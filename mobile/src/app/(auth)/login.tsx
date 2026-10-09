import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, Platform, View } from 'react-native';

import { BrandMark, MASCOT_IMAGES } from '@/components/brand';
import { Button, Card, Input, Screen, Text } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { login, sessionExpired, clearSessionExpired } = useAuth();
  const { spacing } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [keyboardShown, setKeyboardShown] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardShown(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  async function submit() {
    const next: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = 'Email không hợp lệ';
    if (!password) next.password = 'Vui lòng nhập mật khẩu';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    clearSessionExpired();
    try {
      await login(email.trim(), password);
    } catch (e) {
      setFormError(errorMessage(e, 'Đăng nhập thất bại'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']} testID="login-screen" contentStyle={{ justifyContent: 'center' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ gap: spacing.lg }}>
          {keyboardShown ? null : (
            <View style={{ alignItems: 'center', gap: spacing.md }}>
              <BrandMark size={56} fontSize={36} />
              <Image source={MASCOT_IMAGES.bach_ho} accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: 120, height: 120 }} resizeMode="contain" />
            </View>
          )}
          <View style={{ gap: spacing.xs }}>
            <Text variant="title">Đăng nhập IQX</Text>
            <Text color="mutedForeground">Đăng nhập để giao dịch mô phỏng và dùng chiến lược.</Text>
          </View>
          {sessionExpired && !formError ? (
            <Card testID="login-session-expired" accessibilityRole="alert">
              <Text color="statusWarning">Phiên đăng nhập đã hết hạn</Text>
            </Card>
          ) : null}
          {formError ? (
            <Card testID="login-error" accessibilityRole="alert">
              <Text color="statusError">{formError}</Text>
            </Card>
          ) : null}
          <Input
            testID="login-email"
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="username"
            returnKeyType="next"
          />
          <Input
            testID="login-password"
            label="Mật khẩu"
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            secure
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <Button testID="login-submit" title="Đăng nhập" onPress={submit} loading={submitting} />
          <Link href="/register" testID="login-to-register" style={{ textAlign: 'center' }}>
            <Text color="primary">Chưa có tài khoản? Đăng ký</Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
