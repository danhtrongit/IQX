import { Stack } from 'expo-router';

import { useRootHeaderOptions, useStackOptions } from '@/components/navigation';

export default function MoreLayout() {
  const options = useStackOptions();
  const rootOptions = useRootHeaderOptions({ showXu: true });
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'Thêm', ...rootOptions }} />
    </Stack>
  );
}
