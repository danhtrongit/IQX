import { Injectable } from '@nestjs/common';
import { MarketDataService } from '../market-data/index.js';
import type { OhlcvRecord } from './indicators.js';
import type { HistoricalBars, QuantMarketDataProvider } from './quant.types.js';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
function dateFromValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value))
    return new Date(value * 1000 + VN_OFFSET_MS).toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d+$/.test(value))
    return new Date(Number(value) * 1000 + VN_OFFSET_MS).toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}
function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

@Injectable()
export class QuantMarketDataAdapter implements QuantMarketDataProvider {
  constructor(private readonly market: MarketDataService) {}
  async getHistoricalOhlcv(
    symbol: string,
    start: string,
    end: string,
    options: { warmupSessions?: number; maxBars?: number } = {},
  ): Promise<HistoricalBars> {
    const startDate = new Date(`${start}T00:00:00Z`);
    startDate.setUTCDate(
      startDate.getUTCDate() - Math.ceil((options.warmupSessions ?? 0) * 1.6) - 30,
    );
    type OhlcvResponse = {
      data: ReadonlyArray<Record<string, unknown>>;
      meta: { source: string; source_priority: number };
    };
    type MarketApi = {
      getOhlcv?: (
        symbol: string,
        query: { start: string; end: string; interval: '1D' },
      ) => Promise<OhlcvResponse>;
      ohlcv?: (
        symbol: string,
        query: { start: string; end: string; interval: '1D' },
      ) => Promise<OhlcvResponse>;
    };
    const marketApi = this.market as unknown as MarketApi;
    const fetchOhlcv = marketApi.getOhlcv ?? marketApi.ohlcv;
    if (!fetchOhlcv) throw new Error('MarketDataService does not expose historical OHLCV');
    const fetched = await fetchOhlcv.call(marketApi, symbol, {
      start: startDate.toISOString().slice(0, 10),
      end,
      interval: '1D',
    });
    const byDate = new Map<string, OhlcvRecord>();
    let skippedRows = 0;
    for (const raw of fetched.data) {
      const time = dateFromValue(raw.time),
        open = finite(raw.open),
        high = finite(raw.high),
        low = finite(raw.low),
        close = finite(raw.close),
        volume = finite(raw.volume);
      // Never fabricate a bar by copying close into missing OHLC or zeroing
      // volume. A fabricated bar changes indicators and can create trades.
      if (
        !time ||
        time > end ||
        open == null ||
        high == null ||
        low == null ||
        close == null ||
        volume == null ||
        open <= 0 ||
        high <= 0 ||
        low <= 0 ||
        close <= 0 ||
        volume < 0 ||
        high < Math.max(open, close) ||
        low > Math.min(open, close)
      ) {
        skippedRows += 1;
        continue;
      }
      byDate.set(time, { time, open, high, low, close, volume });
    }
    let records = [...byDate.values()].sort((a, b) => a.time.localeCompare(b.time));
    const max = options.maxBars;
    if (max && records.length > max) records = records.slice(-max);
    const startIndex = records.findIndex((item) => item.time >= start);
    return {
      records,
      startIndex: startIndex < 0 ? records.length : startIndex,
      skippedRows,
      source: fetched.meta.source,
      sourcePriority: fetched.meta.source_priority,
      // The market provider currently exposes price history but does not
      // guarantee corporate-action-adjusted bars. Callers must not infer it.
      adjusted: false,
    };
  }
}
