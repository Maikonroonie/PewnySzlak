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
export const preferencesSchema = z.object({
  avoidSteps: z.boolean().default(true),
  avoidRoughSurface: z.boolean().default(true),
  maxIncline: z.number().min(0).max(30).default(6),
  maxKerbHeightCm: z.number().min(0).max(30).default(2),
  minWidthCm: z.number().min(30).max(250).default(90),
  unknownPolicy: z.enum(['penalize', 'exclude']).default('penalize'),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const DEFAULT_PREFERENCES: Preferences = preferencesSchema.parse({});

export type DataMode = 'live' | 'demo';
export const dataModeSchema = z.enum(['live', 'demo']);

// ---------------------------------------------------------------------------
// Źródła i wiarygodność
// ---------------------------------------------------------------------------
export type Source = 'osm' | 'community' | 'z-dykty' | 'nfz' | 'psoz' | 'operator' | 'demo';
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
  address: string | null;
  coordinate: Coordinate | null;
  accessibility: Partial<Accessibility>;
  amenities?: FacilityAmenities;
  evidence: Evidence[];
  /** Czy dojście od grafu do wejścia jest zmapowane (OSM entrance / footway do budynku). */
  entranceVerified: boolean;
  distanceM?: number;
};

export type FacilityAmenities = {
  ramp: boolean | null;
  toilet: boolean | null;
  elevator: boolean | null;
  carPark: boolean | null;
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
};

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
  | { type: 'open-preferences'; label: string };

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
