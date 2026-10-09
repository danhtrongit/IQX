import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { fontFamily, useTheme } from '@/theme';
import { Icon } from './Icon';
import { Text } from './Text';

/** Mirrors the web shadcn Button variants. `primary` is an alias of `default`. */
export type ButtonVariant = 'default' | 'primary' | 'accent' | 'secondary' | 'outline' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'default' | 'lg';

export type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function useButtonColors(variant: ButtonVariant) {
  const { colors } = useTheme();
  switch (variant) {
    case 'accent':
      return { bg: colors.accent, fg: colors.accentForeground, border: colors.accent };
    case 'secondary':
      return { bg: colors.secondary, fg: colors.secondaryForeground, border: colors.secondary };
    case 'outline':
      return { bg: 'transparent', fg: colors.foreground, border: colors.border };
    case 'ghost':
      return { bg: 'transparent', fg: colors.foreground, border: 'transparent' };
    case 'destructive':
      return { bg: colors.destructive, fg: colors.destructiveForeground, border: colors.destructive };
    default:
      return { bg: colors.primary, fg: colors.primaryForeground, border: colors.primary };
  }
}

export function Button({
  title,
  onPress,
  variant = 'default',
  size = 'default',
  icon,
  loading = false,
  disabled = false,
  fullWidth = true,
  testID,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const { radius, layout } = useTheme();
  const inactive = disabled || loading;
  const c = useButtonColors(variant);
  // default = primary action (44); sm = compact (32 visual, wrapped in a 44/48 touch box); lg = 48.
  const height = size === 'sm' ? layout.controlHeightSm : size === 'lg' ? layout.controlHeightLg : layout.inputHeight;
  const box = Math.max(height, layout.minTouchTarget);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        { minHeight: box, justifyContent: 'center', alignSelf: fullWidth ? 'stretch' : 'flex-start', opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}>
      <View
        style={[
          styles.base,
          { height, backgroundColor: c.bg, borderColor: c.border, borderRadius: radius.control },
        ]}>
        <View style={styles.content}>
          {loading ? <ActivityIndicator size="small" color={c.fg} /> : icon ? <Icon icon={icon} color={c.fg} size={layout.iconSize} /> : null}
          <Text variant="label" color={c.fg} style={{ fontFamily: fontFamily.sans600 }}>
            {title}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1 },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
