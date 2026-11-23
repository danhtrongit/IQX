/**
 * Shared cached Vietnam trading calendar service for market-overview aggregators.
 *
 * Loads market holidays from `virtual_trading_configs` (cached 1 hour in
 * `MarketOverviewCache`) and merges them with the static `VN_HOLIDAYS` fallback
 * from `reports/market-calendar.ts`.
 */
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../platform/database/database.service.js';
import { VN_HOLIDAYS } from '../../reports/market-calendar.js';
import { MarketOverviewCache } from '../market-overview.cache.js';
import { normalizeIsoDate } from './derivatives-calendar.js';

const HOLIDAYS_CACHE_KEY = 'vn_market_holidays';
const HOLIDAYS_CACHE_TTL_MS = 60 * 60_000;

@Injectable()
export class VnTradingCalendarService {
  constructor(
    private readonly database: DatabaseService,
    private readonly cache: MarketOverviewCache,
  ) {}

  async getHolidays(): Promise<ReadonlySet<string>> {
    const cached = await this.cache.getOrFetch(
      HOLIDAYS_CACHE_KEY,
      async () => {
        const merged = new Set<string>(VN_HOLIDAYS);
        try {
          if (!this.database.isConfigured()) return merged;
          const rows = await this.database.query<{ holidays: unknown }>(
            `SELECT holidays
               FROM virtual_trading_configs
              WHERE is_active = true
              ORDER BY updated_at DESC
              LIMIT 1`,
          );
          const raw = rows[0]?.holidays;
          const parsed =
            typeof raw === 'string' ? (JSON.parse(raw) as unknown) : Array.isArray(raw) ? raw : [];
          if (Array.isArray(parsed)) {
            for (const entry of parsed) {
              if (typeof entry === 'string') {
                const iso = normalizeIsoDate(entry);
                if (iso) merged.add(iso);
              }
            }
          }
        } catch {
          // Fall back cleanly to static VN_HOLIDAYS.
        }
        return merged;
      },
      { ttlMs: HOLIDAYS_CACHE_TTL_MS },
    );
    return cached.value;
  }
}
