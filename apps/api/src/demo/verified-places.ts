/**
 * Ręcznie sprawdzone miejsca wokół Rynku – overlay w pamięci (nie zastępuje OSM).
 * Id: verified-* albo merge na istniejący POI w promieniu 40 m.
 */
import type { Evidence, Place } from '@pewnyszlak/domain';

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

function ev(id: string, description: string, observedDaysAgo: number): Evidence {
  const observedAt = daysAgo(observedDaysAgo);
  return {
    id: `verified-${id}`,
    source: 'operator',
    sourceId: `demo/verified/${id}`,
    sourceUrl: null,
    status: 'verified',
    description,
    updatedAt: observedAt,
    fetchedAt: observedAt,
    observedAt,
    isStale: false,
  };
}

export type VerifiedPlaceSeed = {
  id: string;
  name: string;
  category: string;
  address: string | null;
  lon: number;
  lat: number;
  matchNames: string[];
  accessibility: Place['accessibility'];
  amenities: NonNullable<Place['amenities']>;
  entranceVerified: boolean;
  description: string;
  observedDaysAgo: number;
};

/** 8 miejsc wokół Rynku Głównego – pod demo jury. */
export const VERIFIED_PLACE_SEEDS: VerifiedPlaceSeed[] = [
  {
    id: 'sukiennice',
    name: 'Sukiennice',
    category: 'tourism=attraction',
    address: 'Rynek Główny 1–3, Kraków',
    lon: 19.9373,
    lat: 50.0617,
    matchNames: ['sukiennice', 'cloth hall'],
    accessibility: { steps: true, surface: 'paving_stones', smoothness: 'good', incline: null, widthCm: 120, kerbHeightCm: 0, wheelchair: 'limited' },
    amenities: { ramp: true, toilet: true, elevator: false, carPark: null, rest: true },
    entranceVerified: true,
    description: 'Wejście główne ze schodami; od strony Rynku północnego pochylnia. Toaleta w budynku (płatna). Ławki w hali.',
    observedDaysAgo: 5,
  },
  {
    id: 'mariacki',
    name: 'Kościół Mariacki',
    category: 'amenity=place_of_worship',
    address: 'pl. Mariacki 5, Kraków',
    lon: 19.9390,
    lat: 50.0617,
    matchNames: ['mariacki', 'st. mary', 'bazylika'],
    accessibility: { steps: true, surface: 'paving_stones', smoothness: 'intermediate', incline: null, widthCm: 100, kerbHeightCm: 4, wheelchair: 'limited' },
    amenities: { ramp: true, toilet: false, elevator: false, carPark: null, rest: false },
    entranceVerified: true,
    description: 'Próg przy portalu ~4 cm; boczne wejście z podjazdem (strona pl. Mariackiego). Brak toalety dla zwiedzających w nawie.',
    observedDaysAgo: 8,
  },
  {
    id: 'barbakan',
    name: 'Barbakan',
    category: 'historic=city_gate',
    address: 'Basztowa, Kraków',
    lon: 19.9415,
    lat: 50.0655,
    matchNames: ['barbakan'],
    accessibility: { steps: true, surface: 'sett', smoothness: 'bad', incline: 3, widthCm: 90, kerbHeightCm: 6, wheelchair: 'no' },
    amenities: { ramp: false, toilet: false, elevator: false, carPark: null, rest: true },
    entranceVerified: true,
    description: 'Kostka kamienna, wysoki próg przy bramie. Zwiedzanie wnętrza ze schodami – wózek praktycznie tylko dziedziniec.',
    observedDaysAgo: 12,
  },
  {
    id: 'planty-basztowa',
    name: 'Planty – odcinek Basztowa',
    category: 'leisure=park',
    address: 'Planty, Kraków',
    lon: 19.9402,
    lat: 50.0648,
    matchNames: ['planty'],
    accessibility: { steps: false, surface: 'asphalt', smoothness: 'good', incline: 2, widthCm: 200, kerbHeightCm: 0, wheelchair: 'yes' },
    amenities: { ramp: null, toilet: null, elevator: null, carPark: null, rest: true },
    entranceVerified: true,
    description: 'Szeroka aleja asfaltowa, ławki co ~40 m. Bez schodów na tym odcinku.',
    observedDaysAgo: 3,
  },
  {
    id: 'ratuszowa-wieza',
    name: 'Wieża Ratuszowa',
    category: 'tourism=attraction',
    address: 'Rynek Główny 1, Kraków',
    lon: 19.9365,
    lat: 50.0615,
    matchNames: ['wieża ratuszowa', 'ratuszowa'],
    accessibility: { steps: true, surface: 'paving_stones', smoothness: 'good', incline: null, widthCm: 110, kerbHeightCm: 2, wheelchair: 'no' },
    amenities: { ramp: false, toilet: false, elevator: false, carPark: null, rest: false },
    entranceVerified: true,
    description: 'Wejście ze schodami; brak windy na taras. Obserwacja: próg ~2 cm przed kasą.',
    observedDaysAgo: 14,
  },
  {
    id: 'toaleta-planty',
    name: 'Toaleta publiczna – Planty (Floriańska)',
    category: 'amenity=toilets',
    address: 'Planty przy Floriańskiej, Kraków',
    lon: 19.9408,
    lat: 50.0638,
    matchNames: ['toaleta', 'toilets'],
    accessibility: { steps: false, surface: 'concrete', smoothness: 'good', incline: null, widthCm: 100, kerbHeightCm: 0, wheelchair: 'yes' },
    amenities: { ramp: true, toilet: true, elevator: null, carPark: null, rest: false },
    entranceVerified: true,
    description: 'Toaleta z oznaczeniem dla wózka, szerokie drzwi, bez progu. Godziny według tabliczki na drzwiach.',
    observedDaysAgo: 2,
  },
  {
    id: 'lawka-rynek',
    name: 'Ławki – Rynek Główny (strona Sukiennic)',
    category: 'amenity=bench',
    address: 'Rynek Główny, Kraków',
    lon: 19.9370,
    lat: 50.0619,
    matchNames: ['ławka', 'bench'],
    accessibility: { steps: false, surface: 'paving_stones', smoothness: 'good', incline: null, widthCm: null, kerbHeightCm: 0, wheelchair: null },
    amenities: { ramp: null, toilet: null, elevator: null, carPark: null, rest: true },
    entranceVerified: true,
    description: 'Stałe ławki przy elewacji Sukiennic – miejsce odpoczynku na płaskim bruku.',
    observedDaysAgo: 4,
  },
  {
    id: 'wawel-podzamcze',
    name: 'Wawel – dojście od Podzamcza',
    category: 'historic=castle',
    address: 'Wawel, Kraków',
    lon: 19.9352,
    lat: 50.0545,
    matchNames: ['wawel'],
    accessibility: { steps: false, surface: 'asphalt', smoothness: 'good', incline: 5, widthCm: 180, kerbHeightCm: 0, wheelchair: 'limited' },
    amenities: { ramp: true, toilet: true, elevator: true, carPark: null, rest: true },
    entranceVerified: true,
    description: 'Podjazd od Podzamcza (nachylenie ~5%). Toalety i winda w strefie zwiedzania – wg informacji kas.',
    observedDaysAgo: 6,
  },
];

export function seedToPlace(seed: VerifiedPlaceSeed, distanceM?: number): Place {
  return {
    id: `verified-${seed.id}`,
    name: seed.name,
    kind: 'place',
    category: seed.category,
    blurb: seed.description.slice(0, 140),
    address: seed.address,
    coordinate: { longitude: seed.lon, latitude: seed.lat },
    accessibility: seed.accessibility,
    amenities: seed.amenities,
    evidence: [ev(seed.id, seed.description, seed.observedDaysAgo)],
    entranceVerified: seed.entranceVerified,
    terrainChecked: true,
    ...(distanceM != null ? { distanceM } : {}),
  };
}

function haversineM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nameMatch(placeName: string, patterns: string[]): boolean {
  const n = placeName.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return patterns.some((p) => n.includes(p.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')));
}

/** Nakłada dane operatorskie na OSM (≤40 m + nazwa) albo dodaje syntetyczne verified-*. */
export function mergeVerifiedPlaces(places: Place[], near?: { lon: number; lat: number }, radiusM = 2_000): Place[] {
  const used = new Set<string>();
  const out = places.map((p) => {
    if (!p.coordinate) return p;
    for (const seed of VERIFIED_PLACE_SEEDS) {
      if (used.has(seed.id)) continue;
      const d = haversineM(p.coordinate.longitude, p.coordinate.latitude, seed.lon, seed.lat);
      if (d > 40) continue;
      if (seed.matchNames.length && !nameMatch(p.name, seed.matchNames) && d > 25) continue;
      used.add(seed.id);
      return {
        ...p,
        accessibility: { ...p.accessibility, ...seed.accessibility },
        amenities: { ...(p.amenities ?? { ramp: null, toilet: null, elevator: null, carPark: null, rest: null }), ...seed.amenities },
        evidence: [...p.evidence, ev(seed.id, seed.description, seed.observedDaysAgo)],
        entranceVerified: seed.entranceVerified || p.entranceVerified,
        terrainChecked: true,
        blurb: p.blurb ?? seed.description.slice(0, 140),
      };
    }
    return p;
  });

  for (const seed of VERIFIED_PLACE_SEEDS) {
    if (used.has(seed.id)) continue;
    if (near) {
      const d = Math.round(haversineM(near.lon, near.lat, seed.lon, seed.lat));
      if (d > radiusM) continue;
      out.push(seedToPlace(seed, d));
    } else {
      out.push(seedToPlace(seed));
    }
  }
  return out;
}

export function verifiedPlacesNear(lon: number, lat: number, radiusM: number): Place[] {
  return VERIFIED_PLACE_SEEDS
    .map((s) => {
      const d = Math.round(haversineM(lon, lat, s.lon, s.lat));
      return d <= radiusM ? seedToPlace(s, d) : null;
    })
    .filter((p): p is Place => p != null);
}
