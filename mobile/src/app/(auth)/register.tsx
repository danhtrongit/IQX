import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button, Card, Input, Screen, Text } from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = { full_name?: string; email?: string; password?: string; confirm?: string };

export default function RegisterScreen() {
  const { register } = useAuth();
  const { spacing } = useTheme();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const next: Errors = {};
    if (!fullName.trim()) next.full_name = 'Vui lòng nhập họ tên';
    if (!EMAIL_RE.test(email.trim())) next.email = 'Email không hợp lệ';
    if (password.length < 8) next.password = 'Mật khẩu tối thiểu 8 ký tự';
    else if (!/[^A-Za-z0-9]/.test(password)) next.password = 'Mật khẩu cần ít nhất 1 ký tự đặc biệt';
    if (confirm !== password) next.confirm = 'Mật khẩu nhập lại không khớp';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    try {
      await register({ email: email.trim(), password, full_name: fullName.trim() });
    } catch (e) {
      const fieldErrors: Errors = {};
      if (e instanceof ApiError && Array.isArray(e.details)) {
        for (const d of e.details as { path?: unknown; message?: unknown }[]) {
          const path = Array.isArray(d.path) ? String(d.path[d.path.length - 1]) : String(d.path ?? '');
          const msg = typeof d.message === 'string' ? d.message : undefined;
          if (msg && (path === 'email' || path === 'password' || path === 'full_name')) fieldErrors[path] = msg;
        }
      }
      setErrors(fieldErrors);
      setFormError(errorMessage(e, 'Đăng ký thất bại'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']} testID="register-screen" contentStyle={{ justifyContent: 'center' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ gap: spacing.lg }}>
          <View style={{ gap: spacing.xs }}>
            <Text variant="title">Tạo tài khoản</Text>
            <Text color="mutedForeground">Mật khẩu tối thiểu 8 ký tự, gồm ít nhất 1 ký tự đặc biệt.</Text>
          </View>
          {formError ? (
            <Card testID="register-error" accessibilityRole="alert">
              <Text color="statusError">{formError}</Text>
            </Card>
          ) : null}
          <Input testID="register-name" label="Họ và tên" value={fullName} onChangeText={setFullName} error={errors.full_name} autoCapitalize="words" autoComplete="name" textContentType="name" />
          <Input testID="register-email" label="Email" value={email} onChangeText={setEmail} error={errors.email} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
          <Input testID="register-password" label="Mật khẩu" value={password} onChangeText={setPassword} error={errors.password} secure textContentType="newPassword" />
          <Input testID="register-confirm" label="Nhập lại mật khẩu" value={confirm} onChangeText={setConfirm} error={errors.confirm} secure textContentType="newPassword" onSubmitEditing={submit} />
          <Button testID="register-submit" title="Đăng ký" onPress={submit} loading={submitting} />
          <Link href="/login" testID="register-to-login" style={{ textAlign: 'center' }}>
            <Text color="primary">Đã có tài khoản? Đăng nhập</Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
