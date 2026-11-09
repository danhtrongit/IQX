/**
 * Truy cập dữ liệu của mẫu nến tính sẵn trong kho Flashback (Candle Dojo v1.3, migration 0046):
 * `fb_dataset_patterns`, `fb_dataset_pattern_runs`, `fb_dataset_raw`, `fb_match_cards`.
 *
 * Quy tắc:
 * - Chỉ thêm mới: không đọc hay ghi cột nào mà v2.2 chưa có ở `fb_dataset_bars`. Đọc `fb_dataset_symbols`,
 *   `fb_dataset_bars` và `symbols` (sàn niêm yết) chỉ để lấy đầu vào.
 * - Mỗi mã được ghi trong MỘT transaction: giá gốc (thay thế) và mẫu (thay thế theo
 *   `detector_version`). Chạy lại nhiều lần không tạo dòng trùng; một mã lỗi không để lại dữ liệu dở dang.
 * - Một phiên bản kho chỉ có một lần chạy `running` (chỉ mục duy nhất của CSDL); lần `done` mới nhất
 *   là lần được dùng lúc chơi.
 * - Ghi thẻ của ván (`recordCard`) kiểm tra quyền sở hữu thẻ (`cd_user_cards`, migration 0045), ghi
 *   `fb_match_cards` và `seen_at` bằng MỘT câu lệnh: người chưa có thẻ thì không ghi gì.
 */

import { Injectable } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/database.service.js';

export const FLASHBACK_PATTERNS_REPOSITORY = Symbol('FLASHBACK_PATTERNS_REPOSITORY');

export type PatternRunStatus = 'running' | 'done' | 'failed';
/** 'build' = bước 2b của kho mới, 'backfill' = CLI trên kho đang dùng, 'admin' = nút, 'detector' = bộ nhận diện mới. */
export type PatternRunTrigger = 'build' | 'backfill' | 'admin' | 'detector';
export type PatternExchange = 'HOSE' | 'HNX' | 'UPCOM';

export interface PatternRunFailure {
  readonly symbol: string;
  readonly reason: string;
}

/** Nhật ký một lần tính mẫu (`fb_dataset_pattern_runs.log`). */
export interface PatternRunLog {
  /** Mã lỗi: vẫn dùng cho ván chơi nhưng không có thẻ. */
  readonly failed?: readonly PatternRunFailure[];
  readonly raw?: {
    readonly source: string;
    readonly symbols_with_raw: number;
    readonly symbols_without_raw: number;
    /** Mã lấy giá gốc lỗi hoặc không có (đã dùng giá gốc lưu từ trước nếu có). */
    readonly errors: readonly PatternRunFailure[];
    /** Mã dùng lại giá gốc đã lưu vì lần lấy này lỗi. */
    readonly reused: readonly string[];
  };
  /** Số mẫu theo từng thẻ của cả lần chạy (chỉ thẻ có ít nhất một mẫu). */
  readonly cards?: Readonly<Record<string, number>>;
  /** Tổng số phiên không có giá gốc nên không xét 4 thẻ Việt Nam. */
  readonly missing_raw_sessions?: number;
  readonly sessions?: number;
  readonly timings?: { readonly duration_ms: number };
  readonly error?: string;
}

export interface PatternRunRow {
  readonly id: number;
  readonly version: number;
  readonly detectorVersion: number;
  readonly status: PatternRunStatus;
  readonly trigger: PatternRunTrigger;
  readonly requestedBy: string | null;
  readonly startedAt: Date;
  readonly heartbeatAt: Date;
  readonly finishedAt: Date | null;
  readonly symbolsDone: number;
  readonly symbolsTotal: number;
  readonly patternsCount: number;
  readonly log: PatternRunLog;
}

/** Một phiên của một mã đọc từ `fb_dataset_bars` (đã điều chỉnh) để tính mẫu. */
export interface PatternSeriesBar {
  readonly idx: number;
  readonly date: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly gapBefore: number;
  readonly bad: 0 | 1;
}

/** Giá gốc và giá tham chiếu của một phiên (đồng nguyên). */
export interface PatternRawRow {
  readonly idx: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly ref: number;
}

/** Mẫu kết thúc ở phiên `idx` (kết quả `pick`). */
export interface PatternRow {
  readonly idx: number;
  readonly date: string;
  readonly cardId: string;
  readonly cardN: number;
  readonly tier: number;
}

export interface PatternCountRow {
  readonly cardId: string;
  readonly tier: number;
  readonly count: number;
}

export interface PatternLookupFilter {
  readonly version: number;
  readonly detectorVersion: number;
  /** `null` = mọi mã. */
  readonly symbol: string | null;
  /** YYYY-MM-DD, gồm cả hai đầu. */
  readonly from: string;
  readonly to: string;
}

export interface MatchCardRow {
  readonly playIdx: number;
  readonly cardId: string;
  readonly cardN: number;
}

export interface NewRun {
  readonly version: number;
  readonly detectorVersion: number;
  readonly trigger: PatternRunTrigger;
  readonly requestedBy: string | null;
  readonly symbolsTotal: number;
}

export interface FinishRun {
  readonly status: 'done' | 'failed';
  readonly symbolsDone: number;
  readonly patternsCount: number;
  readonly log: PatternRunLog;
}

export abstract class FlashbackPatternsRepository {
  // ------------------------------------------------------------------ nhật ký chạy
  /** Đánh dấu `failed` các lần chạy `running` đã ngừng báo nhịp từ lâu. Trả số lần chạy bị đóng. */
  abstract failStaleRuns(staleMs: number): Promise<number>;
  /** Tạo dòng `running`; `null` nếu phiên bản này đang có một lần chạy khác. */
  abstract createRun(input: NewRun): Promise<PatternRunRow | null>;
  abstract touchRun(runId: number, progress: { symbolsDone: number; patternsCount: number }): Promise<void>;
  abstract finishRun(runId: number, input: FinishRun): Promise<void>;
  /** Lần chạy mới nhất của phiên bản (mọi trạng thái). */
  abstract latestRun(version: number): Promise<PatternRunRow | null>;
  /** Lần `done` mới nhất của phiên bản: lần được dùng lúc chơi. */
  abstract latestDoneRun(version: number): Promise<PatternRunRow | null>;

  // ------------------------------------------------------------------ đầu vào
  abstract okSymbols(version: number): Promise<string[]>;
  abstract loadSeries(version: number, symbol: string): Promise<PatternSeriesBar[]>;
  /** Giá gốc đã lưu của một mã (rỗng nếu chưa có). */
  abstract loadRaw(version: number, symbol: string): Promise<{ exchange: PatternExchange; rows: PatternRawRow[] }>;
  /** Sàn của từng mã (mặc định HOSE khi không rõ: rổ VN100 chỉ có mã HOSE). */
  abstract exchanges(symbols: readonly string[]): Promise<Map<string, PatternExchange>>;
  /**
   * Ghi kết quả của một mã trong một transaction: `raw` là `null` thì giữ nguyên giá gốc đang lưu,
   * ngược lại thay thế toàn bộ; mẫu của `(phiên bản, mã, detectorVersion)` được thay thế.
   */
  abstract saveSymbol(input: {
    version: number;
    symbol: string;
    detectorVersion: number;
    exchange: PatternExchange;
    raw: readonly PatternRawRow[] | null;
    patterns: readonly PatternRow[];
  }): Promise<void>;

  // ------------------------------------------------------------------ thống kê (quản trị)
  abstract countByCard(filter: PatternLookupFilter): Promise<PatternCountRow[]>;
  abstract overview(version: number, detectorVersion: number): Promise<PatternCountRow[]>;
  /** Số mã và số phiên có giá gốc của phiên bản. */
  abstract rawCoverage(version: number): Promise<{ symbols: number; sessions: number }>;

  // ------------------------------------------------------------------ lúc chơi
  abstract patternAt(
    version: number,
    symbol: string,
    idx: number,
    detectorVersion: number,
  ): Promise<{ cardId: string; cardN: number } | null>;
  /**
   * Nếu người chơi sở hữu thẻ: ghi `fb_match_cards` (một dòng mỗi phiên) và `seen_at` lần đầu, trả
   * `true`. Không sở hữu: không ghi gì, trả `false`.
   */
  abstract recordCard(input: {
    matchId: string;
    userId: string;
    playIdx: number;
    cardId: string;
    cardN: number;
  }): Promise<boolean>;
  /** Thẻ đã hiện cho người chơi trong ván, từ Phiên 1 tới `upToPlayIdx`, tăng dần. */
  abstract matchCards(matchId: string, userId: string, upToPlayIdx: number): Promise<MatchCardRow[]>;
}

// ------------------------------------------------------------------ Postgres

type Row = Record<string, unknown>;

const toInt = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new RangeError('Giá trị số không hợp lệ');
  return Math.trunc(parsed);
};
const toDate = (value: unknown): Date => (value instanceof Date ? value : new Date(String(value)));
const toDateOrNull = (value: unknown): Date | null =>
  value === null || value === undefined ? null : toDate(value);

/** Số dòng mỗi câu lệnh ghi (giữ mỗi câu lệnh dưới giới hạn thời gian của pool). */
const INSERT_CHUNK = 1_000;

const RUN_COLUMNS = `id, version, detector_version, status, trigger_kind, requested_by, started_at,
  heartbeat_at, finished_at, symbols_done, symbols_total, patterns_count, log`;

function mapRun(row: Row): PatternRunRow {
  return {
    id: toInt(row.id),
    version: toInt(row.version),
    detectorVersion: toInt(row.detector_version),
    status: String(row.status) as PatternRunStatus,
    trigger: String(row.trigger_kind) as PatternRunTrigger,
    requestedBy: row.requested_by === null || row.requested_by === undefined ? null : String(row.requested_by),
    startedAt: toDate(row.started_at),
    heartbeatAt: toDate(row.heartbeat_at),
    finishedAt: toDateOrNull(row.finished_at),
    symbolsDone: toInt(row.symbols_done),
    symbolsTotal: toInt(row.symbols_total),
    patternsCount: toInt(row.patterns_count),
    log: (typeof row.log === 'object' && row.log !== null ? row.log : {}) as PatternRunLog,
  };
}

/** Sàn của `symbols.exchange` (nhiều cách viết) về ba giá trị của `fb_dataset_raw.exchange`. */
export function normalizeExchange(value: unknown): PatternExchange {
  const text = String(value ?? '')
    .trim()
    .toUpperCase();
  if (text === 'HNX' || text === 'HASTC') return 'HNX';
  if (text === 'UPCOM') return 'UPCOM';
  return 'HOSE';
}

const mapCount = (row: Row): PatternCountRow => ({
  cardId: String(row.card_id),
  tier: toInt(row.tier),
  count: toInt(row.n),
});

@Injectable()
export class PgFlashbackPatternsRepository extends FlashbackPatternsRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async failStaleRuns(staleMs: number): Promise<number> {
    const rows = await this.database.query<Row>(
      `update fb_dataset_pattern_runs
          set status = 'failed', finished_at = now(),
              log = coalesce(log, '{}'::jsonb) || jsonb_build_object(
                'error', 'Lần tính mẫu nến bị ngắt giữa chừng (tiến trình dừng, không còn báo nhịp)')
        where status = 'running'
          and heartbeat_at < now() - make_interval(secs => $1::double precision)
        returning id`,
      [staleMs / 1000],
    );
    return rows.length;
  }

  async createRun(input: NewRun): Promise<PatternRunRow | null> {
    const rows = await this.database.query<Row>(
      `insert into fb_dataset_pattern_runs
         (version, detector_version, status, trigger_kind, requested_by, symbols_total)
       values ($1, $2, 'running', $3, $4, $5)
       on conflict do nothing
       returning ${RUN_COLUMNS}`,
      [input.version, input.detectorVersion, input.trigger, input.requestedBy, input.symbolsTotal],
    );
    return rows[0] ? mapRun(rows[0]) : null;
  }

  async touchRun(runId: number, progress: { symbolsDone: number; patternsCount: number }): Promise<void> {
    await this.database.query(
      `update fb_dataset_pattern_runs
          set symbols_done = $2, patterns_count = $3, heartbeat_at = now()
        where id = $1 and status = 'running'`,
      [runId, progress.symbolsDone, progress.patternsCount],
    );
  }

  async finishRun(runId: number, input: FinishRun): Promise<void> {
    await this.database.query(
      `update fb_dataset_pattern_runs
          set status = $2, finished_at = now(), heartbeat_at = now(), symbols_done = $3,
              patterns_count = $4, log = $5::jsonb
        where id = $1`,
      [runId, input.status, input.symbolsDone, input.patternsCount, JSON.stringify(input.log)],
    );
  }

  async latestRun(version: number): Promise<PatternRunRow | null> {
    const rows = await this.database.query<Row>(
      `select ${RUN_COLUMNS} from fb_dataset_pattern_runs
        where version = $1 order by id desc limit 1`,
      [version],
    );
    return rows[0] ? mapRun(rows[0]) : null;
  }

  async latestDoneRun(version: number): Promise<PatternRunRow | null> {
    const rows = await this.database.query<Row>(
      `select ${RUN_COLUMNS} from fb_dataset_pattern_runs
        where version = $1 and status = 'done'
        order by finished_at desc nulls last, id desc limit 1`,
      [version],
    );
    return rows[0] ? mapRun(rows[0]) : null;
  }

  async okSymbols(version: number): Promise<string[]> {
    const rows = await this.database.query<{ symbol: string }>(
      `select symbol from fb_dataset_symbols where version = $1 and status = 'ok' order by symbol`,
      [version],
    );
    return rows.map((row) => String(row.symbol));
  }

  async loadSeries(version: number, symbol: string): Promise<PatternSeriesBar[]> {
    const rows = await this.database.query<Row>(
      `select idx, date, open, high, low, close, gap_before, bad from fb_dataset_bars
        where version = $1 and symbol = $2 order by idx`,
      [version, symbol],
    );
    return rows.map((row) => ({
      idx: toInt(row.idx),
      date: String(row.date).slice(0, 10),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      gapBefore: toInt(row.gap_before),
      bad: toInt(row.bad) === 1 ? 1 : 0,
    }));
  }

  async loadRaw(
    version: number,
    symbol: string,
  ): Promise<{ exchange: PatternExchange; rows: PatternRawRow[] }> {
    const rows = await this.database.query<Row>(
      `select idx, open_raw, high_raw, low_raw, close_raw, ref_price, exchange from fb_dataset_raw
        where version = $1 and symbol = $2 order by idx`,
      [version, symbol],
    );
    return {
      exchange: normalizeExchange(rows[0]?.exchange),
      rows: rows.map((row) => ({
        idx: toInt(row.idx),
        open: Number(row.open_raw),
        high: Number(row.high_raw),
        low: Number(row.low_raw),
        close: Number(row.close_raw),
        ref: Number(row.ref_price),
      })),
    };
  }

  async exchanges(symbols: readonly string[]): Promise<Map<string, PatternExchange>> {
    const out = new Map<string, PatternExchange>();
    if (symbols.length === 0) return out;
    const rows = await this.database.query<Row>(
      `select upper(symbol) as symbol, exchange from symbols where upper(symbol) = any($1::text[])`,
      [symbols.map((symbol) => symbol.toUpperCase())],
    );
    for (const row of rows) out.set(String(row.symbol), normalizeExchange(row.exchange));
    return out;
  }

  async saveSymbol(input: {
    version: number;
    symbol: string;
    detectorVersion: number;
    exchange: PatternExchange;
    raw: readonly PatternRawRow[] | null;
    patterns: readonly PatternRow[];
  }): Promise<void> {
    await this.database.transaction(async (tx) => {
      if (input.raw !== null) {
        await tx.query(`delete from fb_dataset_raw where version = $1 and symbol = $2`, [
          input.version,
          input.symbol,
        ]);
        await this.insertRaw(tx, input, input.raw);
      }
      await tx.query(
        `delete from fb_dataset_patterns where version = $1 and symbol = $2 and detector_version = $3`,
        [input.version, input.symbol, input.detectorVersion],
      );
      for (let from = 0; from < input.patterns.length; from += INSERT_CHUNK) {
        const chunk = input.patterns.slice(from, from + INSERT_CHUNK);
        await tx.query(
          `insert into fb_dataset_patterns (version, symbol, idx, date, card_id, card_n, tier, detector_version)
           select $1, $2, t.idx, t.date, t.card_id, t.card_n, t.tier, $3
             from unnest($4::int[], $5::date[], $6::text[], $7::smallint[], $8::smallint[])
               as t(idx, date, card_id, card_n, tier)`,
          [
            input.version,
            input.symbol,
            input.detectorVersion,
            chunk.map((row) => row.idx),
            chunk.map((row) => row.date),
            chunk.map((row) => row.cardId),
            chunk.map((row) => row.cardN),
            chunk.map((row) => row.tier),
          ],
        );
      }
    });
  }

  private async insertRaw(
    tx: SqlClient,
    input: { version: number; symbol: string; exchange: PatternExchange },
    rows: readonly PatternRawRow[],
  ): Promise<void> {
    for (let from = 0; from < rows.length; from += INSERT_CHUNK) {
      const chunk = rows.slice(from, from + INSERT_CHUNK);
      await tx.query(
        `insert into fb_dataset_raw
           (version, symbol, idx, open_raw, high_raw, low_raw, close_raw, ref_price, exchange)
         select $1, $2, t.idx, t.o, t.h, t.l, t.c, t.ref, $3
           from unnest($4::int[], $5::bigint[], $6::bigint[], $7::bigint[], $8::bigint[], $9::bigint[])
             as t(idx, o, h, l, c, ref)`,
        [
          input.version,
          input.symbol,
          input.exchange,
          chunk.map((row) => row.idx),
          chunk.map((row) => row.open),
          chunk.map((row) => row.high),
          chunk.map((row) => row.low),
          chunk.map((row) => row.close),
          chunk.map((row) => row.ref),
        ],
      );
    }
  }

  async countByCard(filter: PatternLookupFilter): Promise<PatternCountRow[]> {
    const rows = await this.database.query<Row>(
      `select card_id, tier, count(*)::int as n from fb_dataset_patterns
        where version = $1 and detector_version = $2
          and ($3::text is null or symbol = $3)
          and date between $4::date and $5::date
        group by card_id, tier order by tier, n desc, card_id`,
      [filter.version, filter.detectorVersion, filter.symbol, filter.from, filter.to],
    );
    return rows.map(mapCount);
  }

  async overview(version: number, detectorVersion: number): Promise<PatternCountRow[]> {
    const rows = await this.database.query<Row>(
      `select card_id, tier, count(*)::int as n from fb_dataset_patterns
        where version = $1 and detector_version = $2
        group by card_id, tier order by tier, n desc, card_id`,
      [version, detectorVersion],
    );
    return rows.map(mapCount);
  }

  async rawCoverage(version: number): Promise<{ symbols: number; sessions: number }> {
    const rows = await this.database.query<Row>(
      `select count(distinct symbol)::int as symbols, count(*)::int as sessions
         from fb_dataset_raw where version = $1`,
      [version],
    );
    return { symbols: toInt(rows[0]?.symbols ?? 0), sessions: toInt(rows[0]?.sessions ?? 0) };
  }

  async patternAt(
    version: number,
    symbol: string,
    idx: number,
    detectorVersion: number,
  ): Promise<{ cardId: string; cardN: number } | null> {
    const rows = await this.database.query<Row>(
      `select card_id, card_n from fb_dataset_patterns
        where version = $1 and symbol = $2 and idx = $3 and detector_version = $4`,
      [version, symbol, idx, detectorVersion],
    );
    return rows[0] ? { cardId: String(rows[0].card_id), cardN: toInt(rows[0].card_n) } : null;
  }

  async recordCard(input: {
    matchId: string;
    userId: string;
    playIdx: number;
    cardId: string;
    cardN: number;
  }): Promise<boolean> {
    // Một câu lệnh: các CTE ghi chạy dù không được tham chiếu; `owned` rỗng thì hai CTE kia không ghi gì.
    const rows = await this.database.query<Row>(
      `with owned as (
         select 1 from cd_user_cards where user_id = $1::uuid and card_id = $2
       ), recorded as (
         insert into fb_match_cards (match_id, user_id, play_idx, card_id, card_n)
         select $3::uuid, $1::uuid, $4::int, $2, $5::smallint from owned
         on conflict (match_id, user_id, play_idx) do nothing
         returning 1
       ), seen as (
         update cd_user_cards set seen_at = now()
          where user_id = $1::uuid and card_id = $2 and seen_at is null
         returning 1
       )
       select (select count(*) from owned)::int as owned`,
      [input.userId, input.cardId, input.matchId, input.playIdx, input.cardN],
    );
    return toInt(rows[0]?.owned ?? 0) > 0;
  }

  async matchCards(matchId: string, userId: string, upToPlayIdx: number): Promise<MatchCardRow[]> {
    const rows = await this.database.query<Row>(
      `select play_idx, card_id, card_n from fb_match_cards
        where match_id = $1::uuid and user_id = $2::uuid and play_idx <= $3
        order by play_idx`,
      [matchId, userId, upToPlayIdx],
    );
    return rows.map((row) => ({
      playIdx: toInt(row.play_idx),
      cardId: String(row.card_id),
      cardN: toInt(row.card_n),
    }));
  }
}
