import { Stack, useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Screen, Tabs, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { AlertList } from './alert-list';
import { EventsFeed } from './events-feed';
import { AlertsGate } from './gate';

type Segment = 'alerts' | 'events';

export function AlertsHome() {
  const router = useRouter();
  const { spacing } = useTheme();
  const [segment, setSegment] = useState<Segment>('alerts');
  const create = () => router.push('/strategy/alerts/new' as never);
  return (
    <Screen testID="strategy-alerts-screen">
      <Stack.Screen options={{ title: 'Cảnh báo' }} />
      <AlertsGate>
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Tabs<Segment>
            testID="strategy-alerts-tabs"
            value={segment}
            onChange={setSegment}
            items={[
              { value: 'alerts', label: 'Cảnh báo', testID: 'strategy-alerts-tab-alerts' },
              { value: 'events', label: 'Tín hiệu', testID: 'strategy-alerts-tab-events' },
            ]}
          />
          <Button testID="strategy-alerts-create" title="Tạo cảnh báo" icon={Plus} onPress={create} />
          <Text variant="caption" color="mutedForeground">
            Tín hiệu kỹ thuật, không phải giao dịch Bot. Cảnh báo giữ phiên bản cấu hình đã chọn.
          </Text>
          <View style={{ flex: 1 }}>{segment === 'alerts' ? <AlertList onCreate={create} /> : <EventsFeed />}</View>
        </View>
      </AlertsGate>
    </Screen>
  );
}
