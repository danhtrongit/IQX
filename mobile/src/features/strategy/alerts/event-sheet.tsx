import { ScrollView, View } from 'react-native';

import { Badge, KeyValueRow, Sheet, Text } from '@/components/ui';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { useTheme } from '@/theme';
import type { AlertEvent, RuleEvidence } from './types';

export function resultText(result: boolean | null | undefined): string {
  return result === true ? 'Đạt' : result === false ? 'Không đạt' : 'Chưa đánh giá được';
}

export function previousText(event: AlertEvent): string {
  if (event.previous_valid_result == null) return 'Chưa có lần kiểm tra hợp lệ trước đó';
  const session = event.previous_valid_session ? ` (phiên ${formatDate(event.previous_valid_session)})` : '';
  return `${event.previous_valid_result ? 'Đã thỏa' : 'Chưa thỏa'}${session}`;
}

function rhsText(rule: RuleEvidence): string {
  if (rule.missing) return 'Thiếu dữ liệu';
  if (rule.op === '∈' || rule.op === '∉') return `${formatNumber(rule.rhs_lower, 4)} … ${formatNumber(rule.rhs_upper, 4)}`;
  return formatNumber(rule.rhs, 4);
}

export function EventDetailSheet({ event, onClose }: { event: AlertEvent; onClose: () => void }) {
  const { spacing } = useTheme();
  const ev = event.evidence;
  return (
    <Sheet visible onClose={onClose} title={`${event.symbol} · Thỏa điều kiện ${event.side_label}`} testID="strategy-alerts-event-sheet">
      <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
        <Badge label={event.side_label} tone={event.side === 'buy' ? 'success' : 'danger'} />
        <Text variant="caption" color="mutedForeground">
          {event.alert_name} · phiên {formatDate(event.signal_session)}. Dữ liệu được ghi tại phiên này, không tính lại bằng giá hoặc cấu hình hôm nay.
        </Text>
        <Text variant="caption" color="mutedForeground">Đây là tín hiệu thỏa điều kiện, không phải lệnh và không phải giao dịch của Bot.</Text>
        <View>
          <KeyValueRow label="Loại" value={event.event_kind_label ?? '—'} />
          <KeyValueRow label="Phiên tín hiệu" value={formatDate(event.signal_session)} />
          <KeyValueRow label="Ghi nhận lúc" value={formatDateTime(event.evaluated_at)} />
          <KeyValueRow label="Hợp lệ trước đó" value={previousText(event)} />
          <KeyValueRow label="Cảnh báo" value={`${event.alert_name} · v${event.alert_version}`} />
          {ev.bar ? (
            <KeyValueRow
              label={`Nến ${formatDate(ev.bar.date)}`}
              value={`M ${formatNumber(ev.bar.open)} · C ${formatNumber(ev.bar.high)} · T ${formatNumber(ev.bar.low)} · Đ ${formatNumber(ev.bar.close)}`}
            />
          ) : null}
        </View>
        {ev.indicator_ids.length > 0 ? (
          <View style={{ gap: 2 }} testID="strategy-alerts-event-params">
            <Text variant="label" color="mutedForeground">Tham số đã dùng</Text>
            {ev.indicator_ids.map((id) => {
              const params = Object.entries(ev.indicator_params?.[id] ?? {});
              return (
                <Text key={id}>
                  <Text weight="semibold">{id.toUpperCase()}</Text>
                  {params.length ? `: ${params.map(([k, v]) => `${k} ${formatNumber(v)}`).join(' · ')}` : ''}
                </Text>
              );
            })}
          </View>
        ) : null}
        {ev.rules.length > 0 ? (
          <View style={{ gap: spacing.sm }} testID="strategy-alerts-event-rules">
            <Text variant="label" color="mutedForeground">Điều kiện tại phiên tín hiệu</Text>
            {ev.rules.map((rule) => (
              <View key={`${rule.indicator}-${rule.side}-${rule.id}`} style={{ gap: 2 }}>
                <Text weight="semibold">{rule.indicator.toUpperCase()} · {rule.id}</Text>
                <Text variant="caption" capFontScale>
                  {rule.missing ? 'Thiếu dữ liệu' : formatNumber(rule.lhs, 4)} {rule.op} {rhsText(rule)} · {resultText(rule.result)}
                </Text>
                {rule.previous_lhs != null || rule.previous_rhs != null ? (
                  <Text variant="caption" color="mutedForeground" capFontScale>
                    Phiên trước: {formatNumber(rule.previous_lhs, 4)} / {formatNumber(rule.previous_rhs, 4)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}
