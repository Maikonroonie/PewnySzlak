import type { Evidence, Facility, Place } from '@pewnyszlak/domain';
import { config } from '../config.ts';
import type { Db } from '../db.ts';

export function normalizeText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type PlaceRow = { id: string; kind: 'place' | 'address'; name: string; category: string | null; address: string | null; lon: number; lat: number; tags: Record<string, string>; osm_timestamp: string | null; version_id: string; created_at: string; distance_m: number | null };

function placeAccessibility(tags: Record<string, string>): Partial<Place['accessibility']> {
  const out: Partial<Place['accessibility']> = {};
  if (tags.wheelchair === 'yes' || tags.wheelchair === 'no' || tags.wheelchair === 'limited' || tags.wheelchair === 'designated') out.wheelchair = tags.wheelchair;
  if (tags['entrance:step_count'] || tags.step_count) out.steps = Number(tags['entrance:step_count'] ?? tags.step_count) > 0;
  return out;
}

function rowToPlace(r: PlaceRow): Place {
  const osmType = r.id.startsWith('w') || r.id.startsWith('a-w') ? 'way' : 'node';
  const osmId = r.id.replace(/^a-/, '').slice(1);
  const ageMonths = r.osm_timestamp ? (Date.now() - Date.parse(r.osm_timestamp)) / (30.44 * 86_400_000) : Infinity;
  const evidence: Evidence[] = [{
    id: `osm-${osmType}-${osmId}`, source: 'osm', sourceId: `${osmType}/${osmId}`, sourceUrl: `https://www.openstreetmap.org/${osmType}/${osmId}`,
    updatedAt: r.osm_timestamp, fetchedAt: r.created_at, observedAt: null, status: 'mapped', isStale: ageMonths > config.staleAfterMonths,
    description: r.tags.wheelchair ? `OSM: wheelchair=${r.tags.wheelchair}${r.tags['wheelchair:description'] ? ` – ${r.tags['wheelchair:description']}` : ''}` : 'OSM: brak oznaczenia dostępności dla wózka',
  }];
  const amenities = {
    ramp: r.tags.ramp === 'yes' || r.tags['ramp:wheelchair'] === 'yes' ? true : null,
    toilet: r.tags['toilets:wheelchair'] === 'yes' ? true : r.tags['toilets:wheelchair'] === 'no' ? false : null,
    elevator: r.tags.elevator === 'yes' ? true : r.tags.elevator === 'no' ? false : null,
    carPark: null,
  };
  return {
    id: r.id, name: r.name, kind: r.kind, category: r.category, address: r.address,
    coordinate: { longitude: r.lon, latitude: r.lat }, accessibility: placeAccessibility(r.tags), amenities, evidence,
    entranceVerified: r.tags.entrance !== undefined || r.tags.wheelchair !== undefined,
    ...(r.distance_m !== null && r.distance_m !== undefined ? { distanceM: Math.round(r.distance_m) } : {}),
  };
}

export class PlaceRepo {
  constructor(private readonly db: Db) {}

  async search(query: string, near: { lon: number; lat: number } | null, limit = 10): Promise<Place[]> {
    const q = normalizeText(query);
    if (q.length < 2) return [];
    const r = await this.db.query(
      `select p.*, v.created_at,
              ${near ? `ST_DistanceSphere(p.geom, ST_SetSRID(ST_MakePoint($3, $4), 4326))` : 'null'} as distance_m,
              similarity(p.search_text, $1) as sim
         from places p join graph_versions v on v.id = p.version_id and v.is_active
        where p.search_text like $2 or p.search_text % $1
        order by (p.search_text = $1) desc, (p.search_text like $1 || ' %') desc, (p.search_text like $2) desc, (p.kind = 'place') desc, sim desc${near ? ', distance_m asc' : ''}, length(p.name) asc
        limit ${Number(limit)}`,
      near ? [q, `%${q}%`, near.lon, near.lat] : [q, `%${q}%`],
    );
    return r.rows.map(rowToPlace);
  }

  async byId(id: string): Promise<Place | null> {
    const r = await this.db.query(`select p.*, v.created_at, null as distance_m from places p join graph_versions v on v.id = p.version_id and v.is_active where p.id = $1`, [id]);
    return r.rows[0] ? rowToPlace(r.rows[0]) : null;
  }

  async reverse(lon: number, lat: number): Promise<Place | null> {
    const r = await this.db.query(
      `select p.*, v.created_at, ST_DistanceSphere(p.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)) as distance_m
         from places p join graph_versions v on v.id = p.version_id and v.is_active
        where ST_DWithin(p.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 120)
        order by (p.kind = 'address') desc, distance_m asc limit 1`,
      [lon, lat],
    );
    return r.rows[0] ? rowToPlace(r.rows[0]) : null;
  }
}

type FacilityRow = {
  id: string; benefit: string; provider: string; provider_code: string | null; place_name: string | null; address: string | null; locality: string | null; phone: string | null;
  lon: number | null; lat: number | null; coords_valid: boolean; coords_check: string | null; toilet: boolean | null; ramp: boolean | null; elevator: boolean | null; car_park: boolean | null;
  data_month: string | null; nfz_updated_at: string | null; fetched_at: string; psoz_url: string | null; psoz_fetched_at: string | null; psoz_meta: Record<string, unknown> | null; distance_m: number | null;
};

export function rowToFacility(r: FacilityRow): Facility {
  const evidence: Evidence[] = [{
    id: `nfz-${r.id}`, source: 'nfz', sourceId: r.id, sourceUrl: `https://terminyleczenia.nfz.gov.pl/`, updatedAt: r.nfz_updated_at, fetchedAt: r.fetched_at, observedAt: null, status: 'declared',
    isStale: r.nfz_updated_at ? Date.now() - Date.parse(r.nfz_updated_at) > 180 * 86_400_000 : true,
    description: `Udogodnienia deklarowane przez świadczeniodawcę w Informatorze o Terminach Leczenia (dane za ${r.data_month ?? 'nieznany okres'}). Data aktualizacji kolejki nie jest datą sprawdzenia wejścia.`,
  }];
  if (r.psoz_url) {
    evidence.push({ id: `psoz-${r.id}`, source: 'psoz', sourceId: r.psoz_url, sourceUrl: r.psoz_url, updatedAt: null, fetchedAt: r.psoz_fetched_at ?? r.fetched_at, observedAt: null, status: 'declared', isStale: false, description: 'Dopasowany rekord placówki w psoz.pl (dane NFZ o jakości i kolejkach; nie zawiera informacji o barierach).' });
  }
  if (!r.coords_valid || (r.coords_check ?? '').startsWith('UWAGA') || (r.coords_check ?? '').includes('niezgodne')) {
    evidence.push({ id: `nfz-coords-${r.id}`, source: 'nfz', sourceId: `${r.id}/coords`, sourceUrl: null, updatedAt: null, fetchedAt: r.fetched_at, observedAt: null, status: r.coords_valid ? 'unknown' : 'conflicting', isStale: false, description: `Kontrola lokalizacji: ${r.coords_check ?? 'poza granicami / niezgodne z adresem'}.` });
  } else if (r.coords_check) {
    evidence.push({ id: `nfz-coords-${r.id}`, source: 'osm', sourceId: `${r.id}/coords`, sourceUrl: null, updatedAt: null, fetchedAt: r.fetched_at, observedAt: null, status: 'mapped', isStale: false, description: `Kontrola lokalizacji: ${r.coords_check}.` });
  }
  return {
    id: `f-${r.id}`, name: r.place_name ? `${r.place_name} – ${r.provider}` : r.provider, kind: 'facility', category: r.benefit, address: [r.address, r.locality].filter(Boolean).join(', ') || null,
    coordinate: r.coords_valid && r.lon !== null && r.lat !== null ? { longitude: r.lon, latitude: r.lat } : null,
    accessibility: {}, evidence, entranceVerified: false,
    benefit: r.benefit, provider: r.provider, providerCode: r.provider_code, phone: r.phone,
    amenities: { ramp: r.ramp, toilet: r.toilet, elevator: r.elevator, carPark: r.car_park },
    coordsValid: r.coords_valid, coordsCheck: r.coords_check, psozUrl: r.psoz_url, dataMonth: r.data_month,
    ...(r.distance_m !== null && r.distance_m !== undefined ? { distanceM: Math.round(r.distance_m) } : {}),
  };
}

export class FacilityRepo {
  constructor(private readonly db: Db) {}

  async list(opts: { benefit?: string; near?: { lon: number; lat: number }; query?: string; limit?: number; includeInvalid?: boolean }): Promise<Facility[]> {
    const params: unknown[] = [];
    const where: string[] = [];
    if (opts.benefit) { params.push(opts.benefit.toUpperCase()); where.push(`upper(benefit) = $${params.length}`); }
    if (opts.query) { params.push(`%${normalizeText(opts.query)}%`); where.push(`unaccent(lower(coalesce(place_name, '') || ' ' || provider || ' ' || coalesce(address, ''))) like $${params.length}`); }
    if (!opts.includeInvalid) where.push('coords_valid');
    let order = 'provider asc';
    let distance = 'null as distance_m';
    if (opts.near) {
      params.push(opts.near.lon, opts.near.lat);
      distance = `ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint($${params.length - 1}, $${params.length}), 4326)) as distance_m`;
      order = 'distance_m asc nulls last';
    }
    const r = await this.db.query(`select *, ${distance} from facilities ${where.length ? `where ${where.join(' and ')}` : ''} order by ${order} limit ${Number(opts.limit ?? 20)}`, params);
    return r.rows.map(rowToFacility);
  }

  async byId(id: string): Promise<Facility | null> {
    const r = await this.db.query(`select *, null as distance_m from facilities where id = $1`, [id.replace(/^f-/, '')]);
    return r.rows[0] ? rowToFacility(r.rows[0]) : null;
  }

  async benefits(): Promise<{ benefit: string; count: number }[]> {
    const r = await this.db.query(`select benefit, count(*)::int as count from facilities group by benefit order by count desc`);
    return r.rows;
  }
}
