import type { StyleSpecification } from 'maplibre-gl';
import base from './base-style.json';

/** OpenFreeMap / OSM – kolory jak jasna mapa Apple (nie MapKit; Apple Maps nie działa na Androidzie). */
const apple = {
  land: '#F2EFEA',
  residential: '#EFECE6',
  park: '#C9E4B8',
  wood: '#B7D6A4',
  water: '#A4D2E3',
  building: '#E0DBD3',
  building3d: '#D5D0C8',
  road: '#FFFFFF',
  roadCasing: '#D8D3CB',
  minor: '#F7F5F1',
  motorway: '#F6D27A',
  motorwayCasing: '#E2B94A',
  rail: '#D3CEC6',
  label: '#3A3A3C',
  labelMuted: '#6C6C70',
  halo: '#FFFFFF',
};

export const appleMapStyle: StyleSpecification = {
  ...base,
  version: 8,
  name: 'PewnySzlak · Apple light',
  light: { anchor: 'viewport', color: '#ffffff', intensity: 0.28, position: [1.15, 210, 30] },
  layers: base.layers.map((raw) => {
    const layer: any = JSON.parse(JSON.stringify(raw));
    const id = String(layer.id);
    layer.paint ??= {};
    if (layer.type === 'background') layer.paint['background-color'] = apple.land;
    if (layer.type === 'fill') {
      if (id === 'water' || id.includes('aeroway-area')) layer.paint['fill-color'] = apple.water;
      else if (id === 'park') layer.paint['fill-color'] = apple.park;
      else if (id.includes('wood')) layer.paint['fill-color'] = apple.wood;
      else if (id.includes('residential')) layer.paint['fill-color'] = apple.residential;
      else if (id.includes('ice') || id.includes('glacier')) layer.paint['fill-color'] = '#E8F2F6';
    }
    if (layer.type === 'line') {
      if (id.includes('waterway')) layer.paint['line-color'] = apple.water;
      else if (id.includes('motorway') && id.includes('casing')) layer.paint['line-color'] = apple.motorwayCasing;
      else if (id.includes('motorway')) layer.paint['line-color'] = apple.motorway;
      else if (id.includes('casing')) layer.paint['line-color'] = apple.roadCasing;
      else if (id.includes('path')) layer.paint['line-color'] = '#E7E2DA';
      else if (id.includes('minor') || id.includes('subtle')) layer.paint['line-color'] = apple.minor;
      else if (id.includes('railway')) layer.paint['line-color'] = apple.rail;
      else if (id.includes('highway') || id.includes('road')) layer.paint['line-color'] = apple.road;
      else if (id.includes('boundary')) layer.paint['line-color'] = '#C9C4BC';
    }
    if (layer.type === 'symbol') {
      layer.paint['text-color'] = id.includes('water') ? '#3E7A90' : id.includes('place') || id.includes('country') ? apple.label : apple.labelMuted;
      layer.paint['text-halo-color'] = apple.halo;
      layer.paint['text-halo-width'] = 1.2;
    }
    if (id === 'building') {
      return {
        id: 'buildings-3d',
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 15,
        paint: {
          'fill-extrusion-color': apple.building3d,
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 16.2, ['coalesce', ['get', 'render_height'], 8]],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.88,
        },
      };
    }
    return layer;
  }),
} as StyleSpecification;

export const mapStyle = process.env.EXPO_PUBLIC_MAP_STYLE_URL || appleMapStyle;
