import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CircleAlert, Plus } from 'lucide-react-native';
import { FlatList, Pressable, View } from 'react-native';

import { Badge, Button, Card, EmptyState, ErrorState, Icon, PanelState, priceRoleColor, Screen, SkeletonList, Text, useSnackbar } from '@/components/ui';
import { formatNumber, formatPct, formatVnd } from '@/lib/format';
import { useTheme } from '@/theme';
import { watchlistErrorMessage, type HuntItem } from './api';
import { useAddToWatchlist, useHuntFilters, useHuntResult } from './hooks';

/** /trade/hunt: the five "Săn mã" filters. */
export function HuntListScreen() {
  const router = useRouter();
  const { spacing, colors } = useTheme();
  const filters = useHuntFilters();
  return (
    <Screen scroll testID="hunt-screen" onRefresh={() => filters.refetch()} refreshing={filters.isRefetching}>
      <Stack.Screen options={{ title: 'Săn mã' }} />
      {filters.isPending ? (
        <SkeletonList rows={5} testID="hunt-loading" />
      ) : filters.isError ? (
        <ErrorState error={filters.error} onRetry={() => filters.refetch()} testID="hunt-error" />
      ) : filters.data.length === 0 ? (
        <EmptyState title="Chưa có bộ lọc" message="Hiện chưa có bộ lọc Săn mã nào." testID="hunt-empty" />
      ) : (
        filters.data.map((f) => (
          <Pressable
            key={f.ma}
            testID={`hunt-filter-${f.ma}`}
            accessibilityRole="button"
            accessibilityLabel={f.ten}
            accessibilityState={{ disabled: !f.available }}
            disabled={!f.available}
            onPress={() => router.push(`/trade/hunt/${f.ma}`)}
            style={({ pressed }) => ({ opacity: !f.available ? 0.6 : pressed ? 0.7 : 1 })}>
            <Card style={{ gap: spacing.xs, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                {f.icon ? <Text>{f.icon}</Text> : null}
                <Text variant="section" style={{ flex: 1 }}>{f.ten}</Text>
                {!f.available ? <Badge label="Chưa khả dụng" tone="warning" /> : null}
              </View>
              {f.moTa ? <Text color="mutedForeground">{f.moTa}</Text> : null}
              {f.dieuKien ? <Text variant="caption" color="mutedForeground">{f.dieuKien}</Text> : null}
              {!f.available && f.reason ? <Text variant="caption" color="statusWarning" testID={`hunt-filter-${f.ma}-reason`}>{f.reason}</Text> : null}
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

function pctRole(pct: number | null) {
  return pct === null || pct === 0 ? 'ref' : pct > 0 ? 'up' : 'down';
}

function HuntRow({ item, rankBy }: { item: HuntItem; rankBy: string | null }) {
  const router = useRouter();
  const { spacing, colors } = useTheme();
  const snackbar = useSnackbar();
  const add = useAddToWatchlist();
  const onAdd = () =>
    add.mutate(item.symbol, {
      onSuccess: () => snackbar.success(`Đã thêm ${item.symbol} vào danh sách theo dõi.`),
      onError: (error) => snackbar.error(watchlistErrorMessage(error, item.symbol)),
    });
  return (
    <View style={{ paddingVertical: spacing.sm, gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Pressable
        testID={`hunt-row-${item.symbol}`}
        accessibilityRole="button"
        accessibilityLabel={`${item.symbol}, hạng ${item.rank}`}
        onPress={() => router.push(`/trade?symbol=${item.symbol}`)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 }}>
        <Text variant="mono" color="mutedForeground" style={{ width: 24 }}>{item.rank}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text weight="semibold">{item.symbol}</Text>
          {item.signal ? <Text variant="caption" color="mutedForeground" numberOfLines={2}>{item.signal}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text variant="mono" style={{ textAlign: 'right' }}>{item.price === null ? '—' : formatVnd(item.price)}</Text>
          <Text variant="mono" color={priceRoleColor(colors, pctRole(item.changePct))} style={{ textAlign: 'right' }}>{item.changePct === null ? '—' : formatPct(item.changePct)}</Text>
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <Text variant="caption" color="mutedForeground" style={{ flex: 1 }}>
          {rankBy ?? 'Giá trị xếp hạng'}: {item.rankValue === null ? '—' : formatNumber(item.rankValue)}
        </Text>
        <Button testID={`hunt-add-${item.symbol}`} title="Thêm vào theo dõi" icon={Plus} variant="outline" size="sm" fullWidth={false} loading={add.isPending} onPress={onAdd} />
      </View>
    </View>
  );
}

/** /trade/hunt/[filter]: ranked results of one filter. */
export function HuntResultsScreen() {
  const { filter } = useLocalSearchParams<{ filter: string }>();
  const code = String(filter ?? '');
  const filters = useHuntFilters();
  const result = useHuntResult(code);
  const def = filters.data?.find((f) => f.ma === code);
  const { spacing } = useTheme();
  const title = def?.ten ?? 'Săn mã';

  let body;
  if (result.isPending) body = <SkeletonList rows={6} testID="hunt-results-loading" />;
  else if (result.isError) body = <ErrorState error={result.error} onRetry={() => result.refetch()} testID="hunt-results-error" />;
  else if (result.data === null) body = <PanelState icon={CircleAlert} title="Chưa có dữ liệu" message="Bộ lọc này chưa có kết quả." testID="hunt-results-nodata" />;
  else if (!result.data.available)
    body = <PanelState icon={CircleAlert} title="Bộ lọc chưa khả dụng" message={result.data.reason ?? undefined} testID="hunt-results-unavailable" />;
  else {
    const data = result.data;
    body = (
      <FlatList
        testID="hunt-results-list"
        data={data.items}
        keyExtractor={(i) => i.symbol}
        renderItem={({ item }) => <HuntRow item={item} rankBy={data.rankBy} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.xs, paddingBottom: spacing.sm }}>
            {def?.moTa ? <Text color="mutedForeground">{def.moTa}</Text> : null}
            {data.total !== null ? <Text variant="caption" color="mutedForeground">{`${data.total} mã đạt điều kiện${data.examined !== null ? ` / ${data.examined} mã được xét` : ''}`}</Text> : null}
            {data.warnings.map((w) => (
              <View key={w} testID="hunt-warning" style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
                <Icon icon={CircleAlert} size={16} color="statusWarning" />
                <Text variant="caption" color="statusWarning" style={{ flex: 1 }}>{w}</Text>
              </View>
            ))}
          </View>
        }
        ListEmptyComponent={<EmptyState title="Chưa có mã phù hợp" message="Không có mã nào đạt điều kiện lúc này." testID="hunt-results-empty" />}
        refreshing={result.isRefetching}
        onRefresh={() => result.refetch()}
      />
    );
  }
  return (
    <Screen testID="hunt-results-screen">
      <Stack.Screen options={{ title }} />
      {body}
    </Screen>
  );
}
