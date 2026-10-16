import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

/** 8px radius, 1px border, no heavy shadow. */
export type CardProps = ViewProps & { padded?: boolean; style?: StyleProp<ViewStyle> };

export function Card({ padded = true, style, ...rest }: CardProps) {
  const { colors, radius, layout } = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.card,
          padding: padded ? layout.pagePadding : 0,
          overflow: 'hidden',
        },
        style,
      ]}
    />
  );
}
