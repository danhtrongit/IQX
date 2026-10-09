import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

import { darkPalette, lightPalette, layout, radius, shadows, spacing, typography, type Palette } from './tokens';

export * from './tokens';

export type Theme = {
  scheme: 'light' | 'dark';
  isDark: boolean;
  colors: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  layout: typeof layout;
  typography: typeof typography;
};

/** Theme following the system colour scheme; dark (the trading default) when the system is unspecified. */
export function useTheme(): Theme {
  const system = useColorScheme();
  const scheme = system === 'light' ? 'light' : 'dark';
  return useMemo(
    () => ({
      scheme,
      isDark: scheme === 'dark',
      colors: scheme === 'dark' ? darkPalette : lightPalette,
      spacing,
      radius,
      layout,
      typography,
    }),
    [scheme],
  );
}

/** Token shadow strings for the current scheme (web --shadow-1/2). Prefer 1px borders. */
export function shadowTokens(scheme: 'light' | 'dark') {
  return shadows[scheme];
}

/** True when the OS asks to reduce motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => alive && setReduced(v)).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

/**
 * True when the user enabled Reduce Transparency (iOS). Re-evaluated live through the
 * `reduceTransparencyChanged` event; Android has no such setting and reports false.
 */
export function useReduceTransparency(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.().then((v) => alive && setReduced(v)).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', setReduced);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}
