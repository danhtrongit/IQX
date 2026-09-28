import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Body, Button, Card, Heading, Muted } from '../../components/ui';
import { useTheme } from '../../theme';
import type { OrderDraft, PaperPortfolio, Position, TradingStatus } from './types';

const display = (value: number | string | undefined, currency?: string) => {
  if (value == null || value === '') return '—';
  if (typeof value === 'number') return `${currency ?? ''}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return String(value);
};
const change = (value: number | string | undefined) => value == null || value === '' ? '—' : typeof value === 'number' ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : String(value);

export function SimulatedTradingNotice() {
  const { theme } = useTheme();
  return <Card accessibilityLabel="Thông báo giao dịch mô phỏng" style={[styles.notice, { backgroundColor: theme.accentSoft }]}><Body style={styles.noticeTitle}>Chỉ là giao dịch mô phỏng</Body><Muted>Lệnh và giá trị danh mục chỉ dùng để thực hành. Không có lệnh, khớp lệnh, số dư hay tiền thật.</Muted></Card>;
}

export function PortfolioCard({ portfolio }: { portfolio: PaperPortfolio }) {
  const { theme } = useTheme();
  const positive = typeof portfolio.dayChange === 'number' && portfolio.dayChange > 0;
  const negative = typeof portfolio.dayChange === 'number' && portfolio.dayChange < 0;
  return <Card accessibilityLabel="Danh mục mô phỏng"><Body style={styles.sectionTitle}>Danh mục mô phỏng</Body><Heading style={styles.value}>{display(portfolio.equity, portfolio.currency)}</Heading><Muted>Giá trị tài khoản</Muted><View style={styles.metrics}><View><Muted>Sức mua</Muted><Body style={styles.metric}>{display(portfolio.buyingPower, portfolio.currency)}</Body></View><View style={styles.right}><Muted>Hôm nay</Muted><Body style={{ color: positive ? theme.market.up : negative ? theme.market.down : theme.market.reference }}>{change(portfolio.dayChangePercent ?? portfolio.dayChange)}</Body></View></View></Card>;
}

export function PositionsCard({ positions, onSelect, emptyLabel = 'Chưa có vị thế mô phỏng.' }: { positions: Position[]; onSelect?: (position: Position) => void; emptyLabel?: string }) {
  const { theme } = useTheme();
  return <Card><Body style={styles.sectionTitle}>Vị thế</Body>{positions.length === 0 ? <Muted>{emptyLabel}</Muted> : positions.map(position => { const val = typeof position.unrealizedChangePercent === 'number' ? position.unrealizedChangePercent : Number(position.unrealizedChange); const row = <View style={styles.row}><View style={styles.copy}><Body style={styles.symbol}>{position.symbol}</Body><Muted numberOfLines={1}>{position.name ?? `${position.quantity} cổ phiếu`}</Muted></View><View style={styles.right}><Body style={styles.metric}>{display(position.marketValue)}</Body><Body style={{ color: val > 0 ? theme.market.up : val < 0 ? theme.market.down : theme.market.reference }}>{change(position.unrealizedChangePercent ?? position.unrealizedChange)}</Body></View></View>; return onSelect ? <Pressable key={position.symbol} accessibilityRole="button" accessibilityLabel={`Mở vị thế ${position.symbol}`} onPress={() => onSelect(position)} style={({ pressed }) => [pressed && styles.pressed]}>{row}</Pressable> : <View key={position.symbol}>{row}</View>; })}</Card>;
}

export function TradingState({ status, onRetry }: { status: TradingStatus; onRetry?: () => void }) {
  const { theme } = useTheme();
  if (status === 'loading') return <Card accessibilityLabel="Đang tải giao dịch"><Muted>Đang tải danh mục mô phỏng…</Muted><View style={[styles.skeleton, { backgroundColor: theme.border }]} /><View style={[styles.skeleton, styles.short, { backgroundColor: theme.border }]} /></Card>;
  if (status === 'error') return <Card><Body style={styles.sectionTitle}>Không thể tải giao dịch</Body><Muted style={styles.empty}>Không thể tải danh mục mô phỏng. Hãy thử lại.</Muted><Button variant="secondary" onPress={onRetry}>Thử lại</Button></Card>;
  if (status === 'empty') return <Card><Body style={styles.sectionTitle}>Danh mục mô phỏng đang trống</Body><Muted style={styles.empty}>Mở một mã cổ phiếu để tạo giao dịch mô phỏng. Không dùng tiền thật.</Muted></Card>;
  return null;
}

export function TradingFeature({ status = 'ready', portfolio, positions = [], onRetry }: { status?: TradingStatus; portfolio?: PaperPortfolio; positions?: Position[]; onRetry?: () => void }) {
  return <View><SimulatedTradingNotice />{status !== 'ready' ? <TradingState status={status} onRetry={onRetry} /> : portfolio ? <><PortfolioCard portfolio={portfolio} /><PositionsCard positions={positions} /></> : <TradingState status="empty" />}</View>;
}

export function OrderSummary({ order, onSubmit }: { order: OrderDraft; onSubmit?: () => void }) {
  return <Card accessibilityLabel="Tóm tắt lệnh mô phỏng"><Body style={styles.sectionTitle}>{order.side === 'buy' ? 'Mua' : 'Bán'} {order.symbol}</Body><Muted>{order.quantity} cổ phiếu{order.limitPrice != null ? ` · giá giới hạn ${display(order.limitPrice)}` : ''}</Muted><Button onPress={onSubmit}>Xem lại lệnh mô phỏng</Button></Card>;
}

const styles = StyleSheet.create({ notice: {}, noticeTitle: { fontWeight: '700', marginBottom: 4 }, sectionTitle: { fontWeight: '700', marginBottom: 8 }, value: { fontSize: 25, marginVertical: 6 }, metrics: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }, metric: { fontWeight: '700', marginTop: 3 }, right: { alignItems: 'flex-end' }, row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }, copy: { flex: 1, paddingRight: 12 }, symbol: { fontWeight: '700' }, empty: { marginBottom: 14 }, skeleton: { height: 14, borderRadius: 7, marginTop: 12, width: '82%' }, short: { width: '48%' }, pressed: { opacity: 0.7 } });
