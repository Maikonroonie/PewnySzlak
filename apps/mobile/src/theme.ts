import { Platform } from 'react-native';

/** Jasna, sportowa paleta w stylu iOS – kontrast ≥ 4,5:1. */
export const colors = {
  bg: '#F5F5F7',
  surface: '#FFFFFF',
  paper: '#FFFFFF',
  border: '#E5E5EA',
  text: '#1C1C1E',
  textMuted: '#6C6C70',
  primary: '#007AFF',
  primaryText: '#FFFFFF',
  ok: '#248A3D',
  warn: '#C93400',
  danger: '#D70015',
  info: '#007AFF',
  focus: '#007AFF',
  routeOk: '#007AFF',
  routeUncertain: '#FF9F0A',
  routeDifficult: '#FF3B30',
  barrierActive: '#FF3B30',
  barrierPotential: '#FF9F0A',
  barrierDisputed: '#BF5AF2',
  barrierResolved: '#8E8E93',
  sage: '#EEF6FF',
  peach: '#FFF4EC',
  cream: '#F4F4F6',
  hairline: '#D1D1D6',
};

export const headingFont = Platform.select({
  ios: 'System',
  android: 'sans-serif-medium',
  default: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
}) as string;

export const spacing = (n: number) => n * 8;
export const radius = 22;
export const minTouch = 48;
export const tabBarHeight = 72;
