/**
 * Kolory dobrane pod kontrast ≥ 4,5:1 na jasnym tle (WCAG AA dla tekstu).
 * Znaczenie nigdy nie jest przekazywane samym kolorem – zawsze towarzyszy mu tekst lub ikona.
 */
export const colors = {
  bg: '#FFFFFF',
  surface: '#F4F6F8',
  border: '#C7CDD4',
  text: '#14171A',
  textMuted: '#4B5563', // 7.6:1 na białym
  primary: '#0B5FA5', // 6.4:1 na białym
  primaryText: '#FFFFFF',
  ok: '#1B6B3A', // 6.1:1
  warn: '#8A5A00', // 5.9:1
  danger: '#A61B1B', // 7.0:1
  info: '#1F4E79',
  focus: '#FFB300',
  routeOk: '#0B5FA5',
  routeUncertain: '#B26A00',
  barrierActive: '#A61B1B',
  barrierPotential: '#B26A00',
  barrierDisputed: '#6B21A8',
  barrierResolved: '#4B5563',
};

export const spacing = (n: number) => n * 8;
export const radius = 10;
export const minTouch = 48;
