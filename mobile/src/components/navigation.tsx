import { BrandMark, HeaderRight } from '@/components/brand';
import { fontFamily, useTheme } from '@/theme';

/** Shared header options: tokenised colours/fonts; the native header may render iOS 26 glass. */
export function useStackOptions() {
  const { colors } = useTheme();
  return {
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.foreground,
    headerTitleStyle: { color: colors.foreground, fontFamily: fontFamily.heading600, fontSize: 18 },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: colors.background },
  };
}

/** Tab-root header: brand mark left, mascot avatar (and optional xu chip) right; native title stays centred. */
export function useRootHeaderOptions({ showXu = false }: { showXu?: boolean } = {}) {
  const { colors } = useTheme();
  return {
    headerLeft: () => <BrandMark />,
    headerRight: () => <HeaderRight showXu={showXu} />,
    headerTitleAlign: 'center' as const,
    headerTitleStyle: { color: colors.foreground, fontFamily: fontFamily.heading600, fontSize: 16 },
  };
}
