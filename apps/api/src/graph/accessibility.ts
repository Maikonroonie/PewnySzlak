import type { Accessibility, AccessibilityField, SegmentKind } from '@pewnyszlak/domain';

export type Tags = Record<string, string>;

/** Klasa trudności nawierzchni: 0 gładka, 1 umiarkowana, 2 trudna, 3 nieprzejezdna dla wózka, -1 nieznana. */
export type SurfaceClass = -1 | 0 | 1 | 2 | 3;

export type EdgeAttrs = {
  kind: SegmentKind;
  access: Accessibility;
  estimated: AccessibilityField[];
  missing: AccessibilityField[];
  surfaceClass: SurfaceClass;
  baseFactor: number;
  /** Schody z pochylnią dla wózka (ramp:wheelchair=yes) – przejezdne mimo unikania schodów. */
  rampForWheelchair: boolean;
  /** Schody ruchome / chodnik ruchomy – zawsze wykluczone. */
  conveying: boolean;
  /** Droga główna bez informacji o chodniku. */
  sidewalkUnknown: boolean;
  /** Przejście bez informacji o krawężniku (ani na drodze, ani w węzłach). */
  crossingKerbUnknown: boolean;
};

export type NodeAttrs = {
  kerbCm: number | null;
  kerbEstimated: boolean;
  barrier: string | null;
  maxWidthCm: number | null;
  wheelchair: Accessibility['wheelchair'];
  isCrossing: boolean;
  isElevator: boolean;
  /** Przeszkoda konstrukcyjnie nieprzejezdna dla wózka (kołowrót, przełaz, barierka rowerowa bez oznaczenia). */
  impassable: boolean;
  /** Dodatkowy koszt w metrach ekwiwalentnych za przejście przez węzeł (bramka, słupek). */
  penaltyM: number;
  description: string | null;
};

const SURFACE_CLASS: Record<string, SurfaceClass> = {
  asphalt: 0, concrete: 0, 'concrete:plates': 0, 'concrete:lanes': 0, paving_stones: 0, paved: 0, wood: 0, metal: 0, tiles: 0, rubber: 0, tartan: 0, chipseal: 0, 'paving_stones:30': 0,
  sett: 1, bricks: 1, compacted: 1, fine_gravel: 1, grass_paver: 1, metal_grid: 1,
  cobblestone: 2, gravel: 2, ground: 2, dirt: 2, earth: 2, grass: 2, sand: 2, unpaved: 2, pebblestone: 2, woodchips: 2, stepping_stones: 2, rock: 2,
  unhewn_cobblestone: 3, mud: 3,
};

const SMOOTHNESS_CLASS: Record<string, SurfaceClass> = {
  excellent: 0, good: 0, intermediate: 1, bad: 2, very_bad: 3, horrible: 3, very_horrible: 3, impassable: 3,
};

export function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** Nachylenie w % (wartość bezwzględna). "up"/"down" bez liczby → brak wartości. */
export function parseIncline(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseNumber(raw);
  if (n === null) return null;
  if (raw.includes('°')) return Math.abs(Math.tan((n * Math.PI) / 180) * 100);
  return Math.abs(n);
}

/** Długości OSM w cm: "1.5" → 150, "150 cm" → 150, "1.5 m" → 150. */
export function parseLengthCm(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseNumber(raw);
  if (n === null) return null;
  if (/cm/i.test(raw)) return n;
  if (/mm/i.test(raw)) return n / 10;
  if (/m\b/i.test(raw) || n < 10) return n * 100;
  return n; // duże liczby bez jednostki traktujemy jako cm
}

export function kerbHeightCm(tags: Tags): { value: number | null; estimated: boolean; unknown: boolean } {
  const explicit = parseLengthCm(tags['kerb:height']);
  if (explicit !== null) return { value: explicit, estimated: false, unknown: false };
  switch (tags.kerb) {
    case 'flush':
    case 'no':
      return { value: 0, estimated: tags.kerb === 'no', unknown: false };
    case 'lowered':
      return { value: 2, estimated: true, unknown: false };
    case 'rolled':
      return { value: 4, estimated: true, unknown: false };
    case 'raised':
      return { value: 12, estimated: true, unknown: false };
    default:
      return { value: null, estimated: false, unknown: true };
  }
}

export function surfaceClassOf(tags: Tags): SurfaceClass {
  const smooth = tags.smoothness ? SMOOTHNESS_CLASS[tags.smoothness] : undefined;
  const surf = tags.surface ? SURFACE_CLASS[tags.surface.split(';')[0] ?? ''] : undefined;
  if (smooth !== undefined && smooth >= 2) return smooth;
  if (surf === undefined) return smooth ?? -1;
  if (smooth !== undefined) return Math.min(surf, Math.max(smooth, 0)) as SurfaceClass;
  return surf;
}

export function wheelchairTag(tags: Tags): Accessibility['wheelchair'] {
  const w = tags.wheelchair;
  if (w === 'yes' || w === 'no' || w === 'limited' || w === 'designated') return w;
  return null;
}

export function segmentKind(tags: Tags): SegmentKind {
  const hw = tags.highway ?? '';
  const sidewalk = tags.sidewalk ?? tags['sidewalk:both'] ?? tags['sidewalk:left'] ?? tags['sidewalk:right'];
  switch (hw) {
    case 'footway':
      if (tags.footway === 'sidewalk') return 'sidewalk';
      if (tags.footway === 'crossing') return 'crossing';
      if (tags.ramp === 'yes' || tags['ramp:wheelchair'] === 'yes') return 'ramp';
      return 'footway';
    case 'steps':
      return 'steps';
    case 'elevator':
      return 'elevator';
    case 'pedestrian':
      return 'pedestrian';
    case 'crossing':
      return 'crossing';
    case 'corridor':
      return 'corridor';
    case 'platform':
      return 'platform';
    case 'cycleway':
      return 'cycleway';
    case 'path':
    case 'track':
    case 'bridleway':
      return tags.foot === 'designated' && hw === 'path' ? 'footway' : 'path';
    case 'living_street':
      return 'shared-road';
    case 'residential':
    case 'service':
    case 'unclassified':
    case 'road':
      if (sidewalk && sidewalk !== 'no' && sidewalk !== 'none' && sidewalk !== 'separate') return 'sidewalk';
      return 'shared-road';
    default:
      if (sidewalk && sidewalk !== 'no' && sidewalk !== 'none' && sidewalk !== 'separate') return 'sidewalk';
      return 'carriageway';
  }
}

const BASE_FACTOR: Record<SegmentKind, number> = {
  sidewalk: 1.0, footway: 1.0, pedestrian: 1.0, crossing: 1.0, steps: 3.0, elevator: 1.0, ramp: 1.1,
  'shared-road': 1.1, carriageway: 1.8, path: 1.15, cycleway: 1.15, corridor: 1.0, platform: 1.0, other: 1.2,
};

export function edgeAttrs(tags: Tags): EdgeAttrs {
  const kind = segmentKind(tags);
  const hw = tags.highway ?? '';
  const surfaceClass = surfaceClassOf(tags);
  const kerb = kerbHeightCm(tags);
  const estimated: AccessibilityField[] = [];
  const missing: AccessibilityField[] = [];
  const width = parseLengthCm(tags.width) ?? parseLengthCm(tags.est_width) ?? parseLengthCm(tags['sidewalk:width']);
  if (width !== null && !tags.width) estimated.push('widthCm');
  const incline = parseIncline(tags.incline);
  const access: Accessibility = {
    steps: hw === 'steps' ? true : false,
    surface: tags.surface ?? null,
    smoothness: tags.smoothness ?? null,
    incline,
    widthCm: width,
    kerbHeightCm: kind === 'crossing' ? kerb.value : null,
    wheelchair: wheelchairTag(tags),
  };
  if (kerb.estimated && kind === 'crossing') estimated.push('kerbHeightCm');
  if (access.surface === null) missing.push('surface');
  if (access.smoothness === null) missing.push('smoothness');
  if (access.incline === null) missing.push('incline');
  if (access.widthCm === null) missing.push('widthCm');
  if (kind === 'crossing' && kerb.unknown) missing.push('kerbHeightCm');
  if (access.wheelchair === null) missing.push('wheelchair');
  return {
    kind,
    access,
    estimated,
    missing,
    surfaceClass,
    baseFactor: BASE_FACTOR[kind],
    rampForWheelchair: hw === 'steps' && (tags['ramp:wheelchair'] === 'yes' || tags.wheelchair === 'yes'),
    conveying: tags.conveying !== undefined && tags.conveying !== 'no',
    sidewalkUnknown: kind === 'carriageway' && !tags.sidewalk,
    crossingKerbUnknown: kind === 'crossing' && kerb.unknown,
  };
}

const IMPASSABLE_BARRIERS = new Set(['stile', 'turnstile', 'kissing_gate', 'full-height_turnstile', 'kent_carriage_gap', 'log', 'debris', 'jersey_barrier', 'spikes', 'rope', 'cattle_grid', 'motorcycle_barrier']);
const GATE_BARRIERS = new Set(['gate', 'lift_gate', 'swing_gate', 'entrance', 'sally_port', 'hampshire_gate', 'wicket_gate', 'sliding_gate', 'height_restrictor', 'bump_gate', 'yes']);

export function nodeAttrs(tags: Tags): NodeAttrs {
  const kerb = kerbHeightCm(tags);
  const barrier = tags.barrier ?? null;
  const maxWidth = parseLengthCm(tags.maxwidth) ?? parseLengthCm(tags['maxwidth:physical']) ?? parseLengthCm(tags.width);
  const wheelchair = wheelchairTag(tags);
  let impassable = false;
  let penaltyM = 0;
  let description: string | null = null;
  if (barrier) {
    if (IMPASSABLE_BARRIERS.has(barrier) && wheelchair !== 'yes') {
      impassable = true;
      description = `Przeszkoda OSM: ${barrier}`;
    } else if (barrier === 'cycle_barrier') {
      if (wheelchair === 'yes') penaltyM = 10;
      else if (wheelchair === 'no' || (maxWidth !== null && maxWidth < 90)) impassable = true;
      else penaltyM = 60; // barierka rowerowa bez oznaczenia – zwykle trudna do pokonania wózkiem
      description = 'Barierka rowerowa (szykana)';
    } else if (barrier === 'bollard' || barrier === 'block' || barrier === 'planter') {
      penaltyM = maxWidth === null ? 10 : 2;
      description = barrier === 'bollard' ? 'Słupki' : 'Blokada przejazdu';
    } else if (barrier === 'chain') {
      penaltyM = 40;
      description = 'Łańcuch w poprzek drogi';
    } else if (GATE_BARRIERS.has(barrier)) {
      penaltyM = 15;
      description = 'Bramka / furtka';
    } else if (barrier === 'kerb') {
      description = 'Krawężnik';
    } else {
      penaltyM = 5;
      description = `Przeszkoda OSM: ${barrier}`;
    }
  }
  if (wheelchair === 'no') impassable = true;
  if (tags.highway === 'steps') impassable = true;
  return {
    kerbCm: kerb.value,
    kerbEstimated: kerb.estimated,
    barrier,
    maxWidthCm: maxWidth,
    wheelchair,
    isCrossing: tags.highway === 'crossing' || tags.crossing !== undefined,
    isElevator: tags.highway === 'elevator',
    impassable,
    penaltyM,
    description,
  };
}
