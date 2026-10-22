import type { ChartTone } from '../../../src/modules/academy/content/v3/schema.js';

/**
 * Mockup hex -> chart tone (design §6.4). Surfaces and borders never become tones. Builders use
 * `tone('#hex')` so the mapping stays reviewable in one place.
 */
const TONES: Readonly<Record<string, ChartTone>> = {
  '#2bb886': 'pos',
  '#7fe0bd': 'pos',
  '#3fc495': 'pos',
  '#199e70': 'pos',
  '#3d9e6e': 'pos',
  '#5f8f7f': 'pos',
  'var(--c1)': 'p1',
  'var(--c2)': 'p2',
  '#e66767': 'neg',
  '#f2a0a0': 'neg',
  '#3987e5': 'p1',
  '#249bec': 'p1',
  '#5db8ff': 'p1',
  '#7fb8ff': 'p1',
  '#4a95e8': 'p1',
  '#5ba3eb': 'p1',
  '#6cb1ee': 'p1',
  '#7dbff1': 'p1',
  '#dfb969': 'warn',
  '#e8c77d': 'warn',
  '#c99a35': 'warn',
  '#d9a33a': 'warn',
  '#e8a33d': 'warn',
  '#f0d48f': 'warn',
  '#d95926': 'p5',
  '#f0a07a': 'p5',
  '#e09a6c': 'p5',
  '#ff9f6e': 'p5',
  '#e879f9': 'p4',
  '#b48cf2': 'p4',
  '#b77ee6': 'p4',
  '#c9a0f0': 'p4',
  '#6d8399': 'p3',
  '#95a9be': 'p3',
  '#4b6580': 'p3',
  '#3a4b5e': 'neutral',
  '#c9d6e4': 'price',
  '#e7eff9': 'price',
  '#3fc6e0': 'info',
  '#6fd6ea': 'info',
};

export function tone(hex: string): ChartTone {
  const t = TONES[hex.toLowerCase()];
  if (!t) throw new Error(`no chart tone for ${hex}`);
  return t;
}

/** Legend dot colour of a mockup `.legend` entry. */
export const legendTone = (css: string): ChartTone => tone(css.trim());
