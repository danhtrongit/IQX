import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput } from 'react-native';
import { Button, Heading, Muted, Screen, Body, Card } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../theme';

export default function RegisterScreen() {
  const { theme } = useTheme();
  const { register, error, isLoading, clearError } = useAuth();
  const [fullName, setFullName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const submit = async () => { clearError(); try { await register({ full_name: fullName.trim(), email: email.trim(), password }); router.replace('/(tabs)/account'); } catch { /* rendered by context */ } };
  const input = (value: string, setter: (value: string) => void, placeholder: string, secure = false) => <TextInput value={value} onChangeText={setter} placeholder={placeholder} placeholderTextColor={theme.mutedForeground} secureTextEntry={secure} autoCapitalize={secure ? 'none' : 'words'} style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.foreground }]} />;
  return <Screen><Heading style={styles.title}>Tạo tài khoản</Heading><Muted style={styles.copy}>Tạo tài khoản để lưu tiến độ và watchlist.</Muted>{input(fullName, setFullName, 'Họ và tên')}{input(email, setEmail, 'Email')}{input(password, setPassword, 'Mật khẩu', true)}{error && <Card><Body style={{ color: theme.danger }}>{error}</Body></Card>}<Button disabled={isLoading || !fullName.trim() || !email.trim() || !password} onPress={() => void submit()}>{isLoading ? <ActivityIndicator color={theme.primaryForeground} /> : 'Đăng ký'}</Button><Button variant="secondary" style={styles.secondary} onPress={() => router.back()}>Hủy</Button></Screen>;
}

const styles = StyleSheet.create({ title: { marginTop: 32, marginBottom: 8 }, copy: { marginBottom: 24 }, input: { minHeight: 44, borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, marginBottom: 12, fontSize: 14 }, secondary: { marginTop: 12 } });
