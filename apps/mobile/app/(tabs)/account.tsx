import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Heading, Muted, Screen, Body } from '../../components/ui';
import { useAuth } from '../../lib/auth';

export default function AccountScreen() {
  const { user, isLoading, logout } = useAuth();
  return <Screen>
    <Heading style={styles.title}>Tài khoản</Heading>
    <Muted>{user ? 'Tài khoản và quyền truy cập của bạn.' : 'Đăng nhập để đồng bộ dữ liệu giữa các thiết bị.'}</Muted>
    <Card>
      <Body style={styles.name}>{user?.full_name || user?.email || 'Khách'}</Body>
      <Muted>{user ? user.email : 'Chưa đăng nhập'}</Muted>
    </Card>
    {user ? <>
      <Button onPress={() => router.push('/premium')}>Quản lý IQX Pro</Button>
      <Button variant="secondary" style={styles.secondary} onPress={() => router.push('/settings')}>Cài đặt</Button>
      <Button variant="destructive" style={styles.secondary} disabled={isLoading} onPress={() => void logout()}>Đăng xuất</Button>
    </> : <>
      <Button onPress={() => router.push('/auth/sign-in')}>Đăng nhập</Button>
      <Button variant="secondary" style={styles.secondary} onPress={() => router.push('/settings')}>Cài đặt</Button>
    </>}
  </Screen>;
}

const styles = StyleSheet.create({ title: { marginTop: 24, marginBottom: 6 }, name: { fontSize: 18, fontWeight: '700', marginBottom: 4 }, secondary: { marginTop: 12 } });
