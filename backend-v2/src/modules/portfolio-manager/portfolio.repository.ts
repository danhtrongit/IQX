import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import { MarketDataService, VciMarketProvider } from '../market-data/index.js';
import type { PortfolioInput, PortfolioPricePoint, PortfolioReport } from './portfolio.types.js';
import { toHolding, toTrade } from './portfolio.math.js';

const PRICE_STALE_AFTER_DAYS = 7;

function json(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return value as Record<string, unknown>;
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value: unknown): number | null {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}

function timestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(String(value))) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return null;
    return raw < 10_000_000_000 ? raw * 1000 : raw;
  }
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

type HoldingMarketData = {
  history: PortfolioPricePoint[];
  historySource: string | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  fundamentalsSource: string | null;
};

@Injectable()
export class PortfolioRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly market: MarketDataService,
    private readonly vci: VciMarketProvider,
  ) {}

  async accountId(userId: string): Promise<string> {
    const accounts = await this.database.query<{ id: string }>(
      `select id from virtual_trading_accounts where user_id=$1 limit 1`,
      [userId],
    );
    if (!accounts[0]) this.accountMissing();
    return String(accounts[0]!.id);
  }

  async input(userId: string): Promise<PortfolioInput> {
    const accounts = await this.database.query(
      `select * from virtual_trading_accounts where user_id=$1 limit 1`,
      [userId],
    );
    const account = accounts[0];
    if (!account) this.accountMissing();
    const positions = await this.database.query(
      `select p.*, s.current_price_vnd, s.last_synced_at,
              coalesce(s.icb_lv2,s.icb_lv1,'Khác') sector
       from virtual_positions p
       left join symbols s on s.symbol=p.symbol
       where p.account_id=$1 and p.quantity_total>0
       order by p.symbol`,
      [account.id],
    );
    const orders = await this.database.query(
      `select symbol,side,quantity,filled_price_vnd,limit_price_vnd,created_at
       from virtual_orders
       where account_id=$1 and status='filled'
       order by created_at`,
      [account.id],
    );
    const asOf = new Date().toISOString().slice(0, 10);
    const startDate = new Date(`${asOf}T00:00:00.000Z`);
    startDate.setUTCDate(startDate.getUTCDate() - 400);
    const start = startDate.toISOString().slice(0, 10);
    const marketData = await Promise.all(
      positions.map((row) => this.loadHoldingMarketData(String(row.symbol), start, asOf)),
    );
    const holdings = positions.map((row, index) => {
      const loaded = marketData[index]!;
      const latestBar = loaded.history.at(-1);
      const databasePrice = positive(row.current_price_vnd);
      const databaseTimestamp = timestamp(row.last_synced_at);
      const dailyPrice = latestBar?.close ?? null;
      const dailyTimestamp = latestBar?.timestampMs ?? null;
      const useDatabase =
        databasePrice !== null &&
        databaseTimestamp !== null &&
        (dailyTimestamp === null || databaseTimestamp >= dailyTimestamp);
      const selectedPrice = useDatabase ? databasePrice : dailyPrice;
      const selectedTimestamp = useDatabase ? databaseTimestamp : dailyTimestamp;
      if (selectedPrice === null || selectedTimestamp === null) {
        throw new ServiceUnavailableException({
          code: 'PORTFOLIO_VALUATION_UNAVAILABLE',
          message: `Không có giá định giá kèm thời điểm hợp lệ cho ${String(row.symbol)}`,
        });
      }
      const priceAsOf = new Date(selectedTimestamp).toISOString();
      const ageDays =
        (new Date(`${asOf}T23:59:59.999Z`).getTime() - selectedTimestamp) / 86_400_000;
      return toHolding({
        ...row,
        current_price_vnd: Math.trunc(selectedPrice),
        __history: loaded.history,
        __price_source: useDatabase ? 'symbol_snapshot' : 'daily_close',
        __price_as_of: priceAsOf,
        __price_age_days: Math.max(0, ageDays),
        __price_stale: ageDays > PRICE_STALE_AFTER_DAYS,
        __pe: loaded.pe,
        __pb: loaded.pb,
        __roe: loaded.roe,
        __fundamentals_source: loaded.fundamentalsSource,
      });
    });
    const benchmarkHistory = positions.length
      ? await this.market
          .getOhlcv('VNINDEX', { start, end: asOf, interval: '1D' })
          .then((response) => this.normalizeBars(response.data))
          .catch(() => [])
      : [];
    const cashAvailable = BigInt(String(account.cash_available_vnd ?? 0));
    const cashReserved = BigInt(String(account.cash_reserved_vnd ?? 0));
    const cashPending = BigInt(String(account.cash_pending_vnd ?? 0));
    const cash = cashAvailable + cashReserved + cashPending;
    const nav = cash + holdings.reduce((sum, holding) => sum + holding.marketValueVnd, 0n);
    return {
      accountId: String(account.id),
      navVnd: nav,
      cashVnd: cash,
      cashAvailableVnd: cashAvailable,
      cashReservedVnd: cashReserved,
      cashPendingVnd: cashPending,
      holdings,
      trades: orders.map(toTrade),
      benchmarkHistory,
      asOf,
    };
  }

  private async loadHoldingMarketData(
    symbol: string,
    start: string,
    asOf: string,
  ): Promise<HoldingMarketData> {
    const [historyResult, fundamentalsResult] = await Promise.allSettled([
      this.market.getOhlcv(symbol.toUpperCase(), { start, end: asOf, interval: '1D' }),
      this.vci.fetchFinancialReport(symbol.toUpperCase(), 'ratio', { period: 'Y', termType: 1 }),
    ]);
    const history =
      historyResult.status === 'fulfilled' ? this.normalizeBars(historyResult.value.data) : [];
    const historySource =
      historyResult.status === 'fulfilled' ? historyResult.value.meta.source : null;
    if (fundamentalsResult.status !== 'fulfilled') {
      return {
        history,
        historySource,
        pe: null,
        pb: null,
        roe: null,
        fundamentalsSource: null,
      };
    }
    const rows = Array.isArray(fundamentalsResult.value.data)
      ? fundamentalsResult.value.data.filter(
          (row): row is Record<string, unknown> => row !== null && typeof row === 'object',
        )
      : [];
    const newest = rows[0] ?? {};
    const roe = this.pick(newest, ['roe', 'roea', 'roe_ratio', 'return_on_equity']);
    return {
      history,
      historySource,
      pe: this.pick(newest, ['pe', 'price_to_earning', 'pe_ratio']),
      pb: this.pick(newest, ['pb', 'price_to_book', 'pb_ratio']),
      roe: roe !== null && Math.abs(roe) > 1.5 ? roe / 100 : roe,
      fundamentalsSource: fundamentalsResult.value.rawEndpoint,
    };
  }

  private pick(row: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
      if (!(key in row) || row[key] === null) continue;
      const value = finite(row[key]);
      if (value !== null) return value;
    }
    return null;
  }

  private normalizeBars(value: unknown): PortfolioPricePoint[] {
    const rows = Array.isArray(value)
      ? value
      : value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)
        ? (value as { data: unknown[] }).data
        : [];
    const byDate = new Map<string, PortfolioPricePoint>();
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const item = row as Record<string, unknown>;
      const close = positive(item.close ?? item.close_price ?? item.closePrice ?? item.c);
      const time = timestamp(
        item.time ?? item.timestamp ?? item.trading_date ?? item.tradingDate ?? item.date,
      );
      if (close === null || time === null) continue;
      const date = new Date(time).toISOString().slice(0, 10);
      const point = {
        date,
        timestampMs: time,
        close,
        volume: Math.max(0, finite(item.volume ?? item.total_match_volume ?? item.v) ?? 0),
      };
      const previous = byDate.get(date);
      if (!previous || previous.timestampMs <= point.timestampMs) byDate.set(date, point);
    }
    return [...byDate.values()]
      .sort((left, right) => left.timestampMs - right.timestampMs)
      .slice(-253);
  }

  private accountMissing(): never {
    throw new NotFoundException({
      code: 'TRADING_ACCOUNT_NOT_FOUND',
      message: 'Bạn chưa kích hoạt tài khoản giao dịch ảo.',
    });
  }

  async latest(accountId: string): Promise<PortfolioReport | null> {
    const rows = await this.database.query(
      `select analysis_json,narrative_json,valid,model_used,session_date,period_number
       from portfolio_reports
       where account_id=$1
       order by session_date desc
       limit 1`,
      [accountId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      analysis: json(row.analysis_json) ?? {},
      narrative: json(row.narrative_json),
      meta: {
        valid: Boolean(row.valid),
        cached: true,
        persisted: true,
        model: row.model_used ?? '',
        session_date: String(row.session_date).slice(0, 10),
        period_number: Number(row.period_number ?? 1),
      },
    };
  }

  async forDate(accountId: string, date: string): Promise<PortfolioReport | null> {
    const rows = await this.database.query(
      `select analysis_json,narrative_json,valid,model_used,session_date,period_number
       from portfolio_reports
       where account_id=$1 and session_date=$2
       limit 1`,
      [accountId, date],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      analysis: json(row.analysis_json) ?? {},
      narrative: json(row.narrative_json),
      meta: {
        valid: Boolean(row.valid),
        cached: true,
        persisted: true,
        model: row.model_used ?? '',
        session_date: date,
        period_number: Number(row.period_number ?? 1),
      },
    };
  }

  async save(
    accountId: string,
    date: string,
    analysis: Record<string, unknown>,
    narrative: Record<string, unknown> | null,
    model: string,
    valid: boolean,
  ): Promise<void> {
    await this.database.transaction(async (tx: SqlClient) => {
      await tx.query(
        `insert into portfolio_reports
          (id,account_id,session_date,period_number,mode,analysis_json,narrative_json,scores,
           recommended_actions,watch_conditions,holdings_snapshot,model_used,generation_time_ms,
           valid,created_at,updated_at)
         values ($1,$2,$3,1,$4,$5::jsonb,$6::jsonb,$7::jsonb,'[]','[]',$8::jsonb,$9,null,$10,now(),now())
         on conflict (account_id,session_date) do update set
           analysis_json=excluded.analysis_json,narrative_json=excluded.narrative_json,
           model_used=excluded.model_used,valid=excluded.valid,updated_at=now()`,
        [
          randomUUID(),
          accountId,
          date,
          String((analysis.meta as Record<string, unknown>)?.mode ?? 'full_changed'),
          JSON.stringify(analysis),
          JSON.stringify(narrative),
          JSON.stringify(analysis.scores ?? {}),
          JSON.stringify((analysis.overview as Record<string, unknown>)?.positions ?? []),
          model,
          valid,
        ],
      );
    });
  }
}
