import { segmentDifficulty } from '../../lib/route-preview';
import type { Barrier, ComfortEdge, Coordinate, RouteResult } from '@pewnyszlak/domain';

export const MAP_STYLE_URL = process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty';
export const MAP_ATTRIBUTION = process.env.EXPO_PUBLIC_MAP_ATTRIBUTION ?? 'Mapa: © OpenFreeMap · © OpenMapTiles · dane © autorzy OpenStreetMap (ODbL). Wygląd inspirowany Apple Maps (to nie jest MapKit).';
/** Krótka atrybucja na mapie (pełny tekst na ekranie Źródła). */
export const MAP_ATTRIBUTION_SHORT = '© OpenFreeMap · OpenMapTiles · OSM';

export type MapMarker = { id: string; coordinate: Coordinate; kind: 'origin' | 'destination' | 'user' | 'pin' | 'waypoint'; label?: string };

export type MapProps = {
  route?: RouteResult | null;
  comfortEdges?: ComfortEdge[];
  barriers?: Barrier[];
  markers?: MapMarker[];
  /** Ramka do pokazania (minLon, minLat, maxLon, maxLat); ma pierwszeństwo przed center. */
  bounds?: [number, number, number, number] | null;
  center?: Coordinate;
  zoom?: number;
  heading?: number | null;
  previewPlaying?: boolean;
  previewProgress?: number | null;
  selectedSegmentId?: string | null;
  onInteract?: () => void;
  follow?: boolean;
  reduceMotion?: boolean;
  onPress?: (c: Coordinate) => void;
  onBarrierPress?: (b: Barrier) => void;
  onSegmentPress?: (segmentId: string) => void;
  onMarkerPress?: (markerId: string) => void;
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
      properties: { segmentId: s.id, uncertain: s.uncertain, difficult: segmentDifficulty(s).length > 0, kind: s.kind, name: s.name },
      geometry: s.geometry,
    })),
  };
}

export function comfortFeatures(edges: ComfortEdge[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: edges.map((e) => ({
      type: 'Feature',
      id: e.id,
      properties: { edgeId: e.id, status: e.status, reason: e.reason, name: e.name },
      geometry: e.geometry,
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
    features: markers.map((m) => ({
      type: 'Feature',
      id: m.id,
      properties: {
        markerId: m.id,
        kind: m.kind,
        label: m.label ?? (m.kind === 'origin' ? 'S' : m.kind === 'destination' ? 'C' : m.kind === 'waypoint' ? 'P' : ''),
      },
      geometry: { type: 'Point', coordinates: [m.coordinate.longitude, m.coordinate.latitude] },
    })),
  };
}

export const barrierColorExpr = ['match', ['get', 'state'], 'active', '#FF3B30', 'potential', '#FF9F0A', 'disputed', '#BF5AF2', 'resolved', '#8E8E93', '#8E8E93'] as const;
export const markerColorExpr = ['match', ['get', 'kind'], 'origin', '#34C759', 'destination', '#007AFF', 'user', '#111111', 'waypoint', '#FF9F0A', '#111111'] as const;
export const comfortColorExpr = ['match', ['get', 'status'], 'ok', '#34C759', 'uncertain', '#FF9F0A', 'excluded', '#FF3B30', '#8E8E93'] as const;
