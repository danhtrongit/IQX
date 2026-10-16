import { mockFetch } from '@/test-utils/fetch';
import { adaptAnalysis, adaptPortfolio, cancelOrder, fetchAccount, fetchOrders, fetchPortfolio, fetchWatchlist, placeOrder, refreshChanged } from '../api';

const account = { id: 'a1', status: 'active', initial_cash_vnd: 1e8, cash_available_vnd: 9e7, cash_reserved_vnd: 0, cash_pending_vnd: 0, total_cash_vnd: 9e7 };

describe('trading api', () => {
  it('maps a 404 account to null', async () => {
    mockFetch(() => ({ status: 404, body: { error: { code: 'NOT_FOUND', message: 'x' } } }));
    await expect(fetchAccount()).resolves.toBeNull();
    await expect(fetchPortfolio()).resolves.toBeNull();
  });

  it('adapts the portfolio and keeps unknown valuation null', () => {
    const pf = adaptPortfolio({
      account,
      positions: [{ symbol: 'fpt', quantity_total: 100, quantity_sellable: 100, avg_cost_vnd: 57600, current_price_vnd: null, market_value_vnd: null, unrealized_pnl_vnd: null }],
      nav_vnd: 1e8,
      total_market_value_vnd: 0,
      total_unrealized_pnl_vnd: 0,
      return_pct: 0.02,
      refresh_warnings: ['w'],
    });
    expect(pf?.positions[0]).toMatchObject({ symbol: 'FPT', current_price_vnd: null, unrealized_pnl_vnd: null });
    expect(pf?.refresh_warnings).toEqual(['w']);
    expect(pf?.pending_rights).toBeNull();
  });

  it('pages orders with status filter', async () => {
    const { calls } = mockFetch(() => ({
      body: { orders: [{ id: 'o1', symbol: 'FPT', side: 'sell', order_type: 'limit', status: 'pending', quantity: 100, limit_price_vnd: 5e4 }], total: 60, page: 2, page_size: 50 },
    }));
    const page = await fetchOrders({ status: 'pending', page: 2 });
    expect(calls[0].url).toContain('status=pending');
    expect(calls[0].url).toContain('page=2');
    expect(calls[0].url).toContain('page_size=50');
    expect(page.orders[0]).toMatchObject({ id: 'o1', side: 'sell', order_type: 'limit', limit_price_vnd: 5e4 });
    expect(page.total).toBe(60);
  });

  it('posts an order (limit price only for limit) and cancels', async () => {
    const { calls } = mockFetch(({ url }) =>
      url.endsWith('/virtual-trading/orders')
        ? { status: 201, body: { id: 'o2', symbol: 'FPT', side: 'buy', order_type: 'market', status: 'rejected', quantity: 100, rejection_reason: 'Không đủ tiền' } }
        : { status: 200, body: {} },
    );
    const order = await placeOrder({ symbol: 'FPT', side: 'buy', order_type: 'market', quantity: 100, limit_price_vnd: 1 });
    expect(JSON.parse(calls[0].init.body)).toEqual({ symbol: 'FPT', side: 'buy', order_type: 'market', quantity: 100 });
    expect(order.rejection_reason).toBe('Không đủ tiền');
    await cancelOrder('o2');
    expect(calls[1].url).toContain('/virtual-trading/orders/o2/cancel');
    expect(calls[1].init.method).toBe('POST');
  });

  it('adapts watchlist envelopes', async () => {
    mockFetch(() => ({ body: { data: [{ id: 'w2', symbol: 'vnm', sortOrder: 2 }, { id: 'w1', symbol: 'FPT', sortOrder: 1, instrument: { name: 'FPT Corp', shortName: null, exchange: 'HOSE' } }] } }));
    const list = await fetchWatchlist();
    expect(list.map((i) => i.symbol)).toEqual(['FPT', 'VNM']);
    expect(list[0]).toMatchObject({ name: 'FPT Corp', exchange: 'HOSE' });
  });

  it('detects engine changes', () => {
    expect(refreshChanged({ orders_filled: 0, warnings: [] })).toBe(false);
    expect(refreshChanged({ settlements_settled: 2 })).toBe(true);
  });

  it('adapts the AI report defensively', () => {
    const r = adaptAnalysis({ analysis: { scores: { overall: 3.5 } }, narrative: { title: 'T', layers: { risk: 'Rủi ro thấp' }, actions: [{ title: 'Làm A' }] }, meta: { cached: true } });
    expect(r).toMatchObject({ title: 'T', score: 3.5, cached: true, insufficient: false });
    expect(r.sections).toEqual([{ key: 'risk', title: 'Rủi ro', text: 'Rủi ro thấp' }]);
    expect(adaptAnalysis({ analysis: { insufficient_data: true, reason: 'ít' }, narrative: null }).insufficient).toBe(true);
  });
});
