import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { FlatList, RefreshControl, View } from 'react-native';

import { Badge, Divider, EmptyState, ErrorState, SkeletonList, SwitchRow, Text, useSnackbar } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';
import { FeatureDisabledState } from './gate';
import { isFeatureDisabled } from './form-logic';
import { useAlerts, useUpdateAlert } from './hooks';
import { lastCheckText, pinnedRevision, scopeTitle, SIDE_LABEL, sourceCaption, STATUS_HINT, STATUS_LABEL, STATUS_TONE, symbolSummary } from './labels';
import type { StrategyAlert } from './types';

function AlertRow({ alert }: { alert: StrategyAlert }) {
  const router = useRouter();
  const { spacing, colors } = useTheme();
  const update = useUpdateAlert();
  const snackbar = useSnackbar();
  const v = alert.version;

  function toggle(enabled: boolean) {
    update.mutate(
      { id: alert.id, body: { enabled } },
      {
        onSuccess: () =>
          snackbar.success(enabled ? 'Đã bật theo dõi. Cảnh báo kiểm tra từ phiên hiện tại, không gửi lại tín hiệu thời gian tạm dừng.' : 'Đã tạm dừng cảnh báo. Cấu hình chỉ báo và Bot được giữ nguyên.'),
        onError: (e) => snackbar.error(errorMessage(e)),
      },
    );
  }

  return (
    <View testID={`strategy-alerts-item-${alert.id}`} style={{ gap: spacing.xs, paddingVertical: spacing.sm }}>
      <Text
        weight="semibold"
        accessibilityRole="button"
        testID={`strategy-alerts-item-open-${alert.id}`}
        onPress={() => router.push({ pathname: '/strategy/alerts/[id]', params: { id: alert.id } } as never)}>
        {alert.name}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' }}>
        <Badge testID={`strategy-alerts-status-${alert.id}`} label={STATUS_LABEL[alert.status] ?? alert.status} tone={STATUS_TONE[alert.status] ?? 'neutral'} />
        {v.sides.map((s) => (
          <Text key={s} variant="caption" weight="semibold" color={s === 'buy' ? colors.priceUp : colors.priceDown}>
            {SIDE_LABEL[s]}
          </Text>
        ))}
      </View>
      <Text variant="caption" color="mutedForeground">{sourceCaption(v)}</Text>
      <Text variant="caption" color="mutedForeground">
        {scopeTitle(v)} · {symbolSummary(v.symbols)}
      </Text>
      <Text variant="caption" color="mutedForeground">{STATUS_HINT[alert.status]}</Text>
      <Text variant="caption" color="mutedForeground">
        {lastCheckText(alert)} · Cấu hình bản {pinnedRevision(v)} · CB v{alert.current_version}
      </Text>
      <SwitchRow
        testID={`strategy-alerts-toggle-${alert.id}`}
        label="Theo dõi"
        value={alert.enabled}
        disabled={update.isPending}
        onValueChange={toggle}
      />
    </View>
  );
}

export function AlertList({ onCreate }: { onCreate: () => void }) {
  const alerts = useAlerts();
  const { layout } = useTheme();
  if (isFeatureDisabled(alerts.error)) return <FeatureDisabledState />;
  if (alerts.isError) return <ErrorState testID="strategy-alerts-error" error={alerts.error} title="Không tải được cảnh báo" onRetry={() => void alerts.refetch()} />;
  if (alerts.isPending) return <SkeletonList testID="strategy-alerts-loading" />;
  const items = alerts.data ?? [];
  return (
    <FlatList
      testID="strategy-alerts-list"
      data={items}
      keyExtractor={(a) => a.id}
      renderItem={({ item }) => <AlertRow alert={item} />}
      ItemSeparatorComponent={Divider}
      contentContainerStyle={{ paddingBottom: layout.pagePadding * 4, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={alerts.isRefetching} onRefresh={() => void alerts.refetch()} />}
      ListEmptyComponent={
        <EmptyState testID="strategy-alerts-empty" icon={Bell} title="Chưa có cảnh báo" message="Tạo cảnh báo trên mã đã chọn." actionLabel="Tạo cảnh báo" onAction={onCreate} />
      }
    />
  );
}
