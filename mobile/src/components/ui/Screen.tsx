import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

import { useTheme } from '@/theme';

export type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  /** Pull-to-refresh (requires scroll). */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Apply the 12px page padding (default true). */
  padded?: boolean;
  /** Default ['left','right']; pass 'top'/'bottom' for screens without a navigation header / tab bar. */
  edges?: Edge[];
  testID?: string;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({
  children,
  scroll = false,
  onRefresh,
  refreshing = false,
  padded = true,
  edges = ['left', 'right'],
  testID,
  contentStyle,
}: ScreenProps) {
  const { colors, spacing, layout } = useTheme();
  const padding = padded ? layout.pagePadding : 0;
  return (
    <SafeAreaView testID={testID} edges={edges} style={{ flex: 1, backgroundColor: colors.background }}>
      {scroll ? (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[{ padding, gap: spacing.md, flexGrow: 1 }, contentStyle]}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, padding, gap: spacing.md }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
