import { Injectable } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import type { BulletinStatus, SlotNumber, TrackingExitReason } from './bulletin.constants.js';
import {
  EMPTY_LEVELS,
  LEVEL_KEYS,
  type BulletinChecks,
  type BulletinHistoryEntry,
  type BulletinRow,
  type IndexBar,
  type Levels,
  type MarketStats,
  type PublishedSummary,
  type SlotSnapshot,
  type TrackingRow,
} from './bulletin.types.js';

type Timestamp = Date | string | null;

type RawBulletin = {
  trade_date: string;
  status: BulletinStatus;
  data_ready_at: Timestamp;
  market_stats: MarketStats | null;
  trend: string;
  momentum: string;
  liquidity: string;
  levels: Partial<Record<string, unknown>> | null;
  checks: BulletinChecks | null;
  revision: number;
  published_revision: number | null;
  published_summary: PublishedSummary | null;
  published_hash: string | null;
  slots_locked: boolean;
  created_at: Date | string;
  published_by: string | null;
  published_at: Timestamp;
  updated_at: Timestamp;
  edited_at: Timestamp;
  edited_by: string | null;
  history: BulletinHistoryEntry[] | null;
};

const iso = (value: Timestamp): string | null =>
  value === null ? null : (value instanceof Date ? value : new Date(value)).toISOString();

const finiteOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function normalizeLevels(raw: unknown): Levels {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Levels = { ...EMPTY_LEVELS };
  for (const key of LEVEL_KEYS) out[key] = finiteOrNull(source[key]);
  return out;
}

export function toBulletinRow(raw: RawBulletin): BulletinRow {
  return {
    trade_date: String(raw.trade_date).slice(0, 10),
    status: raw.status,
    data_ready_at: iso(raw.data_ready_at),
    market_stats: raw.market_stats ?? null,
    trend: raw.trend,
    momentum: raw.momentum,
    liquidity: raw.liquidity,
    levels: normalizeLevels(raw.levels),
    checks: raw.checks ?? null,
    revision: Number(raw.revision),
    published_revision: raw.published_revision === null ? null : Number(raw.published_revision),
    published_summary: raw.published_summary ?? null,
    published_hash: raw.published_hash ? String(raw.published_hash).trim() : null,
    slots_locked: raw.slots_locked,
    created_at: iso(raw.created_at)!,
    published_by: raw.published_by,
    published_at: iso(raw.published_at),
    updated_at: iso(raw.updated_at),
    edited_at: iso(raw.edited_at),
    edited_by: raw.edited_by,
    history: Array.isArray(raw.history) ? raw.history : [],
  };
}

const BULLETIN_COLUMNS = `trade_date, status, data_ready_at, market_stats, trend, momentum, liquidity, levels,
       checks, revision, published_revision, published_summary, published_hash, slots_locked, created_at,
       published_by, published_at, updated_at, edited_at, edited_by, history`;

export type BulletinListItem = BulletinRow & { actor_name: string | null };

export type FileMeta = {
  trade_date: string;
  variant: 'desktop' | 'mobile';
  revision: number;
  file_name: string;
  byte_size: number;
  page_count: number;
  sha256: string;
};

export type StoredFile = FileMeta & { content: Buffer };

type RawSlot = {
  trade_date: string;
  slot: number;
  snapshot: SlotSnapshot;
};

type RawTracking = {
  id: string;
  symbol: string;
  slot: number;
  first_trade_date: string;
  entry_price_adj: string | number;
  source_trade_date: string;
  exit_trade_date: string | null;
  exit_reason: TrackingExitReason | null;
};

const toTracking = (raw: RawTracking): TrackingRow => ({
  id: raw.id,
  symbol: raw.symbol,
  slot: Number(raw.slot) as SlotNumber,
  first_trade_date: String(raw.first_trade_date).slice(0, 10),
  entry_price_adj: Number(raw.entry_price_adj),
  source_trade_date: String(raw.source_trade_date).slice(0, 10),
  exit_trade_date: raw.exit_trade_date ? String(raw.exit_trade_date).slice(0, 10) : null,
  exit_reason: raw.exit_reason,
});

/** Mọi câu SQL của bản tin (SQL thuần như các mô-đun khác); nhận `SqlClient` để chạy được trong giao dịch. */
@Injectable()
export class BulletinRepository {
  constructor(readonly database: DatabaseService) {}

  // ───────────── nến chỉ số ─────────────

  async upsertIndexBars(
    db: SqlClient,
    symbol: string,
    bars: readonly IndexBar[],
    source = 'DNSE',
  ): Promise<number> {
    if (!bars.length) return 0;
    const rows = await db.query<{ n: number }>(
      `with input as (
         select * from jsonb_to_recordset($2::jsonb)
           as t(d date, o numeric, h numeric, l numeric, c numeric, v numeric)
       ), written as (
         insert into market_index_bars (symbol, trade_date, open, high, low, close, volume, source, fetched_at)
         select $1, d, o, h, l, c, v, $3, now() from input
         on conflict (symbol, trade_date) do update
           set open = excluded.open, high = excluded.high, low = excluded.low, close = excluded.close,
               volume = excluded.volume, source = excluded.source, fetched_at = now()
         returning 1
       )
       select count(*)::int as n from written`,
      [
        symbol,
        JSON.stringify(
          bars.map((bar) => ({
            d: bar.date,
            o: bar.open,
            h: bar.high,
            l: bar.low,
            c: bar.close,
            v: bar.volume,
          })),
        ),
        source,
      ],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** Nến mới nhất tới `upTo` (gồm cả ngày đó), tăng dần theo ngày. */
  async loadIndexBars(
    db: SqlClient,
    symbol: string,
    upTo: string,
    limit: number,
  ): Promise<IndexBar[]> {
    const rows = await db.query<{
      trade_date: string;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>(
      `select trade_date, open, high, low, close, volume
         from market_index_bars
        where symbol = $1 and trade_date <= $2::date
        order by trade_date desc
        limit $3`,
      [symbol, upTo, limit],
    );
    return rows
      .map((row) => ({
        date: String(row.trade_date).slice(0, 10),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume),
      }))
      .reverse();
  }

  async latestIndexDate(db: SqlClient, symbol: string): Promise<string | null> {
    const [row] = await db.query<{ d: string | null }>(
      `select max(trade_date) as d from market_index_bars where symbol = $1`,
      [symbol],
    );
    return row?.d ? String(row.d).slice(0, 10) : null;
  }

  async pruneIndexBars(db: SqlClient, symbol: string, keep: number): Promise<void> {
    await db.query(
      `delete from market_index_bars
        where symbol = $1
          and trade_date < (select trade_date from market_index_bars where symbol = $1
                             order by trade_date desc offset $2 limit 1)`,
      [symbol, keep - 1],
    );
  }

  // ───────────── bản tin ─────────────

  async find(db: SqlClient, date: string, forUpdate = false): Promise<BulletinRow | null> {
    const [row] = await db.query<RawBulletin>(
      `select ${BULLETIN_COLUMNS} from market_bulletins where trade_date = $1::date${forUpdate ? ' for update' : ''}`,
      [date],
    );
    return row ? toBulletinRow(row) : null;
  }

  /** Tạo bản nháp nếu chưa có; trả true khi vừa tạo. */
  async ensureDraft(db: SqlClient, date: string): Promise<boolean> {
    const rows = await db.query<{ trade_date: string }>(
      `insert into market_bulletins (trade_date) values ($1::date)
       on conflict (trade_date) do nothing returning trade_date`,
      [date],
    );
    return rows.length > 0;
  }

  async list(db: SqlClient, since: string): Promise<BulletinListItem[]> {
    const rows = await db.query<RawBulletin & { actor_name: string | null }>(
      `select ${BULLETIN_COLUMNS.split(',')
        .map((column) => `b.${column.trim()}`)
        .join(', ')},
              coalesce(nullif(u.full_name, ''), u.email) as actor_name
         from market_bulletins b
         left join users u on u.id = coalesce(b.edited_by, b.published_by)
        where b.trade_date >= $1::date
        order by b.trade_date desc`,
      [since],
    );
    return rows.map((row) => ({ ...toBulletinRow(row), actor_name: row.actor_name }));
  }

  async setData(
    db: SqlClient,
    date: string,
    stats: MarketStats | null,
    readyAt: Date | null,
  ): Promise<void> {
    await db.query(
      `update market_bulletins
          set market_stats = $2::jsonb,
              data_ready_at = coalesce(data_ready_at, $3::timestamptz)
        where trade_date = $1::date`,
      [date, stats ? JSON.stringify(stats) : null, readyAt],
    );
  }

  async saveContent(
    db: SqlClient,
    date: string,
    content: { trend: string; momentum: string; liquidity: string; levels: Levels },
    editedBy: string,
  ): Promise<void> {
    await db.query(
      `update market_bulletins
          set trend = $2, momentum = $3, liquidity = $4, levels = $5::jsonb,
              edited_at = now(), edited_by = $6::uuid
        where trade_date = $1::date`,
      [
        date,
        content.trend,
        content.momentum,
        content.liquidity,
        JSON.stringify(content.levels),
        editedBy,
      ],
    );
  }

  async saveChecks(db: SqlClient, date: string, checks: BulletinChecks): Promise<void> {
    await db.query(`update market_bulletins set checks = $2::jsonb where trade_date = $1::date`, [
      date,
      JSON.stringify(checks),
    ]);
  }

  async markPublished(
    db: SqlClient,
    date: string,
    input: {
      revision: number;
      hash: string;
      summary: PublishedSummary;
      checks: BulletinChecks;
      by: string;
      first: boolean;
      history: BulletinHistoryEntry[];
    },
  ): Promise<void> {
    await db.query(
      `update market_bulletins
          set status = 'public',
              revision = $2,
              published_revision = $2,
              published_hash = $3,
              published_summary = $4::jsonb,
              checks = $5::jsonb,
              slots_locked = true,
              published_by = case when $7::boolean then $6::uuid else published_by end,
              published_at = case when $7::boolean then now() else published_at end,
              updated_at = case when $7::boolean then updated_at else now() end,
              history = $8::jsonb
        where trade_date = $1::date`,
      [
        date,
        input.revision,
        input.hash,
        JSON.stringify(input.summary),
        JSON.stringify(input.checks),
        input.by,
        input.first,
        JSON.stringify(input.history),
      ],
    );
  }

  async markUnpublished(
    db: SqlClient,
    date: string,
    history: BulletinHistoryEntry[],
  ): Promise<void> {
    await db.query(
      `update market_bulletins
          set status = 'unpublic', published_revision = null, slots_locked = false, history = $2::jsonb
        where trade_date = $1::date`,
      [date, JSON.stringify(history)],
    );
  }

  /** Bản tin quá hạn lưu: xoá cả file PDF và ô bộ lọc theo (ON DELETE CASCADE). */
  async deleteOlderThan(db: SqlClient, cutoff: string): Promise<string[]> {
    const rows = await db.query<{ trade_date: string }>(
      `delete from market_bulletins where trade_date < $1::date returning trade_date`,
      [cutoff],
    );
    return rows.map((row) => String(row.trade_date).slice(0, 10));
  }

  /**
   * Bản nháp trống của một ngày không có phiên (nghỉ lễ): chưa có số liệu, nhận định lẫn bộ lọc, trong khi đã có
   * phiên mới hơn chốt dữ liệu.
   */
  async deleteStaleEmptyDrafts(db: SqlClient, newerDataDate: string): Promise<string[]> {
    const rows = await db.query<{ trade_date: string }>(
      `delete from market_bulletins b
        where b.status = 'draft'
          and b.trade_date < $1::date
          and b.data_ready_at is null
          and b.trend = '' and b.momentum = '' and b.liquidity = ''
          and not exists (select 1 from market_bulletin_slots s where s.trade_date = b.trade_date)
        returning b.trade_date`,
      [newerDataDate],
    );
    return rows.map((row) => String(row.trade_date).slice(0, 10));
  }

  // ───────────── file PDF ─────────────

  async insertFile(db: SqlClient, file: StoredFile): Promise<void> {
    await db.query(
      `insert into market_bulletin_files
         (trade_date, variant, revision, file_name, sha256, byte_size, page_count, content)
       values ($1::date, $2, $3, $4, $5, $6, $7, $8)`,
      [
        file.trade_date,
        file.variant,
        file.revision,
        file.file_name,
        file.sha256,
        file.byte_size,
        file.page_count,
        file.content,
      ],
    );
  }

  async fileMetas(db: SqlClient, date: string, revision: number): Promise<FileMeta[]> {
    const rows = await db.query<FileMeta & { trade_date: string }>(
      `select trade_date, variant, revision, file_name, sha256, byte_size, page_count
         from market_bulletin_files where trade_date = $1::date and revision = $2 order by variant`,
      [date, revision],
    );
    return rows.map((row) => ({
      ...row,
      trade_date: String(row.trade_date).slice(0, 10),
      byte_size: Number(row.byte_size),
      page_count: Number(row.page_count),
      revision: Number(row.revision),
    }));
  }

  /** File chỉ được trả khi bản tin đang Public đúng revision đó. */
  async publicFile(
    date: string,
    variant: 'desktop' | 'mobile',
    revision: number,
  ): Promise<StoredFile | null> {
    const [row] = await this.database.query<StoredFile & { trade_date: string }>(
      `select f.trade_date, f.variant, f.revision, f.file_name, f.sha256, f.byte_size, f.page_count, f.content
         from market_bulletin_files f
         join market_bulletins b on b.trade_date = f.trade_date
        where f.trade_date = $1::date and f.variant = $2 and f.revision = $3
          and b.status = 'public' and b.published_revision = f.revision`,
      [date, variant, revision],
    );
    return row ? { ...row, trade_date: String(row.trade_date).slice(0, 10) } : null;
  }

  // ───────────── ô bộ lọc ─────────────

  async slots(db: SqlClient, date: string): Promise<Record<SlotNumber, SlotSnapshot | null>> {
    const rows = await db.query<RawSlot>(
      `select trade_date, slot, snapshot from market_bulletin_slots where trade_date = $1::date`,
      [date],
    );
    const out: Record<SlotNumber, SlotSnapshot | null> = { 1: null, 2: null, 3: null };
    for (const row of rows) out[Number(row.slot) as SlotNumber] = row.snapshot;
    return out;
  }

  async lastSlotName(db: SqlClient, slot: SlotNumber, before: string): Promise<string | null> {
    const [row] = await db.query<{ display_name: string }>(
      `select display_name from market_bulletin_slots
        where slot = $1 and trade_date < $2::date order by trade_date desc limit 1`,
      [slot, before],
    );
    return row?.display_name ?? null;
  }

  async upsertSlot(
    db: SqlClient,
    snapshot: SlotSnapshot,
    historyEntry: Record<string, unknown>,
  ): Promise<void> {
    await db.query(
      `insert into market_bulletin_slots
         (trade_date, slot, display_name, filter_id, filter_version, result_id, passed_count, snapshot,
          pushed_by, pushed_at, history)
       values ($1::date, $2, $3, $4::uuid, $5, $6::uuid, $7, $8::jsonb, $9::uuid, $10::timestamptz, $11::jsonb)
       on conflict (trade_date, slot) do update
         set display_name = excluded.display_name, filter_id = excluded.filter_id,
             filter_version = excluded.filter_version, result_id = excluded.result_id,
             passed_count = excluded.passed_count, snapshot = excluded.snapshot,
             pushed_by = excluded.pushed_by, pushed_at = excluded.pushed_at,
             history = market_bulletin_slots.history || $11::jsonb`,
      [
        snapshot.trade_date,
        snapshot.slot,
        snapshot.display_name,
        snapshot.filter_id,
        snapshot.filter_version,
        snapshot.result_id,
        snapshot.passed_count,
        JSON.stringify(snapshot),
        snapshot.pushed_by,
        snapshot.pushed_at,
        JSON.stringify([historyEntry]),
      ],
    );
  }

  // ───────────── theo dõi ─────────────

  async activeTracking(db: SqlClient, forUpdate = false): Promise<TrackingRow[]> {
    const rows = await db.query<RawTracking>(
      `select id, symbol, slot, first_trade_date, entry_price_adj, source_trade_date, exit_trade_date, exit_reason
         from market_tracking where exit_trade_date is null order by first_trade_date desc, symbol${forUpdate ? ' for update' : ''}`,
    );
    return rows.map(toTracking);
  }

  async insertTracking(
    db: SqlClient,
    row: {
      symbol: string;
      slot: SlotNumber;
      firstTradeDate: string;
      entryPrice: number;
      sourceTradeDate: string;
    },
  ): Promise<boolean> {
    const rows = await db.query<{ id: string }>(
      `insert into market_tracking (symbol, slot, first_trade_date, entry_price_adj, source_trade_date)
       values ($1, $2, $3::date, $4, $5::date)
       on conflict (symbol) where exit_trade_date is null do nothing
       returning id`,
      [row.symbol, row.slot, row.firstTradeDate, row.entryPrice, row.sourceTradeDate],
    );
    return rows.length > 0;
  }

  async exitTracking(
    db: SqlClient,
    id: string,
    exitDate: string,
    reason: TrackingExitReason,
  ): Promise<void> {
    await db.query(
      `update market_tracking
          set exit_trade_date = $2::date, exit_reason = $3, updated_at = now()
        where id = $1::uuid and exit_trade_date is null`,
      [id, exitDate, reason],
    );
  }

  async refreshEntryPrice(db: SqlClient, id: string, entryPrice: number): Promise<void> {
    await db.query(
      `update market_tracking set entry_price_adj = $2, updated_at = now()
        where id = $1::uuid and entry_price_adj <> $2`,
      [id, entryPrice],
    );
  }

  /** Các dòng đang theo dõi do bản tin này thêm vào (gỡ bản tin thì bỏ chúng). */
  async exitTrackingOfBulletin(
    db: SqlClient,
    sourceDate: string,
    exitDate: string,
  ): Promise<number> {
    const rows = await db.query<{ id: string }>(
      `update market_tracking
          set exit_trade_date = $2::date, exit_reason = 'unpublished', updated_at = now()
        where source_trade_date = $1::date and exit_trade_date is null
        returning id`,
      [sourceDate, exitDate],
    );
    return rows.length;
  }
}
