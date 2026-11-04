import { Injectable } from '@nestjs/common';

import { MarketHttpTransport, MarketTransportError } from './http.transport.js';
import { isObject } from './provider.types.js';

const CHART = 'https://services.entrade.com.vn/chart-api/v2/ohlcs';

/**
 * One closed (or in-progress) daily bar from the DNSE chart API. Prices are in THOUSAND VND and
 * ADJUSTED for corporate actions; `volume` is in shares.
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

/**
 * DNSE (Entrade) chart API: ONE call returns the whole requested daily history of a stock or an
 * index, adjusted. Used by the daily-bars store behind the screener (Bộ lọc 4.0), not per request.
 */
@Injectable()
export class DnseMarketProvider {
  constructor(private readonly http: MarketHttpTransport) {}

  /** Daily bars of a stock (`kind = 'stock'`) or an index such as VNINDEX (`kind = 'index'`). */
  async fetchDailyBars(
    symbol: string,
    fromSeconds: number,
    toSeconds: number,
    kind: 'stock' | 'index' = 'stock',
  ): Promise<DnseDailyBars> {
    const url = new URL(`${CHART}/${kind}`);
    url.searchParams.set('from', String(Math.floor(fromSeconds)));
    url.searchParams.set('to', String(Math.floor(toSeconds)));
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('resolution', '1D');
    const raw = await this.http.requestJson<unknown>(
      url.toString(),
      {
        headers: {
          accept: 'application/json',
          'user-agent': 'Mozilla/5.0 (compatible; IQX/2.0)',
        },
      },
      { timeoutMs: 20_000 },
    );
    if (isObject(raw) && typeof raw.status === 'number' && raw.status >= 400)
      throw new MarketTransportError(
        `DNSE rejected ${symbol}: ${String(raw.message ?? raw.code ?? raw.status)}`,
        raw.status,
      );
    return { bars: parseDnseColumns(raw), rawEndpoint: `${CHART}/${kind}` };
  }
}
