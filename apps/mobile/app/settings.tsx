import { Stack } from 'expo-router';
import { Alert, StyleSheet } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, createIdempotencyKey } from '../lib/api';
import { Button, Card, Heading, Muted, Screen, Body } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useTheme } from '../theme';

type Preferences = { notifications_enabled?: boolean; marketing_enabled?: boolean };
type RequestResult = { request_id?: string; status?: string };

export default function SettingsScreen() {
  const { theme, mode, toggle } = useTheme();
  const { user } = useAuth();
  const preferences = useQuery({ queryKey: ['mobile', 'preferences'], enabled: !!user, queryFn: () => api<Preferences>('mobile/preferences') });
  const deletionStatus = useQuery({ queryKey: ['mobile', 'deletion-status'], enabled: !!user, queryFn: () => api<RequestResult>('users/me/deletion-status') });
  const update = useMutation({ mutationFn: (input: Preferences) => api<Preferences>('mobile/preferences', { method: 'PATCH', body: input }), onSuccess: () => void preferences.refetch() });
  const deletion = useMutation({ mutationFn: () => api<RequestResult>('users/me/deletion', { method: 'POST', idempotencyKey: createIdempotencyKey('account-deletion') }), onSuccess: () => void deletionStatus.refetch() });
  const exportData = useMutation({ mutationFn: () => api<RequestResult>('users/me/export', { method: 'POST', idempotencyKey: createIdempotencyKey('account-export') }) });
  const confirmDeletion = () => Alert.alert('Xóa tài khoản?', 'IQX sẽ xử lý yêu cầu xóa dữ liệu theo chính sách lưu trữ. Bạn vẫn cần hủy subscription ở store.', [{ text: 'Hủy', style: 'cancel' }, { text: 'Gửi yêu cầu', style: 'destructive', onPress: () => deletion.mutate() }]);
  return <Screen><Stack.Screen options={{ headerShown: true, title: 'Cài đặt', headerTintColor: theme.foreground, headerStyle: { backgroundColor: theme.background } }} /><Heading style={styles.title}>Cài đặt</Heading><Card><Body style={styles.label}>Giao diện</Body><Muted>Đang dùng {mode === 'dark' ? 'tối' : 'sáng'}</Muted><Button variant="secondary" style={styles.action} onPress={toggle}>Chuyển sang {mode === 'light' ? 'tối' : 'sáng'}</Button></Card>{user && <><Card><Body style={styles.label}>Thông báo</Body><Muted>{preferences.isPending ? 'Đang tải…' : preferences.data?.notifications_enabled === false ? 'Đang tắt' : 'Đang bật'}</Muted><Button variant="secondary" style={styles.action} disabled={update.isPending || preferences.isPending} onPress={() => update.mutate({ notifications_enabled: preferences.data?.notifications_enabled === false })}>{preferences.data?.notifications_enabled === false ? 'Bật thông báo' : 'Tắt thông báo'}</Button></Card><Card><Body style={styles.label}>Dữ liệu tài khoản</Body><Muted>Gửi yêu cầu xuất dữ liệu hoặc xóa tài khoản đến máy chủ.</Muted><Button variant="secondary" style={styles.action} disabled={exportData.isPending} onPress={() => exportData.mutate()}>Yêu cầu xuất dữ liệu</Button><Button variant="destructive" style={styles.action} disabled={deletion.isPending || deletionStatus.data?.status === 'queued'} onPress={confirmDeletion}>Yêu cầu xóa tài khoản</Button>{(exportData.data?.request_id || deletion.data?.request_id || deletionStatus.data?.request_id) && <Muted style={styles.result}>Yêu cầu đã được ghi nhận.</Muted>}</Card></>}</Screen>;
}

const styles = StyleSheet.create({ title: { marginTop: 22, marginBottom: 8 }, label: { fontSize: 16, fontWeight: '700', marginBottom: 6 }, action: { marginTop: 12 }, result: { marginTop: 12 } });
