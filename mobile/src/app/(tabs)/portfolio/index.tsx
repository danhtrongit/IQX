import { useRouter } from 'expo-router';
import { TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Badge, Button, confirmDialog, Card, Divider, EmptyState, ErrorState, KeyValueRow, PanelState, Screen, SkeletonList, Tabs, Text, useSnackbar } from '@/components/ui';
import {
  ORDER_FILTERS,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  isValuationUnavailable,
  useActivateAccount,
  useAnalyzePortfolio,
  useCancelOrder,
  useTradingAccount,
  useTradingOrders,
  RoleText,
  useTradingPortfolio,
  type TradingOrder,
} from '@/features/trading';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatNumber, formatPct, formatVnd } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';

function pnlRole(value: number | null | undefined) {
  return !value ? 'ref' : value > 0 ? 'up' : 'down';
}

function OrderRow({ order, onCancel, cancelling }: { order: TradingOrder; onCancel: (o: TradingOrder) => void; cancelling: boolean }) {
  const { spacing } = useTheme();
  const price = order.filled_price_vnd ?? order.limit_price_vnd;
  const note = order.rejection_reason ?? order.cancel_reason;
  return (
    <View testID={`portfolio-order-${order.id}`} style={{ paddingVertical: spacing.sm, gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text weight="semibold" color={order.side === 'buy' ? 'priceUp' : 'priceDown'}>{order.side === 'buy' ? 'MUA' : 'BÁN'}</Text>
          <Text weight="semibold">{order.symbol}</Text>
        </View>
        <Badge label={ORDER_STATUS_LABEL[order.status] ?? order.status} tone={ORDER_STATUS_TONE[order.status] ?? 'neutral'} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" color="mutedForeground">{`${order.order_type === 'limit' ? 'LO' : 'Thị trường'} · ${formatNumber(order.quantity, 0)} CP`}</Text>
        <Text variant="mono">{price ? formatVnd(price) : '—'}</Text>
      </View>
      <Text variant="caption" color="mutedForeground">{formatDateTime(order.created_at)}</Text>
      {note ? <Text variant="caption" color="statusError">{note}</Text> : null}
      {order.status === 'pending' ? (
        <Button testID={`portfolio-order-cancel-${order.id}`} title="Huỷ lệnh" size="sm" variant="outline" fullWidth={false} loading={cancelling} onPress={() => onCancel(order)} />
      ) : null}
    </View>
  );
}

export default function PortfolioScreen() {
  const router = useRouter();
  const { spacing, colors } = useTheme();
  const snackbar = useSnackbar();
  const { isPremium } = useAuth();
  const [filter, setFilter] = useState<string>('all');

  const account = useTradingAccount();
  const portfolio = useTradingPortfolio();
  const orders = useTradingOrders(filter);
  const activate = useActivateAccount();
  const cancel = useCancelOrder();
  const analyze = useAnalyzePortfolio();

  const refreshing = portfolio.isRefetching || orders.isRefetching;
  const refresh = () => {
    void account.refetch();
    void portfolio.refetch();
    void orders.refetch();
  };

  const confirmCancel = async (order: TradingOrder) => {
    const ok = await confirmDialog({
      title: 'Huỷ lệnh?',
      message: `${order.side === 'buy' ? 'Mua' : 'Bán'} ${formatNumber(order.quantity, 0)} ${order.symbol}`,
      confirmLabel: 'Huỷ lệnh',
      cancelLabel: 'Giữ lại',
      destructive: true,
    });
    if (!ok) return;
    cancel.mutate(order.id, {
      onSuccess: () => {
        haptics.success();
        snackbar.success(`Đã huỷ lệnh ${order.symbol}`);
      },
      onError: (e) => snackbar.error(errorMessage(e)),
    });
  };

  if (account.isPending) {
    return (
      <Screen scroll testID="portfolio-screen">
        <SkeletonList rows={6} />
      </Screen>
    );
  }
  if (account.isError) {
    return (
      <Screen scroll testID="portfolio-screen" onRefresh={refresh} refreshing={refreshing}>
        <ErrorState error={account.error} onRetry={() => account.refetch()} />
      </Screen>
    );
  }
  if (!account.data) {
    return (
      <Screen scroll testID="portfolio-screen" onRefresh={refresh} refreshing={refreshing}>
        <PanelState
          testID="portfolio-no-account"
          title="Chưa có tài khoản Sân tập"
          message="Kích hoạt tài khoản để nhận vốn ảo và bắt đầu giao dịch giả lập."
          actionLabel={activate.isPending ? 'Đang kích hoạt…' : 'Kích hoạt tài khoản'}
          onAction={() => activate.mutate(undefined, { onError: (e) => snackbar.error(errorMessage(e)) })}
        />
      </Screen>
    );
  }

  const acc = account.data;
  const pf = portfolio.data;
  const valuationDown = portfolio.isError && isValuationUnavailable(portfolio.error);
  const allOrders = (orders.data?.pages ?? []).flatMap((p) => p.orders);

  return (
    <Screen scroll testID="portfolio-screen" onRefresh={refresh} refreshing={refreshing}>
      <Card testID="portfolio-summary" style={{ gap: spacing.xs }}>
        <Text variant="caption" color="mutedForeground">Tổng tài sản (NAV)</Text>
        <Text testID="portfolio-nav" variant="title">{pf ? formatVnd(pf.nav_vnd) : '—'}</Text>
        {pf ? (
          <RoleText testID="portfolio-return" role={pnlRole(pf.return_pct)}>{`${formatPct(pf.return_pct)} · ${formatVnd(pf.total_unrealized_pnl_vnd)}`}</RoleText>
        ) : null}
        <Divider />
        <KeyValueRow testID="portfolio-cash-available" label="Tiền khả dụng" value={formatVnd(acc.cash_available_vnd)} />
        <KeyValueRow label="Tiền bị giữ" value={formatVnd(acc.cash_reserved_vnd)} />
        <KeyValueRow label="Tiền chờ về" value={formatVnd(acc.cash_pending_vnd)} />
        {pf ? <KeyValueRow label="Giá trị cổ phiếu" value={formatVnd(pf.total_market_value_vnd)} /> : null}
        {pf?.pending_rights && (pf.pending_rights.pending_cash_dividend_vnd > 0 || pf.pending_rights.pending_stock_dividend_quantity > 0) ? (
          <>
            <KeyValueRow label="Cổ tức tiền chờ nhận" value={formatVnd(pf.pending_rights.pending_cash_dividend_vnd)} />
            <KeyValueRow label="Cổ tức cổ phiếu chờ nhận" value={`${formatNumber(pf.pending_rights.pending_stock_dividend_quantity, 0)} CP`} />
          </>
        ) : null}
      </Card>

      {valuationDown ? (
        <PanelState
          testID="portfolio-valuation-warning"
          icon={TriangleAlert}
          title="Chưa định giá được danh mục"
          message="Không lấy được giá thị trường lúc này. Tiền mặt vẫn hiển thị đúng; thử lại sau ít phút."
          actionLabel="Thử lại"
          onAction={() => portfolio.refetch()}
        />
      ) : portfolio.isError ? (
        <ErrorState error={portfolio.error} onRetry={() => portfolio.refetch()} />
      ) : null}

      {pf && pf.refresh_warnings.length > 0 ? (
        <Card testID="portfolio-warnings" style={{ gap: spacing.xs, borderColor: colors.statusWarning }}>
          {pf.refresh_warnings.map((w, i) => (
            <Text key={i} variant="caption" color="statusWarning">{w}</Text>
          ))}
        </Card>
      ) : null}

      <View style={{ gap: spacing.xs }}>
        <Text variant="section">Cổ phiếu nắm giữ</Text>
        {portfolio.isPending ? (
          <SkeletonList rows={3} />
        ) : pf && pf.positions.length === 0 ? (
          <EmptyState testID="portfolio-holdings-empty" title="Chưa nắm giữ cổ phiếu nào" message="Đặt lệnh mua ở tab Giao dịch để bắt đầu." />
        ) : pf ? (
          <View testID="portfolio-holdings">
            {pf.positions.map((p) => (
              <Pressable
                key={p.symbol}
                testID={`portfolio-holding-${p.symbol}`}
                accessibilityRole="button"
                accessibilityLabel={`${p.symbol}, mở trong Giao dịch`}
                onPress={() => router.push({ pathname: '/trade', params: { symbol: p.symbol } })}
                style={{ marginBottom: spacing.xs }}>
              <Card style={{ gap: spacing.xs }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="section">{p.symbol}</Text>
                  <RoleText role={pnlRole(p.unrealized_pnl_vnd)}>{p.unrealized_pnl_vnd === null ? '—' : formatVnd(p.unrealized_pnl_vnd)}</RoleText>
                </View>
                <KeyValueRow label="Khối lượng (có thể bán)" value={`${formatNumber(p.quantity_total, 0)} (${formatNumber(p.quantity_sellable, 0)})`} />
                <KeyValueRow label="Giá vốn TB" value={formatVnd(p.avg_cost_vnd)} />
                <KeyValueRow label="Giá thị trường" value={formatVnd(p.current_price_vnd)} />
                <KeyValueRow label="Giá trị" value={formatVnd(p.market_value_vnd)} />
              </Card>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text variant="section">Lịch sử lệnh</Text>
        <Tabs testID="portfolio-order-filter" items={ORDER_FILTERS.map((f) => ({ value: f.value, label: f.label }))} value={filter} onChange={setFilter} />
        {orders.isPending ? (
          <SkeletonList rows={3} />
        ) : orders.isError ? (
          <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
        ) : allOrders.length === 0 ? (
          <EmptyState testID="portfolio-orders-empty" title="Chưa có lệnh nào" />
        ) : (
          <View testID="portfolio-orders">
            {allOrders.map((o, i) => (
              <View key={o.id}>
                {i > 0 ? <Divider /> : null}
                <OrderRow order={o} onCancel={confirmCancel} cancelling={cancel.isPending && cancel.variables === o.id} />
              </View>
            ))}
            {orders.hasNextPage ? (
              <Button testID="portfolio-orders-more" title="Tải thêm" variant="outline" loading={orders.isFetchingNextPage} onPress={() => orders.fetchNextPage()} />
            ) : null}
          </View>
        )}
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text variant="section">Báo cáo AI danh mục</Text>
        {!isPremium ? (
          <PanelState testID="portfolio-ai-locked" title="Cần gói Premium" message="Báo cáo phân tích danh mục là một phần của gói Premium. Phần nắm giữ và lịch sử lệnh vẫn dùng đầy đủ." />
        ) : (
          <Card style={{ gap: spacing.sm }}>
            {analyze.data ? (
              <View testID="portfolio-ai-report" style={{ gap: spacing.sm }}>
                {analyze.data.insufficient ? (
                  <Text color="mutedForeground">{analyze.data.reason ?? 'Chưa đủ dữ liệu để phân tích. Danh mục cần thêm vị thế hoặc lịch sử giao dịch.'}</Text>
                ) : (
                  <>
                    <Text variant="heading">{analyze.data.title ?? 'Báo cáo danh mục'}</Text>
                    {analyze.data.score !== null ? <Text variant="mono">{`Điểm tổng: ${formatNumber(analyze.data.score)} / 5`}</Text> : null}
                    {analyze.data.verdict ? <Text weight="semibold">{analyze.data.verdict}</Text> : null}
                    {analyze.data.lede ? <Text color="mutedForeground">{analyze.data.lede}</Text> : null}
                    {analyze.data.sections.map((s) => (
                      <View key={s.key} style={{ gap: 2 }}>
                        <Text variant="label" color="mutedForeground">{s.title}</Text>
                        <Text>{s.text}</Text>
                      </View>
                    ))}
                    {analyze.data.actions.length > 0 ? <Text variant="label" color="mutedForeground">Việc cần làm</Text> : null}
                    {analyze.data.actions.map((a, i) => (
                      <View key={i}>
                        <Text weight="semibold">{a.title}</Text>
                        {a.detail ? <Text color="mutedForeground">{a.detail}</Text> : null}
                      </View>
                    ))}
                    {analyze.data.closing ? <Text color="mutedForeground">{analyze.data.closing}</Text> : null}
                  </>
                )}
              </View>
            ) : analyze.isError ? (
              <ErrorState error={analyze.error} title="Không tạo được báo cáo" />
            ) : (
              <Text color="mutedForeground">AI tổng hợp điểm số, phân bổ, rủi ro và việc cần làm từ danh mục Sân tập của bạn.</Text>
            )}
            <Button testID="portfolio-ai-analyze" title={analyze.data ? 'Tạo lại báo cáo' : 'Phân tích danh mục'} variant="outline" loading={analyze.isPending} onPress={() => analyze.mutate()} />
          </Card>
        )}
      </View>
    </Screen>
  );
}
