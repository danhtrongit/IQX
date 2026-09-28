import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput } from 'react-native';
import { Button, Heading, Muted, Screen, Body, Card } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../theme';

export default function SignInScreen() {
  const { theme } = useTheme();
  const { login, error, isLoading, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    setSubmitted(true);
    clearError();
    try { await login(email.trim(), password); router.replace('/(tabs)/account'); } catch { /* error is rendered below */ }
  };

  return <Screen>
    <Heading style={styles.title}>Đăng nhập IQX</Heading>
    <Muted style={styles.copy}>Đồng bộ watchlist, tiến độ học và tài khoản mô phỏng của bạn.</Muted>
    <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={theme.mutedForeground} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.foreground }]} accessibilityLabel="Email" />
    <TextInput value={password} onChangeText={setPassword} placeholder="Mật khẩu" placeholderTextColor={theme.mutedForeground} secureTextEntry style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.foreground }]} accessibilityLabel="Mật khẩu" />
    {error && <Card><Body style={{ color: theme.danger }}>{error}</Body></Card>}
    <Button onPress={() => void submit()} disabled={isLoading || !email.trim() || !password} accessibilityLabel="Đăng nhập">
      {isLoading && submitted ? <ActivityIndicator color={theme.primaryForeground} /> : 'Đăng nhập'}
    </Button>
    <Button variant="secondary" style={styles.secondary} onPress={() => router.push('/auth/register')}>Tạo tài khoản</Button>
    <Button variant="secondary" style={styles.secondary} onPress={() => router.push('/auth/forgot-password')}>Quên mật khẩu</Button>
    <Button variant="secondary" style={styles.secondary} onPress={() => router.back()}>Để sau</Button>
  </Screen>;
}

const styles = StyleSheet.create({ title: { marginTop: 32, marginBottom: 8 }, copy: { marginBottom: 24 }, input: { minHeight: 44, borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, marginBottom: 12, fontSize: 14 }, secondary: { marginTop: 12 } });
