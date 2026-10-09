import { View } from 'react-native';
import type { ReactNode } from 'react';

import { Text } from './Text';

export function KeyValueRow({ label, value, testID }: { label: string; value: ReactNode; testID?: string }) {
  return (
    <View testID={testID} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 32 }}>
      <Text color="mutedForeground">{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? <Text variant="mono" align="right">{String(value)}</Text> : value}
    </View>
  );
}
