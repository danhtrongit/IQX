import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Body, Button, Card, Heading, Muted } from '../../components/ui';
import { useTheme } from '../../theme';
import type { MarketIndex, MarketOverview, MarketStatus, WatchlistItem } from './types';

const formatNumber = (value: number | string) => typeof value === 'number' ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : value;
const formatChange = (value: number | string) => typeof value === 'number' ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : value;

export function MarketPulseCard({ overview }: { overview: MarketOverview }) {
  const { theme } = useTheme();
  return <Card accessibilityLabel="Market pulse">
    <Muted>Tổng quan thị trường</Muted>
    <Heading style={styles.headline}>{overview.headline}</Heading>
    <Body style={{ color: theme.accent }}>{overview.score == null ? 'Thông tin thị trường cập nhật' : `${overview.score} / 100`}{overview.updatedAt ? ` · ${overview.updatedAt}` : ''}</Body>
  </Card>;
}

export function MarketIndexRow({ index, onPress }: { index: MarketIndex; onPress?: () => void }) {
  const { theme } = useTheme();
  const positive = index.direction === 'up' || (index.direction == null && index.change > 0);
  const negative = index.direction === 'down' || (index.direction == null && index.change < 0);
  const content = <View style={styles.row}><View style={styles.copy}><Body style={styles.symbol}>{index.symbol}</Body><Muted numberOfLines={1}>{index.name}</Muted></View><View style={styles.values}><Body style={styles.value}>{formatNumber(index.value)}</Body><Body style={{ color: positive ? theme.market.up : negative ? theme.market.down : theme.market.reference }}>{formatChange(index.changePercent ?? index.change)}</Body></View></View>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`Open ${index.symbol}`} onPress={onPress} style={({ pressed }) => [styles.touch, pressed && styles.pressed]}>{content}</Pressable> : content;
}

export function WatchlistCard({ items, onSelect, emptyLabel = 'Your watchlist is empty.' }: { items: WatchlistItem[]; onSelect?: (item: WatchlistItem) => void; emptyLabel?: string }) {
  const rows = items.flatMap((item) => {
    const price = typeof item.price === 'number' ? item.price : Number(item.price);
    const change = typeof item.change === 'number' ? item.change : Number(item.change);
    return Number.isFinite(price) && Number.isFinite(change)
      ? [{ item, index: { symbol: item.symbol, name: item.name ?? 'Equity', value: price, change, changePercent: item.changePercent, direction: item.direction } as MarketIndex }]
      : [];
  });
  return <Card><Body style={styles.sectionTitle}>Danh sách theo dõi</Body>{rows.length === 0 ? <Muted style={styles.empty}>{emptyLabel}</Muted> : rows.map(({ item, index }) => <MarketIndexRow key={item.symbol} index={index} onPress={() => onSelect?.(item)} />)}</Card>;
}

export function MarketPremiumGate({ onUpgrade }: { onUpgrade?: () => void }) {
  return <Card accessibilityLabel="Phân tích Premium"><Body style={styles.sectionTitle}>Phân tích thị trường nâng cao</Body><Muted style={styles.empty}>Mở tín hiệu danh sách theo dõi, bối cảnh chuyên sâu và chiến lược với IQX Pro.</Muted><Button onPress={onUpgrade}>Mở IQX Pro</Button></Card>;
}

export function MarketState({ status, onRetry, onUpgrade }: { status: MarketStatus; onRetry?: () => void; onUpgrade?: () => void }) {
  const { theme } = useTheme();
  if (status === 'loading') return <Card accessibilityLabel="Đang tải thị trường"><Muted>Đang tải dữ liệu thị trường…</Muted><View style={[styles.skeleton, { backgroundColor: theme.border }]} /><View style={[styles.skeleton, styles.short, { backgroundColor: theme.border }]} /></Card>;
  if (status === 'error') return <Card><Body style={styles.sectionTitle}>Không thể tải thị trường</Body><Muted style={styles.empty}>Không thể tải dữ liệu thị trường. Hãy thử lại.</Muted><Button variant="secondary" onPress={onRetry}>Thử lại</Button></Card>;
  if (status === 'empty') return <Card><Body style={styles.sectionTitle}>Chưa có dữ liệu thị trường</Body><Muted style={styles.empty}>Dữ liệu sẽ hiển thị khi máy chủ sẵn sàng.</Muted></Card>;
  if (status === 'premium') return <MarketPremiumGate onUpgrade={onUpgrade} />;
  return null;
}

export function MarketFeature({ status = 'ready', overview, watchlist = [], onSelect, onRetry, onUpgrade }: { status?: MarketStatus; overview?: MarketOverview; watchlist?: WatchlistItem[]; onSelect?: (item: WatchlistItem) => void; onRetry?: () => void; onUpgrade?: () => void }) {
  if (status !== 'ready') return <MarketState status={status} onRetry={onRetry} onUpgrade={onUpgrade} />;
  if (!overview) return <MarketState status="empty" />;
  return <View><MarketPulseCard overview={overview} />{overview.indices?.map(index => <MarketIndexRow key={index.symbol} index={index} onPress={() => onSelect?.({ symbol: index.symbol, name: index.name, price: index.value, change: index.change, changePercent: index.changePercent, direction: index.direction })} />)}<WatchlistCard items={watchlist} onSelect={onSelect} /></View>;
}

const styles = StyleSheet.create({ headline: { marginTop: 6, marginBottom: 4, fontSize: 22 }, sectionTitle: { fontWeight: '700', marginBottom: 8 }, row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 }, touch: { minHeight: 44 }, pressed: { opacity: 0.7 }, copy: { flex: 1, paddingRight: 12 }, symbol: { fontWeight: '700' }, values: { alignItems: 'flex-end' }, value: { fontWeight: '700' }, empty: { marginBottom: 14 }, skeleton: { height: 14, borderRadius: 7, marginTop: 12, width: '82%' }, short: { width: '48%' } });
