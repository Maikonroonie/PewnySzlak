import { Camera, GeoJSONSource, Layer, Map as MLMap, type CameraRef } from '@maplibre/maplibre-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { previewPosition, shortestBearing } from '../../lib/route-preview';
import { MapChrome } from './MapChrome';
import { mapStyle } from './map-style';
import { colors } from '../../theme';
import { KRAKOW_CENTER } from '../../lib/geo';
import { barrierColorExpr, barrierFeatures, MAP_ATTRIBUTION, markerColorExpr, markerFeatures, routeFeatures, type MapProps } from './types';

export default function MapView({ route, barriers = [], markers = [], bounds, center, zoom = 14, heading, follow, reduceMotion, previewProgress, previewPlaying, selectedSegmentId, onInteract, onPress, onBarrierPress, onSegmentPress, accessibilityLabel, style, testID }: MapProps) {
  const camera = useRef<CameraRef>(null);
  const [threeD, setThreeD] = useState(true);
  const angle = useRef(0);
  const pitch = threeD ? 54 : 0;
  const preview = useMemo(() => route && previewProgress != null ? previewPosition(route, previewProgress) : null, [route, previewProgress]);
  const routeFc = useMemo(() => (route ? routeFeatures(route) : null), [route]);
  const barrierFc = useMemo(() => barrierFeatures(barriers), [barriers]);
  const markerFc = useMemo(() => markerFeatures([...markers, ...(preview ? [{ id: 'preview', kind: 'user' as const, coordinate: preview.point }] : [])]), [markers, preview]);
  const duration = reduceMotion ? 0 : 600;

  useEffect(() => {
    if (bounds && !preview) camera.current?.fitBounds(bounds, { padding: { top: 40, right: 40, bottom: 40, left: 40 }, duration });
  }, [bounds, duration, !!preview]);

  useEffect(() => {
    if (!bounds && center && !preview) camera.current?.easeTo({ center: [center.longitude, center.latitude], pitch, zoom: follow ? 17.6 : zoom, bearing: follow && heading != null ? heading : 0, duration });
  }, [center, zoom, heading, follow, bounds, duration, !!preview, pitch]);

  useEffect(() => {
    if (preview) { angle.current = shortestBearing(angle.current, preview.heading); camera.current?.easeTo({ center: [preview.point.longitude, preview.point.latitude], bearing: threeD ? angle.current : 0, pitch, zoom: threeD ? 17.6 : 16.7, duration: reduceMotion ? 0 : previewPlaying ? 160 : 1000 }); }
  }, [preview, pitch, threeD, reduceMotion]);
  useEffect(() => { camera.current?.setStop({ pitch, duration }); }, [pitch, duration]);

  const initial = center ?? KRAKOW_CENTER;

  return (
    <View style={[{ flex: 1, minHeight: 260, borderRadius: 24, overflow: 'hidden' }, style]} testID={testID}>
      <View accessible accessibilityLabel={accessibilityLabel} accessibilityHint="Mapa poglądowa. Wszystkie funkcje są dostępne poza mapą." style={{ flex: 1 }}>
        <MLMap
          style={{ flex: 1 }}
          mapStyle={mapStyle as never}
          attribution={false}
          logo={false}
          compass
          touchPitch
          onPress={(e) => { const [lng, lat] = e.nativeEvent.lngLat; onPress?.({ longitude: lng, latitude: lat }); }}
        >
          <Camera ref={camera} initialViewState={{ center: [initial.longitude, initial.latitude], zoom, pitch, bearing: -18 }} minZoom={10} maxZoom={19} />
          {routeFc ? (
            <GeoJSONSource id="route" data={routeFc} onPress={(e) => { const f = e.nativeEvent.features[0]; if (f?.properties?.segmentId) onSegmentPress?.(String(f.properties.segmentId)); }} hitbox={{ top: 12, right: 12, bottom: 12, left: 12 }}>
              <Layer id="route-selected" type="line" filter={['==', ['get', 'segmentId'], selectedSegmentId ?? '']} paint={{ 'line-color': '#DF9C8E', 'line-width': 25, 'line-opacity': 0.32 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
              <Layer id="route-casing" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 9, 'line-opacity': 0.9 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
              <Layer id="route-ok" type="line" filter={['all', ['!', ['get', 'uncertain']], ['!', ['get', 'difficult']]]} paint={{ 'line-color': colors.routeOk, 'line-width': 5 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
              <Layer id="route-uncertain" type="line" filter={['all', ['get', 'uncertain'], ['!', ['get', 'difficult']]]} paint={{ 'line-color': colors.routeUncertain, 'line-width': 5, 'line-dasharray': [1.5, 1.2] }} layout={{ 'line-join': 'round' }} />
              <Layer id="route-difficult" type="line" filter={['get', 'difficult']} paint={{ 'line-color': colors.routeDifficult, 'line-width': 8 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
            </GeoJSONSource>
          ) : null}
          <GeoJSONSource id="barriers" data={barrierFc} onPress={(e) => { const f = e.nativeEvent.features[0]; const b = barriers.find((x) => x.id === f?.properties?.barrierId); if (b) onBarrierPress?.(b); }} hitbox={{ top: 16, right: 16, bottom: 16, left: 16 }}>
            <Layer id="barrier-halo" type="circle" paint={{ 'circle-radius': 13, 'circle-color': '#FFFFFF', 'circle-opacity': 0.9 }} />
            <Layer id="barrier-dot" type="circle" paint={{ 'circle-radius': 9, 'circle-color': barrierColorExpr as never, 'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF' }} />
            <Layer id="barrier-label" type="symbol" layout={{ 'text-field': '!', 'text-size': 13, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true }} paint={{ 'text-color': '#FFFFFF' }} />
          </GeoJSONSource>
          <GeoJSONSource id="markers" data={markerFc}>
            <Layer id="marker-dot" type="circle" paint={{ 'circle-radius': ['match', ['get', 'kind'], 'user', 9, 12] as never, 'circle-color': markerColorExpr as never, 'circle-stroke-width': 3, 'circle-stroke-color': '#FFFFFF' }} />
            <Layer id="marker-label" type="symbol" layout={{ 'text-field': ['get', 'label'] as never, 'text-size': 13, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true }} paint={{ 'text-color': '#FFFFFF' }} />
          </GeoJSONSource>
        </MLMap>
      </View>
      <MapChrome threeD={threeD} onToggle={() => { onInteract?.(); setThreeD(v => !v); }} />
      <Text style={{ fontSize: 10, color: colors.textMuted, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.surface }}>{MAP_ATTRIBUTION} · Bryły budynków poglądowe</Text>
    </View>
  );
}
