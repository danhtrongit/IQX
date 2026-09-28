import { router } from 'expo-router';
import { ActivityIndicator, Platform, ScrollView, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card, Heading, Muted, Screen, Body } from '../components/ui';
import { useTheme } from '../theme';

type Product = { id: string; store_product_id?: string | null; name?: string; description?: string | null; price_vnd?: number; duration_days?: number };
export default function PremiumScreen() {
  const { theme } = useTheme();
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const plans = useQuery({ queryKey: ['mobile', 'premium', 'products', platform], queryFn: () => api<{ items?: Product[] }>(`mobile/premium/products?platform=${platform}`) });
  return <Screen><ScrollView contentContainerStyle={styles.content}><Heading>IQX Pro</Heading><Muted style={styles.subtitle}>Premium được kích hoạt bởi store và xác nhận từ máy chủ.</Muted>{plans.isPending && <Card><ActivityIndicator color={theme.primary} /><Muted style={styles.state}>Đang tải gói…</Muted></Card>}{plans.isError && <Card><Body style={{ color: theme.danger }}>Không thể tải danh sách gói.</Body><Button variant="secondary" style={styles.action} onPress={() => void plans.refetch()}>Thử lại</Button></Card>}{plans.data?.items?.length ? plans.data.items.map((plan) => <Card key={plan.id}><Body style={styles.plan}>{plan.name ?? plan.id}</Body>{plan.description && <Muted>{plan.description}</Muted>}<Muted style={styles.price}>{typeof plan.price_vnd === 'number' ? `${plan.price_vnd.toLocaleString('vi-VN')} VND` : 'Giá hiển thị trên store'}{plan.duration_days ? ` · ${plan.duration_days} ngày` : ''}</Muted>{plan.store_product_id ? <Muted style={styles.action}>Store product đã được cấu hình; native billing adapter sẽ bật nút mua trong bản build production.</Muted> : <Muted style={styles.action}>Gói này chưa được cấu hình trên store.</Muted>}</Card>) : null}{!plans.isPending && !plans.isError && !plans.data?.items?.length && <Card><Muted>Chưa có gói Premium khả dụng.</Muted></Card>}<Button variant="secondary" style={styles.action} onPress={() => router.back()}>Đóng</Button></ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { paddingVertical: 30, paddingBottom: 32 }, subtitle: { marginTop: 6, marginBottom: 16 }, state: { marginTop: 8, textAlign: 'center' }, plan: { fontSize: 18, fontWeight: '700', marginBottom: 6 }, price: { marginTop: 10 }, action: { marginTop: 12 } });
