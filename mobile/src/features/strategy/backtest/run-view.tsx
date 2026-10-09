import { View } from 'react-native';

import { Badge, Card, Divider, EmptyState, Text } from '@/components/ui';
import { formatDate, formatNumber } from '@/lib/format';
import { useTheme } from '@/theme';
import { DASH, fmtInt, fmtPercent, fmtSignedPercent, fmtSignedVnd, fmtVnd, toneKey } from '../shared/format';
import { BacktestChart } from './chart';
import type { BacktestResult, BacktestTrade, OpenPosition, PendingOrder, Snapshot } from './types';

export const OUTCOME_LABEL = { win: 'Lãi', loss: 'Lỗ', flat: 'Hòa vốn' } as const;

export type KpiItem = { id: string; label: string; value: string; caption?: string; tone?: 'priceUp' | 'priceDown' | 'foreground' };

/** The 6 headline KPIs (values are already percent). */
export function buildKpis(result: BacktestResult): KpiItem[] {
  const k = result.kpis;
  const n = k.closed_trade_count ?? result.counts?.closed_trade_count ?? null;
  const wins = result.supplementary?.winning_trade_count ?? 0;
  return [
    { id: 'total-return', label: 'Tổng lợi nhuận', value: fmtSignedPercent(k.total_return_pct), tone: toneKey(k.total_return_pct) },
    { id: 'annual-return', label: 'Lợi nhuận năm hóa', value: fmtSignedPercent(k.annualized_return_pct), tone: toneKey(k.annualized_return_pct) },
    { id: 'max-drawdown', label: 'Sụt giảm lớn nhất', value: fmtSignedPercent(k.max_drawdown_pct), tone: toneKey(k.max_drawdown_pct) },
    { id: 'trade-count', label: 'Số giao dịch', value: fmtInt(n) },
    {
      id: 'win-rate',
      label: 'Tỷ lệ thắng',
      value: fmtPercent(k.win_rate_pct, 1),
      caption: n && n > 0 ? `${wins} / ${n} giao dịch` : 'Chưa có giao dịch đã đóng',
    },
    { id: 'buy-hold', label: 'Lợi nhuận mua và giữ', value: fmtSignedPercent(k.buy_hold_return_pct), tone: toneKey(k.buy_hold_return_pct) },
  ];
}

export function KpiGrid({ result }: { result: BacktestResult }) {
  const { spacing } = useTheme();
  const items = buildKpis(result);
  return (
    <View testID="strategy-backtest-kpi-grid" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {items.map((it) => (
        <View key={it.id} testID={`strategy-backtest-kpi-${it.id}`} style={{ flexBasis: '47%', flexGrow: 1 }}>
          <Card padded>
            <Text variant="caption" color="mutedForeground">{it.label}</Text>
            <Text variant="title" color={it.tone ?? 'foreground'} style={{ fontVariant: ['tabular-nums'] }}>{it.value}</Text>
            {it.caption ? <Text variant="caption" color="mutedForeground">{it.caption}</Text> : null}
          </Card>
        </View>
      ))}
    </View>
  );
}

export function RunSummary({ snapshot, runId }: { snapshot?: Snapshot | null; runId: string }) {
  const { spacing } = useTheme();
  if (!snapshot) return null;
  const warnings = snapshot.data_warnings ?? [];
  return (
    <View style={{ gap: spacing.xs }} testID="strategy-backtest-assumptions">
      <Text variant="caption" color="mutedForeground">
        Vốn ban đầu {fmtVnd(snapshot.capital)} · khoảng yêu cầu {formatDate(snapshot.requested_start)} đến {formatDate(snapshot.requested_end)} · mã lần chạy {runId.slice(0, 8)}.
      </Text>
      <Text variant="caption" color="mutedForeground">
        {snapshot.execution === 'same_close' ? 'Khớp tại giá đóng cửa cùng phiên.' : 'Khớp tại giá mở cửa phiên kế tiếp.'}{' '}
        {snapshot.fee_preset === 'none' ? 'Không tính phí.' : 'Có tính phí chuẩn của hồ sơ mô phỏng.'} Lô 100 cổ phiếu, không có cắt lỗ hay chốt lời.
      </Text>
      {warnings.length > 0 ? (
        <View accessibilityLabel="Cảnh báo dữ liệu" testID="strategy-backtest-warnings" style={{ gap: 2 }}>
          {warnings.map((w) => (
            <Text key={w.code} variant="caption" color="statusWarning">• {w.message}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function OpenPositionStrip({ position, symbol }: { position: OpenPosition; symbol: string }) {
  return (
    <Card padded>
      <View testID="strategy-backtest-open-position" style={{ gap: 4 }}>
        <Badge label="Vị thế đang mở" tone="neutral" />
        <Text weight="semibold">{symbol} · {fmtInt(position.qty)} CP</Text>
        <Text variant="caption" color="mutedForeground">
          Mua {formatDate(position.date)} (tín hiệu {formatDate(position.signal_date)}) · Giá vốn {formatNumber(position.price, 0)} đ
        </Text>
        <Text variant="caption" color="mutedForeground">Giá cuối {formatNumber(position.last_price, 0)} đ · giá trị {fmtVnd(position.market_value)}</Text>
        <Text variant="mono" color={toneKey(position.unrealized_pnl)}>Tạm tính {fmtSignedVnd(position.unrealized_pnl)}</Text>
        <Text variant="caption" color="mutedForeground">
          Chỉ tính tạm: giá trị tại giá đóng cửa cuối trừ tổng chi mua, chưa trừ phí và thuế bán. Chưa là giao dịch đã đóng, không vào số giao dịch hay tỷ lệ thắng.
        </Text>
      </View>
    </Card>
  );
}

export function PendingOrders({ orders }: { orders: PendingOrder[] }) {
  if (!orders.length) return null;
  return (
    <Card padded>
      <View testID="strategy-backtest-pending-orders" style={{ gap: 4 }}>
        <Badge label="Lệnh chưa khớp cuối kỳ" tone="neutral" />
        {orders.map((o, i) => (
          <Text key={i} variant="caption" color="mutedForeground">
            {String(o.side ?? '').toUpperCase() === 'SELL' || o.side === 'sell' ? 'Bán' : 'Mua'} {o.symbol ?? ''} {o.qty ? `${fmtInt(o.qty)} CP` : ''} {o.date ? `· ${formatDate(o.date)}` : ''}
          </Text>
        ))}
      </View>
    </Card>
  );
}

export function TradeRow({ trade, index }: { trade: BacktestTrade; index: number }) {
  const { spacing } = useTheme();
  const tone = toneKey(trade.pnl);
  const outcome = trade.outcome ? OUTCOME_LABEL[trade.outcome] : DASH;
  return (
    <View testID={`strategy-backtest-trade-${index}`} style={{ paddingVertical: spacing.sm, gap: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text weight="semibold">#{trade.number} · {formatDate(trade.entry_date)} → {formatDate(trade.exit_date)}</Text>
        <Badge label={outcome} tone={trade.outcome === 'win' ? 'success' : trade.outcome === 'loss' ? 'danger' : 'neutral'} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" color="mutedForeground">
          {fmtInt(trade.qty)} CP · {formatNumber(trade.entry_price, 0)} → {formatNumber(trade.exit_price, 0)} · giữ {fmtInt(trade.hold)} phiên
        </Text>
        <Text variant="mono" color={tone} align="right">{fmtSignedPercent(trade.pnl_pct, 1)}</Text>
      </View>
      <Text variant="mono" color={tone} align="right">{fmtSignedVnd(trade.pnl)}</Text>
      <Divider />
    </View>
  );
}

export function NoTrades() {
  return <EmptyState title="Chưa có giao dịch đã đóng" message="Chưa có giao dịch đã đóng trong khoảng kiểm thử này." />;
}

export { BacktestChart };
