import { Stack } from 'expo-router';

import { useRootHeaderOptions, useStackOptions } from '@/components/navigation';
import { useTradingHeartbeat } from '@/features/trading';

export default function TradeLayout() {
  const options = useStackOptions();
  const rootOptions = useRootHeaderOptions({ showXu: false });
  useTradingHeartbeat();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'Giao dịch', ...rootOptions }} />
      <Stack.Screen name="order" options={{ title: 'Đặt lệnh', presentation: 'modal' }} />
    </Stack>
  );
}
