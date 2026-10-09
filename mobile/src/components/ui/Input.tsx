import { forwardRef, useId, useImperativeHandle, useRef, useState } from 'react';
import { InputAccessoryView, Keyboard, Platform, Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { fontFamily, useTheme } from '@/theme';
import { Text } from './Text';

export type InputProps = TextInputProps & {
  label?: string;
  error?: string | null;
  secure?: boolean;
  testID?: string;
};

const NUMERIC_KEYBOARDS = new Set(['number-pad', 'decimal-pad', 'numeric', 'phone-pad']);

/** 44px high, 4px radius, 16px text (mobile/DESIGN.md §3). iOS numeric pads get a "Xong" bar (they have no return key). */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, secure, testID, style, onFocus, onBlur, ...rest },
  ref,
) {
  const { colors, radius, spacing, layout, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  const inner = useRef<TextInput>(null);
  useImperativeHandle(ref, () => inner.current as TextInput);
  const accessoryId = `input-done-${useId()}`;
  const needsDoneBar = Platform.OS === 'ios' && NUMERIC_KEYBOARDS.has(rest.keyboardType ?? '');
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <Text variant="label" color="mutedForeground">{label}</Text> : null}
      <Pressable onPress={() => inner.current?.focus()} accessible={false}>
        <TextInput
          ref={inner}
          testID={testID}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          secureTextEntry={secure}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.mutedForeground}
          inputAccessoryViewID={needsDoneBar ? accessoryId : undefined}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            {
              height: layout.inputHeight,
              paddingHorizontal: spacing.sm,
              paddingVertical: 0,
              borderRadius: radius.control,
              borderWidth: focused ? 2 : 1,
              borderColor: error ? colors.destructive : focused ? colors.ring : colors.input,
              backgroundColor: colors.card,
              color: colors.foreground,
              fontFamily: fontFamily.sans400,
              fontSize: typography.input.fontSize,
            },
            style,
          ]}
        />
      </Pressable>
      {needsDoneBar ? (
        <InputAccessoryView nativeID={accessoryId}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              backgroundColor: colors.muted,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}>
            <Pressable
              testID={testID ? `${testID}-done` : undefined}
              accessibilityRole="button"
              accessibilityLabel="Xong"
              onPress={() => Keyboard.dismiss()}
              hitSlop={8}
              style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.sm }}>
              <Text weight="semibold" color="primary">Xong</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
      {error ? (
        <Text variant="caption" color="statusError" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
});
