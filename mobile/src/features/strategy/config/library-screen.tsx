import { useQueryClient } from '@tanstack/react-query';
import { Stack, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, confirmDialog, ErrorState, Screen, SkeletonList, Text, useSnackbar } from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api';
import { fieldErrors, newKey } from '../shared/errors';
import { StrategyGate } from '../shared/gate';
import { configKeys, patchSharedConfig } from './api';
import { useRegistry, useSharedConfig } from './hooks';
import { IndicatorCard, indicatorErrors } from './indicator-card';
import {
  buildPatch,
  CONFLICT_MESSAGE,
  dirtyIds,
  draftFromSaved,
  groupByChapter,
  isIndicatorDirty,
  LOCKED_MESSAGE,
  rebaseDraft,
  usedCount,
  withParam,
} from './model';
import type { Draft, IndicatorConfig, Side } from './types';

export function LibraryScreen() {
  const registry = useRegistry();
  const shared = useSharedConfig();
  const err = registry.error ?? shared.error;
  return (
    <>
      <Stack.Screen options={{ title: 'Thư viện chỉ báo' }} />
      <StrategyGate error={err} testID="strategy-library-gate">
        <LibraryBody />
      </StrategyGate>
    </>
  );
}

function LibraryBody() {
  const registry = useRegistry();
  const shared = useSharedConfig();
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const navigation = useNavigation();

  const base = useMemo(
    () => (registry.data && shared.data ? draftFromSaved(registry.data, shared.data) : null),
    [registry.data, shared.data],
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const baseRef = useRef<Draft | null>(null);
  const [texts, setTexts] = useState<Record<string, Record<string, string>>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'error' | 'conflict' | 'locked'; message: string } | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!base) return;
    const old = baseRef.current;
    baseRef.current = base;
    setDraft((cur) => (cur && old ? rebaseDraft(cur, old, base) : base));
  }, [base]);

  const dirty = useMemo(() => (draft && base ? dirtyIds(draft, base) : []), [draft, base]);
  const hasUnsaved = dirty.length > 0;

  // Unsaved-changes guard.
  useEffect(() => {
    if (!hasUnsaved) return;
    return navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      void confirmDialog({
        title: 'Bỏ thay đổi chưa lưu?',
        message: 'Bạn có thay đổi chưa lưu trong thư viện chỉ báo.',
        confirmLabel: 'Bỏ thay đổi',
        cancelLabel: 'Ở lại',
        destructive: true,
      }).then((ok) => {
        if (ok) navigation.dispatch(e.data.action);
      });
    });
  }, [hasUnsaved, navigation]);

  const update = useCallback((id: string, next: IndicatorConfig) => {
    keyRef.current = null;
    setDraft((d) => (d ? { ...d, [id]: next } : d));
  }, []);

  const loading = registry.isPending || shared.isPending;
  if (loading) return <Screen><SkeletonList rows={6} /></Screen>;
  if (registry.isError || shared.isError || !registry.data || !shared.data || !draft || !base) {
    return (
      <Screen>
        <ErrorState
          testID="strategy-library-error"
          error={registry.error ?? shared.error}
          onRetry={() => {
            void registry.refetch();
            void shared.refetch();
          }}
        />
      </Screen>
    );
  }

  const groups = groupByChapter(registry.data.indicators);
  const allErrors = dirty.flatMap((id) => {
    const ind = registry.data.indicators.find((i) => i.id === id);
    return ind ? indicatorErrors(ind, draft[id], texts[id] ?? {}) : [];
  });

  const reload = async () => {
    setBanner(null);
    setServerErrors({});
    await Promise.all([registry.refetch(), shared.refetch()]);
  };

  const save = async () => {
    if (!shared.data || saving || allErrors.length > 0 || !hasUnsaved) return;
    setSaving(true);
    setBanner(null);
    setServerErrors({});
    keyRef.current = keyRef.current ?? newKey('cfg');
    try {
      const body = buildPatch(registry.data, shared.data, draft, base, keyRef.current);
      const saved = await patchSharedConfig(body);
      qc.setQueryData(configKeys.shared, saved);
      keyRef.current = null;
      setTexts({});
      // Draft equals the saved config now.
      baseRef.current = draftFromSaved(registry.data, saved);
      setDraft(baseRef.current);
      snackbar.success('Đã lưu cấu hình chỉ báo.');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        keyRef.current = null;
        setBanner({ tone: 'conflict', message: CONFLICT_MESSAGE });
      } else if (e instanceof ApiError && e.status === 403 && e.code === 'CAPABILITY_LOCKED') {
        setBanner({ tone: 'locked', message: LOCKED_MESSAGE });
      } else if (e instanceof ApiError && (e.status === 422 || e.status === 400)) {
        const map: Record<string, string> = {};
        for (const f of fieldErrors(e)) map[f.path.replace(/^indicators\./, '')] = f.message;
        setServerErrors(map);
        setBanner({ tone: 'error', message: errorMessage(e) });
        keyRef.current = null;
      } else {
        setBanner({ tone: 'error', message: errorMessage(e) });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll testID="strategy-library-screen" onRefresh={() => void reload()} refreshing={registry.isRefetching || shared.isRefetching}>
      <Text color="mutedForeground">
        Cấu hình này dùng chung cho Bot và Backtest. Đang dùng: {usedCount(draft, 'buy')} điều kiện Mua · {usedCount(draft, 'sell')} điều kiện Bán.
      </Text>
      {banner ? (
        <View accessibilityRole="alert" testID="strategy-library-banner" style={{ gap: 8 }}>
          <Text color={banner.tone === 'locked' ? 'statusWarning' : 'statusError'}>{banner.message}</Text>
          {banner.tone === 'conflict' ? (
            <Button title="Tải lại cấu hình" variant="outline" onPress={() => void reload()} testID="strategy-library-reload" />
          ) : null}
        </View>
      ) : null}
      {groups.map((g) => (
        <View key={g.chapter} style={{ gap: 8 }}>
          <Text variant="label" color="mutedForeground">{g.title}</Text>
          {g.items.map((ind) => {
            const value = draft[ind.id];
            if (!value) return null;
            const learned = !!ind.learned || shared.data.granted_indicators.includes(ind.id);
            const t = texts[ind.id] ?? {};
            return (
              <IndicatorCard
                key={ind.id}
                indicator={ind}
                value={value}
                learned={learned}
                expanded={expanded === ind.id}
                dirty={isIndicatorDirty(value, base[ind.id])}
                texts={t}
                serverErrors={serverErrors}
                onToggleExpanded={() => setExpanded((cur) => (cur === ind.id ? null : ind.id))}
                onChange={(next) => update(ind.id, next)}
                onText={(side: Side, key, text, parsed) => {
                  setTexts((cur) => ({ ...cur, [ind.id]: { ...(cur[ind.id] ?? {}), [`${side}.${key}`]: text } }));
                  if (parsed !== null) update(ind.id, withParam(value, side, key, parsed));
                }}
              />
            );
          })}
        </View>
      ))}
      {hasUnsaved ? (
        <Button
          title={saving ? 'Đang lưu…' : `Lưu cấu hình (${dirty.length})`}
          variant="primary"
          loading={saving}
          disabled={allErrors.length > 0}
          onPress={() => void save()}
          testID="strategy-library-save"
        />
      ) : null}
    </Screen>
  );
}
