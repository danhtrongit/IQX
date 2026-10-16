import { ApiError, apiData, apiRequest } from '@/lib/api';
import { num, rows, str } from '@/features/market';
import type {
  EngineRefreshResult,
  OrderPage,
  OrderSide,
  PlaceOrderInput,
  PortfolioAnalysis,
  TradingAccount,
  TradingOrder,
  TradingPortfolio,
  TradingPosition,
  WatchlistItem,
} from './types';

type Raw = Record<string, unknown>;

export const tradingKeys = {
  all: ['trading'] as const,
  account: ['trading', 'account'] as const,
  portfolio: ['trading', 'portfolio'] as const,
  orders: (status: string) => ['trading', 'orders', status] as const,
  watchlist: ['trading', 'watchlist'] as const,
  analysis: ['trading', 'analysis'] as const,
};

function record(value: unknown): Raw | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null;
}

function n0(value: unknown): number {
  return num(value) ?? 0;
}

export function adaptAccount(raw: unknown): TradingAccount | null {
  const r = record(raw);
  const id = r ? str(r.id) : null;
  if (!r || !id) return null;
  return {
    id,
    status: str(r.status) ?? 'active',
    initial_cash_vnd: n0(r.initial_cash_vnd),
    cash_available_vnd: n0(r.cash_available_vnd),
    cash_reserved_vnd: n0(r.cash_reserved_vnd),
    cash_pending_vnd: n0(r.cash_pending_vnd),
    total_cash_vnd: n0(r.total_cash_vnd),
  };
}

export function adaptPosition(raw: Raw): TradingPosition | null {
  const symbol = str(raw.symbol)?.toUpperCase();
  if (!symbol) return null;
  return {
    symbol,
    quantity_total: n0(raw.quantity_total),
    quantity_sellable: n0(raw.quantity_sellable),
    quantity_pending: n0(raw.quantity_pending),
    quantity_reserved: n0(raw.quantity_reserved),
    avg_cost_vnd: n0(raw.avg_cost_vnd),
    current_price_vnd: num(raw.current_price_vnd),
    market_value_vnd: num(raw.market_value_vnd),
    unrealized_pnl_vnd: num(raw.unrealized_pnl_vnd),
  };
}

export function adaptPortfolio(raw: unknown): TradingPortfolio | null {
  const r = record(raw);
  const account = r ? adaptAccount(r.account) : null;
  if (!r || !account) return null;
  const rights = record(r.pending_rights);
  return {
    account,
    positions: (Array.isArray(r.positions) ? (r.positions as Raw[]) : []).flatMap((p) => {
      const position = record(p) ? adaptPosition(p) : null;
      return position ? [position] : [];
    }),
    total_market_value_vnd: n0(r.total_market_value_vnd),
    nav_vnd: n0(r.nav_vnd),
    total_unrealized_pnl_vnd: n0(r.total_unrealized_pnl_vnd),
    return_pct: n0(r.return_pct),
    refresh_warnings: Array.isArray(r.refresh_warnings) ? r.refresh_warnings.filter((w): w is string => typeof w === 'string') : [],
    pending_rights: rights
      ? {
          pending_cash_dividend_vnd: n0(rights.pending_cash_dividend_vnd),
          pending_stock_dividend_quantity: n0(rights.pending_stock_dividend_quantity),
        }
      : null,
  };
}

export function adaptOrder(raw: Raw): TradingOrder | null {
  const id = str(raw.id);
  const symbol = str(raw.symbol)?.toUpperCase();
  if (!id || !symbol) return null;
  return {
    id,
    symbol,
    side: str(raw.side) === 'sell' ? 'sell' : 'buy',
    order_type: str(raw.order_type) === 'limit' ? 'limit' : 'market',
    status: str(raw.status) ?? 'pending',
    quantity: n0(raw.quantity),
    limit_price_vnd: num(raw.limit_price_vnd),
    filled_price_vnd: num(raw.filled_price_vnd),
    gross_amount_vnd: num(raw.gross_amount_vnd),
    fee_vnd: num(raw.fee_vnd),
    tax_vnd: num(raw.tax_vnd),
    net_amount_vnd: num(raw.net_amount_vnd),
    trading_date: str(raw.trading_date),
    rejection_reason: str(raw.rejection_reason),
    cancel_reason: str(raw.cancel_reason),
    created_at: str(raw.created_at),
  };
}

export function adaptWatchlistItem(raw: Raw): WatchlistItem | null {
  const symbol = str(raw.symbol)?.toUpperCase();
  if (!symbol) return null;
  const instrument = record(raw.instrument);
  return {
    id: str(raw.id) ?? symbol,
    symbol,
    sortOrder: num(raw.sortOrder) ?? 0,
    name: instrument ? (str(instrument.shortName) ?? str(instrument.name)) : null,
    exchange: instrument ? str(instrument.exchange) : null,
  };
}

/** `null` when the user has no virtual account yet (404). */
export async function fetchAccount(signal?: AbortSignal): Promise<TradingAccount | null> {
  try {
    return adaptAccount(await apiData<unknown>('/virtual-trading/account', { signal }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function activateAccount(): Promise<TradingAccount | null> {
  return adaptAccount(
    await apiData<unknown>('/virtual-trading/account/activate', {
      method: 'POST',
    }),
  );
}

export async function fetchPortfolio(signal?: AbortSignal): Promise<TradingPortfolio | null> {
  try {
    return adaptPortfolio(await apiData<unknown>('/virtual-trading/portfolio', { signal }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export const ORDERS_PAGE_SIZE = 50;

export async function fetchOrders(params: { status?: string; page?: number }, signal?: AbortSignal): Promise<OrderPage> {
  const page = params.page ?? 1;
  const payload = record(
    await apiData<unknown>('/virtual-trading/orders', {
      query: { page, page_size: ORDERS_PAGE_SIZE, status: params.status },
      signal,
    }),
  );
  const list = payload && Array.isArray(payload.orders) ? (payload.orders as Raw[]) : [];
  return {
    orders: list.flatMap((o) => {
      const order = record(o) ? adaptOrder(o) : null;
      return order ? [order] : [];
    }),
    total: num(payload?.total) ?? list.length,
    page: num(payload?.page) ?? page,
    pageSize: num(payload?.page_size) ?? ORDERS_PAGE_SIZE,
  };
}

export async function placeOrder(input: PlaceOrderInput): Promise<TradingOrder> {
  const body: Raw = {
    symbol: input.symbol,
    side: input.side,
    order_type: input.order_type,
    quantity: input.quantity,
  };
  if (input.order_type === 'limit' && input.limit_price_vnd !== undefined) body.limit_price_vnd = input.limit_price_vnd;
  const order = adaptOrder(
    record(
      await apiData<unknown>('/virtual-trading/orders', {
        method: 'POST',
        body,
      }),
    ) ?? {},
  );
  if (!order) throw new ApiError('Phản hồi đặt lệnh không hợp lệ', 502);
  return order;
}

export async function cancelOrder(id: string): Promise<void> {
  await apiRequest(`/virtual-trading/orders/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });
}

export async function fetchWatchlist(signal?: AbortSignal): Promise<WatchlistItem[]> {
  const payload = await apiRequest<unknown>('/watchlists', { signal });
  return rows(payload)
    .flatMap((raw) => {
      const item = adaptWatchlistItem(raw);
      return item ? [item] : [];
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function addToWatchlist(symbol: string): Promise<void> {
  await apiRequest('/watchlists', {
    method: 'POST',
    body: { symbol: symbol.trim().toUpperCase() },
  });
}

export async function removeFromWatchlist(symbol: string): Promise<void> {
  await apiRequest(`/watchlists/${encodeURIComponent(symbol.trim().toUpperCase())}`, { method: 'DELETE' });
}

export async function postRefresh(signal?: AbortSignal): Promise<EngineRefreshResult> {
  const result = await apiData<unknown>('/virtual-trading/refresh', {
    method: 'POST',
    signal,
  });
  return (record(result) ?? {}) as EngineRefreshResult;
}

/** True when the engine reported any change (a positive numeric counter). */
export function refreshChanged(result: EngineRefreshResult): boolean {
  return Object.values(result).some((v) => typeof v === 'number' && v > 0);
}

const LAYER_TITLES: Record<string, string> = {
  overview: 'Tổng quan',
  performance: 'Hiệu suất',
  allocation: 'Phân bổ',
  stress: 'Sức chịu đựng',
  risk: 'Rủi ro',
  attribution: 'Đóng góp',
  quality: 'Chất lượng',
  behavior: 'Hành vi',
};

export function adaptAnalysis(raw: unknown): PortfolioAnalysis {
  const r = record(raw) ?? {};
  const analysis = record(r.analysis) ?? {};
  const narrative = record(r.narrative);
  const meta = record(r.meta);
  const layers = narrative ? record(narrative.layers) : null;
  const sections = layers
    ? Object.entries(layers).flatMap(([key, value]) => {
        const text = str(value);
        return text ? [{ key, title: LAYER_TITLES[key] ?? key, text }] : [];
      })
    : [];
  const insight = narrative ? record(narrative.insight) : null;
  if (insight && str(insight.text))
    sections.push({
      key: 'insight',
      title: str(insight.label) ?? 'Nhận định',
      text: str(insight.text)!,
    });
  const actions = narrative && Array.isArray(narrative.actions) ? (narrative.actions as unknown[]) : [];
  const scores = record(analysis.scores);
  return {
    insufficient: analysis.insufficient_data === true,
    reason: str(analysis.reason),
    title: narrative ? str(narrative.title) : null,
    verdict: narrative ? str(narrative.verdict) : null,
    lede: narrative ? str(narrative.lede) : null,
    score: scores ? num(scores.overall) : null,
    sections,
    actions: actions.flatMap((a) => {
      const row = record(a);
      const title = row ? str(row.title) : null;
      return title ? [{ title, detail: str(row!.detail) }] : [];
    }),
    closing: narrative ? str(narrative.closing) : null,
    cached: meta?.cached === true,
  };
}

export async function analyzePortfolio(signal?: AbortSignal): Promise<PortfolioAnalysis> {
  return adaptAnalysis(
    await apiRequest<unknown>('/portfolio-manager/analyze', {
      method: 'POST',
      signal,
      timeoutMs: 90_000,
    }),
  );
}

export function sideLabel(side: OrderSide): string {
  return side === 'buy' ? 'Mua' : 'Bán';
}
