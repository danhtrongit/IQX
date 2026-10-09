import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { useReduceTransparency, useTheme } from '@/theme';

/**
 * Liquid glass for floating system chrome ONLY (bottom order bar, floating toolbars).
 * Never use for cards, lists, tables, forms or charts. Falls back to a flat token surface
 * on Android, iOS < 26, when the API is missing, and live whenever Reduce Transparency is on.
 */
export function GlassSurface({
  children,
  style,
  tinted = false,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Tint the glass with the primary token. */
  tinted?: boolean;
  testID?: string;
}) {
  const { colors, radius, isDark } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const available = Platform.OS === 'ios' && !reduceTransparency && isLiquidGlassAvailable();
  if (available) {
    return (
      <GlassView
        testID={testID}
        glassEffectStyle="regular"
        tintColor={tinted ? colors.primary : undefined}
        colorScheme={isDark ? 'dark' : 'light'}
        style={[{ borderRadius: radius.card, overflow: 'hidden' }, style]}>
        {children}
      </GlassView>
    );
  }
  return (
    <View
      testID={testID}
      style={[
        { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, overflow: 'hidden' },
        style,
      ]}>
      {children}
    </View>
  );
}
