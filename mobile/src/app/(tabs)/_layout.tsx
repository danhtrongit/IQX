import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/theme';

/**
 * Native system tab bar: iOS 26 liquid glass on iOS, Material on Android (system chrome may be glass,
 * content stays flat). `unstable-native-tabs` is the SDK 55-57 entry point of NativeTabs.
 * Labels are the accessible names used by Maestro.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <NativeTabs tintColor={colors.primary} labelStyle={{ color: colors.mutedForeground }}>
      <NativeTabs.Trigger name="trade">
        <NativeTabs.Trigger.Label>Giao dịch</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" md="candlestick_chart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="portfolio">
        <NativeTabs.Trigger.Label>Danh mục</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="briefcase.fill" md="work" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="strategy">
        <NativeTabs.Trigger.Label>Chiến lược</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bolt.fill" md="bolt" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Label>Thêm</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="ellipsis.circle.fill" md="more_horiz" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
