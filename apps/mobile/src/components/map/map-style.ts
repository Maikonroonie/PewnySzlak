import type { StyleSpecification } from 'maplibre-gl';
import base from './base-style.json';

/** OpenFreeMap Positron, styled locally. OSM footprints; heights may be generalized. */
export const editorialMapStyle: StyleSpecification = {
  ...base,
  version: 8,
  name: 'PewnySzlak · Poranek w Krakowie',
  light: { anchor: 'viewport', color: '#fff7e9', intensity: 0.35, position: [1.5, 195, 50] },
  layers: base.layers.map((raw) => {
    const layer: any = JSON.parse(JSON.stringify(raw));
    const id = layer.id as string;
    layer.paint ??= {};
    if (layer.type === 'background') layer.paint['background-color'] = '#f3f0e7';
    if (layer.type === 'fill') {
      if (id === 'water') layer.paint['fill-color'] = '#a9cdc9';
      else if (id === 'park' || id.includes('wood')) layer.paint['fill-color'] = '#cadbbc';
      else if (id.includes('residential')) layer.paint['fill-color'] = '#ede9df';
    }
    if (layer.type === 'line' && id.includes('waterway')) layer.paint['line-color'] = '#a9cdc9';
    if (layer.type === 'symbol') {
      layer.paint['text-color'] = '#5b685c';
      layer.paint['text-halo-color'] = '#faf8ef';
    }
    if (id === 'building') return {
      id: 'buildings-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
      paint: {
        'fill-extrusion-color': '#d8d4c9',
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.2, ['coalesce', ['get', 'render_height'], 6]],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.82,
      },
    };
    return layer;
  }),
} as StyleSpecification;
export const mapStyle = process.env.EXPO_PUBLIC_MAP_STYLE_URL || editorialMapStyle;
