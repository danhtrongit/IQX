import { Stack } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Card, EmptyState, ErrorState, PanelState, Screen, SkeletonList, Text, type BadgeTone } from '@/components/ui';
import { SymbolPicker } from '@/features/market';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';
import { ApiError } from '@/lib/api';
import type { PatternItem, PatternKind, PatternSignal } from './api';
import { usePatterns } from './hooks';

const SIGNAL: Record<PatternSignal, { tone: BadgeTone; label: string }> = {
  bullish: { tone: 'success', label: 'Tăng' },
  bearish: { tone: 'danger', label: 'Giảm' },
  neutral: { tone: 'neutral', label: 'Trung lập' },
};

function PatternRow({ item, kind, index }: { item: PatternItem; kind: PatternKind; index: number }) {
  const { spacing } = useTheme();
  const sig = SIGNAL[item.signal];
  return (
    <Card testID={`patterns-${kind}-item-${index}`} style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <Text variant="section" style={{ flex: 1 }}>{item.name}</Text>
        <Badge label={item.signalLabel ?? sig.label} tone={sig.tone} />
      </View>
      {item.state ? <Text color="mutedForeground">{item.state}</Text> : null}
      {item.meaning ? <Text>{item.meaning}</Text> : null}
      {item.action ? <Text weight="medium">{item.action}</Text> : null}
    </Card>
  );
}

function Section({ kind, title, symbol }: { kind: PatternKind; title: string; symbol: string }) {
  const { spacing } = useTheme();
  const q = usePatterns(kind, symbol, true);
  return (
    <View style={{ gap: spacing.sm }} testID={`patterns-${kind}`}>
      <Text variant="heading">{title}</Text>
      {q.isPending ? (
        <SkeletonList rows={3} />
      ) : q.isError ? (
        q.error instanceof ApiError && q.error.status === 403 ? (
          <PanelState icon={Lock} title="Cần gói Premium" message="Máy chủ từ chối yêu cầu này vì gói Premium chưa hoạt động." />
        ) : (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        )
      ) : q.data.length === 0 ? (
        <EmptyState title="Chưa phát hiện mẫu hình" message={`Chưa có ${title.toLowerCase()} nào cho ${symbol}.`} />
      ) : (
        q.data.map((item, i) => <PatternRow key={`${item.name}-${i}`} item={item} kind={kind} index={i} />)
      )}
    </View>
  );
}

/** /trade/patterns: Premium-gated AI candle and chart patterns. */
export function PatternsScreen() {
  const { isPremium } = useAuth();
  const [symbol, setSymbol] = useState('FPT');
  return (
    <Screen scroll testID="patterns-screen">
      <Stack.Screen options={{ title: 'Mẫu hình nến' }} />
      {!isPremium ? (
        <PanelState
          testID="patterns-premium"
          icon={Lock}
          title="Cần gói Premium"
          message="Nhận diện mẫu nến và mẫu hình giá bằng AI chỉ dành cho tài khoản Premium. Các công cụ khác vẫn dùng bình thường."
        />
      ) : (
        <>
          <SymbolPicker value={symbol} onChange={setSymbol} testID="patterns-symbol" />
          <Section kind="candles" title="Mẫu hình nến" symbol={symbol} />
          <Section kind="charts" title="Mẫu hình giá" symbol={symbol} />
        </>
      )}
    </Screen>
  );
}
