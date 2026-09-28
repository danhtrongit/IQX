import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Body, Button, Card, Heading, Muted } from '../../components/ui';
import { useTheme } from '../../theme';
import type { AlertSeverity, BacktestResult, StrategyAlert, StrategyIndicator, StrategySnapshot, StrategyStatus } from './types';

export function StrategyIndicators({ indicators = [] }: { indicators?: StrategyIndicator[] }) {
  const { theme } = useTheme();
  if (!indicators.length) return <Card><Body style={styles.section}>Chỉ báo</Body><Muted>Chưa có chỉ báo nào.</Muted></Card>;
  return <Card accessibilityLabel="Chỉ báo chiến lược"><Body style={styles.section}>Chỉ báo</Body>{indicators.map((item) => <View key={item.id} style={styles.row}><View style={styles.copy}><Body style={styles.name}>{item.name}</Body><Muted>{item.kind}{item.description ? ` · ${item.description}` : ''}</Muted></View><Body style={{ color: theme.accent, fontWeight: '700' }}>{item.value ?? '—'}</Body></View>)}</Card>;
}

const severityColor = (severity: AlertSeverity, theme: ReturnType<typeof useTheme>['theme']) => severity === 'critical' ? theme.danger : severity === 'warning' ? theme.accent : theme.primary;
export function StrategyAlerts({ alerts = [] }: { alerts?: StrategyAlert[] }) {
  const { theme } = useTheme();
  return <Card accessibilityLabel="Cảnh báo chiến lược"><Body style={styles.section}>Cảnh báo</Body>{alerts.length === 0 ? <Muted>Chưa có cảnh báo đang hoạt động.</Muted> : alerts.map((alert) => <View key={alert.id} style={styles.alert}><View style={[styles.dot, { backgroundColor: severityColor(alert.severity, theme) }]} /><View style={styles.copy}><Body style={styles.name}>{alert.title}</Body><Muted>{alert.message ?? alert.createdAt ?? 'Tín hiệu mới'}</Muted></View></View>)}</Card>;
}

export function BacktestSummary({ result }: { result?: BacktestResult }) {
  if (!result) return <Card><Body style={styles.section}>Backtest</Body><Muted>Chạy backtest để đánh giá chiến lược.</Muted></Card>;
  return <Card accessibilityLabel="Kết quả backtest"><Body style={styles.section}>Backtest · {result.symbol}</Body><View style={styles.metrics}><Metric label="Lợi nhuận" value={`${result.returnPct >= 0 ? '+' : ''}${result.returnPct.toFixed(1)}%`} /><Metric label="Tỷ lệ thắng" value={`${result.winRate.toFixed(1)}%`} /><Metric label="Sụt giảm" value={`${result.maxDrawdown.toFixed(1)}%`} /><Metric label="Số lệnh" value={String(result.trades)} /></View>{result.period ? <Muted style={styles.period}>{result.period}</Muted> : null}</Card>;
}
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Muted>{label}</Muted><Body style={styles.metricValue}>{value}</Body></View>; }

export function StrategyPremiumGate({ onUpgrade }: { onUpgrade?: () => void }) { return <Card accessibilityLabel="Công cụ chiến lược Premium"><Body style={styles.section}>Công cụ chiến lược nâng cao</Body><Muted style={styles.empty}>Mở nghiên cứu chỉ báo, cảnh báo và backtest với IQX Pro.</Muted><Button onPress={onUpgrade}>Mở IQX Pro</Button></Card>; }
export function StrategyState({ status, onRetry, onUpgrade }: { status: StrategyStatus; onRetry?: () => void; onUpgrade?: () => void }) {
  const { theme } = useTheme();
  if (status === 'loading') return <Card accessibilityLabel="Đang tải chiến lược"><Muted>Đang tải dữ liệu chiến lược…</Muted><View style={[styles.skeleton, { backgroundColor: theme.border }]} /><View style={[styles.skeleton, styles.short, { backgroundColor: theme.border }]} /></Card>;
  if (status === 'error') return <Card><Body style={styles.section}>Không thể tải chiến lược</Body><Muted style={styles.empty}>Không thể tải dữ liệu chiến lược. Hãy thử lại.</Muted><Button variant="secondary" onPress={onRetry}>Thử lại</Button></Card>;
  if (status === 'empty') return <Card><Body style={styles.section}>Chưa có dữ liệu chiến lược</Body><Muted>Chỉ báo và cảnh báo sẽ hiển thị khi có dữ liệu.</Muted></Card>;
  if (status === 'premium') return <StrategyPremiumGate onUpgrade={onUpgrade} />;
  return null;
}
export function StrategyFeature({ status = 'ready', snapshot, onRetry, onUpgrade }: { status?: StrategyStatus; snapshot?: StrategySnapshot; onRetry?: () => void; onUpgrade?: () => void }) {
  if (status !== 'ready') return <StrategyState status={status} onRetry={onRetry} onUpgrade={onUpgrade} />;
  if (!snapshot) return <StrategyState status="empty" />;
  return <View><Card><Heading style={styles.title}>{snapshot.title}</Heading>{snapshot.summary ? <Muted>{snapshot.summary}</Muted> : null}</Card><StrategyIndicators indicators={snapshot.indicators} /><StrategyAlerts alerts={snapshot.alerts} /><BacktestSummary result={snapshot.backtest} /></View>;
}
const styles = StyleSheet.create({ title: { fontSize: 22, marginBottom: 5 }, section: { fontWeight: '700', marginBottom: 8 }, row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }, copy: { flex: 1, paddingRight: 12 }, name: { fontWeight: '600' }, alert: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }, dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 }, metrics: { flexDirection: 'row', flexWrap: 'wrap' }, metric: { width: '50%', paddingVertical: 7 }, metricValue: { fontWeight: '700', fontSize: 18 }, period: { marginTop: 4 }, empty: { marginBottom: 14 }, skeleton: { height: 14, borderRadius: 7, marginTop: 12, width: '82%' }, short: { width: '48%' } });
