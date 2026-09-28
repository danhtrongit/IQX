import React from 'react';
import {
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  type TextProps,
  View,
  type ViewProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

export function Screen({ children, style, ...props }: ViewProps) {
  const { theme } = useTheme();
  return (
    <SafeAreaView {...props} style={[styles.screen, { backgroundColor: theme.background }, style]}>
      {children}
    </SafeAreaView>
  );
}

export function Heading({ children, style, ...props }: TextProps) {
  const { theme } = useTheme();
  return <Text {...props} style={[styles.heading, { color: theme.foreground }, style]}>{children}</Text>;
}

export function Body({ children, style, ...props }: TextProps) {
  const { theme } = useTheme();
  return <Text {...props} style={[styles.body, { color: theme.foreground }, style]}>{children}</Text>;
}

export function Muted({ children, style, ...props }: TextProps) {
  const { theme } = useTheme();
  return <Text {...props} style={[styles.body, { color: theme.mutedForeground }, style]}>{children}</Text>;
}

export function Card({ children, style, ...props }: ViewProps) {
  const { theme } = useTheme();
  return <View {...props} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, style]}>{children}</View>;
}

export function PressableCard({ children, style, onPress, accessibilityLabel, ...props }: Omit<PressableProps, 'style'> & { children: React.ReactNode; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const { theme } = useTheme();
  return (
    <Pressable
      {...props}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.card, { backgroundColor: theme.card, borderColor: theme.border }, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}

type ButtonProps = Omit<PressableProps, 'style'> & {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'destructive';
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

export function Button({ children, variant = 'primary', style, labelStyle, ...props }: ButtonProps) {
  const { theme } = useTheme();
  const backgroundColor = variant === 'primary' ? theme.primary : variant === 'destructive' ? theme.destructive : theme.secondary;
  const color = variant === 'primary' || variant === 'destructive' ? theme.primaryForeground : theme.foreground;
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, { backgroundColor }, pressed && styles.pressed, style]}
    >
      <Text style={[styles.buttonText, { color }, labelStyle]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16 },
  heading: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.3 },
  body: { fontFamily: 'BeVietnamPro_400Regular', fontSize: 14, lineHeight: 21 },
  card: { borderWidth: 1, borderRadius: 8, padding: 16, marginVertical: 6 },
  button: { minHeight: 44, borderRadius: 4, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.76 },
});
