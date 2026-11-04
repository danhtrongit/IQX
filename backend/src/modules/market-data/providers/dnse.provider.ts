import { Injectable } from '@nestjs/common';
import { MarketHttpTransport, MarketTransportError } from './http.transport.js';
import { isObject, type JsonObject, type ProviderResult } from './provider.types.js';

/** DNSE (Entrade) chart API. Public, no credentials. */
export const DNSE_CHART_BASE = 'https://services.entrade.com.vn/chart-api/v2/ohlcs';

/**
 * One closed (or in-progress) daily bar from the DNSE chart API, already tied to its trading date.
 * Prices are in THOUSAND VND and ADJUSTED for corporate actions; `volume` is in shares.
 */
export type DnseDailyBar = {
  /** Vietnam trading date (YYYY-MM-DD). */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type DnseDailyBars = { bars: DnseDailyBar[]; rawEndpoint: string };

const VN_OFFSET_SECONDS = 7 * 3600;

/** `t` is a unix second inside the Vietnam trading day (07:00 or 09:00 local); +7h gives its date. */
export function dnseDate(seconds: number): string {
  return new Date((seconds + VN_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10);
}

/** Pure parser of the `{t,o,h,l,c,v}` column payload; rows with a non-finite field are dropped. */
export function parseDnseColumns(raw: unknown): DnseDailyBar[] {
  if (!isObject(raw)) return [];
  const column = (key: string): unknown[] => (Array.isArray(raw[key]) ? raw[key] : []);
  const [t, o, h, l, c, v] = ['t', 'o', 'h', 'l', 'c', 'v'].map(column) as [
    unknown[],
    unknown[],
    unknown[],
    unknown[],
    unknown[],
    unknown[],
  ];
  const byDate = new Map<string, DnseDailyBar>();
  t.forEach((time, index) => {
    const seconds = Number(time);
    const bar = {
      open: Number(o[index]),
      high: Number(h[index]),
      low: Number(l[index]),
      close: Number(c[index]),
      volume: Number(v[index]),
    };
    if (!Number.isFinite(seconds) || Object.values(bar).some((value) => !Number.isFinite(value)))
      return;
    const date = dnseDate(seconds);
    byDate.set(date, { date, ...bar });
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

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
 *
 * `fetchDailyBars` is the same call parsed into trading dates; it feeds the daily-bars store behind
 * the screener (Bộ lọc 4.0), which reads one request per symbol after the close and never per run.
 */
@Injectable()
export class DnseMarketProvider {
  constructor(private readonly http: MarketHttpTransport) {}

  /** Daily bars of a stock (`kind = 'stock'`) or an index such as VNINDEX (`kind = 'index'`), by trading date. */
  async fetchDailyBars(
    symbol: string,
    fromSeconds: number,
    toSeconds: number,
    kind: DnseKind = 'stock',
  ): Promise<DnseDailyBars> {
    const endpoint = `${DNSE_CHART_BASE}/${kind}`;
    const url = new URL(endpoint);
    url.searchParams.set('from', String(Math.floor(fromSeconds)));
    url.searchParams.set('to', String(Math.floor(toSeconds)));
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('resolution', '1D');
    // One payload per symbol per refresh: keep it out of the shared 15 s cache.
    const raw = await this.http.requestJson<unknown>(
      url.toString(),
      {
        headers: {
          accept: 'application/json',
          'user-agent': 'Mozilla/5.0 (compatible; IQX/2.0)',
        },
      },
      { timeoutMs: 20_000, cacheTtlMs: 0 },
    );
    if (isObject(raw) && typeof raw.status === 'number' && raw.status >= 400)
      throw new MarketTransportError(
        `DNSE rejected ${symbol}: ${String(raw.message ?? raw.code ?? raw.status)}`,
        raw.status,
      );
    return { bars: parseDnseColumns(raw), rawEndpoint: endpoint };
  }

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
