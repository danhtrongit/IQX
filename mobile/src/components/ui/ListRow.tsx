import { ChevronRight } from 'lucide-react-native';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { useTheme } from '@/theme';
import { Icon } from './Icon';
import { Text } from './Text';

export type ListRowProps = {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  /** Show a trailing chevron (for navigable rows). */
  chevron?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function ListRow({ title, subtitle, left, right, chevron, onPress, disabled, testID, accessibilityLabel, style }: ListRowProps) {
  const { spacing, layout } = useTheme();
  const content = (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: subtitle ? layout.rowMinTwoLine : layout.rowMin, paddingVertical: spacing.sm }, style]}>
      {left}
      <View style={{ flex: 1 }}>
        <Text>{title}</Text>
        {subtitle ? <Text variant="caption" color="mutedForeground">{subtitle}</Text> : null}
      </View>
      {right}
      {chevron ? <Icon icon={ChevronRight} color="mutedForeground" /> : null}
    </View>
  );
  if (!onPress) return <View testID={testID}>{content}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}>
      {content}
    </Pressable>
  );
}
