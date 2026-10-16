import { Platform, type TextStyle } from 'react-native';

import { generatedTokens } from './tokens.generated';

/** Semantic colour roles (generated from frontend/src/index.css; see scripts/sync-design-tokens.mjs). */
export type Palette = Record<keyof typeof generatedTokens.light, string> & {
  /** Text on destructive surfaces. index.css defines none; the web uses the light primary foreground. */
  destructiveForeground: string;
};

function palette(source: Record<string, string>): Palette {
  return { ...(source as Omit<Palette, 'destructiveForeground'>), destructiveForeground: source.primaryForeground };
}

export const lightPalette: Palette = palette(generatedTokens.light);
export const darkPalette: Palette = palette(generatedTokens.dark);

export const shadows = generatedTokens.shadows;

const g = generatedTokens.geometry;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** control = buttons/inputs/tabs (4px); card = cards/panels (8px, from --radius). */
export const radius = { control: 4, card: g.radius, pill: 999 } as const;

/** mobile/DESIGN.md §3: inputs and primary buttons 44; compact controls 32 visual with 44 (iOS) / 48 (Android) touch boxes. */
export const layout = {
  pagePadding: g.pagePadding,
  /** Text inputs and primary buttons. */
  inputHeight: 44,
  /** Compact controls (chips, segmented, inline buttons, line tabs, icon buttons): visual height. */
  controlHeight: 32,
  controlHeightSm: 32,
  controlHeightLg: 48,
  /** Minimum touch box per platform; compact controls wrap their visual in a box this size (no overlap). */
  minTouchTarget: Platform.OS === 'android' ? 48 : 44,
  /** Minimum list row heights (one / two lines). */
  rowMin: 48,
  rowMinTwoLine: 64,
  iconSize: 20,
  tabIconSize: 22,
  /** Approximate native tab bar height, used to float overlays (Snackbar) above bottom chrome. */
  tabBarHeight: Platform.OS === 'android' ? 80 : 49,
  headerTop: g.headerTop,
} as const;

/** maxFontSizeMultiplier for numeric table cells and chart axes only (mobile/DESIGN.md §3). */
export const NUMERIC_FONT_SCALE_CAP = 1.4;

/** Loaded in the root layout from @expo-google-fonts (no fontWeight: weights are separate families). */
export const fontFamily = {
  heading600: 'SpaceGrotesk_600SemiBold',
  heading700: 'SpaceGrotesk_700Bold',
  sans400: 'BeVietnamPro_400Regular',
  sans500: 'BeVietnamPro_500Medium',
  sans600: 'BeVietnamPro_600SemiBold',
  sans700: 'BeVietnamPro_700Bold',
} as const;

export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold';
export const sansByWeight: Record<FontWeight, string> = {
  regular: fontFamily.sans400,
  medium: fontFamily.sans500,
  semibold: fontFamily.sans600,
  bold: fontFamily.sans700,
};

/** mobile/DESIGN.md §3 scale (size/line-height): title 24/30, panel 18/24, section 16/22, body 15/22, input 16, dense 13/18, meta 12/16. */
export const typography: Record<
  'title' | 'heading' | 'section' | 'body' | 'input' | 'dense' | 'label' | 'caption' | 'mono',
  TextStyle
> = {
  title: { fontFamily: fontFamily.heading700, fontSize: 24, lineHeight: 30 },
  heading: { fontFamily: fontFamily.heading600, fontSize: 18, lineHeight: 24 },
  section: { fontFamily: fontFamily.sans600, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fontFamily.sans400, fontSize: 15, lineHeight: 22 },
  input: { fontFamily: fontFamily.sans400, fontSize: 16, lineHeight: 22 },
  /** Dense data (tables, prices). */
  dense: { fontFamily: fontFamily.sans400, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fontFamily.sans500, fontSize: 13, lineHeight: 18 },
  /** Metadata, chart axes. */
  caption: { fontFamily: fontFamily.sans400, fontSize: 12, lineHeight: 16 },
  /** Prices and quantities: dense size, tabular numbers. Right-align in tables. */
  mono: { fontFamily: fontFamily.sans500, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
};

export type TypographyVariant = keyof typeof typography;
