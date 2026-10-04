import { z } from 'zod';

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------
export const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type Coordinate = z.infer<typeof coordinateSchema>;
export type LineString = { type: 'LineString'; coordinates: [number, number][] };
export type Polygon = { type: 'Polygon'; coordinates: [number, number][][] };

// ---------------------------------------------------------------------------
// Preferencje użytkownika (bez konta, bez informacji o zdrowiu)
// ---------------------------------------------------------------------------
export const activitySchema = z.enum(['walk', 'run', 'bike', 'skates', 'wheelchair']);
export type Activity = z.infer<typeof activitySchema>;
/** easy – omijaj podjazdy, normal – neutralnie, hard – szukaj podjazdów (trening). */
export const effortSchema = z.enum(['easy', 'normal', 'hard']);
export type Effort = z.infer<typeof effortSchema>;

export const preferencesSchema = z.object({
  activity: activitySchema.default('bike'),
  effort: effortSchema.default('normal'),
  avoidSteps: z.boolean().default(true),
  avoidRoughSurface: z.boolean().default(false),
  maxIncline: z.number().min(0).max(30).default(12),
  maxKerbHeightCm: z.number().min(0).max(30).default(12),
  minWidthCm: z.number().min(30).max(250).default(60),
  unknownPolicy: z.enum(['penalize', 'exclude']).default('penalize'),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const DEFAULT_PREFERENCES: Preferences = preferencesSchema.parse({});

type ActivityPreset = Omit<Preferences, 'activity' | 'effort' | 'unknownPolicy'>;
export const ACTIVITY_PRESETS: Record<Activity, ActivityPreset> = {
  walk: { avoidSteps: false, avoidRoughSurface: false, maxIncline: 30, maxKerbHeightCm: 30, minWidthCm: 30 },
  run: { avoidSteps: false, avoidRoughSurface: false, maxIncline: 30, maxKerbHeightCm: 30, minWidthCm: 30 },
  bike: { avoidSteps: true, avoidRoughSurface: false, maxIncline: 12, maxKerbHeightCm: 12, minWidthCm: 60 },
  /** Rolki: tylko możliwie równa nawierzchnia, niski krawężnik, bez schodów. */
  skates: { avoidSteps: true, avoidRoughSurface: true, maxIncline: 8, maxKerbHeightCm: 2, minWidthCm: 80 },
  wheelchair: { avoidSteps: true, avoidRoughSurface: true, maxIncline: 6, maxKerbHeightCm: 2, minWidthCm: 90 },
};
/** Średnia prędkość w m/s używana do szacowania czasu. */
export const ACTIVITY_SPEED_MPS: Record<Activity, number> = { walk: 1.25, run: 2.7, bike: 4.5, skates: 3.6, wheelchair: 0.95 };
export const activityLabels: Record<Activity, string> = { walk: 'Spacer', run: 'Bieg', bike: 'Rower', skates: 'Rolki', wheelchair: 'Wózek inwalidzki' };
export const effortLabels: Record<Effort, string> = { easy: 'Lekko', normal: 'Normalnie', hard: 'Wyzwanie' };
export function applyEffort(p: Preferences): Preferences {
  if (p.activity === 'wheelchair') return { ...p, effort: 'easy' };
  if (p.activity === 'skates') return { ...p, maxIncline: p.effort === 'hard' ? 12 : p.effort === 'easy' ? 5 : 8 };
  if (p.activity === 'bike' || p.activity === 'run' || p.activity === 'walk') {
    const maxIncline = p.effort === 'hard' ? 30 : p.effort === 'easy' ? (p.activity === 'bike' ? 6 : 8) : p.activity === 'bike' ? 12 : 15;
    return { ...p, maxIncline };
  }
  return p;
}
export function preferencesForActivity(activity: Activity, current: Preferences = DEFAULT_PREFERENCES): Preferences {
  return applyEffort({ ...current, ...ACTIVITY_PRESETS[activity], activity, effort: activity === 'wheelchair' ? 'easy' : current.effort });
}

export type DataMode = 'live' | 'demo';
export const dataModeSchema = z.enum(['live', 'demo']);

// ---------------------------------------------------------------------------
// Źródła i wiarygodność
// ---------------------------------------------------------------------------
export type Source = 'osm' | 'community' | 'z-dykty' | 'nfz' | 'psoz' | 'operator' | 'demo' | 'msip';
export type EvidenceStatus =
  | 'mapped' // dane mapowe OSM – fakt zmapowany, niekoniecznie sprawdzony w terenie
  | 'estimated' // wartość oszacowana z tagu opisowego (np. kerb=lowered → ~2 cm)
  | 'reported' // niezweryfikowane zgłoszenie społeczności
  | 'signal' // sygnał z rejestru publicznego (np. przetarg) – możliwe utrudnienie, lokalizacja niepotwierdzona
  | 'verified' // potwierdzone formalnie przez operatora
  | 'declared' // deklaracja świadczeniodawcy (NFZ)
  | 'conflicting' // sprzeczne obserwacje
  | 'unknown'; // brak danych

export type Evidence = {
  id: string;
  source: Source;
  sourceId: string;
  sourceUrl: string | null;
  /** Data ostatniej zmiany w źródle (np. edycja OSM). To NIE jest data sprawdzenia w terenie. */
  updatedAt: string | null;
  /** Kiedy pobraliśmy dane ze źródła. */
  fetchedAt: string;
  /** Kiedy ktoś faktycznie sprawdził stan w terenie (zgłoszenie, weryfikacja). */
  observedAt: string | null;
  status: EvidenceStatus;
  isStale: boolean;
  description?: string;
};

// ---------------------------------------------------------------------------
// Cechy dostępności odcinka / miejsca
// ---------------------------------------------------------------------------
export type Accessibility = {
  steps: boolean | null;
  surface: string | null;
  smoothness: string | null;
  /** Nachylenie w %, wartość bezwzględna. */
  incline: number | null;
  widthCm: number | null;
  kerbHeightCm: number | null;
  wheelchair: 'yes' | 'no' | 'limited' | 'designated' | null;
};
export const UNKNOWN_ACCESSIBILITY: Accessibility = {
  steps: null, surface: null, smoothness: null, incline: null, widthCm: null, kerbHeightCm: null, wheelchair: null,
};
export type AccessibilityField = keyof Accessibility;

export type SegmentKind = 'sidewalk' | 'footway' | 'pedestrian' | 'crossing' | 'steps' | 'elevator' | 'ramp' | 'shared-road' | 'carriageway' | 'path' | 'cycleway' | 'corridor' | 'platform' | 'other';

// ---------------------------------------------------------------------------
// Miejsca, adresy, placówki
// ---------------------------------------------------------------------------
export type Place = {
  id: string;
  name: string;
  kind: 'place' | 'address' | 'facility';
  category: string | null;
  /** Krótki opis z OSM/MSIP (datowanie, wikipedia…), nie ocena dostępności. */
  blurb?: string | null;
  address: string | null;
  coordinate: Coordinate | null;
  accessibility: Partial<Accessibility>;
  amenities?: FacilityAmenities;
  evidence: Evidence[];
  /** Czy dojście od grafu do wejścia jest zmapowane (OSM entrance / footway do budynku). */
  entranceVerified: boolean;
  /** Sprawdzenie w terenie (operator / seed demo) – nie mylić z tagiem OSM. */
  terrainChecked?: boolean;
  distanceM?: number;
};

export type FacilityAmenities = {
  ramp: boolean | null;
  toilet: boolean | null;
  elevator: boolean | null;
  carPark: boolean | null;
  /** Ławka / miejsce odpoczynku w obiekcie lub przy wejściu. */
  rest: boolean | null;
};

/** Osiem cech z wyzwania PDF – wspólny model dla karty miejsca i odcinka. */
export type FeatureGridKey = 'steps' | 'kerb' | 'ramp' | 'elevator' | 'width' | 'surface' | 'toilet' | 'rest';
export type FeatureGridValue = 'yes' | 'no' | 'unknown';
export type FeatureGridCell = { key: FeatureGridKey; label: string; value: FeatureGridValue };
export const FEATURE_GRID_LABELS: Record<FeatureGridKey, string> = {
  steps: 'Schody',
  kerb: 'Progi',
  ramp: 'Podjazd',
  elevator: 'Winda',
  width: 'Szerokość',
  surface: 'Nawierzchnia',
  toilet: 'Toaleta',
  rest: 'Odpoczynek',
};

export type Facility = Place & {
  kind: 'facility';
  benefit: string;
  provider: string;
  providerCode: string | null;
  phone: string | null;
  amenities: FacilityAmenities;
  coordsValid: boolean;
  coordsCheck: string | null;
  psozUrl: string | null;
  dataMonth: string | null;
};

// ---------------------------------------------------------------------------
// Bariery
// ---------------------------------------------------------------------------
export const barrierTypeSchema = z.enum(['steps', 'kerb', 'surface', 'construction', 'elevator', 'narrow', 'obstacle', 'other']);
export type BarrierType = z.infer<typeof barrierTypeSchema>;
export type BarrierState = 'potential' | 'active' | 'resolved' | 'disputed';

export type Barrier = {
  id: string;
  type: BarrierType;
  title: string;
  description: string;
  coordinate: Coordinate | null;
  edgeIds: string[];
  nodeIds: string[];
  state: BarrierState;
  blocksRouting: boolean;
  validFrom: string | null;
  validUntil: string | null;
  evidence: Evidence[];
  confirmationCount: number;
  rejectionCount: number;
  resolvedCount: number;
  isDemo: boolean;
  originSource: Source;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Trasa
// ---------------------------------------------------------------------------
export const routeRequestSchema = z.object({
  origin: coordinateSchema,
  destination: coordinateSchema,
  /** Punkty pośrednie odwiedzane po kolei (A, B, C…). */
  waypoints: z.array(coordinateSchema).max(6).default([]),
  preferences: preferencesSchema.default({}),
});
export type RouteRequest = z.infer<typeof routeRequestSchema>;

export type RouteSegment = {
  id: string;
  edgeIds: string[];
  wayIds: number[];
  name: string;
  kind: SegmentKind;
  geometry: LineString;
  lengthM: number;
  accessibility: Accessibility;
  /** Pola, których wartość jest szacunkiem a nie pomiarem. */
  estimatedFields: AccessibilityField[];
  missingFields: AccessibilityField[];
  /** Odcinek wymaga ostrożności: brak kluczowych danych, bariera potencjalna lub zgłoszenie. */
  uncertain: boolean;
  evidence: Evidence[];
  barriers: Barrier[];
  warnings: string[];
};

export type RouteInstruction = {
  id: string;
  segmentId: string;
  text: string;
  /** Dystans do przejścia od tej instrukcji do następnej. */
  distanceM: number;
  coordinate: Coordinate;
  type: 'depart' | 'continue' | 'turn-left' | 'turn-right' | 'turn-slight-left' | 'turn-slight-right' | 'crossing' | 'steps' | 'elevator' | 'caution' | 'arrive';
};

export type Snap = { coordinate: Coordinate; distanceM: number; verified: boolean; edgeId: string; note: string | null };

export type RouteResult = {
  id: string;
  mode: DataMode;
  graphVersion: string;
  barrierVersion: string;
  computedAt: string;
  preferences: Preferences;
  geometry: LineString;
  distanceM: number;
  durationSeconds: number;
  unknownDistanceM: number;
  uncertainDistanceM: number;
  segments: RouteSegment[];
  steps: RouteInstruction[];
  /** Bariery leżące na trasie (wpływają na koszt, nie blokują). */
  barriers: Barrier[];
  /** Bariery blokujące w pobliżu trasy, które trasa omija. */
  avoidedBarriers: Barrier[];
  warnings: string[];
  originSnap: Snap;
  destinationSnap: Snap;
  /** Przewyższenia z modelu terenu; null, gdy wysokości nie są wczytane. */
  elevation: RouteElevation | null;
  /** Odcinki między kolejnymi punktami (start → A → B → cel). */
  legs: RouteLeg[];
};

export type RouteElevation = { ascentM: number; descentM: number; maxGradePct: number; source: string };
export type RouteLeg = { distanceM: number; durationSeconds: number; ascentM: number | null };

export type NoRouteReason = 'origin-unreachable' | 'destination-unreachable' | 'disconnected' | 'blocked-by-preferences' | 'outside-coverage';
export type NoRouteDetails = { reason: NoRouteReason; explanation: string; suggestions: string[]; exploredNodes: number };

// ---------------------------------------------------------------------------
// Zgłoszenia społeczności
// ---------------------------------------------------------------------------
export const installationIdSchema = z.string().min(16).max(100);
export const reportRequestSchema = z.object({
  type: barrierTypeSchema,
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).default(''),
  coordinate: coordinateSchema,
  edgeIds: z.array(z.string().max(100)).max(10).default([]),
  installationId: installationIdSchema,
});
export type ReportRequest = z.infer<typeof reportRequestSchema>;

export const feedbackRequestSchema = z.object({
  installationId: installationIdSchema,
  action: z.enum(['confirm', 'reject', 'resolved']),
  comment: z.string().trim().max(500).optional(),
});
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;

// ---------------------------------------------------------------------------
// Stan źródeł
// ---------------------------------------------------------------------------
export type SourceStatus = {
  source: Source;
  name: string;
  state: 'available' | 'stale' | 'unavailable' | 'disabled' | 'never';
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  message: string;
  recordCount: number;
  updateFrequency: string;
  licence: string;
};
export type SourcesResponse = {
  mode: DataMode;
  graphVersion: string | null;
  graphDataTimestamp: string | null;
  coverage: string;
  edgeCount: number;
  sources: SourceStatus[];
};

// ---------------------------------------------------------------------------
// Asystent
// ---------------------------------------------------------------------------
export const assistantRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  coordinate: coordinateSchema.optional(),
  preferences: preferencesSchema.optional(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).max(12).default([]),
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

export type AssistantAction =
  | { type: 'route-to'; label: string; destination: Coordinate; placeName: string }
  | { type: 'show-facilities'; label: string; benefit: string }
  | { type: 'open-sources'; label: string }
  | { type: 'open-preferences'; label: string }
  | { type: 'open-explore'; label: string };

export type AssistantResponse = {
  mode: 'rules' | 'llm';
  message: string;
  citations: Evidence[];
  places: Place[];
  actions: AssistantAction[];
  suggestedDestination: Coordinate | null;
  disclaimer: string;
};

export type ApiError = { error: { code: string; message: string; details?: unknown } };

// ---------------------------------------------------------------------------
// Etykiety (wspólne dla UI i odpowiedzi szablonowych)
// ---------------------------------------------------------------------------
export const sourceLabels: Record<Source, string> = {
  osm: 'OpenStreetMap',
  community: 'Zgłoszenie społeczności',
  'z-dykty': 'z-dykty.pl · Biuletyn Zamówień Publicznych',
  nfz: 'NFZ – Informator o Terminach Leczenia',
  psoz: 'psoz.pl · dane o ochronie zdrowia',
  operator: 'Weryfikacja operatora',
  demo: 'Dane demonstracyjne',
  msip: 'MSIP Kraków · ewidencja / rejestr zabytków',
};
export const statusLabels: Record<EvidenceStatus, string> = {
  mapped: 'Zmapowane w OSM (niesprawdzone w terenie)',
  estimated: 'Oszacowane z opisu',
  reported: 'Niezweryfikowane zgłoszenie',
  signal: 'Sygnał z rejestru publicznego',
  verified: 'Potwierdzone przez operatora',
  declared: 'Deklaracja świadczeniodawcy',
  conflicting: 'Sprzeczne informacje',
  unknown: 'Brak danych',
};
export const accessibilityLabels: Record<AccessibilityField, string> = {
  steps: 'Schody',
  surface: 'Nawierzchnia',
  smoothness: 'Równość nawierzchni',
  incline: 'Nachylenie',
  widthCm: 'Szerokość',
  kerbHeightCm: 'Wysokość krawężnika',
  wheelchair: 'Oznaczenie „wózek” w OSM',
};
export const barrierTypeLabels: Record<BarrierType, string> = {
  steps: 'Schody',
  kerb: 'Wysoki krawężnik',
  surface: 'Zła nawierzchnia',
  construction: 'Remont / roboty',
  elevator: 'Winda nieczynna',
  narrow: 'Zwężenie',
  obstacle: 'Przeszkoda na drodze',
  other: 'Inne',
};
export const segmentKindLabels: Record<SegmentKind, string> = {
  sidewalk: 'Chodnik',
  footway: 'Ciąg pieszy',
  pedestrian: 'Strefa piesza',
  crossing: 'Przejście',
  steps: 'Schody',
  elevator: 'Winda',
  ramp: 'Pochylnia',
  'shared-road': 'Ulica współdzielona',
  carriageway: 'Jezdnia (brak chodnika w danych)',
  path: 'Ścieżka',
  cycleway: 'Droga rowerowa',
  corridor: 'Korytarz',
  platform: 'Peron / przystanek',
  other: 'Odcinek',
};
export const surfaceLabels: Record<string, string> = {
  asphalt: 'asfalt', concrete: 'beton', 'concrete:plates': 'płyty betonowe', 'concrete:lanes': 'płyty betonowe', paving_stones: 'kostka brukowa (równa)',
  sett: 'kostka kamienna', cobblestone: 'bruk', unhewn_cobblestone: 'kocie łby', gravel: 'żwir', fine_gravel: 'drobny żwir', compacted: 'nawierzchnia utwardzona',
  ground: 'grunt', dirt: 'ziemia', grass: 'trawa', sand: 'piasek', wood: 'drewno', metal: 'metal', paved: 'utwardzona', unpaved: 'nieutwardzona', mud: 'błoto', pebblestone: 'otoczaki', grass_paver: 'kratka trawnikowa', woodchips: 'zrębki', tiles: 'płytki',
};
export const smoothnessLabels: Record<string, string> = {
  excellent: 'bardzo równa', good: 'równa', intermediate: 'średnio równa', bad: 'nierówna', very_bad: 'bardzo nierówna', horrible: 'fatalna', very_horrible: 'fatalna', impassable: 'nieprzejezdna',
};

/** Czytelna etykieta kategorii miejsca (zamiast surowego `tourism=museum`). */
export function placeCategoryLabel(category: string | null | undefined): string {
  if (!category) return 'Miejsce';
  const c = category.trim().toLowerCase();
  const map: Record<string, string> = {
    'tourism=museum': 'Muzeum',
    'tourism=gallery': 'Galeria',
    'tourism=attraction': 'Atrakcja',
    'tourism=artwork': 'Rzeźba / sztuka',
    'tourism=viewpoint': 'Punkt widokowy',
    'tourism=zoo': 'Zoo',
    'tourism=theme_park': 'Park rozrywki',
    'leisure=park': 'Park',
    'leisure=garden': 'Ogród',
    'leisure=nature_reserve': 'Rezerwat',
    'historic=monument': 'Pomnik',
    'historic=memorial': 'Upamiętnienie',
    'historic=castle': 'Zamek / pałac',
    'historic=city_gate': 'Brama miejska',
    'historic=ruins': 'Ruiny',
    'historic=archaeological_site': 'Stanowisko archeologiczne',
    'historic=wayside_shrine': 'Kapliczka',
    'historic=church': 'Kościół (zabytek)',
    'historic=cathedral': 'Katedra',
    'historic=building': 'Zabytkowy budynek',
    'amenity=place_of_worship': 'Świątynia',
    'amenity=theatre': 'Teatr',
    'amenity=arts_centre': 'Centrum sztuki',
    'amenity=library': 'Biblioteka',
    'amenity=fountain': 'Fontanna',
    'amenity=planetarium': 'Planetarium',
    'amenity=toilets': 'Toaleta publiczna',
    'amenity=bench': 'Ławka',
    'amenity=shelter': 'Wiata / schronienie',
    'heritage=register': 'Zabytek (rejestr)',
    'heritage=inventory': 'Zabytek (ewidencja)',
    museum: 'Muzeum',
    gallery: 'Galeria',
    attraction: 'Atrakcja',
    artwork: 'Rzeźba / sztuka',
    park: 'Park',
    toilets: 'Toaleta publiczna',
    bench: 'Ławka',
  };
  if (map[c]) return map[c];
  const v = c.includes('=') ? c.split('=').pop()! : c;
  return map[v] ?? v.replace(/_/g, ' ');
}

export function wheelchairLabel(v: Accessibility['wheelchair']): string | null {
  if (v === 'yes' || v === 'designated') return 'OSM: oznaczenie dla wózka';
  if (v === 'limited') return 'OSM: dostępność ograniczona';
  if (v === 'no') return 'OSM: niedostępne dla wózka (tag)';
  return null;
}

function cell(key: FeatureGridKey, value: FeatureGridValue): FeatureGridCell {
  return { key, label: FEATURE_GRID_LABELS[key], value };
}

/** Siatka 8 cech dla miejsca (✓ / ✗ / brak). */
export function placeFeatureGrid(place: Place): FeatureGridCell[] {
  const a = place.accessibility;
  const am = place.amenities;
  const steps: FeatureGridValue = a.steps === true ? 'yes' : a.steps === false ? 'no' : 'unknown';
  const kerb: FeatureGridValue = a.kerbHeightCm != null ? (a.kerbHeightCm > 2 ? 'yes' : 'no') : 'unknown';
  const width: FeatureGridValue = a.widthCm != null ? (a.widthCm >= 90 ? 'yes' : 'no') : 'unknown';
  const surface: FeatureGridValue = a.surface
    ? (['asphalt', 'concrete', 'paving_stones', 'paved', 'concrete:plates'].includes(a.surface) ? 'yes' : 'no')
    : 'unknown';
  const boolCell = (v: boolean | null | undefined): FeatureGridValue => (v === true ? 'yes' : v === false ? 'no' : 'unknown');
  return [
    cell('steps', steps),
    cell('kerb', kerb),
    cell('ramp', boolCell(am?.ramp)),
    cell('elevator', boolCell(am?.elevator)),
    cell('width', width),
    cell('surface', surface),
    cell('toilet', boolCell(am?.toilet)),
    cell('rest', boolCell(am?.rest)),
  ];
}

/** Siatka 8 cech dla odcinka trasy (toaleta/odpoczynek zwykle unknown na samym odcinku). */
export function segmentFeatureGrid(
  accessibility: Partial<Accessibility>,
  extras?: { ramp?: boolean | null; elevator?: boolean | null; toilet?: boolean | null; rest?: boolean | null },
): FeatureGridCell[] {
  const a = accessibility;
  const steps: FeatureGridValue = a.steps === true ? 'yes' : a.steps === false ? 'no' : 'unknown';
  const kerb: FeatureGridValue = a.kerbHeightCm != null ? (a.kerbHeightCm > 2 ? 'yes' : 'no') : 'unknown';
  const width: FeatureGridValue = a.widthCm != null ? (a.widthCm >= 90 ? 'yes' : 'no') : 'unknown';
  const surface: FeatureGridValue = a.surface
    ? (['asphalt', 'concrete', 'paving_stones', 'paved', 'concrete:plates'].includes(a.surface) ? 'yes' : 'no')
    : 'unknown';
  const boolCell = (v: boolean | null | undefined): FeatureGridValue => (v === true ? 'yes' : v === false ? 'no' : 'unknown');
  return [
    cell('steps', steps),
    cell('kerb', kerb),
    cell('ramp', boolCell(extras?.ramp)),
    cell('elevator', boolCell(extras?.elevator)),
    cell('width', width),
    cell('surface', surface),
    cell('toilet', boolCell(extras?.toilet)),
    cell('rest', boolCell(extras?.rest)),
  ];
}

export function isTerrainChecked(place: Place): boolean {
  if (place.terrainChecked) return true;
  return place.evidence.some((e) => e.status === 'verified' && e.observedAt != null && (e.source === 'operator' || e.source === 'demo'));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}
export function formatDuration(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `ok. ${Math.max(1, min)} min`;
  return `ok. ${Math.floor(min / 60)} h ${min % 60} min`;
}

/** NMT is an additional ground profile, never proof of sidewalk accessibility. */
export type TerrainProfileResult = {
  source: string; sourceUrl: string; fetchedAt: string; surveyedAt: null;
  model: string; resolutionM: number; warning: string;
  points: (Coordinate & { distanceM: number; elevationM: number | null })[];
};

// ---------------------------------------------------------------------------
// Odkrywanie okolicy (comfort-first, bez wymogu celu)
// ---------------------------------------------------------------------------
export const exploreRequestSchema = z.object({
  origin: coordinateSchema,
  preferences: preferencesSchema.default({}),
  /** Promień poszukiwania miejsc od startu (m). Limity komfortu na mapie i tak są próbką lokalną. */
  radiusM: z.number().min(250).max(25_000).default(5_000),
});
export type ExploreRequest = z.infer<typeof exploreRequestSchema>;

/** Opcje promienia okolicy zależne od trybu aktywności. */
export function exploreRadiusOptions(activity: Activity): { value: number; label: string }[] {
  switch (activity) {
    case 'bike':
      return [
        { value: 3_000, label: '3 km' },
        { value: 5_000, label: '5 km' },
        { value: 10_000, label: '10 km' },
        { value: 15_000, label: '15 km' },
        { value: 20_000, label: '20 km' },
        { value: 25_000, label: '25 km' },
      ];
    case 'run':
      return [
        { value: 2_000, label: '2 km' },
        { value: 3_000, label: '3 km' },
        { value: 5_000, label: '5 km' },
        { value: 8_000, label: '8 km' },
      ];
    case 'walk':
    case 'skates':
      return [
        { value: 1_000, label: '1 km' },
        { value: 2_000, label: '2 km' },
        { value: 3_000, label: '3 km' },
        { value: 5_000, label: '5 km' },
      ];
    case 'wheelchair':
    default:
      return [
        { value: 400, label: '400 m' },
        { value: 600, label: '600 m' },
        { value: 1_000, label: '1 km' },
        { value: 2_000, label: '2 km' },
      ];
  }
}

export function defaultExploreRadiusM(activity: Activity): number {
  const opts = exploreRadiusOptions(activity);
  return opts[Math.min(1, opts.length - 1)]!.value;
}

export function clampExploreRadiusM(activity: Activity, radiusM: number): number {
  const opts = exploreRadiusOptions(activity);
  if (opts.some((o) => o.value === radiusM)) return radiusM;
  // Najbliższa dostępna wartość
  let best = opts[0]!;
  for (const o of opts) {
    if (Math.abs(o.value - radiusM) < Math.abs(best.value - radiusM)) best = o;
  }
  return best.value;
}

/** Opcjonalna docelowa długość trasy (łącznie). `null` = bez limitu. */
export function exploreTargetLengthOptions(activity: Activity): { value: number | null; label: string }[] {
  const any = { value: null as number | null, label: 'Bez limitu' };
  switch (activity) {
    case 'bike':
      return [any, { value: 5_000, label: '5 km' }, { value: 10_000, label: '10 km' }, { value: 15_000, label: '15 km' }, { value: 20_000, label: '20 km' }, { value: 30_000, label: '30 km' }, { value: 50_000, label: '50 km' }];
    case 'run':
      return [any, { value: 3_000, label: '3 km' }, { value: 5_000, label: '5 km' }, { value: 8_000, label: '8 km' }, { value: 12_000, label: '12 km' }];
    case 'walk':
    case 'skates':
      return [any, { value: 2_000, label: '2 km' }, { value: 3_000, label: '3 km' }, { value: 5_000, label: '5 km' }, { value: 8_000, label: '8 km' }];
    case 'wheelchair':
    default:
      return [any, { value: 500, label: '500 m' }, { value: 1_000, label: '1 km' }, { value: 2_000, label: '2 km' }, { value: 3_000, label: '3 km' }];
  }
}

/**
 * Promień okolicy pod cele w odpowiedniej odległości.
 * Przy „tam i z powrotem” szukamy punktu zwrotnego w ~połowie dystansu.
 */
export function exploreRadiusForTargetLength(activity: Activity, targetLengthM: number, roundTrip = false): number {
  const leg = roundTrip ? targetLengthM / 2 : targetLengthM;
  const need = Math.max(leg * 0.85, leg - 1_500);
  const opts = exploreRadiusOptions(activity);
  const ok = opts.find((o) => o.value >= need);
  return ok?.value ?? opts[opts.length - 1]!.value;
}

/** Kategorie „warte zobaczenia” – bez gastronomii i sklepów. */
export const EXPLORE_SIGHT_HINT = 'zabytki, muzea, parki, rzeźby, punkty widokowe';

export type ComfortEdgeStatus = 'ok' | 'uncertain' | 'excluded';
export type ComfortEdge = {
  id: string;
  status: ComfortEdgeStatus;
  reason: string | null;
  name: string;
  lengthM: number;
  geometry: LineString;
};

export type ExploreSuggestion = {
  place: Place;
  distanceM: number;
  fitSummary: string;
  gaps: string[];
};

export type ExploreResponse = {
  origin: Coordinate;
  radiusM: number;
  preferences: Preferences;
  places: Place[];
  barriers: Barrier[];
  comfortEdges: ComfortEdge[];
  stats: { ok: number; uncertain: number; excluded: number; sampled: number };
  suggestions: ExploreSuggestion[];
  disclaimer: string;
};
