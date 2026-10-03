import { Camera, GeoJSONSource, Layer, Map as MLMap, type CameraRef } from '@maplibre/maplibre-react-native';
import React, { useEffect, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import { colors } from '../../theme';
import { KRAKOW_CENTER } from '../../lib/geo';
import { barrierColorExpr, barrierFeatures, MAP_ATTRIBUTION, MAP_STYLE_URL, markerColorExpr, markerFeatures, routeFeatures, type MapProps } from './types';

export default function MapView({ route, barriers = [], markers = [], bounds, center, zoom = 14, heading, follow, reduceMotion, onPress, onBarrierPress, onSegmentPress, accessibilityLabel, style, testID }: MapProps) {
  const camera = useRef<CameraRef>(null);
  const routeFc = useMemo(() => (route ? routeFeatures(route) : null), [route]);
  const barrierFc = useMemo(() => barrierFeatures(barriers), [barriers]);
  const markerFc = useMemo(() => markerFeatures(markers), [markers]);
  const duration = reduceMotion ? 0 : 600;

  useEffect(() => {
    if (bounds) camera.current?.fitBounds(bounds, { padding: { top: 40, right: 40, bottom: 40, left: 40 }, duration });
  }, [bounds, duration]);

  useEffect(() => {
    if (!bounds && center) camera.current?.easeTo({ center: [center.longitude, center.latitude], zoom: follow ? 17 : zoom, bearing: follow && heading != null ? heading : 0, duration });
  }, [center, zoom, heading, follow, bounds, duration]);

  const initial = center ?? KRAKOW_CENTER;

  return (
    <View style={[{ flex: 1, minHeight: 240 }, style]} testID={testID}>
      <View accessible accessibilityLabel={accessibilityLabel} accessibilityHint="Mapa poglądowa. Wszystkie funkcje są dostępne poza mapą." style={{ flex: 1 }}>
        <MLMap
          style={{ flex: 1 }}
          mapStyle={MAP_STYLE_URL}
          attribution={false}
          logo={false}
          compass
          touchPitch={false}
          onPress={(e) => { const [lng, lat] = e.nativeEvent.lngLat; onPress?.({ longitude: lng, latitude: lat }); }}
        >
          <Camera ref={camera} initialViewState={{ center: [initial.longitude, initial.latitude], zoom }} minZoom={10} maxZoom={19} />
          {routeFc ? (
            <GeoJSONSource id="route" data={routeFc} onPress={(e) => { const f = e.nativeEvent.features[0]; if (f?.properties?.segmentId) onSegmentPress?.(String(f.properties.segmentId)); }} hitbox={{ top: 12, right: 12, bottom: 12, left: 12 }}>
              <Layer id="route-casing" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 9, 'line-opacity': 0.9 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
              <Layer id="route-ok" type="line" filter={['!', ['get', 'uncertain']]} paint={{ 'line-color': colors.routeOk, 'line-width': 5 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
              <Layer id="route-uncertain" type="line" filter={['get', 'uncertain']} paint={{ 'line-color': colors.routeUncertain, 'line-width': 5, 'line-dasharray': [1.5, 1.2] }} layout={{ 'line-join': 'round' }} />
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
      <Text style={{ fontSize: 11, color: colors.textMuted, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.surface }}>{MAP_ATTRIBUTION}</Text>
    </View>
  );
}
