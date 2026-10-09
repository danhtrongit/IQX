import { Switch, View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from './Text';

export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
  testID,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 }}>
      <View style={{ flex: 1 }}>
        <Text>{label}</Text>
        {description ? <Text variant="caption" color="mutedForeground">{description}</Text> : null}
      </View>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        accessibilityRole="switch"
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ true: colors.primary, false: colors.input }}
        thumbColor={colors.card}
      />
    </View>
  );
}
