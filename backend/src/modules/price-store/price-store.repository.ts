/**
 * PostgreSQL access of the daily price store (migration 0058). Reads are columnar: one row per
 * symbol with comma-joined columns (`string_agg`), parsed into typed arrays, so a VN100 × 15 years
 * load never materialises one object per bar (D8).
 */

import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/database.service.js';
import { MARKET_INDEX_SYMBOL } from '../strategy-rules/constants.js';
import type { PriceSeriesBundle, SymbolSeries } from '../strategy-rules/contracts.js';
import { type StoreBar } from './price-store.logic.js';

export const PRICE_STORE_REPOSITORY = Symbol('PRICE_STORE_REPOSITORY');

export type StoreSymbolRow = {
  symbol: string;
  kind: 'stock' | 'index';
  source: string;
  first_date: string | null;
  last_date: string | null;
  bars_count: number;
  series_rev: number;
  series_hash: string | null;
  refreshed_at: Date | null;
  last_error: string | null;
};

export type SymbolWrite = {
  symbol: string;
  kind: 'stock' | 'index';
  source: string;
  upserts: readonly StoreBar[];
  bump_rev: boolean;
  series_hash: string;
  refreshed_at: Date;
};

/** Load in chunks so each statement stays far below the 3 s production statement timeout. */
const LOAD_CHUNK = 15;

const isoDate = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

function parseColumn(text: string | null, length: number): Float64Array {
  const out = new Float64Array(length);
  if (!text) return out;
  let start = 0;
  let index = 0;
  for (let i = 0; i <= text.length && index < length; i += 1) {
    if (i === text.length || text.charCodeAt(i) === 44) {
      out[index] = Number(text.slice(start, i));
      index += 1;
      start = i + 1;
    }
  }
  return out;
}

export interface PriceStoreRepository {
  symbols(client?: SqlClient): Promise<StoreSymbolRow[]>;
  symbol(symbol: string, client?: SqlClient): Promise<StoreSymbolRow | null>;
  bars(symbol: string, client?: SqlClient): Promise<StoreBar[]>;
  writeSymbol(write: SymbolWrite): Promise<StoreSymbolRow>;
  markError(
    symbol: string,
    kind: 'stock' | 'index',
    source: string,
    error: string,
    at: Date,
  ): Promise<void>;
  calendar(until?: string): Promise<string[]>;
  latestMembership(indexCode: string): Promise<{ session_date: string; symbols: string[] } | null>;
  membershipAt(
    indexCode: string,
    session: string,
  ): Promise<{ session_date: string; symbols: string[] } | null>;
  openPositionSymbols(): Promise<string[]>;
  loadSeries(symbols: readonly string[], until: string | null): Promise<PriceSeriesBundle>;
}

@Injectable()
export class PgPriceStoreRepository implements PriceStoreRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private row(raw: Record<string, unknown>): StoreSymbolRow {
    return {
      symbol: String(raw.symbol),
      kind: raw.kind === 'index' ? 'index' : 'stock',
      source: String(raw.source),
      first_date: isoDate(raw.first_date),
      last_date: isoDate(raw.last_date),
      bars_count: Number(raw.bars_count ?? 0),
      series_rev: Number(raw.series_rev ?? 1),
      series_hash:
        raw.series_hash === null || raw.series_hash === undefined ? null : String(raw.series_hash),
      refreshed_at:
        raw.refreshed_at instanceof Date
          ? raw.refreshed_at
          : raw.refreshed_at
            ? new Date(String(raw.refreshed_at))
            : null,
      last_error:
        raw.last_error === null || raw.last_error === undefined ? null : String(raw.last_error),
    };
  }

  async symbols(client: SqlClient = this.database): Promise<StoreSymbolRow[]> {
    const rows = await client.query(
      `select symbol, kind, source, first_date::text, last_date::text, bars_count, series_rev,
              series_hash, refreshed_at, last_error
         from strategy_price_symbols order by symbol`,
    );
    return rows.map((raw) => this.row(raw));
  }

  async symbol(symbol: string, client: SqlClient = this.database): Promise<StoreSymbolRow | null> {
    const rows = await client.query(
      `select symbol, kind, source, first_date::text, last_date::text, bars_count, series_rev,
              series_hash, refreshed_at, last_error
         from strategy_price_symbols where symbol = $1`,
      [symbol],
    );
    return rows[0] ? this.row(rows[0]) : null;
  }

  async bars(symbol: string, client: SqlClient = this.database): Promise<StoreBar[]> {
    const rows = await client.query<{
      date: string;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
      value_vnd: string;
      close_idx: string | null;
    }>(
      `select date::text as date, open, high, low, close, volume, value_vnd, close_idx
         from strategy_price_bars where symbol = $1 order by date`,
      [symbol],
    );
    return rows.map((row) => ({
      date: row.date,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      value_vnd: Number(row.value_vnd),
      close_idx: row.close_idx === null ? null : Number(row.close_idx),
    }));
  }

  /**
   * One transaction per symbol: upsert new/changed bars (never deletes), recompute the symbol row
   * from the stored bars, bump `series_rev` when an older bar changed.
   */
  async writeSymbol(write: SymbolWrite): Promise<StoreSymbolRow> {
    return this.database.transaction(async (tx) => {
      await tx.query(
        `insert into strategy_price_symbols (symbol, kind, source, price_unit, adjusted)
         values ($1, $2, $3, $4, $5)
         on conflict (symbol) do nothing`,
        [
          write.symbol,
          write.kind,
          write.source,
          write.kind === 'index' ? 'POINT' : 'VND',
          write.kind === 'stock',
        ],
      );
      await tx.query('select symbol from strategy_price_symbols where symbol = $1 for update', [
        write.symbol,
      ]);
      const upserts = write.upserts;
      for (let offset = 0; offset < upserts.length; offset += 2_000) {
        const chunk = upserts.slice(offset, offset + 2_000);
        await tx.query(
          `insert into strategy_price_bars (symbol, date, open, high, low, close, volume, value_vnd, close_idx)
           select $1, d, o, h, l, c, v, val, ci
             from unnest($2::date[], $3::bigint[], $4::bigint[], $5::bigint[], $6::bigint[], $7::bigint[],
                         $8::bigint[], $9::numeric[]) as t(d, o, h, l, c, v, val, ci)
           on conflict (symbol, date) do update set
             open = excluded.open, high = excluded.high, low = excluded.low, close = excluded.close,
             volume = excluded.volume, value_vnd = excluded.value_vnd, close_idx = excluded.close_idx`,
          [
            write.symbol,
            chunk.map((bar) => bar.date),
            chunk.map((bar) => String(Math.round(bar.open))),
            chunk.map((bar) => String(Math.round(bar.high))),
            chunk.map((bar) => String(Math.round(bar.low))),
            chunk.map((bar) => String(Math.round(bar.close))),
            chunk.map((bar) => String(Math.round(bar.volume))),
            chunk.map((bar) => String(Math.round(bar.value_vnd))),
            chunk.map((bar) => (bar.close_idx === null ? null : bar.close_idx.toFixed(2))),
          ],
        );
      }
      const rows = await tx.query(
        `update strategy_price_symbols s set
            source = $2,
            first_date = agg.first_date,
            last_date = agg.last_date,
            bars_count = agg.n,
            series_rev = s.series_rev + case when $3::boolean then 1 else 0 end,
            series_hash = $4,
            refreshed_at = $5,
            last_error = null,
            last_error_at = null
           from (select min(date) as first_date, max(date) as last_date, count(*)::int as n
                   from strategy_price_bars where symbol = $1) agg
          where s.symbol = $1
          returning s.symbol, s.kind, s.source, s.first_date::text, s.last_date::text, s.bars_count,
                    s.series_rev, s.series_hash, s.refreshed_at, s.last_error`,
        [write.symbol, write.source, write.bump_rev, write.series_hash, write.refreshed_at],
      );
      return this.row(rows[0]!);
    });
  }

  async markError(
    symbol: string,
    kind: 'stock' | 'index',
    source: string,
    error: string,
    at: Date,
  ): Promise<void> {
    await this.database.query(
      `insert into strategy_price_symbols (symbol, kind, source, price_unit, adjusted, last_error, last_error_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (symbol) do update set last_error = excluded.last_error, last_error_at = excluded.last_error_at`,
      [
        symbol,
        kind,
        source,
        kind === 'index' ? 'POINT' : 'VND',
        kind === 'stock',
        error.slice(0, 500),
        at,
      ],
    );
  }

  async calendar(until?: string): Promise<string[]> {
    const rows = await this.database.query<{ dates: string | null }>(
      `select string_agg(date::text, ',' order by date) as dates
         from strategy_price_bars where symbol = $1 and ($2::date is null or date <= $2::date)`,
      [MARKET_INDEX_SYMBOL, until ?? null],
    );
    const text = rows[0]?.dates;
    return text ? text.split(',') : [];
  }

  async latestMembership(
    indexCode: string,
  ): Promise<{ session_date: string; symbols: string[] } | null> {
    const rows = await this.database.query<{ session_date: string; symbols: string[] }>(
      `select session_date::text as session_date, symbols from index_membership_snapshots
        where index_code = $1 order by session_date desc limit 1`,
      [indexCode],
    );
    return rows[0] ?? null;
  }

  async membershipAt(
    indexCode: string,
    session: string,
  ): Promise<{ session_date: string; symbols: string[] } | null> {
    const rows = await this.database.query<{ session_date: string; symbols: string[] }>(
      `select session_date::text as session_date, symbols from index_membership_snapshots
        where index_code = $1 and session_date <= $2::date order by session_date desc limit 1`,
      [indexCode, session],
    );
    return rows[0] ?? null;
  }

  async openPositionSymbols(): Promise<string[]> {
    const rows = await this.database.query<{ symbol: string }>(
      `select distinct symbol from bot_positions where status = 'open' order by symbol`,
    );
    return rows.map((row) => row.symbol);
  }

  /** Columnar series of `symbols` (+ VNINDEX) up to `until` (inclusive; null = everything). */
  async loadSeries(symbols: readonly string[], until: string | null): Promise<PriceSeriesBundle> {
    const calendar = await this.calendar(until ?? undefined);
    const position = new Map(calendar.map((date, index) => [date, index]));
    const wanted = [
      ...new Set([...symbols.map((s) => s.trim().toUpperCase()), MARKET_INDEX_SYMBOL]),
    ].sort();
    const out: Record<string, SymbolSeries> = {};
    let market: Float64Array | null = null;
    const hash = createHash('sha256').update(
      `until:${until ?? ''}|cal:${calendar.length}:${calendar.at(-1) ?? ''}`,
    );
    for (let offset = 0; offset < wanted.length; offset += LOAD_CHUNK) {
      const chunk = wanted.slice(offset, offset + LOAD_CHUNK);
      const rows = await this.database.query<{
        symbol: string;
        series_rev: number;
        series_hash: string | null;
        n: number;
        dates: string | null;
        o: string | null;
        h: string | null;
        l: string | null;
        c: string | null;
        v: string | null;
        ci: string | null;
      }>(
        `select s.symbol, s.series_rev, s.series_hash, count(b.date)::int as n,
                string_agg(b.date::text, ',' order by b.date) as dates,
                string_agg(b.open::text, ',' order by b.date) as o,
                string_agg(b.high::text, ',' order by b.date) as h,
                string_agg(b.low::text, ',' order by b.date) as l,
                string_agg(b.close::text, ',' order by b.date) as c,
                string_agg(b.volume::text, ',' order by b.date) as v,
                string_agg(coalesce(b.close_idx::text, ''), ',' order by b.date) as ci
           from strategy_price_symbols s
           join strategy_price_bars b on b.symbol = s.symbol and ($2::date is null or b.date <= $2::date)
          where s.symbol = any($1::varchar[])
          group by s.symbol, s.series_rev, s.series_hash
          order by s.symbol`,
        [chunk, until],
      );
      for (const row of rows) {
        hash.update(`|${row.symbol}:${row.series_rev}:${row.series_hash ?? ''}:${row.n}`);
        const dates = row.dates ? row.dates.split(',') : [];
        if (row.symbol === MARKET_INDEX_SYMBOL) {
          market = new Float64Array(calendar.length).fill(Number.NaN);
          const closes = (row.ci ?? '').split(',');
          dates.forEach((date, i) => {
            const at = position.get(date);
            const value = Number(closes[i]);
            if (at !== undefined && closes[i] !== '' && Number.isFinite(value)) market![at] = value;
          });
          continue;
        }
        // Keep bars on market sessions only (a vendor bar on a non-session date is ignored).
        const keep: number[] = [];
        const idx: number[] = [];
        dates.forEach((date, i) => {
          const at = position.get(date);
          if (at !== undefined) {
            keep.push(i);
            idx.push(at);
          }
        });
        const columns = [row.o, row.h, row.l, row.c, row.v].map((text) =>
          parseColumn(text, dates.length),
        );
        const pick = (column: Float64Array) =>
          keep.length === dates.length ? column : Float64Array.from(keep, (i) => column[i]!);
        out[row.symbol] = {
          symbol: row.symbol,
          session_idx: Int32Array.from(idx),
          open: pick(columns[0]!),
          high: pick(columns[1]!),
          low: pick(columns[2]!),
          close: pick(columns[3]!),
          volume: pick(columns[4]!),
          series_rev: row.series_rev,
        };
      }
    }
    return {
      calendar,
      data_as_of: calendar.at(-1) ?? null,
      symbols: out,
      market,
      data_hash: hash.digest('hex'),
    };
  }
}
