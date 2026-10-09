import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Button, ErrorState, Screen, SkeletonList, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { StrategyGate } from '../shared/gate';
import { useBacktest, useBacktestTrades } from './hooks';
import { KpiGrid, NoTrades, OpenPositionStrip, PendingOrders, RunSummary, TradeRow, BacktestChart } from './run-view';

export function ResultScreen() {
  const { runId } = useLocalSearchParams<{ runId: string }>();
  const q = useBacktest(runId ?? '');
  return (
    <>
      <Stack.Screen options={{ title: 'Kết quả backtest' }} />
      <StrategyGate error={q.error} testID="strategy-backtest-result-gate">
        <ResultBody runId={runId ?? ''} />
      </StrategyGate>
    </>
  );
}

function ResultBody({ runId }: { runId: string }) {
  const { spacing } = useTheme();
  const run = useBacktest(runId);
  const trades = useBacktestTrades(runId);
  if (run.isPending) return <Screen><SkeletonList rows={5} /></Screen>;
  if (run.isError || !run.data) return <Screen><ErrorState error={run.error} onRetry={() => void run.refetch()} testID="strategy-backtest-result-error" /></Screen>;
  const result = run.data.result;
  if (!result) {
    return (
      <Screen>
        <ErrorState error={new Error(run.data.error?.message ?? 'Lần chạy này chưa có kết quả.')} title="Không có kết quả" />
      </Screen>
    );
  }
  const symbol = run.data.snapshot?.symbol ?? run.data.request?.symbol ?? '';
  const pages = trades.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const open = pages[0]?.open_position ?? result.open_position;
  const pending = pages[0]?.pending_orders ?? result.pending_orders ?? [];
  return (
    <Screen scroll testID="strategy-backtest-result-screen" onRefresh={() => void run.refetch()} refreshing={run.isRefetching}>
      <Text variant="heading">{symbol}</Text>
      <KpiGrid result={result} />
      <BacktestChart result={result} symbol={symbol} />
      <RunSummary snapshot={run.data.snapshot} runId={runId} />
      {open ? <OpenPositionStrip position={open} symbol={symbol} /> : null}
      <PendingOrders orders={pending} />
      <Text variant="section">Giao dịch đã đóng{pages[0] ? ` (${pages[0].total})` : ''}</Text>
      {trades.isPending ? (
        <SkeletonList rows={3} />
      ) : trades.isError ? (
        <ErrorState error={trades.error} onRetry={() => void trades.refetch()} testID="strategy-backtest-trades-error" />
      ) : items.length === 0 ? (
        <NoTrades />
      ) : (
        <View testID="strategy-backtest-trades" style={{ gap: spacing.xs }}>
          {items.map((t, i) => <TradeRow key={t.number} trade={t} index={i} />)}
          {trades.hasNextPage ? (
            <Button title="Xem thêm" variant="outline" loading={trades.isFetchingNextPage} onPress={() => void trades.fetchNextPage()} testID="strategy-backtest-trades-more" />
          ) : null}
        </View>
      )}
    </Screen>
  );
}
