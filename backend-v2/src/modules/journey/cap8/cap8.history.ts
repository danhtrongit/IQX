import { Injectable } from '@nestjs/common';

import { VciMarketProvider } from '../../market-data/providers/vci.provider.js';
import type { DailyClose } from './cap8.types.js';

function vnDate(value: unknown): string | null {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
    const epoch = Number(value);
    if (!Number.isFinite(epoch)) return null;
    // VCI returns epoch seconds; sessions are evaluated in Vietnam time.
    return new Date((epoch + 7 * 60 * 60) * 1000).toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

@Injectable()
export class Cap8PriceHistoryService {
  constructor(private readonly vci: VciMarketProvider) {}

  async dailyCloses(symbol: string): Promise<DailyClose[] | null> {
    try {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const startSeconds = nowSeconds - 730 * 86_400;
      const result = await this.vci.fetchOhlcv(symbol, startSeconds, nowSeconds, '1D');
      const byDay = new Map<string, number>();
      for (const row of result.data) {
        const day = vnDate(row.time);
        const close = Number(row.close);
        if (day && Number.isFinite(close) && close > 0) byDay.set(day, close);
      }
      const rows = [...byDay]
        .map(([day, close]) => ({ day, close }))
        .sort((a, b) => a.day.localeCompare(b.day));
      return rows.length ? rows : null;
    } catch {
      // Price history is evidence. Unavailable evidence is unknown, never safe.
      return null;
    }
  }
}
