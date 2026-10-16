import { View } from 'react-native';

import { useTheme, type Palette } from '@/theme';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const toneColor: Record<BadgeTone, keyof Palette> = {
  neutral: 'mutedForeground',
  primary: 'primary',
  accent: 'accent',
  success: 'statusSuccess',
  warning: 'statusWarning',
  danger: 'statusError',
  info: 'statusInfo',
};

export function Badge({ label, tone = 'neutral', testID }: { label: string; tone?: BadgeTone; testID?: string }) {
  const { colors, radius } = useTheme();
  const c = colors[toneColor[tone]];
  return (
    <View
      testID={testID}
      accessibilityLabel={label}
      style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.control, borderWidth: 1, borderColor: c }}>
      <Text variant="caption" weight="semibold" color={c}>
        {label}
      </Text>
    </View>
  );
}
