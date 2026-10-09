import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen } from '@/components/ui';
import { normalizeSymbol } from '@/features/market';
import { OrderTicket, type OrderSide } from '@/features/trading';

export default function OrderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ symbol?: string; side?: string }>();
  const symbol = normalizeSymbol(typeof params.symbol === 'string' ? params.symbol : '') || 'FPT';
  const side: OrderSide = params.side === 'sell' ? 'sell' : 'buy';
  return (
    <Screen scroll edges={['left', 'right', 'bottom']} testID="order-screen">
      <OrderTicket initialSymbol={symbol} initialSide={side} onDone={() => router.back()} />
    </Screen>
  );
}
