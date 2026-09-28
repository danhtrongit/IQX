/**
 * Cross-platform IQX design tokens.
 *
 * Colour values mirror frontend-v2/src/index.css. Keep the CSS source as the
 * source of truth and run `npm run check` after changing either representation.
 */

export const typography = {
  fontFamily: {
    sans: "'Be Vietnam Pro', sans-serif",
    heading: "'Space Grotesk Variable', 'Be Vietnam Pro', sans-serif",
  },
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  size: {
    xs: '12px',
    sm: '13px',
    md: '14px',
    section: '16px',
    panel: '18px',
    pageMin: '24px',
    pageMax: '32px',
  },
  lineHeight: { tight: 1.15, normal: 1.4, relaxed: 1.55 },
} as const;

export const spacing = {
  pagePadding: '12px',
  headerTop: '48px',
  panelHeaderHeight: '64px',
  sidebarWidth: '25rem',
  railWidth: '5rem',
  controlHeight: '32px',
  compactControlHeight: '28px',
} as const;

export const radius = {
  control: '4px',
  base: '0.5rem',
  sm: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  xxl: '1rem',
  xxxl: '1.25rem',
  xxxxl: '1.5rem',
} as const;

export const shadows = {
  light: {
    1: '0 1px 3px 0 rgb(15 23 42 / 0.12)',
    2: '0 4px 14px 0 rgb(15 23 42 / 0.14)',
  },
  dark: {
    1: '0 1px 3px 0 rgb(0 0 0 / 0.55)',
    2: '0 4px 16px 0 rgb(0 0 0 / 0.42)',
  },
} as const;

export const marketColors = {
  light: {
    up: '#15803d', down: '#c62828', reference: '#8a6b0f', ceiling: '#9333ea', floor: '#0369a1',
  },
  dark: {
    up: '#32d74b', down: '#ff453a', reference: 'var(--accent)', ceiling: '#bf5af2', floor: '#64d2ff',
  },
} as const;

export const statusColors = {
  light: {
    success: 'oklch(0.49 0.12 155)', error: 'var(--destructive)', info: 'var(--primary)', warning: 'oklch(0.52 0.12 70)',
  },
  dark: {
    success: 'oklch(0.76 0.15 155)', error: 'oklch(0.76 0.16 25)', info: 'oklch(0.76 0.12 250)', warning: 'oklch(0.79 0.14 80)',
  },
} as const;

export const colors = {
  light: {
    background: 'oklch(0.967 0.004 256)', foreground: 'oklch(0.270 0.018 256)', card: 'oklch(1 0 0)',
    cardForeground: 'var(--foreground)', popover: 'oklch(1 0 0)', popoverForeground: 'var(--foreground)',
    primary: 'oklch(0.478 0.147 254.3)', primaryForeground: 'oklch(0.985 0.010 250)',
    secondary: 'oklch(0.950 0.006 256)', secondaryForeground: 'var(--foreground)', muted: 'oklch(0.935 0.006 256)',
    mutedForeground: 'oklch(0.490 0.016 256)', accent: 'oklch(0.728 0.138 89.7)', accentForeground: 'oklch(0.220 0.050 90)',
    destructive: 'oklch(0.550 0.200 25)', border: 'oklch(0.900 0.006 256)', input: 'oklch(0.870 0.010 256)', ring: 'oklch(0.478 0.147 254.3)',
    sidebar: 'oklch(0.979 0.003 256)', sidebarForeground: 'var(--foreground)', sidebarPrimary: 'oklch(0.478 0.147 254.3)', sidebarPrimaryForeground: 'oklch(0.985 0.010 250)', sidebarAccent: 'var(--muted)', sidebarAccentForeground: 'var(--foreground)', sidebarBorder: 'var(--border)', sidebarRing: 'oklch(0.478 0.147 254.3)',
  },
  dark: {
    background: 'oklch(0.171 0.019 255.8)', foreground: 'oklch(0.960 0.010 250)', card: 'oklch(0.216 0.027 258.3)',
    cardForeground: 'oklch(0.960 0.010 250)', popover: 'oklch(0.216 0.027 258.3)', popoverForeground: 'oklch(0.960 0.010 250)',
    primary: 'oklch(0.551 0.153 252.1)', primaryForeground: 'oklch(0.985 0.010 250)',
    secondary: 'oklch(0.258 0.032 258.3)', secondaryForeground: 'oklch(0.960 0.010 250)', muted: 'oklch(0.258 0.032 258.3)',
    mutedForeground: 'oklch(0.720 0.020 250)', accent: 'oklch(0.767 0.139 91.1)', accentForeground: 'oklch(0.220 0.050 90)',
    destructive: 'oklch(0.630 0.220 25)', border: 'oklch(0.320 0.030 258)', input: 'oklch(0.320 0.030 258)', ring: 'oklch(0.551 0.153 252.1)',
    sidebar: 'oklch(0.190 0.022 258)', sidebarForeground: 'oklch(0.960 0.010 250)', sidebarPrimary: 'oklch(0.551 0.153 252.1)', sidebarPrimaryForeground: 'oklch(0.985 0.010 250)', sidebarAccent: 'oklch(0.258 0.032 258.3)', sidebarAccentForeground: 'oklch(0.960 0.010 250)', sidebarBorder: 'oklch(0.320 0.030 258)', sidebarRing: 'oklch(0.551 0.153 252.1)',
  },
} as const;

/**
 * React Native cannot consume CSS `oklch()` or `var()` values directly. These
 * sRGB values are the native rendering of the semantic tokens above; screens
 * must consume them through the theme adapter rather than hardcoding colors.
 */
export const nativeColors = {
  light: {
    background: '#F1F4F8',
    foreground: '#29323E',
    card: '#FFFFFF',
    primary: '#176BC1',
    primaryForeground: '#F5F9FF',
    secondary: '#E9EDF2',
    muted: '#E0E5EB',
    mutedForeground: '#65707D',
    accent: '#C29B1F',
    accentForeground: '#3A2D05',
    border: '#D3DAE3',
    input: '#CBD4DE',
    ring: '#176BC1',
    destructive: '#C44635',
  },
  dark: {
    background: '#171D28',
    foreground: '#F1F4FA',
    card: '#222B3A',
    primary: '#3D91E9',
    primaryForeground: '#F7FBFF',
    secondary: '#2A3545',
    muted: '#2A3545',
    mutedForeground: '#AEB7C5',
    accent: '#D9B94D',
    accentForeground: '#3B2F07',
    border: '#3B4657',
    input: '#3B4657',
    ring: '#3D91E9',
    destructive: '#F06B5B',
  },
} as const;

export const nativeMarketColors = {
  light: { up: '#15803D', down: '#C62828', reference: '#8A6B0F', ceiling: '#9333EA', floor: '#0369A1' },
  dark: { up: '#32D74B', down: '#FF453A', reference: '#D9B94D', ceiling: '#BF5AF2', floor: '#64D2FF' },
} as const;

export const charts = {
  light: ['oklch(0.478 0.147 254.3)', 'oklch(0.728 0.138 89.7)', 'var(--price-up)', 'var(--price-down)', 'oklch(0.550 0.040 250)'],
  dark: ['oklch(0.551 0.153 252.1)', 'oklch(0.767 0.139 91.1)', 'oklch(0.750 0.190 145)', 'oklch(0.650 0.220 25)', 'oklch(0.450 0.030 250)'],
} as const;

export const motion = {
  duration: { fast: '150ms', standard: '200ms', slow: '250ms', pageLoading: '1100ms' },
  easing: { standard: 'ease-in-out' },
  reducedMotion: 'prefers-reduced-motion: reduce',
} as const;

export const safeArea = {
  top: 'env(safe-area-inset-top, 0px)', right: 'env(safe-area-inset-right, 0px)',
  bottom: 'env(safe-area-inset-bottom, 0px)', left: 'env(safe-area-inset-left, 0px)',
} as const;

export const touch = { minTarget: '44px', compactTarget: '32px' } as const;

export const tokens = { colors, nativeColors, charts, marketColors, nativeMarketColors, statusColors, typography, spacing, radius, shadows, motion, safeArea, touch } as const;
export type DesignTokens = typeof tokens;
export type Theme = keyof typeof colors;
export type MarketColor = keyof typeof marketColors.light;
export type StatusColor = keyof typeof statusColors.light;
