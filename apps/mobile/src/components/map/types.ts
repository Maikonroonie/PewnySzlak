import type { Barrier, Coordinate, RouteResult } from '@pewnyszlak/domain';

export const MAP_STYLE_URL = process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty';
export const MAP_ATTRIBUTION = process.env.EXPO_PUBLIC_MAP_ATTRIBUTION ?? 'Mapa: © OpenFreeMap · © OpenMapTiles · dane © autorzy OpenStreetMap (ODbL)';

export type MapMarker = { id: string; coordinate: Coordinate; kind: 'origin' | 'destination' | 'user' | 'pin' };

export type MapProps = {
  route?: RouteResult | null;
  barriers?: Barrier[];
  markers?: MapMarker[];
  /** Ramka do pokazania (minLon, minLat, maxLon, maxLat); ma pierwszeństwo przed center. */
  bounds?: [number, number, number, number] | null;
  center?: Coordinate;
  zoom?: number;
  heading?: number | null;
  follow?: boolean;
  reduceMotion?: boolean;
  onPress?: (c: Coordinate) => void;
  onBarrierPress?: (b: Barrier) => void;
  onSegmentPress?: (segmentId: string) => void;
  /** Tekst alternatywny mapy dla czytników ekranu. */
  accessibilityLabel: string;
  style?: object;
  testID?: string;
};

export function routeFeatures(route: RouteResult): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: route.segments.map((s) => ({
      type: 'Feature',
      id: s.id,
      properties: { segmentId: s.id, uncertain: s.uncertain, kind: s.kind, name: s.name },
      geometry: s.geometry,
    })),
  };
}

export function barrierFeatures(barriers: Barrier[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: barriers.filter((b) => b.coordinate).map((b) => ({
      type: 'Feature',
      id: b.id,
      properties: { barrierId: b.id, state: b.state, title: b.title, isDemo: b.isDemo },
      geometry: { type: 'Point', coordinates: [b.coordinate!.longitude, b.coordinate!.latitude] },
    })),
  };
}

export function markerFeatures(markers: MapMarker[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: markers.map((m) => ({ type: 'Feature', id: m.id, properties: { kind: m.kind, label: m.kind === 'origin' ? 'A' : m.kind === 'destination' ? 'B' : '' }, geometry: { type: 'Point', coordinates: [m.coordinate.longitude, m.coordinate.latitude] } })),
  };
}

export const barrierColorExpr = ['match', ['get', 'state'], 'active', '#A61B1B', 'potential', '#B26A00', 'disputed', '#6B21A8', 'resolved', '#4B5563', '#4B5563'] as const;
export const markerColorExpr = ['match', ['get', 'kind'], 'origin', '#1B6B3A', 'destination', '#0B5FA5', 'user', '#1F4E79', '#14171A'] as const;
