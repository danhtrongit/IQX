import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Badge, Button, Divider, EmptyState, ErrorState, Screen, SkeletonList, Text } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { StrategyGate } from '../shared/gate';
import { useBotSession } from './hooks';
import { ACTION_LABEL } from './labels';
import { formatDong } from './money';

export function SessionScreen() {
  const { session } = useLocalSearchParams<{ session: string }>();
  const q = useBotSession(session ?? '');
  return (
    <>
      <Stack.Screen options={{ title: `Phiên ${formatDate(session)}` }} />
      <StrategyGate error={q.error} testID="strategy-bot-session-gate">
        <Screen scroll testID="strategy-bot-session-screen">
          {q.isPending ? (
            <SkeletonList rows={4} />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : (
            (() => {
              const items = q.data.pages.flatMap((p) => p.items);
              if (!items.length) return <EmptyState title="Không có quyết định" message="Phiên này chưa có quyết định nào." />;
              return (
                <View>
                  {items.map((it, i) => (
                    <View key={it.id}>
                      {i > 0 ? <Divider /> : null}
                      <View style={{ paddingVertical: 8, gap: 2 }} testID={`strategy-bot-decision-${i}`}>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                          <Badge label={ACTION_LABEL[it.action] ?? it.action} tone={it.action === 'buy' ? 'success' : it.action === 'sell' ? 'danger' : 'neutral'} />
                          <Text weight="semibold">{it.symbol}</Text>
                        </View>
                        <Text variant="caption" color="mutedForeground">{it.reason_label ?? it.reason ?? '—'}</Text>
                        {it.execution ? <Text variant="mono">{it.execution.qty ?? '—'} CP @ {formatDong(it.execution.price_vnd)}</Text> : null}
                      </View>
                    </View>
                  ))}
                  {q.hasNextPage ? <Button title="Xem thêm" variant="outline" loading={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()} testID="strategy-bot-session-more" /> : null}
                </View>
              );
            })()
          )}
        </Screen>
      </StrategyGate>
    </>
  );
}
