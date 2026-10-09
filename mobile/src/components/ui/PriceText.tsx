import type { TextProps } from 'react-native';

import { formatPct, formatVnd, priceColorRole, type PriceRole } from '@/lib/format';
import { useTheme } from '@/theme';
import { Text } from './Text';

const roleKey = {
  up: 'priceUp',
  down: 'priceDown',
  ref: 'priceRef',
  ceiling: 'priceCeiling',
  floor: 'priceFloor',
} as const;

export function priceRoleColor(colors: ReturnType<typeof useTheme>['colors'], role: PriceRole): string {
  return colors[roleKey[role]];
}

export type PriceTextProps = Omit<TextProps, 'role'> & {
  /** Explicit role, or derive from price/ref/ceiling/floor. */
  role?: PriceRole;
  price?: number | null;
  refPrice?: number | null;
  ceiling?: number | null;
  floor?: number | null;
  /** Text to show; defaults to formatVnd(price) ("—" when unknown, never 0). Pass formatPct(...) for changes. */
  children?: string;
  /** Show percent change vs refPrice instead of the price. */
  asPercent?: boolean;
};

export function PriceText({ role, price, refPrice, ceiling, floor, asPercent, children, style, ...rest }: PriceTextProps) {
  const { colors } = useTheme();
  const r = role ?? priceColorRole(price, refPrice, ceiling, floor);
  let text = children;
  if (text === undefined) {
    if (asPercent) {
      text = price && refPrice ? formatPct(((price - refPrice) / refPrice) * 100) : '—';
    } else text = price ? formatVnd(price) : '—';
  }
  return (
    <Text {...rest} variant="mono" style={[{ color: priceRoleColor(colors, r) }, style]}>
      {text}
    </Text>
  );
}
