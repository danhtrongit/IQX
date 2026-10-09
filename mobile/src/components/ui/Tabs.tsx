import { Pressable, ScrollView, View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from './Text';

export type TabItem<T extends string> = { value: T; label: string; testID?: string };

/** Line-variant tabs for analytical cards (active: primary underline). */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  testID,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}) {
  const { colors, spacing, layout } = useTheme();
  const box = Math.max(layout.controlHeight, layout.minTouchTarget);
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} testID={testID} accessibilityRole="tablist">
        {items.map((item) => {
          const selected = item.value === value;
          return (
            <Pressable
              key={item.value}
              testID={item.testID ?? (testID ? `${testID}-${item.value}` : undefined)}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(item.value)}
              style={{ minHeight: box, justifyContent: 'center', paddingHorizontal: spacing.xs }}>
              <View
                style={{
                  height: layout.controlHeight,
                  paddingHorizontal: spacing.sm,
                  justifyContent: 'center',
                  borderBottomWidth: 2,
                  borderBottomColor: selected ? colors.primary : 'transparent',
                }}>
                <Text variant="label" weight={selected ? 'semibold' : 'medium'} color={selected ? 'foreground' : 'mutedForeground'}>
                  {item.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
