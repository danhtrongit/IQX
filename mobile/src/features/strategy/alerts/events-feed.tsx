import { Pressable, FlatList, RefreshControl, View } from 'react-native';
import { useState } from 'react';

import { Divider, EmptyState, ErrorState, LoadingState, SkeletonList, Tabs, Text } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/theme';
import { EventDetailSheet } from './event-sheet';
import { FeatureDisabledState } from './gate';
import { isFeatureDisabled } from './form-logic';
import { useAlertEvents } from './hooks';
import { SIDE_LABEL } from './labels';
import type { AlertEvent, AlertSide } from './types';

type SideFilter = AlertSide | 'all';

export function EventsFeed() {
  const [side, setSide] = useState<SideFilter>('all');
  const [selected, setSelected] = useState<AlertEvent | null>(null);
  const q = useAlertEvents(side);
  const { spacing, colors, layout } = useTheme();
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;

  if (isFeatureDisabled(q.error)) return <FeatureDisabledState />;

  return (
    <View style={{ flex: 1, gap: spacing.sm }}>
      <Tabs<SideFilter>
        testID="strategy-alerts-side-filter"
        value={side}
        onChange={setSide}
        items={[
          { value: 'all', label: 'Tất cả' },
          { value: 'buy', label: 'Mua' },
          { value: 'sell', label: 'Bán' },
        ]}
      />
      {q.isError && items.length === 0 ? (
        <ErrorState testID="strategy-alerts-events-error" error={q.error} title="Không tải được tín hiệu" onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <SkeletonList testID="strategy-alerts-events-loading" />
      ) : (
        <FlatList
          testID="strategy-alerts-events-list"
          data={items}
          keyExtractor={(e) => e.id}
          ItemSeparatorComponent={Divider}
          contentContainerStyle={{ paddingBottom: layout.pagePadding * 4, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
          }}
          ListHeaderComponent={<Text variant="caption" color="mutedForeground">{total} tín hiệu</Text>}
          ListEmptyComponent={<EmptyState testID="strategy-alerts-events-empty" title="Chưa có tín hiệu theo bộ lọc đang chọn." />}
          ListFooterComponent={q.isFetchingNextPage ? <LoadingState /> : null}
          renderItem={({ item }) => (
            <Pressable
              testID={`strategy-alerts-event-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${item.symbol} ${item.side_label} ${formatDate(item.signal_session)}`}
              onPress={() => setSelected(item)}
              style={{ paddingVertical: spacing.sm, gap: 2, minHeight: layout.rowMinTwoLine }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'baseline' }}>
                  <Text weight="bold" color="primary">{item.symbol}</Text>
                  <Text weight="semibold" color={item.side === 'buy' ? colors.priceUp : colors.priceDown}>
                    {item.side_label || SIDE_LABEL[item.side]}
                  </Text>
                </View>
                <Text variant="caption" color="mutedForeground">{formatDate(item.signal_session)}</Text>
              </View>
              <Text variant="caption" color="mutedForeground">{item.alert_name}</Text>
              <Text variant="caption">{item.message}</Text>
            </Pressable>
          )}
        />
      )}
      {selected ? <EventDetailSheet event={selected} onClose={() => setSelected(null)} /> : null}
    </View>
  );
}
