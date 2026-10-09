import type { LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';
import { useButtonColors, type ButtonVariant } from './Button';
import { Icon } from './Icon';

/** Icon-only button; the accessibility label is required. 32px visual inside a 44 (iOS) / 48 (Android) touch box, so neighbours never overlap. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'ghost',
  disabled,
  testID,
}: {
  icon: LucideIcon;
  accessibilityLabel: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  testID?: string;
}) {
  const { radius, layout } = useTheme();
  const c = useButtonColors(variant);
  const box = Math.max(layout.controlHeight, layout.minTouchTarget);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: box,
        height: box,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}>
      <View
        style={{
          width: layout.controlHeight,
          height: layout.controlHeight,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.bg,
        }}>
        <Icon icon={icon} color={c.fg} size={layout.iconSize} />
      </View>
    </Pressable>
  );
}
