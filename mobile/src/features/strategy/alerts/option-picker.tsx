import { ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Icon, ListRow, Sheet, Text, Divider } from '@/components/ui';
import { useTheme } from '@/theme';

export type PickerOption = { value: string; label: string };

/** Select-like field: shows the current label, opens a sheet with the options. */
export function OptionPicker({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled,
  testID,
}: {
  label: string;
  value: string | null;
  options: PickerOption[];
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  testID: string;
}) {
  const { colors, radius, spacing, layout } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="label" color="mutedForeground">{label}</Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={{
          height: layout.inputHeight,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.sm,
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: colors.input,
          backgroundColor: colors.card,
          opacity: disabled ? 0.5 : 1,
        }}>
        <Text numberOfLines={1} style={{ flex: 1 }} color={current ? 'foreground' : 'mutedForeground'}>
          {current?.label ?? placeholder}
        </Text>
        <Icon icon={ChevronDown} color="mutedForeground" />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label} testID={`${testID}-sheet`}>
        <ScrollView>
          {options.map((o, i) => (
            <View key={o.value}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                testID={`${testID}-option-${o.value}`}
                title={o.label}
                right={o.value === value ? <Text color="primary" weight="semibold">✓</Text> : undefined}
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              />
            </View>
          ))}
        </ScrollView>
      </Sheet>
    </View>
  );
}
