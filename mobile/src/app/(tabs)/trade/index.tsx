import { BarChart3, Newspaper, ScanSearch, Star, X } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Divider, ErrorState, IconButton, ListRow, PanelState, priceRoleColor, Screen, SkeletonList, Text, useSnackbar } from '@/components/ui';
import { normalizeSymbol, SymbolPicker, useDailyCloses, useQuote } from '@/features/market';
import { QuoteCard, Sparkline, useAddToWatchlist, useRemoveFromWatchlist, useWatchlist } from '@/features/trading';
import { errorMessage } from '@/lib/api';
import { priceColorRole, todayVN } from '@/lib/format';
import { useTheme } from '@/theme';

function startDate(end: string, days: number): string {
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function TradeScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const snackbar = useSnackbar();
  const params = useLocalSearchParams<{ symbol?: string }>();
  const paramSymbol = typeof params.symbol === 'string' ? normalizeSymbol(params.symbol) : '';
  const [symbol, setSymbol] = useState(paramSymbol || 'FPT');
  const [seenParam, setSeenParam] = useState(paramSymbol);
  if (paramSymbol !== seenParam) {
    setSeenParam(paramSymbol);
    if (paramSymbol) setSymbol(paramSymbol);
  }

  const quoteQuery = useQuote(symbol);
  const end = useMemo(() => todayVN(), []);
  const closes = useDailyCloses(symbol, startDate(end, 92), end);
  const watchlist = useWatchlist();
  const add = useAddToWatchlist();
  const remove = useRemoveFromWatchlist();

  const quote = quoteQuery.data ?? null;
  const inWatchlist = (watchlist.data ?? []).some((item) => item.symbol === symbol);
  const refreshing = quoteQuery.isRefetching || watchlist.isRefetching;
  const sparkValues = (closes.data ?? []).map((b) => b.close);
  const sparkRole = priceColorRole(quote?.price, quote?.reference, quote?.ceiling, quote?.floor);

  const open = (side: 'buy' | 'sell') => router.push({ pathname: '/trade/order', params: { symbol, side } });

  return (
    <Screen
      scroll
      testID="trade-screen"
      refreshing={refreshing}
      onRefresh={() => {
        void quoteQuery.refetch();
        void watchlist.refetch();
        void closes.refetch();
      }}>
      <SymbolPicker testID="trade-symbol-picker" value={symbol} onChange={setSymbol} />

      {quoteQuery.isPending ? (
        <SkeletonList rows={4} />
      ) : quoteQuery.isError ? (
        <ErrorState error={quoteQuery.error} onRetry={() => quoteQuery.refetch()} testID="trade-quote-error" />
      ) : quote ? (
        <>
          <QuoteCard symbol={symbol} quote={quote} />
          {sparkValues.length > 1 ? <Sparkline testID="trade-sparkline" values={sparkValues} color={priceRoleColor(colors, sparkRole)} /> : null}
        </>
      ) : (
        <PanelState testID="trade-quote-empty" title="Không có dữ liệu mã CK" message={`Không tìm thấy giá cho ${symbol}.`} />
      )}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button testID="trade-buy" title="Mua" variant="primary" onPress={() => open('buy')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button testID="trade-sell" title="Bán" variant="destructive" onPress={() => open('sell')} />
        </View>
      </View>

      <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
        <ListRow testID="trade-link-hunt" title="Săn mã" subtitle="Bộ lọc tìm cổ phiếu" left={<ScanSearch size={20} color={colors.primary} />} chevron onPress={() => router.push('/trade/hunt' as never)} />
        <Divider />
        <ListRow testID="trade-link-news" title="Tin tức AI" subtitle="Tin thị trường có chấm điểm" left={<Newspaper size={20} color={colors.primary} />} chevron onPress={() => router.push('/trade/news' as never)} />
        <Divider />
        <ListRow testID="trade-link-patterns" title="Mẫu hình nến" subtitle="Nhận diện mẫu hình kỹ thuật" left={<BarChart3 size={20} color={colors.primary} />} chevron onPress={() => router.push('/trade/patterns' as never)} />
      </Card>

      <View style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="section">Danh sách theo dõi</Text>
          <Button
            testID="trade-watchlist-add"
            title={inWatchlist ? 'Đã theo dõi' : `Theo dõi ${symbol}`}
            icon={Star}
            size="sm"
            variant="outline"
            fullWidth={false}
            disabled={inWatchlist || add.isPending}
            onPress={() => add.mutate(symbol, { onSuccess: () => snackbar.success(`Đã thêm ${symbol} vào danh sách theo dõi`), onError: (e) => snackbar.error(errorMessage(e)) })}
          />
        </View>
        {watchlist.isPending ? (
          <SkeletonList rows={3} />
        ) : watchlist.isError ? (
          <ErrorState error={watchlist.error} onRetry={() => watchlist.refetch()} />
        ) : (watchlist.data ?? []).length === 0 ? (
          <Text color="mutedForeground" testID="trade-watchlist-empty">Chưa có mã nào trong danh sách theo dõi.</Text>
        ) : (
          (watchlist.data ?? []).map((item) => (
            <ListRow
              key={item.id}
              testID={`trade-watchlist-row-${item.symbol}`}
              title={item.symbol}
              subtitle={[item.name, item.exchange].filter(Boolean).join(' · ') || undefined}
              onPress={() => setSymbol(item.symbol)}
              right={
                <IconButton
                  testID={`trade-watchlist-remove-${item.symbol}`}
                  icon={X}
                  accessibilityLabel={`Bỏ theo dõi ${item.symbol}`}
                  disabled={remove.isPending}
                  onPress={() => remove.mutate(item.symbol, { onError: (e) => snackbar.error(errorMessage(e)) })}
                />
              }
            />
          ))
        )}
      </View>
    </Screen>
  );
}
