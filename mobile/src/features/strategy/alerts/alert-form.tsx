import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Input, LoadingState, RadioGroup, Screen, SwitchRow, Text, confirmDialog, useSnackbar } from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/theme';
import { alertKeys } from './api';
import { buildUpdateBody, mapApiErrors, newKey, resolveSides, type FieldErrors } from './form-logic';
import { useConfigRevisions, useCreateAlert, useDeleteAlert, useRunsForAlerts, useSourcePreview, useUpdateAlert } from './hooks';
import { pinnedRevision, scopeTitle, sourceCaption, symbolSummary } from './labels';
import { OptionPicker } from './option-picker';
import { SideSelector } from './side-selector';
import { NAME_MAX, validateSymbols } from './symbols';
import type { AlertDetail, AlertSide, AlertSourceInput } from './types';

type SourceMode = 'keep' | 'shared' | 'run';

export function AlertForm({ alert }: { alert?: AlertDetail }) {
  const router = useRouter();
  const { spacing } = useTheme();
  const snackbar = useSnackbar();
  const qc = useQueryClient();
  const editing = !!alert;
  const create = useCreateAlert();
  const update = useUpdateAlert();
  const remove = useDeleteAlert();
  const revisions = useConfigRevisions();
  const runs = useRunsForAlerts();

  const [name, setName] = useState<string | null>(alert?.name ?? null);
  const [sourceMode, setSourceMode] = useState<SourceMode>(editing ? 'keep' : 'shared');
  const [revision, setRevision] = useState<number | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [symbolText, setSymbolText] = useState<string | null>(null);
  const [sideChoice, setSideChoice] = useState<Partial<Record<AlertSide, boolean>>>({});
  const [enabled, setEnabled] = useState(alert?.enabled ?? true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);

  const revisionRows = useMemo(() => [...(revisions.data ?? [])].sort((a, b) => b.revision - a.revision), [revisions.data]);
  const runRows = useMemo(() => (runs.data ?? []).filter((r) => r.status === 'succeeded' && r.kind === 'single'), [runs.data]);

  const selectedRevision = revision ?? revisionRows[0]?.revision ?? null;
  const selectedRunId = runId ?? (sourceMode === 'run' ? (runRows[0]?.run_id ?? null) : null);
  const selectedRun = runRows.find((r) => r.run_id === selectedRunId) ?? null;

  const source: AlertSourceInput | null =
    sourceMode === 'shared' && selectedRevision !== null
      ? { kind: 'shared_config', revision: selectedRevision }
      : sourceMode === 'run' && selectedRunId
        ? { kind: 'backtest_run', run_id: selectedRunId }
        : null;
  const preview = useSourcePreview(source);
  const sidesDetail = sourceMode === 'keep' && alert ? alert.version.sides_detail : preview.data?.sides_detail;

  const savedList = alert?.version.scope.kind === 'saved_list' ? alert.version.scope : null;
  const defaultName = selectedRun ? `${selectedRun.symbol} · Theo dõi tín hiệu` : '';
  const nameValue = name ?? defaultName;
  const suggested = preview.data?.suggested_symbol ?? selectedRun?.symbol ?? null;
  const symbolValue = symbolText ?? (editing ? alert!.version.symbols.join(', ') : (suggested ?? ''));

  const chosenSides = resolveSides(sidesDetail, sideChoice, editing ? alert!.version.sides : undefined);
  const busy = create.isPending || update.isPending || remove.isPending;
  const previewLoading = sourceMode !== 'keep' && !!source && preview.isPending;
  const noPinnable = sourceMode === 'shared' && !revisions.isPending && revisionRows.length === 0;

  const clear = () => setErrors({});

  async function submit() {
    const next: FieldErrors = {};
    const trimmed = nameValue.trim();
    if (!trimmed) next.name = 'Nhập tên cảnh báo.';
    else if (trimmed.length > NAME_MAX) next.name = `Tên cảnh báo tối đa ${NAME_MAX} ký tự.`;
    if (sourceMode !== 'keep' && !source) next.source = 'Chọn nguồn cấu hình cho cảnh báo.';
    let symbols: string[] | null = null;
    if (!savedList) {
      const check = validateSymbols(symbolValue);
      if (!check.ok) next.symbols = check.message;
      else symbols = check.symbols;
    }
    if (chosenSides.length === 0) next.sides = 'Chọn ít nhất một phía có điều kiện hợp lệ.';
    if (Object.keys(next).length > 0) return setErrors(next);
    setErrors({});

    try {
      if (!alert) {
        const body = {
          name: trimmed,
          source: source as AlertSourceInput,
          scope: { kind: 'symbols', symbols: symbols as string[] },
          sides: chosenSides,
          enabled,
        };
        const fingerprint = JSON.stringify(body);
        if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newKey() };
        await create.mutateAsync({ ...body, idempotency_key: attempt.current.key });
        snackbar.success(`Đã tạo cảnh báo “${trimmed}”. Cấu hình Bot và danh mục mua mới không đổi.`);
        router.back();
        return;
      }
      const body = buildUpdateBody(alert, {
        name: trimmed,
        enabled,
        source: sourceMode !== 'keep' ? source : null,
        scope: symbols ? { kind: 'symbols', symbols } : null,
        sides: chosenSides,
      });
      if (Object.keys(body).length === 0) return router.back();
      await update.mutateAsync({ id: alert.id, body });
      snackbar.success(`Đã lưu cảnh báo “${trimmed}”.`);
      router.back();
    } catch (e) {
      const mapped = mapApiErrors(e, errorMessage(e));
      if (e instanceof ApiError && e.status === 409) {
        void qc.invalidateQueries({ queryKey: alertKeys.all });
        snackbar.error(mapped.form ?? 'Cảnh báo đã thay đổi. Đã tải lại.');
      }
      setErrors(mapped);
    }
  }

  async function onDelete() {
    if (!alert) return;
    const ok = await confirmDialog({
      title: 'Xóa cảnh báo?',
      message: `Cảnh báo “${alert.name}” sẽ dừng phát sinh tín hiệu mới. Lịch sử tín hiệu và các phiên bản đã ghim được giữ lại. Cấu hình chỉ báo và Bot không bị ảnh hưởng.`,
      confirmLabel: 'Xóa cảnh báo',
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(alert.id);
      snackbar.success('Đã xóa cảnh báo. Lịch sử tín hiệu được giữ nguyên.');
      router.back();
    } catch (e) {
      setErrors({ form: errorMessage(e) });
    }
  }

  const sourceNote =
    sourceMode === 'keep'
      ? 'Giữ đúng bộ điều kiện đang theo dõi. Đổi tên hoặc bật/tạm dừng không chuyển sang bản mới nhất.'
      : sourceMode === 'run'
        ? 'Ghim đúng cấu hình của kết quả đã chọn, không lấy form Backtest đang chỉnh.'
        : 'Ghim đúng bản đã lưu được chọn. Sửa cấu hình chung sau đó không đổi cảnh báo này.';

  return (
    <Screen scroll edges={['left', 'right', 'bottom']} testID="strategy-alerts-form">
      <Stack.Screen options={{ title: editing ? 'Chỉnh cảnh báo' : 'Tạo cảnh báo' }} />
      <Input
        testID="strategy-alerts-name"
        label="Tên cảnh báo"
        value={nameValue}
        maxLength={NAME_MAX}
        placeholder="Ví dụ: Theo dõi xu hướng"
        autoCapitalize="sentences"
        error={errors.name}
        onChangeText={(t) => {
          clear();
          setName(t);
        }}
      />

      <View style={{ gap: spacing.xs }}>
        <Text variant="label" color="mutedForeground">Nguồn cấu hình</Text>
        <RadioGroup<SourceMode>
          testID="strategy-alerts-source"
          value={sourceMode}
          onChange={(v) => {
            clear();
            setSourceMode(v);
          }}
          options={[
            ...(editing ? [{ value: 'keep' as const, label: 'Giữ cấu hình đang theo dõi', testID: 'strategy-alerts-source-keep' }] : []),
            { value: 'shared', label: 'Cấu hình chung', testID: 'strategy-alerts-source-shared' },
            { value: 'run', label: 'Kết quả backtest', testID: 'strategy-alerts-source-run' },
          ]}
        />
      </View>

      {sourceMode === 'shared' ? (
        <View style={{ gap: spacing.xs }}>
          <OptionPicker
            testID="strategy-alerts-revision"
            label="Bản cấu hình chung"
            value={selectedRevision === null ? null : String(selectedRevision)}
            disabled={revisionRows.length === 0}
            placeholder={revisions.isPending ? 'Đang tải…' : 'Chưa có bản cấu hình đã lưu'}
            options={revisionRows.map((r) => ({ value: String(r.revision), label: `Bản ${r.revision} · lưu ${formatDate(r.saved_at)}` }))}
            onChange={(v) => {
              clear();
              setRevision(Number(v));
            }}
          />
          {noPinnable ? <Text variant="caption" color="mutedForeground">Lưu cấu hình Mua/Bán ở Backtest trước khi tạo cảnh báo.</Text> : null}
        </View>
      ) : null}

      {sourceMode === 'run' ? (
        <OptionPicker
          testID="strategy-alerts-run"
          label="Kết quả kiểm thử"
          value={selectedRunId}
          disabled={runRows.length === 0}
          placeholder={runs.isPending ? 'Đang tải…' : 'Chưa có kết quả kiểm thử nào'}
          options={runRows.map((r) => ({
            value: r.run_id,
            label: `${r.symbol} · ${formatDate(r.start)} đến ${formatDate(r.end)} · bản ${r.shared_revision} · chạy ${formatDate(r.created_at)}`,
          }))}
          onChange={(v) => {
            clear();
            setRunId(v);
          }}
        />
      ) : null}
      {errors.source ? <Text variant="caption" color="statusError" accessibilityRole="alert">{errors.source}</Text> : null}

      <Card>
        <View testID="strategy-alerts-preview" style={{ gap: 2 }}>
          {previewLoading ? (
            <LoadingState label="Đang đọc điều kiện của nguồn đã chọn…" />
          ) : preview.isError && sourceMode !== 'keep' ? (
            <Text variant="caption" color="statusError">{errorMessage(preview.error)}</Text>
          ) : sidesDetail ? (
            <Text variant="caption" color="mutedForeground">
              {sourceMode === 'keep' && alert ? `Cấu hình đang ghim: cảnh báo v${alert.current_version}` : 'Điều kiện của nguồn đã chọn'}
            </Text>
          ) : (
            <Text variant="caption" color="mutedForeground">Chọn nguồn để xem các phía có điều kiện hợp lệ.</Text>
          )}
        </View>
      </Card>

      {savedList ? (
        <View style={{ gap: spacing.xs }} testID="strategy-alerts-saved-list">
          <Text variant="label" color="mutedForeground">Phạm vi theo dõi</Text>
          <Text>{scopeTitle(alert!.version)}</Text>
          <Text variant="caption" color="mutedForeground">{symbolSummary(alert!.version.symbols, 40)}</Text>
          <Text variant="caption" color="mutedForeground">Cảnh báo giữ đúng tập mã được chọn lúc lưu. Phạm vi danh mục chỉ chỉnh được trên web.</Text>
        </View>
      ) : (
        <Input
          testID="strategy-alerts-symbols"
          label="Mã theo dõi"
          value={symbolValue}
          multiline
          autoCapitalize="characters"
          placeholder="Nhập mã, ví dụ FPT, VNM"
          error={errors.symbols}
          style={{ height: 96, paddingVertical: spacing.sm, textAlignVertical: 'top' }}
          onChangeText={(t) => {
            clear();
            setSymbolText(t);
          }}
        />
      )}
      {!savedList ? <Text variant="caption" color="mutedForeground">Một hoặc nhiều mã, cách nhau bởi dấu cách hoặc dấu phẩy, tối đa 500. Máy chủ kiểm tra mã có trong danh mục cổ phiếu.</Text> : null}

      <View style={{ gap: spacing.xs }}>
        <Text variant="label" color="mutedForeground">Phía theo dõi</Text>
        <SideSelector
          detail={sidesDetail}
          choice={sideChoice}
          currentSides={editing ? alert!.version.sides : undefined}
          onChange={(side, v) => {
            clear();
            setSideChoice((p) => ({ ...p, [side]: v }));
          }}
        />
        {errors.sides ? <Text variant="caption" color="statusError" accessibilityRole="alert">{errors.sides}</Text> : null}
      </View>

      <SwitchRow
        testID="strategy-alerts-enabled"
        label="Theo dõi"
        description="Cuối phiên · Tín hiệu mới thỏa điều kiện"
        value={enabled}
        onValueChange={(v) => {
          clear();
          setEnabled(v);
        }}
      />

      <Text variant="caption" color="mutedForeground">{sourceNote} Cảnh báo chỉ ghi lịch sử: không đặt lệnh, không thay cấu hình hay danh mục của Bot.</Text>
      {errors.form ? <Text color="statusError" accessibilityRole="alert" testID="strategy-alerts-form-error">{errors.form}</Text> : null}

      <Button testID="strategy-alerts-save" title="Lưu cảnh báo" loading={create.isPending || update.isPending} disabled={busy || previewLoading} onPress={() => void submit()} />
      {alert ? (
        <>
          <Button testID="strategy-alerts-delete" title="Xóa cảnh báo" variant="destructive" disabled={busy} onPress={() => void onDelete()} />
          <VersionHistory alert={alert} />
        </>
      ) : null}
    </Screen>
  );
}

function VersionHistory({ alert }: { alert: AlertDetail }) {
  const { spacing } = useTheme();
  const versions = [...(alert.versions ?? [])].sort((a, b) => b.version - a.version);
  if (versions.length === 0) return null;
  return (
    <View testID="strategy-alerts-versions" style={{ gap: spacing.xs }}>
      <Text variant="section">Lịch sử phiên bản</Text>
      {versions.map((v) => (
        <View key={v.version}>
          <Text weight="semibold">
            CB v{v.version}
            {v.version === alert.current_version ? ' · hiện tại' : ''}
          </Text>
          <Text variant="caption" color="mutedForeground">
            {sourceCaption(v)} · cấu hình bản {pinnedRevision(v)}
          </Text>
          <Text variant="caption" color="mutedForeground">
            {scopeTitle(v)} · {v.sides.map((s) => (s === 'buy' ? 'Mua' : 'Bán')).join(', ')}
            {v.created_at ? ` · ${formatDate(v.created_at)}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}
