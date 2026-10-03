import { Platform } from 'react-native';

/** Warm editorial palette. Statuses always have a text/pattern equivalent. */
export const colors = {
  bg: '#F6F5EF', surface: '#EEEFE7', paper: '#FFFFFF', border: '#DDDED4',
  text: '#243C32', textMuted: '#58665C', primary: '#254F3E', primaryText: '#FFFFFF',
  ok: '#315E43', warn: '#88540E', danger: '#B63E32', info: '#355951', focus: '#A55D14',
  routeOk: '#387259', routeUncertain: '#B67B25', routeDifficult: '#D74B3E',
  barrierActive: '#B63E32', barrierPotential: '#88540E', barrierDisputed: '#704D85', barrierResolved: '#657167',
  sage: '#DEE8D8', peach: '#F5DED0', cream: '#F5EBCF',
};
export const headingFont = Platform.OS === 'ios' || Platform.OS === 'web' ? 'Georgia' : 'serif';
export const spacing = (n: number) => n * 8;
export const radius = 20;
export const minTouch = 48;
