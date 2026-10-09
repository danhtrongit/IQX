import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SnackbarProvider } from '@/components/ui';
import { mockFetch } from '@/test-utils/fetch';
import { OrderTicket } from '../order-ticket';

const account = { id: 'a1', status: 'active', initial_cash_vnd: 1e8, cash_available_vnd: 9e7, cash_reserved_vnd: 0, cash_pending_vnd: 0, total_cash_vnd: 9e7 };
const row = { symbol: 'FPT', close_price: 57600, reference_price: 57000, ceiling_price: 60900, floor_price: 53100, bid_prices: [], ask_prices: [] };

async function setup(onDone = jest.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const mocks = mockFetch(
    ({ url }) => (url.includes('/price-board') ? { body: [row] } : undefined),
    ({ url }) => (url.endsWith('/virtual-trading/account') ? { body: account } : undefined),
    ({ url }) => (url.endsWith('/virtual-trading/portfolio') ? { body: { account, positions: [], nav_vnd: 1e8, total_market_value_vnd: 0, total_unrealized_pnl_vnd: 0, return_pct: 0, refresh_warnings: [] } } : undefined),
    ({ url, init }) =>
      url.endsWith('/virtual-trading/orders') && init.method === 'POST'
        ? { status: 201, body: { id: 'o1', symbol: 'FPT', side: 'buy', order_type: 'market', status: 'filled', quantity: 100 } }
        : undefined,
  );
  const view = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}>
        <SnackbarProvider>
          <OrderTicket initialSymbol="FPT" initialSide="buy" onDone={onDone} />
        </SnackbarProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { view, mocks, onDone };
}

describe('OrderTicket', () => {
  it('validates, shows the review summary and submits', async () => {
    const { mocks, onDone } = await setup();
    await screen.findByTestId('order-review-button');
    await waitFor(() => expect(screen.getByText(/Giá: 57\.600/)).toBeTruthy());

    await fireEvent.press(screen.getByTestId('order-review-button'));
    expect(screen.getByText('Khối lượng tối thiểu là 100 CP')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('order-quantity'), '150');
    await fireEvent.press(screen.getByTestId('order-review-button'));
    expect(screen.getByText('Khối lượng phải là bội số của 100')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('order-quantity'), '100');
    await fireEvent.press(screen.getByTestId('order-review-button'));
    expect(screen.getByTestId('order-review')).toBeTruthy();
    expect(screen.getByTestId('order-review-gross')).toHaveTextContent(/5\.760\.000/);
    expect(screen.getByTestId('order-review-fee')).toHaveTextContent(/8\.640/);
    expect(screen.getByTestId('order-review-total')).toHaveTextContent(/5\.768\.640/);

    await fireEvent.press(screen.getByTestId('order-confirm'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const post = mocks.calls.find((c) => c.init.method === 'POST' && c.url.endsWith('/virtual-trading/orders'));
    expect(JSON.parse(post!.init.body)).toEqual({ symbol: 'FPT', side: 'buy', order_type: 'market', quantity: 100 });
  });
});
