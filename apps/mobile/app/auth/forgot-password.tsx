import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { Button, Heading, Muted, Screen, Body, Card } from '../../components/ui';
import { api } from '../../lib/api';
import { useTheme } from '../../theme';

export default function ForgotPasswordScreen() { const { theme } = useTheme(); const [email, setEmail] = useState(''); const [done, setDone] = useState(false); const [error, setError] = useState<string | null>(null); const submit = async () => { setError(null); try { await api('auth/forgot-password', { method: 'POST', body: { email: email.trim() } }); setDone(true); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể gửi yêu cầu'); } }; return <Screen><Heading style={styles.title}>Quên mật khẩu</Heading><Muted style={styles.copy}>Nhập email để nhận hướng dẫn đặt lại mật khẩu.</Muted><TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={theme.mutedForeground} keyboardType="email-address" autoCapitalize="none" style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.foreground }]} />{done && <Card><Body>Yêu cầu đã được gửi nếu email tồn tại.</Body></Card>}{error && <Card><Body style={{ color: theme.danger }}>{error}</Body></Card>}<Button disabled={!email.trim()} onPress={() => void submit()}>Gửi yêu cầu</Button><Button variant="secondary" style={styles.secondary} onPress={() => router.back()}>Quay lại</Button></Screen>; }
const styles = StyleSheet.create({ title: { marginTop: 32, marginBottom: 8 }, copy: { marginBottom: 24 }, input: { minHeight: 44, borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, marginBottom: 12, fontSize: 14 }, secondary: { marginTop: 12 } });
