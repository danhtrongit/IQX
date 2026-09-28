import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, TextInput } from 'react-native';
import { api } from '../../lib/api';
import { Body, Button, Card, Heading, Muted, Screen } from '../../components/ui';
import { useTheme } from '../../theme';

export default function ResetPasswordScreen() {
  const { theme } = useTheme();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const valid = Boolean(token && password.length >= 8 && password === confirmation);
  const submit = async () => {
    if (!valid || !token) return;
    setPending(true);
    try {
      await api('auth/reset-password', { method: 'POST', body: { token: String(token), new_password: password } });
      setDone(true);
    } catch (error) {
      Alert.alert('Không thể đặt lại mật khẩu', error instanceof Error ? error.message : 'Liên kết đã hết hạn hoặc không hợp lệ.');
    } finally {
      setPending(false);
    }
  };
  return <Screen><Stack.Screen options={{ presentation: 'modal', title: 'Đặt lại mật khẩu' }} /><Heading style={styles.title}>Đặt lại mật khẩu</Heading>{done ? <Card><Body>Mật khẩu đã được đặt lại. Hãy đăng nhập lại.</Body><Button style={styles.action} onPress={() => router.replace('/auth/sign-in')}>Đăng nhập</Button></Card> : <><Muted style={styles.copy}>{token ? 'Chọn mật khẩu mới cho tài khoản của bạn.' : 'Liên kết này thiếu token hoặc đã hết hạn.'}</Muted><TextInput value={password} onChangeText={setPassword} placeholder="Mật khẩu mới" placeholderTextColor={theme.mutedForeground} secureTextEntry autoCapitalize="none" style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.foreground }]} /><TextInput value={confirmation} onChangeText={setConfirmation} placeholder="Nhập lại mật khẩu" placeholderTextColor={theme.mutedForeground} secureTextEntry autoCapitalize="none" style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.foreground }]} />{password && password.length < 8 && <Muted>Mật khẩu cần ít nhất 8 ký tự.</Muted>}{confirmation && password !== confirmation && <Muted>Mật khẩu chưa khớp.</Muted>}<Button disabled={!valid || pending} onPress={() => void submit()}>{pending ? 'Đang cập nhật…' : 'Đặt lại mật khẩu'}</Button></>}</Screen>;
}

const styles = StyleSheet.create({ title: { marginTop: 32, marginBottom: 8 }, copy: { marginBottom: 20 }, input: { minHeight: 44, borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, marginBottom: 12, fontSize: 14 }, action: { marginTop: 12 } });
