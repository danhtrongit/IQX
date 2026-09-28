import AsyncStorage from '@react-native-async-storage/async-storage';
import { nativeColors, nativeMarketColors } from '@iqx/design-tokens';
import { useFonts } from 'expo-font';
import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
} from '@expo-google-fonts/be-vietnam-pro';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

export type ColorMode = 'light' | 'dark';
type NativeMarket = { up: string; down: string; reference: string; ceiling: string; floor: string };
type NativeColorSet = { [Key in keyof typeof nativeColors.light]: string };
export type NativePalette = NativeColorSet & {
  market: NativeMarket;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  danger: string;
};

const MODE_KEY = 'iqx.mobile.theme-mode';

function palette(mode: ColorMode): NativePalette {
  const colors = nativeColors[mode];
  return {
    ...colors,
    market: nativeMarketColors[mode],
    surface: colors.card,
    text: colors.foreground,
    muted: colors.mutedForeground,
    accent: colors.accent,
    accentSoft: colors.secondary,
    danger: colors.destructive,
  };
}

type ThemeContextValue = {
  theme: NativePalette;
  mode: ColorMode;
  isReady: boolean;
  toggle: () => void;
  setMode: (mode: ColorMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemMode: ColorMode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [mode, setModeState] = useState<ColorMode>(systemMode);
  const [storageReady, setStorageReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
  });

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(MODE_KEY).then((stored) => {
      if (!active) return;
      if (stored === 'light' || stored === 'dark') setModeState(stored);
      setStorageReady(true);
    });
    return () => { active = false; };
  }, []);

  const setMode = (next: ColorMode) => {
    setModeState(next);
    void AsyncStorage.setItem(MODE_KEY, next);
  };

  const isReady = storageReady && (fontsLoaded || !!fontError);
  const value = useMemo<ThemeContextValue>(() => ({
    theme: palette(mode),
    mode,
    isReady,
    toggle: () => setMode(mode === 'light' ? 'dark' : 'light'),
    setMode,
  }), [fontsLoaded, fontError, isReady, mode, storageReady]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
