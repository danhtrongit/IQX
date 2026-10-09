import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';
import { Icon } from './Icon';
import { Text } from './Text';

/** Real checkbox control (role=checkbox), 16px box, 4px radius. */
export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  testID,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, opacity: disabled ? 0.5 : 1 }}>
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: checked ? colors.primary : colors.input,
          backgroundColor: checked ? colors.primary : colors.card,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {checked ? <Icon icon={Check} size={12} color="primaryForeground" strokeWidth={3} /> : null}
      </View>
      <Text>{label}</Text>
    </Pressable>
  );
}

export type RadioOption<T extends string> = { value: T; label: string; testID?: string };

/** Real radio group (role=radiogroup / radio). */
export function RadioGroup<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View testID={testID} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={o.testID ?? (testID ? `${testID}-${o.value}` : undefined)}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(o.value)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 }}>
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: selected ? colors.primary : colors.input,
                backgroundColor: colors.card,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {selected ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
            </View>
            <Text>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
