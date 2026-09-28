import { Stack, useLocalSearchParams, router } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button, Card, Heading, Muted, Screen, Body } from '../../components/ui';
import { useTheme } from '../../theme';

type Raw = Record<string, unknown>;
function unwrap(payload: unknown): Raw {
  if (payload && typeof payload === 'object' && 'data' in payload) return ((payload as Raw).data ?? {}) as Raw;
  return (payload ?? {}) as Raw;
}
function text(raw: Raw, ...keys: string[]) { for (const key of keys) if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') return String(raw[key]); return '—'; }

export default function StockScreen() {
  const { symbol: rawSymbol } = useLocalSearchParams<{ symbol: string }>();
  const symbol = String(rawSymbol ?? '').toUpperCase();
  const { theme } = useTheme();
  const query = useQuery({ queryKey: ['mobile', 'stock', symbol], enabled: !!symbol, queryFn: () => api<unknown>(`/market-data/company/${encodeURIComponent(symbol)}/overview`) });
  const profile = query.data ? unwrap(query.data) : null;
  return <Screen>
    <Stack.Screen options={{ headerShown: true, title: symbol || 'Stock', headerTintColor: theme.foreground, headerStyle: { backgroundColor: theme.background } }} />
    <ScrollView contentContainerStyle={styles.content}>
      <Heading>{symbol || '—'}</Heading>
      <Muted>{profile ? text(profile, 'exchange') : 'Đang tải dữ liệu công ty'}</Muted>
      {query.isPending && <Card><ActivityIndicator color={theme.primary} /><Muted style={styles.state}>Đang tải dữ liệu…</Muted></Card>}
      {query.isError && <Card><Body style={{ color: theme.danger }}>Không thể tải dữ liệu mã {symbol}.</Body><Button variant="secondary" style={styles.action} onPress={() => void query.refetch()}>Thử lại</Button></Card>}
      {profile && !query.isError && <>
        <Card><Muted>Tên doanh nghiệp</Muted><Body style={styles.value}>{text(profile, 'organ_name', 'organName', 'name')}</Body><Muted style={styles.source}>Nguồn và timestamp do backend trả về.</Muted></Card>
        <Card><Muted>Ngành</Muted><Body style={styles.value}>{text(profile, 'icb_name_2', 'industry')}</Body><Muted>Sàn: {text(profile, 'exchange')}</Muted></Card>
      </>}
      {!query.isPending && !query.isError && !profile && <Card><Muted>Chưa có dữ liệu cho mã này.</Muted></Card>}
      <Button variant="secondary" onPress={() => router.push('/(tabs)/trading')}>Mở khu vực mô phỏng</Button>
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({ content: { paddingVertical: 22, paddingBottom: 32 }, value: { fontSize: 18, fontWeight: '700', marginTop: 6, marginBottom: 4 }, source: { marginTop: 10 }, state: { marginTop: 8, textAlign: 'center' }, action: { marginTop: 12 } });
