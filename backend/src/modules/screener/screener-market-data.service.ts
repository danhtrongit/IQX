import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import {
  barsUpTo,
  DailyBarsService,
  type DailyBarColumns,
} from '../market-integration/daily-bars.service.js';
import { IndexMembershipService } from '../market-integration/index-membership.service.js';
import { daysBefore } from '../market-integration/integration.utils.js';
import { SCREENER_STATEMENT_GROUPS, type ScreenerBasket, type StatementGroup } from './screener.definition.js';
import type { UniverseRecord } from './screener.market.js';
import type { ScreenerMarketDataPort } from './screener.ports.js';

/** A basket snapshot older than this (days before T) is no longer taken as the constituents at T. */
const BASKET_MAX_AGE_DAYS = 45;
const BAR_CHUNK = 400;

type UniverseSql = {
  symbol: string;
  name: string | null;
  exchange: string | null;
  sector: string | null;
  statement_template: string | null;
  shares_outstanding: string | number | null;
};

/** Database-backed `ScreenerMarketDataPort`: symbols table, `market_daily_bars`, index membership snapshots. */
@Injectable()
export class ScreenerMarketDataService implements ScreenerMarketDataPort {
  readonly priceSource = 'DNSE';

  constructor(
    private readonly database: DatabaseService,
    private readonly dailyBars: DailyBarsService,
    private readonly membership: IndexMembershipService,
  ) {}

  async resolveSession(now: Date): Promise<string | null> {
    return (await this.dailyBars.resolveSession(now))?.session ?? null;
  }

  async universe(): Promise<UniverseRecord[]> {
    const rows = await this.database.query<UniverseSql>(
      `select upper(symbol) as symbol,
              coalesce(nullif(trim(name), ''), nullif(trim(short_name), '')) as name,
              case when upper(exchange) = 'HSX' then 'HOSE' else upper(exchange) end as exchange,
              coalesce(nullif(trim(icb_lv2), ''), nullif(trim(icb_lv1), '')) as sector,
              statement_template,
              shares_outstanding
         from symbols
        where is_active = true
          and coalesce(is_index, false) = false
          and lower(asset_type) = 'stock'
        order by upper(symbol)`,
    );
    return rows.map((row) => {
      const shares = row.shares_outstanding === null ? null : Number(row.shares_outstanding);
      return {
        symbol: row.symbol,
        name: row.name,
        exchange: row.exchange,
        sector: row.sector,
        group: (SCREENER_STATEMENT_GROUPS as readonly string[]).includes(row.statement_template ?? '')
          ? (row.statement_template as StatementGroup)
          : null,
        shares: shares !== null && Number.isFinite(shares) && shares > 0 ? shares : null,
      };
    });
  }

  async loadBars(
    symbols: readonly string[],
    session: string,
  ): Promise<Map<string, DailyBarColumns>> {
    const out = new Map<string, DailyBarColumns>();
    for (let start = 0; start < symbols.length; start += BAR_CHUNK) {
      const stored = await this.dailyBars.loadColumns(symbols.slice(start, start + BAR_CHUNK));
      for (const [symbol, columns] of stored) {
        const bars = barsUpTo(columns, session);
        if (bars.dates.length) out.set(symbol, bars);
      }
    }
    return out;
  }

  async basketMembers(
    baskets: readonly ScreenerBasket[],
    session: string,
    now: Date,
  ): Promise<Map<ScreenerBasket, Set<string> | null>> {
    const out = new Map<ScreenerBasket, Set<string> | null>();
    for (const code of baskets) {
      const snapshot =
        (await this.membership.ensureForSession(code, session, now)) ??
        (await this.membership.latestOnOrBefore(code, session));
      const fresh = snapshot && snapshot.session_date >= daysBefore(session, BASKET_MAX_AGE_DAYS);
      out.set(code, fresh ? new Set(snapshot.symbols) : null);
    }
    return out;
  }
}
