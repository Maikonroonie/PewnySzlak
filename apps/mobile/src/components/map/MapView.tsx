// Metro wybiera MapView.web.tsx / MapView.native.tsx; ten plik służy TypeScriptowi i jako fallback.
export { default } from './MapView.native';
export type { MapMarker, MapProps } from './types';
