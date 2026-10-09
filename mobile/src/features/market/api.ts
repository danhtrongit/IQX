/**
 * Shared market data used by every feature (trading, strategy, insights).
 * Mirrors frontend/src/pages/demo-trading/market/market-api.ts: missing upstream values stay `null`
 * (rendered as "—") and are never coerced to 0.
 */
import { apiRequest } from '@/lib/api';

type Raw = Record<string, unknown>;

export type OrderBookLevel = { price: number; volume: number };

export type MarketQuote = {
  symbol: string;
  price: number | null;
  reference: number | null;
  ceiling: number | null;
  floor: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
};

export type SymbolSearchResult = {
  symbol: string;
  name: string | null;
  exchange: string | null;
  industry: string | null;
};

export const marketKeys = {
  all: ['market'] as const,
  quote: (symbol: string) => ['market', 'quote', symbol] as const,
  search: (query: string) => ['market', 'symbol-search', query] as const,
  ohlcv: (symbol: string, start: string, end: string) => ['market', 'ohlcv', symbol, start, end] as const,
};

export function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function str(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof value === 'number') return String(value);
  return null;
}

/** A tradeable price: upstream uses `null`/`0` for "no trade yet". */
function price(value: unknown): number | null {
  const n = num(value);
  return n !== null && n > 0 ? n : null;
}

/** First array in the payload: bare array, `{data}`, then `{items}`. */
export function rows(payload: unknown): Raw[] {
  if (Array.isArray(payload)) return payload as Raw[];
  if (payload && typeof payload === 'object') {
    const record = payload as { data?: unknown; items?: unknown };
    if (Array.isArray(record.data)) return record.data as Raw[];
    if (Array.isArray(record.items)) return record.items as Raw[];
  }
  return [];
}

function levels(value: unknown): OrderBookLevel[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Raw;
    const p = price(row.price);
    return p === null ? [] : [{ price: p, volume: num(row.volume) ?? 0 }];
  });
}

export function adaptQuote(raw: Raw, symbol: string): MarketQuote | null {
  const code = str(raw.symbol)?.toUpperCase();
  // Unknown tickers come back as an empty-symbol row full of zeros.
  if (!code || code !== symbol) return null;
  return {
    symbol: code,
    price: price(raw.close_price),
    reference: price(raw.reference_price),
    ceiling: price(raw.ceiling_price),
    floor: price(raw.floor_price),
    high: price(raw.high_price),
    low: price(raw.low_price),
    volume: num(raw.total_volume),
    bids: levels(raw.bid_prices),
    asks: levels(raw.ask_prices),
  };
}

/** Live quote for one symbol; unknown tickers resolve to `null`. */
export async function fetchQuote(symbol: string, signal?: AbortSignal): Promise<MarketQuote | null> {
  const code = normalizeSymbol(symbol);
  if (!code) return null;
  const payload = await apiRequest<unknown>('/market-data/trading/price-board', {
    method: 'POST',
    body: { symbols: [code] },
    signal,
  });
  for (const raw of rows(payload)) {
    const quote = adaptQuote(raw, code);
    if (quote) return quote;
  }
  return null;
}

/** Exchanges where the demo sandbox can fill an order. */
const TRADABLE_EXCHANGES = new Set(['HOSE', 'HNX', 'UPCOM']);

/** Typeahead restricted to active, tradable stocks (HOSE/HNX/UPCOM). */
export async function searchTradableSymbols(query: string, signal?: AbortSignal): Promise<SymbolSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const payload = await apiRequest<unknown>('/instruments', {
    query: { q, page: 1, page_size: 10, asset_type: 'stock', include_indices: false },
    signal,
  });
  return rows(payload)
    .map((raw): SymbolSearchResult | null => {
      const symbol = str(raw.symbol)?.toUpperCase();
      if (!symbol) return null;
      return {
        symbol,
        name: str(raw.name),
        exchange: str(raw.exchange)?.toUpperCase() ?? null,
        industry: str(raw.icbLv1),
      };
    })
    .filter((item): item is SymbolSearchResult => item !== null && item.exchange !== null && TRADABLE_EXCHANGES.has(item.exchange));
}

export type DailyBar = { date: string; close: number };

/** Daily closes (oldest first) for sparklines. Bars without a close are dropped. */
export async function fetchDailyCloses(symbol: string, start: string, end: string, signal?: AbortSignal): Promise<DailyBar[]> {
  const payload = await apiRequest<unknown>(`/market-data/quotes/${encodeURIComponent(normalizeSymbol(symbol))}/ohlcv`, {
    query: { start, end, interval: '1D' },
    signal,
  });
  return rows(payload).flatMap((raw) => {
    const close = price(raw.close ?? raw.close_price);
    const date = str(raw.time ?? raw.date ?? raw.trading_date);
    return close === null || date === null ? [] : [{ date: date.slice(0, 10), close }];
  });
}

const SYMBOL_RE = /^[A-Z0-9]{1,10}$/;

export function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidSymbol(value: string): boolean {
  return SYMBOL_RE.test(normalizeSymbol(value));
}

/** (price - reference) / reference as a percentage, or null when unknown. */
export function changePct(quote: Pick<MarketQuote, 'price' | 'reference'> | null | undefined): number | null {
  if (!quote || quote.price === null || quote.reference === null || quote.reference === 0) return null;
  return ((quote.price - quote.reference) / quote.reference) * 100;
}
