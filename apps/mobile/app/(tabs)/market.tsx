import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { createMarketRealtime } from '../../lib/market-realtime';
import { useAuth } from '../../lib/auth';
import { MarketFeature, type MarketIndex, type MarketOverview, type WatchlistItem } from '../../features/market';
import { Heading, Muted, Screen } from '../../components/ui';

type Raw = Record<string, unknown>;
function numberValue(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function adaptMarket(payload: { data?: unknown }): MarketOverview {
  const indices: MarketIndex[] = (Array.isArray(payload.data) ? payload.data : []).flatMap((item) => {
    const raw = (item && typeof item === 'object' ? item : {}) as Raw;
    const symbol = String(raw.symbol ?? raw.index_name ?? '').trim();
    const value = numberValue(raw.price ?? raw.index_value);
    const change = numberValue(raw.change);
    if (!symbol || value === null || change === null) return [];
    return [{ symbol, name: String(raw.name ?? raw.index_name ?? symbol), value, change, changePercent: numberValue(raw.change_percent) ?? undefined, direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat' }];
  });
  return { headline: indices.length ? 'Dữ liệu chỉ số thị trường' : '', indices, updatedAt: new Date().toISOString() };
}

function adaptWatchlist(payload: unknown): WatchlistItem[] {
  const items: unknown[] = Array.isArray(payload) ? payload : payload && typeof payload === 'object' && Array.isArray((payload as Raw).items) ? (payload as Raw).items as unknown[] : [];
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as Raw;
    const symbol = String(raw.symbol ?? raw.ticker ?? '').trim().toUpperCase();
    if (!symbol) return [];
    const price = numberValue(raw.price ?? raw.last_price ?? raw.close);
    const change = numberValue(raw.change ?? raw.change_value);
    return [{ symbol, name: typeof raw.name === 'string' ? raw.name : undefined, price: price ?? '', change: change ?? '', changePercent: numberValue(raw.change_percent) ?? undefined }];
  });
}

export default function MarketScreen() {
  const { user } = useAuth();
  const [live, setLive] = useState<Record<string, { value?: number; change?: number; changePercent?: number }>>({});
  const market = useQuery({
    queryKey: ['mobile', 'market-indices'],
    queryFn: () => api<{ data?: unknown }>('/market-data/overview/market-index?symbols=VNINDEX,VN30,HNXIndex,HNX30,HNXUpcomIndex'),
  });
  const watchlist = useQuery({
    queryKey: ['mobile', 'watchlist'],
    enabled: !!user,
    queryFn: () => api<unknown>('/watchlists'),
  });
  useEffect(() => {
    if (!user) return undefined;
    const stream = createMarketRealtime({
      symbols: ['VNINDEX', 'VN30', 'HNXINDEX', 'HNX30', 'UPCOMINDEX'],
      channels: ['index', 'tick'],
      pollFallback: () => market.refetch().then(() => undefined),
      onEvent: (event) => {
        const symbol = typeof event.symbol === 'string' ? event.symbol.toUpperCase() : '';
        const value = numberValue(event.price ?? event.index_value ?? event.value ?? event.last_price);
        const change = numberValue(event.change ?? event.change_value);
        const changePercent = numberValue(event.change_percent ?? event.changePercent);
        if (!symbol || (value === null && change === null && changePercent === null)) return;
        setLive((current) => ({ ...current, [symbol]: { ...current[symbol], ...(value !== null ? { value } : {}), ...(change !== null ? { change } : {}), ...(changePercent !== null ? { changePercent } : {}) } }));
      },
    });
    stream.start();
    return () => stream.stop();
  }, [market.refetch, user]);
  const status = market.isPending ? 'loading' : market.isError ? 'error' : adaptMarket(market.data ?? {}).indices?.length ? 'ready' : 'empty';
  const baseOverview = market.data ? adaptMarket(market.data) : undefined;
  const overview = baseOverview ? { ...baseOverview, indices: (baseOverview.indices ?? []).map((index) => ({ ...index, ...live[index.symbol] })) } : undefined;
  return <Screen>
    <ScrollView contentContainerStyle={styles.content}>
      <Heading>Thị trường</Heading>
      <Muted style={styles.subtitle}>Dữ liệu từ IQX, có timestamp từ máy chủ.</Muted>
      <MarketFeature status={status} overview={overview} watchlist={adaptWatchlist(watchlist.data)} onRetry={() => { void market.refetch(); void watchlist.refetch(); }} onSelect={(item) => router.push(`/stock/${item.symbol}`)} />
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({ content: { paddingVertical: 24, paddingBottom: 32 }, subtitle: { marginTop: 6, marginBottom: 16 } });
