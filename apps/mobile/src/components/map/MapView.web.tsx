import { Map as MLMap, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { colors } from '../../theme';
import { KRAKOW_CENTER } from '../../lib/geo';
import { previewPosition, shortestBearing } from '../../lib/route-preview';
import { MapChrome } from './MapChrome';
import { mapStyle } from './map-style';
import { barrierColorExpr, barrierFeatures, MAP_ATTRIBUTION, markerColorExpr, markerFeatures, routeFeatures, type MapProps } from './types';

setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const srOnly = { position: 'absolute' as const, width: 1, height: 1, overflow: 'hidden' as const, opacity: 0 };

export default function MapView(props: MapProps) {
  const { accessibilityLabel, style, testID } = props;
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MLMap | null>(null);
  const loaded = useRef(false);
  const latest = useRef(props); latest.current = props;
  const [threeD, setThreeD] = useState(true);
  const dimension = useRef(threeD); dimension.current = threeD;
  const [error, setError] = useState(false);
  const routeData = useRef<{ route: MapProps['route']; data: GeoJSON.FeatureCollection }>({ route: null, data: EMPTY });

  function sync() {
    const m = map.current, p = latest.current;
    if (!m || !loaded.current) return;
    if (routeData.current.route !== p.route) routeData.current = { route: p.route, data: p.route ? routeFeatures(p.route) : EMPTY };
    (m.getSource('route') as GeoJSONSource)?.setData(routeData.current.data);
    (m.getSource('barriers') as GeoJSONSource)?.setData(barrierFeatures(p.barriers ?? []));
    const markers = [...(p.markers ?? [])];
    if (p.route && p.previewProgress != null) markers.push({ id: 'preview', kind: 'user', coordinate: previewPosition(p.route, p.previewProgress).point });
    (m.getSource('markers') as GeoJSONSource)?.setData(markerFeatures(markers));
    m.setFilter('route-selected', ['==', ['get', 'segmentId'], p.selectedSegmentId ?? '']);
  }
  function camera() {
    const m = map.current, p = latest.current;
    if (!m || !loaded.current) return;
    const pitch = dimension.current ? 54 : 0;
    if (p.route && p.previewProgress != null) {
      const sample = previewPosition(p.route, p.previewProgress);
      m.easeTo({ center: [sample.point.longitude, sample.point.latitude], pitch, zoom: dimension.current ? 17.6 : 16.7, bearing: dimension.current ? shortestBearing(m.getBearing(), sample.heading) : 0, duration: p.reduceMotion ? 0 : p.previewPlaying ? 160 : 1000 });
    } else if (p.bounds) {
      m.fitBounds([[p.bounds[0], p.bounds[1]], [p.bounds[2], p.bounds[3]]], { padding: 55, duration: p.reduceMotion ? 0 : 900, maxZoom: 17, pitch, bearing: dimension.current ? -18 : 0 });
    } else {
      const c = p.center ?? KRAKOW_CENTER;
      m.easeTo({ center: [c.longitude, c.latitude], pitch, zoom: p.follow ? 17.6 : p.zoom ?? 15.8, bearing: p.follow && p.heading != null ? shortestBearing(m.getBearing(), p.heading) : dimension.current ? -18 : 0, duration: p.reduceMotion ? 0 : 800 });
    }
  }
  useEffect(() => {
    if (!container.current) return;
    const p = latest.current, c = p.center ?? KRAKOW_CENTER;
    let m: MLMap;
    try {
      m = new MLMap({ container: container.current, style: mapStyle, center: [c.longitude, c.latitude], zoom: p.zoom ?? 15.8, pitch: 54, bearing: -18, minZoom: 10, maxZoom: 20, maxPitch: 70, attributionControl: false, pitchWithRotate: true, keyboard: true });
    } catch (cause) { console.warn('PewnySzlak: map initialization failed', cause); setError(true); return; }
    map.current = m;
    m.addControl(new NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right');
    m.on('error', () => setError(true));
    m.on('load', () => {
      for (const id of ['route', 'barriers', 'markers']) m.addSource(id, { type: 'geojson', data: EMPTY });
      const lineLayout = { 'line-cap': 'round', 'line-join': 'round' } as const;
      m.addLayer({ id: 'route-selected', type: 'line', source: 'route', filter: ['==', ['get', 'segmentId'], ''], paint: { 'line-color': '#DF9C8E', 'line-width': 25, 'line-opacity': 0.32 }, layout: lineLayout });
      m.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': '#FFFFFF', 'line-width': 11, 'line-opacity': 0.95 }, layout: lineLayout });
      m.addLayer({ id: 'route-ok', type: 'line', source: 'route', filter: ['all', ['!', ['get', 'uncertain']], ['!', ['get', 'difficult']]], paint: { 'line-color': colors.routeOk, 'line-width': 6 }, layout: lineLayout });
      m.addLayer({ id: 'route-uncertain', type: 'line', source: 'route', filter: ['all', ['get', 'uncertain'], ['!', ['get', 'difficult']]], paint: { 'line-color': colors.routeUncertain, 'line-width': 6, 'line-dasharray': [1.5, 1.2] }, layout: lineLayout });
      m.addLayer({ id: 'route-difficult', type: 'line', source: 'route', filter: ['get', 'difficult'], paint: { 'line-color': colors.routeDifficult, 'line-width': 8 }, layout: lineLayout });
      m.addLayer({ id: 'barrier-halo', type: 'circle', source: 'barriers', paint: { 'circle-radius': 17, 'circle-color': '#FFFFFF', 'circle-opacity': 0.92 } });
      m.addLayer({ id: 'barrier-dot', type: 'circle', source: 'barriers', paint: { 'circle-radius': 12, 'circle-color': barrierColorExpr as never, 'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF' } });
      m.addLayer({ id: 'barrier-label', type: 'symbol', source: 'barriers', layout: { 'text-field': '!', 'text-size': 15, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true }, paint: { 'text-color': '#FFFFFF' } });
      m.addLayer({ id: 'user-halo', type: 'circle', source: 'markers', filter: ['==', ['get', 'kind'], 'user'], paint: { 'circle-radius': 24, 'circle-color': colors.routeOk, 'circle-opacity': 0.18 } });
      m.addLayer({ id: 'marker-dot', type: 'circle', source: 'markers', paint: { 'circle-radius': 12, 'circle-color': markerColorExpr as never, 'circle-stroke-width': 4, 'circle-stroke-color': '#FFFFFF' } });
      m.addLayer({ id: 'marker-label', type: 'symbol', source: 'markers', layout: { 'text-field': ['get', 'label'], 'text-size': 13, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true }, paint: { 'text-color': '#FFFFFF' } });
      loaded.current = true; setError(false); sync(); camera();
    });
    m.on('dragstart', () => latest.current.onInteract?.());
    m.on('zoomstart', (event) => { if (event.originalEvent) latest.current.onInteract?.(); });
    m.on('click', (event) => {
      const p = latest.current;
      const layers = ['barrier-dot', 'route-difficult', 'route-ok', 'route-uncertain'].filter(l => m.getLayer(l));
      const hits = layers.length ? m.queryRenderedFeatures(event.point, { layers }) : [];
      const b = hits.find(f => f.properties?.barrierId);
      if (b) { const barrier = p.barriers?.find(v => v.id === b.properties.barrierId); if (barrier) p.onBarrierPress?.(barrier); return; }
      const s = hits.find(f => f.properties?.segmentId);
      if (s) { p.onSegmentPress?.(String(s.properties.segmentId)); return; }
      p.onPress?.({ longitude: event.lngLat.lng, latitude: event.lngLat.lat });
    });
    m.getCanvas().setAttribute('aria-hidden', 'true'); m.getCanvas().setAttribute('tabindex', '-1');
    const observer = new ResizeObserver(() => m.resize()); observer.observe(container.current);
    return () => { observer.disconnect(); m.remove(); map.current = null; loaded.current = false; };
  }, []);
  useEffect(sync, [props.route, props.barriers, props.markers, props.selectedSegmentId]);
  useEffect(() => {
    const m = map.current, p = latest.current;
    if (m && loaded.current) {
      const markers = [...(p.markers ?? [])];
      if (p.route && p.previewProgress != null) markers.push({ id: 'preview', kind: 'user', coordinate: previewPosition(p.route, p.previewProgress).point });
      (m.getSource('markers') as GeoJSONSource)?.setData(markerFeatures(markers));
    }
    camera();
  }, [props.bounds, props.center, props.zoom, props.heading, props.follow, props.reduceMotion, props.previewProgress, threeD]);

  return <View style={[{ flex: 1, minHeight: 260, borderRadius: 24, overflow: 'hidden', backgroundColor: '#e6ebdf' }, style]} testID={testID}>
    <Text style={srOnly}>{accessibilityLabel}</Text>
    <View style={{ flex: 1 }}><div ref={container} style={{ width: '100%', height: '100%', minHeight: 260 }} /></View>
    <MapChrome threeD={threeD} onToggle={() => { props.onInteract?.(); setThreeD(v => !v); }} error={error} />
    <Text style={{ fontSize: 10, color: colors.textMuted, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#F6F5EF' }}>{MAP_ATTRIBUTION} · Bryły budynków poglądowe</Text>
  </View>;
}
