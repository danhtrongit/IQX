import { View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { changePct, type MarketQuote } from '@/features/market';
import { formatNumber, formatPct, formatVnd, priceColorRole } from '@/lib/format';
import { useTheme } from '@/theme';
import { RoleText } from './role-text';

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="caption" color="mutedForeground">
        {label}
      </Text>
      {children}
    </View>
  );
}

/** Price, change %, reference/ceiling/floor, high/low, volume and the 3-level order book. */
export function QuoteCard({ symbol, quote }: { symbol: string; quote: MarketQuote }) {
  const { spacing, colors } = useTheme();
  const role = priceColorRole(quote.price, quote.reference, quote.ceiling, quote.floor);
  const pct = changePct(quote);
  const bids = [0, 1, 2].map((i) => quote.bids[i]);
  const asks = [0, 1, 2].map((i) => quote.asks[i]);
  return (
    <Card testID="trade-quote-card" style={{ gap: spacing.md }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <Text variant="heading">{symbol}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <RoleText testID="trade-quote-price" role={role} style={{ fontSize: 24, lineHeight: 30 }}>
            {quote.price ? formatVnd(quote.price) : '—'}
          </RoleText>
          <RoleText testID="trade-quote-change" role={role}>
            {formatPct(pct)}
          </RoleText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Stat label="Tham chiếu">
          <RoleText role="ref">{formatVnd(quote.reference)}</RoleText>
        </Stat>
        <Stat label="Trần">
          <RoleText role="ceiling">{formatVnd(quote.ceiling)}</RoleText>
        </Stat>
        <Stat label="Sàn">
          <RoleText role="floor">{formatVnd(quote.floor)}</RoleText>
        </Stat>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Stat label="Cao">
          <RoleText role={priceColorRole(quote.high, quote.reference, quote.ceiling, quote.floor)}>
            {formatVnd(quote.high)}
          </RoleText>
        </Stat>
        <Stat label="Thấp">
          <RoleText role={priceColorRole(quote.low, quote.reference, quote.ceiling, quote.floor)}>
            {formatVnd(quote.low)}
          </RoleText>
        </Stat>
        <Stat label="Khối lượng">
          <Text variant="mono">{formatNumber(quote.volume, 0)}</Text>
        </Stat>
      </View>
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: spacing.sm,
          gap: spacing.xs,
        }}
      >
        <View style={{ flexDirection: 'row' }}>
          <Text variant="caption" color="mutedForeground" style={{ flex: 1 }}>
            Mua (KL × giá)
          </Text>
          <Text variant="caption" color="mutedForeground" style={{ flex: 1 }} align="right">
            Bán (giá × KL)
          </Text>
        </View>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: 'row', gap: spacing.md }}>
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                justifyContent: 'space-between',
              }}
            >
              <Text variant="mono" color="mutedForeground">
                {bids[i] ? formatNumber(bids[i].volume, 0) : '—'}
              </Text>
              <RoleText role="up">{bids[i] ? formatVnd(bids[i].price) : '—'}</RoleText>
            </View>
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                justifyContent: 'space-between',
              }}
            >
              <RoleText role="down">{asks[i] ? formatVnd(asks[i].price) : '—'}</RoleText>
              <Text variant="mono" color="mutedForeground">
                {asks[i] ? formatNumber(asks[i].volume, 0) : '—'}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}
