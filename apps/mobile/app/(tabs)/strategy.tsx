import { router } from 'expo-router';
import { Linking, ScrollView, StyleSheet } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { StrategyFeature } from '../../features/strategy';
import { Button, Heading, Muted, Screen } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { api, createIdempotencyKey } from '../../lib/api';

export default function StrategyScreen() {
  const { user } = useAuth();
  const entitlement = useQuery({ queryKey: ['premium', 'me'], enabled: !!user, queryFn: () => api<{ is_premium?: boolean }>('premium/me') });
  const catalog = useQuery({ queryKey: ['strategy', 'catalog'], enabled: entitlement.data?.is_premium === true, queryFn: () => api<Record<string, unknown>>('backtest/catalog') });
  const signals = useQuery({ queryKey: ['strategy', 'signals'], enabled: entitlement.data?.is_premium === true, queryFn: () => api<Array<Record<string, unknown>>>('alerts/signals') });
  const events = useQuery({ queryKey: ['strategy', 'events'], enabled: entitlement.data?.is_premium === true, queryFn: () => api<Array<Record<string, unknown>>>('alerts/events') });
  const telegram = useQuery({ queryKey: ['strategy', 'telegram'], enabled: entitlement.data?.is_premium === true, queryFn: () => api<{ linked?: boolean; bot_username?: string }>('alerts/telegram') });
  const telegramLink = useMutation({
    mutationFn: () => api<{ url?: string }>('alerts/telegram/link', { method: 'POST', idempotencyKey: createIdempotencyKey('telegram-link') }),
    onSuccess: (result) => { if (result.url) void Linking.openURL(result.url); },
  });
  const snapshot = entitlement.data?.is_premium ? {
    title: 'Chiến lược IQX',
    summary: 'Tín hiệu và dữ liệu chiến lược từ máy chủ.',
    indicators: (Array.isArray(catalog.data?.factors) ? catalog.data.factors : []).slice(0, 12).map((factor, index) => ({ id: String((factor as Record<string, unknown>).id ?? index), name: String((factor as Record<string, unknown>).name ?? (factor as Record<string, unknown>).id ?? 'Factor'), kind: 'trend' as const, description: typeof (factor as Record<string, unknown>).description === 'string' ? (factor as Record<string, unknown>).description as string : undefined })),
    alerts: (events.data ?? []).slice(0, 12).map((event, index) => ({ id: String(event.id ?? index), title: String(event.title ?? event.message_title ?? event.symbol ?? 'Alert'), message: typeof event.message === 'string' ? event.message : undefined, severity: 'info' as const, createdAt: typeof event.fired_at === 'string' ? event.fired_at : undefined })),
  } : undefined;
  const loading = !!user && (entitlement.isPending || (entitlement.data?.is_premium === true && (catalog.isPending || signals.isPending || events.isPending)));
  const failed = entitlement.isError || catalog.isError || signals.isError || events.isError;
  return <Screen><ScrollView contentContainerStyle={styles.content}><Heading>Chiến lược</Heading><Muted style={styles.subtitle}>Tín hiệu, cảnh báo và backtest từ dữ liệu máy chủ.</Muted>{!user ? <><StrategyFeature status="empty" /><Button onPress={() => router.push('/auth/sign-in')}>Đăng nhập để đồng bộ</Button></> : entitlement.data?.is_premium === false ? <StrategyFeature status="premium" onUpgrade={() => router.push('/premium')} /> : loading ? <StrategyFeature status="loading" /> : failed ? <StrategyFeature status="error" onRetry={() => { void entitlement.refetch(); void catalog.refetch(); void signals.refetch(); void events.refetch(); }} /> : <><StrategyFeature status={snapshot ? 'ready' : 'empty'} snapshot={snapshot} onUpgrade={() => router.push('/premium')} /><Button variant="secondary" style={styles.telegram} disabled={telegramLink.isPending} onPress={() => telegramLink.mutate()}>{telegram.data?.linked ? 'Mở Telegram' : 'Kết nối Telegram'}</Button>{telegram.data?.bot_username && <Muted style={styles.telegramHint}>Bot: @{telegram.data.bot_username}</Muted>}</>}</ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { paddingVertical: 24, paddingBottom: 32 }, subtitle: { marginTop: 6, marginBottom: 16 }, telegram: { marginTop: 12 }, telegramHint: { marginTop: 8 } });
