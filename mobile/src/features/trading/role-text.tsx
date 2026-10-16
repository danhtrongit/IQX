import type { TextProps } from 'react-native';

import { priceRoleColor, Text } from '@/components/ui';
import type { PriceRole } from '@/lib/format';
import { useTheme } from '@/theme';

/** Mono number coloured by price role (PriceText's `role` prop collides with RN's `role` typing). */
export function RoleText({ role, children, style, ...rest }: Omit<TextProps, 'role'> & { role: PriceRole; children: string }) {
  const { colors } = useTheme();
  return (
    <Text {...rest} variant="mono" style={[{ color: priceRoleColor(colors, role) }, style]}>
      {children}
    </Text>
  );
}
