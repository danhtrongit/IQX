import { Injectable } from '@nestjs/common';
import { MarketHttpTransport, MarketTransportError } from './http.transport.js';
import { isObject, type JsonObject, type ProviderResult } from './provider.types.js';

/** DNSE (Entrade) chart API. Public, no credentials. */
export const DNSE_CHART_BASE = 'https://services.entrade.com.vn/chart-api/v2/ohlcs';

/** Largest window one request may ask for: from the epoch to now is the full history. */
const DNSE_FULL_HISTORY_FROM = 0;

type DnseKind = 'stock' | 'index';

const arrayOrEmpty = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Daily bars from DNSE (Entrade).
 *
 * `GET {DNSE_CHART_BASE}/{stock|index}?from=<unix>&to=<unix>&symbol=<SYM>&resolution=1D` answers
 * `{ t: [unix], o: [], h: [], l: [], c: [], v: [], nextTime }` and one call returns the whole
 * history of the symbol (verified 2026-11-04: FPT 3,403 bars from 2012-03-20; every VN100 member
 * starts in 2012-03 or later).
 *
 * Units (same as the VND provider, so callers scale the same way):
 * - stocks: prices are ADJUSTED for dividends, bonus shares and splits and are in THOUSAND VND
 *   with two decimals (57.4 = 57,400 VND, a 10 VND resolution); volume is the vendor's matched
 *   volume and is not adjusted;
 * - indices: points.
 *
 * `time` is the vendor's unix timestamp in seconds, left untouched for the caller to convert to a
 * trading date. `nextTime` only matters for `no_data` answers and is ignored: an answer without
 * bars is returned as an empty list.
 *
 * Only the 1D resolution has been verified against the live endpoint, so other intervals are
 * refused instead of guessed. The default provider chain of `MarketDataService` (Bots, quotes) is
 * deliberately NOT changed by this class; callers opt in by injecting it.
 */
@Injectable()
export class DnseMarketProvider {
  constructor(private readonly http: MarketHttpTransport) {}

  /** Daily bars of a stock in `[startTs, endTs]` (unix seconds). */
  fetchOhlcv(
    symbol: string,
    startTs: number,
    endTs: number,
    interval = '1D',
  ): Promise<ProviderResult<JsonObject[]>> {
    return this.fetchChart('stock', symbol, startTs, endTs, interval);
  }

  /** Daily points of an index (VNINDEX, VN30, ...) in `[startTs, endTs]` (unix seconds). */
  fetchIndexOhlcv(
    symbol: string,
    startTs: number,
    endTs: number,
    interval = '1D',
  ): Promise<ProviderResult<JsonObject[]>> {
    return this.fetchChart('index', symbol, startTs, endTs, interval);
  }

  /** The whole history of a stock up to `endTs` (default: now plus one day). */
  fetchFullHistory(symbol: string, endTs?: number): Promise<ProviderResult<JsonObject[]>> {
    return this.fetchOhlcv(symbol, DNSE_FULL_HISTORY_FROM, endTs ?? this.defaultEnd(), '1D');
  }

  /** The whole history of an index up to `endTs` (default: now plus one day). */
  fetchFullIndexHistory(symbol: string, endTs?: number): Promise<ProviderResult<JsonObject[]>> {
    return this.fetchIndexOhlcv(symbol, DNSE_FULL_HISTORY_FROM, endTs ?? this.defaultEnd(), '1D');
  }

  private defaultEnd(): number {
    return Math.floor(Date.now() / 1000) + 86_400;
  }

  private async fetchChart(
    kind: DnseKind,
    symbol: string,
    startTs: number,
    endTs: number,
    interval: string,
  ): Promise<ProviderResult<JsonObject[]>> {
    if (interval !== '1D') {
      throw new MarketTransportError(`DNSE provider only supports the 1D interval, got ${interval}`);
    }
    const code = symbol.trim();
    if (!/^[A-Za-z0-9._-]{1,16}$/.test(code)) {
      throw new MarketTransportError('DNSE provider received an invalid symbol');
    }
    const endpoint = `${DNSE_CHART_BASE}/${kind}`;
    const url = new URL(endpoint);
    url.searchParams.set('from', String(Math.max(0, Math.floor(startTs))));
    url.searchParams.set('to', String(Math.floor(endTs)));
    url.searchParams.set('symbol', code.toUpperCase());
    url.searchParams.set('resolution', '1D');
    // A full history is a few hundred KB: allow more time than the 12 s default and do not keep
    // the payload in the shared 15 s cache (builders read each symbol once).
    const raw = await this.http.requestJson<unknown>(
      url.toString(),
      { headers: { Accept: 'application/json' } },
      { timeoutMs: 25_000, cacheTtlMs: 0 },
    );
    const body = isObject(raw) ? raw : {};
    const times = arrayOrEmpty(body.t);
    const [opens, highs, lows, closes, volumes] = ['o', 'h', 'l', 'c', 'v'].map((key) =>
      arrayOrEmpty(body[key]),
    );
    return {
      data: times.map((time, index) => ({
        time,
        open: opens?.[index] ?? 0,
        high: highs?.[index] ?? 0,
        low: lows?.[index] ?? 0,
        close: closes?.[index] ?? 0,
        volume: volumes?.[index] ?? 0,
      })),
      rawEndpoint: endpoint,
    };
  }
}
