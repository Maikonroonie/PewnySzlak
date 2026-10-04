import type { Evidence, Place } from '@pewnyszlak/domain';
import { haversineM } from '../graph/geo.ts';

type MsipAttrs = {
  objectid?: number;
  user_adres?: string | null;
  user_typol?: string | null;
  user_datow?: string | null;
  user_autor?: string | null;
  user_num_1?: string | null;
};

type MsipFeature = { attributes?: MsipAttrs; geometry?: { x?: number; y?: number } | null };

const BASE = 'https://msip.um.krakow.pl/arcgis/rest/services/Obserwatorium/zabytki_do_pobrania/MapServer';
/** 0 = rejestr zabytków, 1 = gminna ewidencja. */
const LAYERS: { id: number; category: string; label: string }[] = [
  { id: 0, category: 'heritage=register', label: 'Rejestr zabytków (WUOZ / MSIP Kraków)' },
  { id: 1, category: 'heritage=inventory', label: 'Gminna ewidencja zabytków (MSIP Kraków)' },
];

const CACHE_TTL_MS = 8 * 60_000;
type CacheEntry = { at: number; key: string; places: Place[] };
let heritageCache: CacheEntry | null = null;

function cacheKey(lon: number, lat: number, radiusM: number): string {
  return `${lon.toFixed(3)}|${lat.toFixed(3)}|${Math.round(radiusM / 50) * 50}`;
}

function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function featureToPlace(f: MsipFeature, layer: (typeof LAYERS)[number], origin: { lon: number; lat: number }, fetchedAt: string): Place | null {
  const g = f.geometry;
  const a = f.attributes ?? {};
  if (g?.x == null || g?.y == null) return null;
  const typol = clean(a.user_typol) || 'Zabytek';
  const adres = clean(a.user_adres);
  const datow = clean(a.user_datow);
  const autor = clean(a.user_autor);
  const numer = clean(a.user_num_1);
  const name = typol.length > 90 ? `${typol.slice(0, 87)}…` : typol;
  const blurbParts = [
    datow && datow.length < 60 ? datow : datow ? `z ${datow.slice(0, 40)}…` : null,
    numer ? `nr ${numer.split(',')[0]!.trim()}` : null,
  ].filter(Boolean);
  const evidence: Evidence[] = [{
    id: `msip-${layer.id}-${a.objectid ?? `${g.x},${g.y}`}`,
    source: 'msip',
    sourceId: `layer${layer.id}/${a.objectid ?? 'x'}`,
    sourceUrl: 'https://msipkrakow.pl/dataset/2841',
    updatedAt: null,
    fetchedAt,
    observedAt: null,
    status: 'signal',
    isStale: false,
    description: `${layer.label}. Dane orientacyjne MSIP – potwierdzenie u Miejskiego Konserwatora Zabytków. ${[datow && `Datowanie: ${datow}`, autor && `Autor: ${autor}`, numer && `Nr: ${numer}`].filter(Boolean).join(' · ')}`.trim(),
  }];
  return {
    id: `msip-${layer.id}-${a.objectid ?? `${Math.round(g.x * 1e5)}-${Math.round(g.y * 1e5)}`}`,
    name,
    kind: 'place',
    category: layer.category,
    blurb: blurbParts.length ? blurbParts.join(' · ') : null,
    address: adres || null,
    coordinate: { longitude: g.x, latitude: g.y },
    accessibility: {},
    evidence,
    entranceVerified: false,
    distanceM: Math.round(haversineM(origin.lon, origin.lat, g.x, g.y)),
  };
}

async function queryLayer(layerId: number, lon: number, lat: number, radiusM: number): Promise<MsipFeature[]> {
  const qs = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    distance: String(Math.min(Math.max(radiusM, 100), 1500)),
    units: 'esriSRUnit_Meter',
    outFields: 'objectid,user_adres,user_typol,user_datow,user_autor,user_num_1',
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: '40',
    f: 'json',
  });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4500);
  try {
    const res = await fetch(`${BASE}/${layerId}/query?${qs}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const body = (await res.json()) as { features?: MsipFeature[]; error?: unknown };
    if (body.error) return [];
    return body.features ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

/** Zabytki z MSIP Kraków wokół punktu (rejestr + ewidencja). Nie ocenia dostępności wejścia. Cache 8 min. */
export async function nearbyHeritage(lon: number, lat: number, radiusM = 600): Promise<Place[]> {
  const key = cacheKey(lon, lat, radiusM);
  if (heritageCache && heritageCache.key === key && Date.now() - heritageCache.at < CACHE_TTL_MS) {
    return heritageCache.places.map((p) => ({
      ...p,
      distanceM: p.coordinate ? Math.round(haversineM(lon, lat, p.coordinate.longitude, p.coordinate.latitude)) : p.distanceM,
    }));
  }
  const fetchedAt = new Date().toISOString();
  const batches = await Promise.all(LAYERS.map(async (layer) => {
    const feats = await queryLayer(layer.id, lon, lat, radiusM);
    return feats.map((f) => featureToPlace(f, layer, { lon, lat }, fetchedAt)).filter((p): p is Place => !!p);
  }));
  const all = batches.flat();
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const p of all.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0))) {
    const k = `${p.name.slice(0, 40)}|${p.coordinate!.longitude.toFixed(5)}|${p.coordinate!.latitude.toFixed(5)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  const places = out.slice(0, 24);
  heritageCache = { at: Date.now(), key, places };
  return places;
}

/** Testy: wyczyść cache MSIP. */
export function clearHeritageCache(): void {
  heritageCache = null;
}
