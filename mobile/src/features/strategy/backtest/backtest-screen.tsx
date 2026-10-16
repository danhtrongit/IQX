import { useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Divider, ErrorState, Input, ListRow, RadioGroup, Screen, SkeletonList, Text } from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { SymbolPicker } from '@/features/market';
import { useTheme } from '@/theme';
import { hasBuyCondition } from '../config/model';
import { useSharedConfig } from '../config/hooks';
import { newKey } from '../shared/errors';
import { StrategyGate } from '../shared/gate';
import { fmtSignedPercent } from '../shared/format';
import { backtestKeys, runBacktest } from './api';
import { defaultForm, EXECUTION_OPTIONS, FEE_OPTIONS, parseCapital, formatCapital, toRequest, validateForm, type FormValues } from './form';
import { useBacktests } from './hooks';

export const TIMEOUT_MESSAGE =
  'Backtest chạy quá lâu nên đã dừng. Thu hẹp khoảng thời gian hoặc bớt điều kiện rồi chạy lại; kết quả cũ không bị thay.';

export function BacktestScreen() {
  const shared = useSharedConfig();
  const list = useBacktests();
  return (
    <>
      <Stack.Screen options={{ title: 'Backtest' }} />
      <StrategyGate error={shared.error ?? list.error} testID="strategy-backtest-gate">
        <BacktestBody />
      </StrategyGate>
    </>
  );
}

function BacktestBody() {
  const router = useRouter();
  const qc = useQueryClient();
  const { spacing } = useTheme();
  const shared = useSharedConfig();
  const list = useBacktests();
  const [form, setForm] = useState<FormValues>(() => defaultForm());
  const [submitted, setSubmitted] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);

  const buyOk = hasBuyCondition(shared.data);
  const errors = useMemo(() => validateForm(form, { hasBuyCondition: buyOk }), [form, buyOk]);
  const invalid = Object.keys(errors).length > 0;
  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => {
    keyRef.current = null;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const run = async () => {
    setSubmitted(true);
    setRunError(null);
    if (invalid || !shared.data || running) return;
    setRunning(true);
    keyRef.current = keyRef.current ?? newKey('bt');
    try {
      const res = await runBacktest(toRequest(form), shared.data.saved_revision, keyRef.current);
      keyRef.current = null;
      qc.setQueryData(backtestKeys.run(res.run_id), res);
      void qc.invalidateQueries({ queryKey: backtestKeys.list });
      router.push({ pathname: '/strategy/backtest/[runId]', params: { runId: res.run_id } } as never);
    } catch (e) {
      setRunError(e instanceof ApiError && e.code === 'TIMEOUT' ? TIMEOUT_MESSAGE : errorMessage(e));
    } finally {
      setRunning(false);
    }
  };

  const show = (k: keyof typeof errors) => (submitted || k === 'indicators' ? errors[k] : undefined);

  return (
    <Screen scroll testID="strategy-backtest-screen">
      <Card padded>
        <View style={{ gap: spacing.md }}>
          <SymbolPicker value={form.symbol} onChange={(s) => set('symbol', s)} label="Mã cổ phiếu" testID="strategy-backtest-symbol" />
          {show('symbol') ? <Text variant="caption" color="statusError">{show('symbol')}</Text> : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Input label="Từ ngày" value={form.start} onChangeText={(t) => set('start', t.trim())} placeholder="YYYY-MM-DD" maxLength={10} keyboardType="numbers-and-punctuation" error={show('start')} testID="strategy-backtest-start" />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Đến ngày" value={form.end} onChangeText={(t) => set('end', t.trim())} placeholder="YYYY-MM-DD" maxLength={10} keyboardType="numbers-and-punctuation" error={show('end')} testID="strategy-backtest-end" />
            </View>
          </View>
          <Input
            label="Vốn ban đầu (đ)"
            value={form.capital}
            onChangeText={(t) => {
              const n = parseCapital(t);
              set('capital', n === null ? t : formatCapital(n));
            }}
            keyboardType="number-pad"
            error={show('capital')}
            testID="strategy-backtest-capital"
          />
          <View style={{ gap: spacing.xs }}>
            <Text variant="label" color="mutedForeground">Thời điểm khớp lệnh</Text>
            <RadioGroup options={EXECUTION_OPTIONS.map((o) => ({ ...o, testID: `strategy-backtest-execution-${o.value}` }))} value={form.execution} onChange={(v) => set('execution', v)} testID="strategy-backtest-execution" />
          </View>
          <View style={{ gap: spacing.xs }}>
            <Text variant="label" color="mutedForeground">Phí giao dịch</Text>
            <RadioGroup options={FEE_OPTIONS.map((o) => ({ ...o, testID: `strategy-backtest-fee-${o.value}` }))} value={form.fee} onChange={(v) => set('fee', v)} testID="strategy-backtest-fee" />
          </View>
          {shared.isPending ? null : errors.indicators ? (
            <View style={{ gap: spacing.xs }} testID="strategy-backtest-no-buy">
              <Text variant="caption" color="statusWarning">{errors.indicators}</Text>
              <Button title="Mở thư viện chỉ báo" variant="outline" onPress={() => router.push('/strategy/library' as never)} testID="strategy-backtest-open-library" />
            </View>
          ) : null}
          {runError ? <Text accessibilityRole="alert" color="statusError" testID="strategy-backtest-error">{runError}</Text> : null}
          <Button
            title={running ? 'Đang chạy backtest…' : 'Chạy backtest'}
            variant="primary"
            loading={running}
            disabled={running || shared.isPending || (submitted && invalid)}
            onPress={() => void run()}
            testID="strategy-backtest-run"
          />
          {running ? <Text variant="caption" color="mutedForeground" testID="strategy-backtest-running">Có thể mất tới 2 phút. Vui lòng giữ màn hình này mở.</Text> : null}
        </View>
      </Card>

      <Text variant="section">Lịch sử chạy</Text>
      {list.isPending ? (
        <SkeletonList rows={3} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} testID="strategy-backtest-history-error" />
      ) : (
        (() => {
          const items = (list.data ?? []).filter((r) => r.status === 'succeeded' && r.kind === 'single');
          if (!items.length) return <Text color="mutedForeground" testID="strategy-backtest-history-empty">Chưa có lần chạy nào.</Text>;
          return (
            <View testID="strategy-backtest-history">
              {items.map((r, i) => {
                const raw = r as unknown as { symbol?: string; start?: string; end?: string; kpis?: { total_return_pct?: number | null } };
                return (
                  <View key={r.run_id}>
                    {i > 0 ? <Divider /> : null}
                    <ListRow
                      title={`${raw.symbol ?? '—'} · ${formatDate(raw.start)} – ${formatDate(raw.end)}`}
                      subtitle={`${fmtSignedPercent(raw.kpis?.total_return_pct)} · ${formatDateTime(r.created_at)}`}
                      chevron
                      testID={`strategy-backtest-history-${r.run_id}`}
                      onPress={() => router.push({ pathname: '/strategy/backtest/[runId]', params: { runId: r.run_id } } as never)}
                    />
                  </View>
                );
              })}
            </View>
          );
        })()
      )}
    </Screen>
  );
}
