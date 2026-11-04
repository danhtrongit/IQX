import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import { DnseMarketProvider, type DnseDailyBar } from '../market-data/providers/dnse.provider.js';
import { daysBefore, isCompletedVietnamSession, vnToday } from './integration.utils.js';

/**
 * Daily bar store behind the screener (Bộ lọc 4.0, spec §9 step 1): the last closed sessions of
 * every listed stock, adjusted, in thousand VND. Filled after the close by job `market.daily-bars`
 * from one DNSE call per symbol; the screener only READS it, so a run never calls the provider
 * per symbol.
 */

/** Closed sessions kept per symbol (the Bot window below needs ~460; headroom for long periods). */
export const DAILY_BARS_RETAINED_SESSIONS = 520;
export const DAILY_BARS_SOURCE = 'DNSE';
/** Market index whose bar tells that a session is published (never suspended, unlike a stock). */
export const DAILY_BARS_BENCHMARK = 'VNINDEX';
const FETCH_CONCURRENCY = 6;
/** A symbol that failed or has no provider data is asked again after this long. */
const RETRY_AFTER_MS = 60 * 60_000;
/** Calendar days requested per symbol: comfortably more than the retained sessions. */
const HISTORY_DAYS = 820;
/** A session is "the" session T once this share of the stored symbols has its bar. */
export const SESSION_COVERAGE_RATIO = 0.85;

/**
 * Calendar days of history the Bot reads before a session (`QuantMarketDataAdapter`: `warmupSessions × 1.6 + 30`
 * with `warmupSessions = BOT_SHARED_CONFIG_WARMUP_SESSIONS = 400`). The screener evaluates on exactly this window so a
 * recursive indicator (EMA, Wilder) seeds on the same first bar as the Bot.
 */
export const BOT_BAR_WINDOW_SESSIONS = 400;
export const BOT_BAR_WINDOW_DAYS = Math.ceil(BOT_BAR_WINDOW_SESSIONS * 1.6) + 30;

export type DailyBarColumns = {
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
};

export type StoredColumns = { d: string[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] };

export type RefreshSummary = {
  requested: number;
  stored: number;
  no_data: number;
  failed: number;
  elapsed_ms: number;
  errors: string[];
};

export type EnsureFreshOutcome =
  | { status: 'up_to_date'; session: string }
  | { status: 'skipped'; reason: 'no_new_session' | 'benchmark_unavailable'; session: string | null }
  | { status: 'refreshed'; session: string; summary: RefreshSummary };

type CountRow = { last_date: Date | string; n: number | string };

const day = (value: Date | string): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

const isWeekend = (date: string): boolean => {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
};

/** Latest weekday whose session is closed at `now` (Bot readiness: 15:15 ICT). Holidays are unknown here. */
export function latestCompletedWeekday(now: Date): string {
  let date = vnToday(now);
  for (let guard = 0; guard < 10; guard += 1) {
    if (!isWeekend(date) && isCompletedVietnamSession(date, now)) return date;
    date = daysBefore(date, 1);
  }
  return date;
}

/** First calendar day of the Bot's history window for `session`. */
export function barWindowStart(session: string): string {
  return daysBefore(session, BOT_BAR_WINDOW_DAYS);
}

/** Same bar acceptance as `QuantMarketDataAdapter`: never fabricate or repair a bar. */
export function acceptBar(bar: DnseDailyBar): boolean {
  return (
    bar.open > 0 &&
    bar.high > 0 &&
    bar.low > 0 &&
    bar.close > 0 &&
    bar.volume >= 0 &&
    bar.high >= Math.max(bar.open, bar.close) &&
    bar.low <= Math.min(bar.open, bar.close)
  );
}

/** Validated, closed-sessions-only, newest `limit` bars as stored columns. */
export function toStoredColumns(
  bars: readonly DnseDailyBar[],
  now: Date,
  limit = DAILY_BARS_RETAINED_SESSIONS,
): StoredColumns {
  const accepted = bars
    .filter((bar) => acceptBar(bar) && isCompletedVietnamSession(bar.date, now))
    .slice(-limit);
  return {
    d: accepted.map((bar) => bar.date),
    o: accepted.map((bar) => bar.open),
    h: accepted.map((bar) => bar.high),
    l: accepted.map((bar) => bar.low),
    c: accepted.map((bar) => bar.close),
    v: accepted.map((bar) => bar.volume),
  };
}

/** Stored columns → bars up to `session`, inside the Bot window when `windowed`. */
export function barsUpTo(
  columns: StoredColumns,
  session: string,
  windowed = true,
): DailyBarColumns {
  const start = windowed ? barWindowStart(session) : '0000-00-00';
  const out: DailyBarColumns = { dates: [], open: [], high: [], low: [], close: [], volume: [] };
  for (let i = 0; i < columns.d.length; i += 1) {
    const date = columns.d[i]!;
    if (date > session) break;
    if (date < start) continue;
    out.dates.push(date);
    out.open.push(columns.o[i]!);
    out.high.push(columns.h[i]!);
    out.low.push(columns.l[i]!);
    out.close.push(columns.c[i]!);
    out.volume.push(columns.v[i]!);
  }
  return out;
}

/**
 * Session T from the distribution of the symbols' last stored date: the newest closed date that at
 * least `SESSION_COVERAGE_RATIO` of the stored symbols reached. A half-finished refresh therefore
 * never exposes a session only some symbols have.
 */
export function sessionFromCounts(
  counts: ReadonlyArray<{ date: string; symbols: number }>,
  now: Date,
  ratio = SESSION_COVERAGE_RATIO,
): { session: string; coverage: number; total: number } | null {
  const total = counts.reduce((sum, item) => sum + item.symbols, 0);
  if (total === 0) return null;
  const sorted = [...counts].sort((a, b) => b.date.localeCompare(a.date));
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.symbols;
    if (isCompletedVietnamSession(item.date, now) && cumulative >= ratio * total) {
      return { session: item.date, coverage: cumulative, total };
    }
  }
  return null;
}

@Injectable()
export class DailyBarsService {
  private readonly logger = new Logger(DailyBarsService.name);
  private refreshing: Promise<RefreshSummary> | null = null;
  /** Last attempt per symbol (epoch ms) for the retry back-off of `ensureFresh`. */
  private readonly attempts = new Map<string, number>();

  constructor(
    private readonly database: DatabaseService,
    private readonly dnse: DnseMarketProvider,
  ) {}

  /** Active listed stocks (the screener universe). */
  async activeStockSymbols(): Promise<string[]> {
    const rows = await this.database.query<{ symbol: string }>(
      `select upper(symbol) as symbol
         from symbols
        where is_active = true
          and coalesce(is_index, false) = false
          and lower(asset_type) = 'stock'
        order by upper(symbol)`,
    );
    return rows.map((row) => row.symbol);
  }

  /** The session T every screener run uses, from the stored bars; null while the store is empty. */
  async resolveSession(
    now = new Date(),
  ): Promise<{ session: string; coverage: number; total: number } | null> {
    const rows = await this.database.query<CountRow>(
      `select last_date, count(*)::int as n
         from market_daily_bars
        where last_date is not null
        group by last_date
        order by last_date desc
        limit 20`,
    );
    return sessionFromCounts(
      rows.map((row) => ({ date: day(row.last_date), symbols: Number(row.n) })),
      now,
    );
  }

  /** Stored columns of the symbols (no window): `symbol → columns`. */
  async loadColumns(symbols: readonly string[]): Promise<Map<string, StoredColumns>> {
    const out = new Map<string, StoredColumns>();
    if (!symbols.length) return out;
    const rows = await this.database.query<{ symbol: string; bars: StoredColumns }>(
      `select symbol, bars from market_daily_bars where symbol = any($1::text[])`,
      [symbols],
    );
    for (const row of rows) out.set(row.symbol, row.bars);
    return out;
  }

  /** Re-reads one symbol from DNSE and replaces its stored series (adjusted history may have changed). */
  async refreshSymbol(symbol: string, now = new Date()): Promise<'stored' | 'no_data'> {
    const to = Math.floor(now.getTime() / 1000);
    const from = to - HISTORY_DAYS * 86_400;
    const fetched = await this.dnse.fetchDailyBars(symbol, from, to, 'stock');
    const columns = toStoredColumns(fetched.bars, now);
    if (!columns.d.length) return 'no_data';
    await this.database.query(
      `insert into market_daily_bars
         (symbol, bars, bar_count, first_date, last_date, source, price_unit, adjusted, fetched_at)
       values ($1, $2::jsonb, $3, $4::date, $5::date, $6, 'thousand_vnd', true, $7)
       on conflict (symbol) do update set
         bars = excluded.bars, bar_count = excluded.bar_count, first_date = excluded.first_date,
         last_date = excluded.last_date, source = excluded.source, fetched_at = excluded.fetched_at`,
      [
        symbol,
        JSON.stringify(columns),
        columns.d.length,
        columns.d[0],
        columns.d.at(-1),
        DAILY_BARS_SOURCE,
        now,
      ],
    );
    return 'stored';
  }

  /** Re-reads `symbols` with bounded concurrency; one failing symbol never stops the rest. */
  async refreshSymbols(
    symbols: readonly string[],
    now = new Date(),
    concurrency = FETCH_CONCURRENCY,
  ): Promise<RefreshSummary> {
    const started = Date.now();
    const summary: RefreshSummary = {
      requested: symbols.length,
      stored: 0,
      no_data: 0,
      failed: 0,
      elapsed_ms: 0,
      errors: [],
    };
    let next = 0;
    const lanes = Array.from({ length: Math.min(concurrency, symbols.length) }, async () => {
      while (next < symbols.length) {
        const symbol = symbols[next]!;
        next += 1;
        try {
          const result = await this.refreshSymbol(symbol, now);
          if (result === 'stored') summary.stored += 1;
          else summary.no_data += 1;
        } catch (error) {
          summary.failed += 1;
          if (summary.errors.length < 5)
            summary.errors.push(
              `${symbol}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
      }
    });
    await Promise.all(lanes);
    summary.elapsed_ms = Date.now() - started;
    return summary;
  }

  /** Date of the newest closed bar of the benchmark index; null when the provider fails. */
  async benchmarkSession(now = new Date()): Promise<string | null> {
    try {
      const to = Math.floor(now.getTime() / 1000);
      const fetched = await this.dnse.fetchDailyBars(
        DAILY_BARS_BENCHMARK,
        to - 14 * 86_400,
        to,
        'index',
      );
      const closed = fetched.bars.filter((bar) => isCompletedVietnamSession(bar.date, now));
      return closed.at(-1)?.date ?? null;
    } catch (error) {
      this.logger.warn(
        `Daily bars benchmark unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Job body: idempotent and cheap when nothing is due. Refreshes only the symbols not fetched since
   * the target session closed (a suspended symbol is therefore asked once per session, not every
   * tick); a symbol that failed or has no data is not retried for an hour. Concurrent calls share
   * one refresh.
   */
  async ensureFresh(now = new Date()): Promise<EnsureFreshOutcome> {
    const current = await this.resolveSession(now);
    const expected = latestCompletedWeekday(now);
    let target: string;
    if (current && current.session >= expected) {
      target = current.session;
    } else {
      const benchmark = await this.benchmarkSession(now);
      if (!benchmark)
        return {
          status: 'skipped',
          reason: 'benchmark_unavailable',
          session: current?.session ?? null,
        };
      if (current && benchmark <= current.session)
        return { status: 'skipped', reason: 'no_new_session', session: current.session };
      target = benchmark;
    }
    const due = (await this.staleSymbols(target)).filter((symbol) => {
      const attempted = this.attempts.get(symbol);
      return attempted === undefined || now.getTime() - attempted >= RETRY_AFTER_MS;
    });
    if (!due.length) return { status: 'up_to_date', session: target };
    if (this.refreshing) {
      const summary = await this.refreshing;
      return { status: 'refreshed', session: target, summary };
    }
    for (const symbol of due) this.attempts.set(symbol, now.getTime());
    this.refreshing = this.refreshSymbols(due, now);
    try {
      const summary = await this.refreshing;
      this.logger.log(
        `Daily bars refreshed for ${target}: ${summary.stored}/${summary.requested} stored, ` +
          `${summary.no_data} without data, ${summary.failed} failed in ${summary.elapsed_ms} ms`,
      );
      return { status: 'refreshed', session: target, summary };
    } finally {
      this.refreshing = null;
    }
  }

  /** Symbols with no stored series or not fetched since the close of `session`. */
  private async staleSymbols(session: string): Promise<string[]> {
    const rows = await this.database.query<{ symbol: string }>(
      `select upper(s.symbol) as symbol
         from symbols s
         left join market_daily_bars b on b.symbol = upper(s.symbol)
        where s.is_active = true
          and coalesce(s.is_index, false) = false
          and lower(s.asset_type) = 'stock'
          and (b.symbol is null
               or b.fetched_at < (($1::date + time '15:15') at time zone 'Asia/Ho_Chi_Minh'))
        order by upper(s.symbol)`,
      [session],
    );
    return rows.map((row) => row.symbol);
  }
}
