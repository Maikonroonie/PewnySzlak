import { Map as MLMap, NavigationControl, setWorkerUrl, type GeoJSONSource, type MapMouseEvent, type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { colors } from '../../theme';
import { KRAKOW_CENTER } from '../../lib/geo';
import { barrierColorExpr, barrierFeatures, MAP_ATTRIBUTION, MAP_STYLE_URL, markerColorExpr, markerFeatures, routeFeatures, type MapProps } from './types';

const srOnly = { position: 'absolute' as const, width: 1, height: 1, overflow: 'hidden' as const, opacity: 0 };
// Worker MapLibre jest kopiowany do public/maplibre przez scripts/copy-maplibre-worker.mjs (Metro nie bundluje module workerów).
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export default function MapView({ route, barriers = [], markers = [], bounds, center, zoom = 14, heading, follow, reduceMotion, onPress, onBarrierPress, onSegmentPress, accessibilityLabel, style, testID }: MapProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MLMap | null>(null);
  const loaded = useRef(false);
  const handlers = useRef({ onPress, onBarrierPress, onSegmentPress, barriers });
  handlers.current = { onPress, onBarrierPress, onSegmentPress, barriers };

  useEffect(() => {
    if (!container.current || map.current) return;
    const initial = center ?? KRAKOW_CENTER;
    const m = new MLMap({
      container: container.current,
      style: MAP_STYLE_URL,
      center: [initial.longitude, initial.latitude],
      zoom,
      minZoom: 10,
      maxZoom: 19,
      attributionControl: false,
      pitchWithRotate: false,
      // Mapa nie jest jedynym sposobem obsługi – klawiatura sterowana jest przyciskami aplikacji; MapLibre dodaje własną obsługę strzałek.
      keyboard: true,
    });
    m.addControl(new NavigationControl({ showCompass: true, visualizePitch: false }), 'top-right');
    m.on('load', () => {
      m.addSource('route', { type: 'geojson', data: EMPTY });
      m.addSource('barriers', { type: 'geojson', data: EMPTY });
      m.addSource('markers', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': '#FFFFFF', 'line-width': 9, 'line-opacity': 0.9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      m.addLayer({ id: 'route-ok', type: 'line', source: 'route', filter: ['!', ['get', 'uncertain']], paint: { 'line-color': colors.routeOk, 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      m.addLayer({ id: 'route-uncertain', type: 'line', source: 'route', filter: ['get', 'uncertain'], paint: { 'line-color': colors.routeUncertain, 'line-width': 5, 'line-dasharray': [1.5, 1.2] }, layout: { 'line-join': 'round' } });
      m.addLayer({ id: 'barrier-halo', type: 'circle', source: 'barriers', paint: { 'circle-radius': 13, 'circle-color': '#FFFFFF', 'circle-opacity': 0.9 } });
      m.addLayer({ id: 'barrier-dot', type: 'circle', source: 'barriers', paint: { 'circle-radius': 9, 'circle-color': barrierColorExpr as never, 'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF' } });
      m.addLayer({ id: 'barrier-label', type: 'symbol', source: 'barriers', layout: { 'text-field': '!', 'text-size': 13, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true }, paint: { 'text-color': '#FFFFFF' } });
      m.addLayer({ id: 'marker-dot', type: 'circle', source: 'markers', paint: { 'circle-radius': ['match', ['get', 'kind'], 'user', 9, 12] as never, 'circle-color': markerColorExpr as never, 'circle-stroke-width': 3, 'circle-stroke-color': '#FFFFFF' } });
      m.addLayer({ id: 'marker-label', type: 'symbol', source: 'markers', layout: { 'text-field': ['get', 'label'] as never, 'text-size': 13, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true }, paint: { 'text-color': '#FFFFFF' } });
      loaded.current = true;
      // odśwież dane po załadowaniu stylu
      sync();
    });
    m.on('click', (e: MapMouseEvent) => {
      const h = handlers.current;
      const hits = m.queryRenderedFeatures(e.point, { layers: ['barrier-dot', 'route-ok', 'route-uncertain'].filter((l) => m.getLayer(l)) });
      const barrierHit = hits.find((f: MapGeoJSONFeature) => f.layer.id === 'barrier-dot');
      if (barrierHit) { const b = h.barriers.find((x) => x.id === barrierHit.properties?.barrierId); if (b) { h.onBarrierPress?.(b); return; } }
      const segHit = hits.find((f: MapGeoJSONFeature) => f.layer.id.startsWith('route-'));
      if (segHit?.properties?.segmentId) { h.onSegmentPress?.(String(segHit.properties.segmentId)); return; }
      h.onPress?.({ longitude: e.lngLat.lng, latitude: e.lngLat.lat });
    });
    for (const layer of ['barrier-dot', 'route-ok', 'route-uncertain']) {
      m.on('mouseenter', layer, () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = ''; });
    }
    map.current = m;
    // Canvas nie jest celem dla czytnika – opis mapy jest w opakowaniu.
    m.getCanvas().setAttribute('aria-hidden', 'true');
    m.getCanvas().setAttribute('tabindex', '-1');
    return () => { m.remove(); map.current = null; loaded.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sync = () => {
    const m = map.current;
    if (!m || !loaded.current) return;
    (m.getSource('route') as GeoJSONSource | undefined)?.setData(route ? routeFeatures(route) : EMPTY);
    (m.getSource('barriers') as GeoJSONSource | undefined)?.setData(barrierFeatures(barriers));
    (m.getSource('markers') as GeoJSONSource | undefined)?.setData(markerFeatures(markers));
  };
  useEffect(sync, [route, barriers, markers]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      if (bounds) m.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 40, duration: reduceMotion ? 0 : 600, maxZoom: 17 });
      else if (center) m.easeTo({ center: [center.longitude, center.latitude], zoom: follow ? 17 : zoom, bearing: follow && heading != null ? heading : 0, duration: reduceMotion ? 0 : 600 });
    };
    if (m.loaded()) apply(); else m.once('load', apply);
  }, [bounds, center, zoom, heading, follow, reduceMotion]);

  return (
    <View style={[{ flex: 1, minHeight: 240 }, style]} testID={testID}>
      {/* Opis mapy dla czytników ekranu; sama mapa (canvas) jest poza drzewem dostępności, a jej przyciski zoomu są zwykłymi przyciskami. */}
      <Text style={srOnly}>{accessibilityLabel}</Text>
      <View style={{ flex: 1 }}>
        <div ref={container} style={{ width: '100%', height: '100%', minHeight: 240 }} />
      </View>
      <Text style={{ fontSize: 11, color: colors.textMuted, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.surface }}>{MAP_ATTRIBUTION}</Text>
    </View>
  );
}
