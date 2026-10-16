import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Button, Card, Divider, EmptyState, ErrorState, KeyValueRow, ListRow, Screen, SkeletonList, Tabs, Text } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/theme';
import { StrategyGate } from '../shared/gate';
import { useBot, useBotPositions, useBotSessions, useBotTrades } from './hooks';
import { configStateLabel, NEW_BUYS_OFF_NOTE, NOT_READY_COPY, runStatusNote, sessionSummary, sourceText } from './labels';
import { formatDong, formatDongSigned, formatPercentSigned, formatRatio, toneOf, toNumber } from './money';
import type { BotPosition, BotTrade } from './types';

type Tab = 'positions' | 'history' | 'journal';

export function BotScreen() {
  const bot = useBot();
  return (
    <>
      <Stack.Screen options={{ title: 'Bot' }} />
      <StrategyGate error={bot.error} testID="strategy-bot-gate">
        <BotBody />
      </StrategyGate>
    </>
  );
}

function Kpi({ id, label, value, tone }: { id: string; label: string; value: string; tone?: 'priceUp' | 'priceDown' | 'foreground' }) {
  return (
    <View testID={`strategy-bot-kpi-${id}`} style={{ flexBasis: '47%', flexGrow: 1 }}>
      <Card padded>
        <Text variant="caption" color="mutedForeground">{label}</Text>
        <Text variant="section" color={tone ?? 'foreground'} style={{ fontVariant: ['tabular-nums'] }}>{value}</Text>
      </Card>
    </View>
  );
}

function BotBody() {
  const { spacing } = useTheme();
  const bot = useBot();
  const [tab, setTab] = useState<Tab>('positions');
  if (bot.isPending) return <Screen><SkeletonList rows={5} /></Screen>;
  if (bot.isError || !bot.data) return <Screen><ErrorState error={bot.error} onRetry={() => void bot.refetch()} testID="strategy-bot-error" /></Screen>;
  const d = bot.data;
  const a = d.account;
  const c = d.conditions;
  const issues = d.bot_run?.issues ?? [];
  const note = runStatusNote(d.bot_run?.status);
  const ready = !!d.bot && !!a;
  return (
    <Screen scroll testID="strategy-bot-screen" onRefresh={() => void bot.refetch()} refreshing={bot.isRefetching}>
      <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
        <Badge label={ready ? 'Bot đã sẵn sàng' : 'Chưa sẵn sàng'} tone={ready ? 'success' : 'neutral'} testID="strategy-bot-status" />
        {note ? <Badge label={note} tone={d.bot_run?.status === 'failed' ? 'danger' : 'info'} /> : null}
        {d.bot && d.bot.new_buys_enabled === false ? <Badge label={NEW_BUYS_OFF_NOTE} tone="warning" /> : null}
      </View>
      {!ready ? <Text color="mutedForeground" testID="strategy-bot-not-ready">{NOT_READY_COPY}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Kpi id="initial" label="Vốn Bot ban đầu" value={formatDong(d.bot?.initial_cash_vnd)} />
        <Kpi id="cash" label="Tiền mặt" value={formatDong(a?.cash_vnd)} />
        <Kpi id="market" label="Giá trị danh mục" value={formatDong(a?.market_value_vnd)} />
        <Kpi id="pnl" label="Tổng lợi nhuận" value={`${formatDongSigned(a?.pnl_total_net_vnd)} (${formatRatio(a?.return_total)})`} tone={toneOf(a?.pnl_total_net_vnd)} />
      </View>
      {a?.valuation_complete === false ? <Text variant="caption" color="statusWarning">Định giá chưa đầy đủ ở phiên gần nhất.</Text> : null}
      {issues.length ? (
        <Card padded>
          <View style={{ gap: 4 }} testID="strategy-bot-issues">
            <Text weight="semibold">Lần xử lý gần nhất cần kiểm tra</Text>
            {issues.map((i, k) => <Text key={k} variant="caption" color="statusWarning">• {i.symbol ? `${i.symbol}: ` : ''}{i.detail ?? i.code}</Text>)}
          </View>
        </Card>
      ) : null}
      <Card padded>
        <View style={{ gap: spacing.xs }} testID="strategy-bot-conditions">
          <Text variant="section">Điều kiện của Bot</Text>
          <Text color="mutedForeground">{configStateLabel(c)}</Text>
          <KeyValueRow label="ĐIỀU KIỆN MUA" value={`${c?.buy_condition_count ?? 0} chỉ báo`} />
          <KeyValueRow label="ĐIỀU KIỆN BÁN" value={`${c?.sell_condition_count ?? 0} chỉ báo`} />
          <KeyValueRow label="Bản đang hiệu lực" value={c?.effective_revision != null ? `${c.effective_revision}` : '—'} />
          {c?.pending ? <Text variant="caption" color="mutedForeground">Chờ hiệu lực từ phiên {formatDate(c.pending.effective_session)}{c.pending.revision != null ? ` (bản ${c.pending.revision})` : ''}</Text> : null}
        </View>
      </Card>
      {ready ? (
        <>
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            testID="strategy-bot-tabs"
            items={[
              { value: 'positions', label: 'Đang giữ', testID: 'strategy-bot-tab-positions' },
              { value: 'history', label: 'Lịch sử', testID: 'strategy-bot-tab-history' },
              { value: 'journal', label: 'Nhật ký', testID: 'strategy-bot-tab-journal' },
            ]}
          />
          {tab === 'positions' ? <PositionsList /> : tab === 'history' ? <TradesList /> : <JournalList />}
        </>
      ) : null}
    </Screen>
  );
}

function PositionsList() {
  const q = useBotPositions();
  if (q.isPending) return <SkeletonList rows={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data.length) return <EmptyState title="Chưa có vị thế" message="Bot chưa nắm giữ cổ phiếu nào." testID="strategy-bot-positions-empty" />;
  return (
    <View testID="strategy-bot-positions">
      {q.data.map((p: BotPosition, i) => (
        <View key={p.id}>
          {i > 0 ? <Divider /> : null}
          <View style={{ paddingVertical: 8, gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text weight="semibold">{p.symbol} · {p.qty ?? '—'} CP</Text>
              <Text variant="mono" color={toneOf(p.unrealized_pnl_net_vnd)} align="right">{formatDongSigned(p.unrealized_pnl_net_vnd)}</Text>
            </View>
            <Text variant="caption" color="mutedForeground">
              Giá vốn {formatDong(p.entry_price_vnd)} · Giá hiện tại {formatDong(p.current_close_vnd)} · Giá trị {formatDong(p.market_value_vnd)}
            </Text>
            <Text variant="caption" color="mutedForeground">
              Tỷ trọng {toNumber(p.weight_pct) === null ? '—' : `${toNumber(p.weight_pct)?.toFixed(1)}%`} · giữ {p.holding_sessions ?? '—'} phiên
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function TradesList() {
  const q = useBotTrades();
  if (q.isPending) return <SkeletonList rows={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const items = q.data.pages.flatMap((p) => p.items);
  if (!items.length) return <EmptyState title="Chưa có giao dịch đã đóng" message="Các giao dịch đã đóng của Bot sẽ hiện ở đây." testID="strategy-bot-trades-empty" />;
  return (
    <View testID="strategy-bot-trades">
      {items.map((t: BotTrade, i) => (
        <View key={t.id}>
          {i > 0 ? <Divider /> : null}
          <View style={{ paddingVertical: 8, gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text weight="semibold">{t.symbol} · {t.buy?.qty ?? t.sell?.qty ?? '—'} CP</Text>
              <Text variant="mono" color={toneOf(t.realized_pnl_vnd)} align="right">{formatDongSigned(t.realized_pnl_vnd)} ({formatPercentSigned(t.realized_pnl_pct)})</Text>
            </View>
            <Text variant="caption" color="mutedForeground">
              Mua {formatDate(t.buy?.session)} @ {formatDong(t.buy?.price_vnd)} → Bán {formatDate(t.sell?.session)} @ {formatDong(t.sell?.price_vnd)}
            </Text>
          </View>
        </View>
      ))}
      {q.hasNextPage ? <Button title="Xem thêm" variant="outline" loading={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()} testID="strategy-bot-trades-more" /> : null}
    </View>
  );
}

function JournalList() {
  const router = useRouter();
  const q = useBotSessions();
  if (q.isPending) return <SkeletonList rows={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const items = q.data.pages.flatMap((p) => p.items);
  if (!items.length) return <EmptyState title="Chưa có nhật ký phiên" message="Nhật ký quyết định của Bot theo từng phiên sẽ hiện ở đây." testID="strategy-bot-journal-empty" />;
  return (
    <View testID="strategy-bot-journal">
      {items.map((s) => (
        <ListRow
          key={s.session}
          title={formatDate(s.session)}
          subtitle={`${sessionSummary(s)} · ${sourceText(s.universe?.kind, s.universe?.name, s.universe?.revision)}`}
          chevron
          testID={`strategy-bot-session-${s.session}`}
          onPress={() => router.push({ pathname: '/strategy/bot/session/[session]', params: { session: s.session } } as never)}
        />
      ))}
      {q.hasNextPage ? <Button title="Xem thêm" variant="outline" loading={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()} testID="strategy-bot-journal-more" /> : null}
    </View>
  );
}
