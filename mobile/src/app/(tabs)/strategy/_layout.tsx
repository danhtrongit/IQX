import { Stack } from 'expo-router';

import { useRootHeaderOptions, useStackOptions } from '@/components/navigation';

export default function StrategyLayout() {
  const options = useStackOptions();
  const rootOptions = useRootHeaderOptions({ showXu: false });
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'Chiến lược', ...rootOptions }} />
    </Stack>
  );
}
