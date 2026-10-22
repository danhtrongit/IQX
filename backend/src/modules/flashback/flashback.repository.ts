import { Injectable } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/database.service.js';
import type { FlashbackRoundStatus } from './flashback.constants.js';
import type {
  FlashbackBar,
  FlashbackEntryRow,
  FlashbackIndicatorInstance,
  FlashbackLeaderboardEntry,
  FlashbackLotRow,
  FlashbackOrderRow,
  FlashbackRoundRow,
} from './flashback.types.js';

type Row = Record<string, unknown>;

/** Token kho Flashback (để test thay bằng bản giả). */
export const FLASHBACK_REPOSITORY = Symbol('FLASHBACK_REPOSITORY');

/** Loại kind của ledger xu do Flashback ghi (migration 0028). */
export type FlashbackCoinLedgerKind = 'flashback_fee' | 'flashback_reward';

/** Trạng thái ví xu đọc dưới khoá. */
export interface FlashbackWalletState {
  readonly balance: number;
  readonly lastSeq: number;
}

/** Dòng ledger xu sẽ ghi. */
export interface FlashbackLedgerEntry {
  readonly userId: string;
  readonly seq: number;
  readonly kind: FlashbackCoinLedgerKind;
  readonly delta: number;
  readonly balanceAfter: number;
  readonly uniqueKey: string;
  readonly ref: Record<string, unknown>;
  readonly policyVersion: string;
}

/** Đề mới tạo. */
export interface NewFlashbackRound {
  readonly roundNo: number;
  readonly symbol: string;
  readonly startDate: string;
  readonly warmupBars: readonly FlashbackBar[];
  readonly bars: readonly FlashbackBar[];
  readonly scheduledOpenAt: Date;
  readonly fallbackLevel: number;
}

/** Lượt chơi mới. */
export interface NewFlashbackEntry {
  readonly roundId: string;
  readonly userId: string;
  readonly feeXu: number;
  readonly firstJoin: boolean;
  readonly cash: bigint;
  readonly initialCash: bigint;
}

/** Lệnh mới. */
export interface NewFlashbackOrder {
  readonly entryId: string;
  readonly side: 'buy' | 'sell';
  readonly qty: number;
  readonly price: bigint;
  readonly step: number;
  readonly amount: bigint;
  readonly fee: bigint;
  readonly tax: bigint;
  readonly idempotencyKey: string | null;
}

/** Lô cổ phiếu mới. */
export interface NewFlashbackLot {
  readonly entryId: string;
  readonly qty: number;
  readonly price: bigint;
  readonly step: number;
  readonly sellableStep: number;
}

/** Kết quả chốt lượt chơi. */
export interface FlashbackEntryFinish {
  readonly finalNav: bigint;
  readonly pnlPct: number;
  readonly maxDrawdown: number;
  readonly finishedAt: Date;
}

/**
 * Truy cập dữ liệu Flashback. Mọi ghi đều đi qua một transaction của caller nên khoá ví xu và
 * ràng buộc unique làm việc đúng khi hai request chạy song song.
 */
export abstract class FlashbackRepository {
  // ------------------------------------------------------------------ đề
  abstract openRound(db: SqlClient): Promise<FlashbackRoundRow | null>;
  abstract readyRound(db: SqlClient): Promise<FlashbackRoundRow | null>;
  abstract roundById(db: SqlClient, id: string): Promise<FlashbackRoundRow | null>;
  abstract listRounds(db: SqlClient, limit: number): Promise<FlashbackRoundRow[]>;
  abstract nextRoundNo(db: SqlClient): Promise<number>;
  abstract insertRound(tx: SqlClient, input: NewFlashbackRound): Promise<FlashbackRoundRow | null>;
  /** Chuyển trạng thái đề; chỉ đổi khi đề đang ở một trong `from`. */
  abstract transitionRound(
    tx: SqlClient,
    id: string,
    from: readonly FlashbackRoundStatus[],
    to: FlashbackRoundStatus,
    extra?: { opensAt?: Date; closesAt?: Date },
  ): Promise<FlashbackRoundRow | null>;
  /** Các đề đã tạo gần đây (dùng để loại mã lặp lại). */
  abstract recentRoundSymbols(db: SqlClient, limit: number): Promise<string[]>;
  /** Các khoảng 120 phiên đã dùng của một mã (để không chồng giai đoạn). */
  abstract roundWindowsBySymbol(
    db: SqlClient,
    symbol: string,
    limit: number,
  ): Promise<{ start: string; end: string }[]>;
  /** Ngày thật của 120 nến biểu đồ của các đề gần đây của một mã. */
  abstract roundChartDates(db: SqlClient, symbol: string, limit: number): Promise<string[][]>;
  /** Các đề đang ở một trạng thái (dùng cho job). */
  abstract roundsByStatus(db: SqlClient, status: FlashbackRoundStatus): Promise<FlashbackRoundRow[]>;
  /** Tăng bước chơi khi bước hiện tại vẫn là `fromStep` (chống gọi lại). */
  abstract advanceEntryStep(
    tx: SqlClient,
    id: string,
    fromStep: number,
    toStep: number,
  ): Promise<FlashbackEntryRow | null>;
  /** Lượt chơi của một đề kèm thông tin người chơi (tên, điều kiện nhận thưởng). */
  abstract leaderboardEntries(
    db: SqlClient,
    roundId: string,
  ): Promise<FlashbackLeaderboardEntry[]>;
  /** Thành viên nhóm của người dùng (theo trưởng nhóm); rỗng khi không có quan hệ. */
  abstract teamMemberIds(db: SqlClient, userId: string): Promise<string[]>;

  // ------------------------------------------------------------- lượt chơi
  abstract entryByRoundUser(
    db: SqlClient,
    roundId: string,
    userId: string,
  ): Promise<FlashbackEntryRow | null>;
  abstract entryById(db: SqlClient, id: string): Promise<FlashbackEntryRow | null>;
  abstract countEntriesByUser(db: SqlClient, userId: string): Promise<number>;
  abstract insertEntry(tx: SqlClient, input: NewFlashbackEntry): Promise<FlashbackEntryRow | null>;
  abstract updateEntryStep(tx: SqlClient, id: string, step: number): Promise<FlashbackEntryRow | null>;
  abstract updateEntryCash(
    tx: SqlClient,
    id: string,
    cash: bigint,
  ): Promise<FlashbackEntryRow | null>;
  abstract updateEntryIndicators(
    tx: SqlClient,
    id: string,
    indicators: readonly FlashbackIndicatorInstance[],
  ): Promise<FlashbackEntryRow | null>;
  abstract finishEntry(
    tx: SqlClient,
    id: string,
    result: FlashbackEntryFinish,
  ): Promise<FlashbackEntryRow | null>;
  abstract assignEntryRanking(
    tx: SqlClient,
    id: string,
    rank: number,
    rewardXu: number,
  ): Promise<FlashbackEntryRow | null>;
  abstract listEntriesByRound(db: SqlClient, roundId: string): Promise<FlashbackEntryRow[]>;
  abstract countEntriesByRound(db: SqlClient, roundId: string): Promise<number>;
  /** Tổng số cổ phiếu còn giữ của từng lượt chơi trong một đề. */
  abstract holdingsByRound(db: SqlClient, roundId: string): Promise<Map<string, number>>;

  // ------------------------------------------------------------------ lô
  abstract lotsByEntry(db: SqlClient, entryId: string): Promise<FlashbackLotRow[]>;
  abstract insertLot(tx: SqlClient, input: NewFlashbackLot): Promise<FlashbackLotRow>;
  /** Trừ số lượng còn lại của một lô; trả về false khi lô không đủ. */
  abstract consumeLot(tx: SqlClient, lotId: string, qty: number): Promise<boolean>;

  // --------------------------------------------------------------- lệnh
  abstract insertOrder(tx: SqlClient, input: NewFlashbackOrder): Promise<FlashbackOrderRow | null>;
  abstract ordersByEntry(db: SqlClient, entryId: string): Promise<FlashbackOrderRow[]>;
  abstract orderByIdempotencyKey(
    tx: SqlClient,
    entryId: string,
    key: string,
  ): Promise<FlashbackOrderRow | null>;

  // ------------------------------------------------------------------ ví
  abstract lockWallet(tx: SqlClient, userId: string): Promise<FlashbackWalletState>;
  abstract saveWallet(
    tx: SqlClient,
    userId: string,
    balance: number,
    lastSeq: number,
  ): Promise<void>;
  /** Ghi một dòng ledger xu; trả về false khi unique_key đã tồn tại. */
  abstract appendLedger(tx: SqlClient, entry: FlashbackLedgerEntry): Promise<boolean>;

  // -------------------------------------------------------------- cấu hình
  abstract getSetting(db: SqlClient, key: string): Promise<unknown>;
  abstract setSetting(tx: SqlClient, key: string, value: unknown): Promise<void>;

  // -------------------------------------------------------------- nhật ký
  abstract appendJobLog(
    tx: SqlClient,
    entry: {
      step: string;
      roundId: string | null;
      result: string;
      error: string | null;
      level?: FlashbackAlertLevel | null;
    },
  ): Promise<void>;
  abstract listJobLog(db: SqlClient, limit: number): Promise<FlashbackJobLogRow[]>;
  /** Đã có cảnh báo cùng mức độ cho đề này trong khoảng thời gian gần đây chưa. */
  abstract hasRecentAlert(
    db: SqlClient,
    roundId: string | null,
    level: FlashbackAlertLevel,
    withinMinutes: number,
  ): Promise<boolean>;

  // ------------------------------------------------------------------ VN30
  abstract listCurrentVn30(db: SqlClient): Promise<string[]>;
  abstract replaceVn30(
    tx: SqlClient,
    symbols: readonly string[],
    effectiveFrom: Date,
  ): Promise<void>;

  // -------------------------------------------------------------- khoá job
  async tryAcquireJobLock(_db: SqlClient): Promise<boolean> {
    return true;
  }

  async releaseJobLock(_db: SqlClient): Promise<void> {}

  async withJobLock<T>(
    dbOrFn: SqlClient | (() => Promise<T>),
    maybeFn?: () => Promise<T>,
  ): Promise<{ ran: boolean; result?: T }> {
    const fn = typeof dbOrFn === 'function' ? dbOrFn : maybeFn!;
    const db = typeof dbOrFn === 'function' ? ({} as SqlClient) : dbOrFn;
    const locked = await this.tryAcquireJobLock(db);
    if (!locked) return { ran: false };
    try {
      return { ran: true, result: await fn() };
    } finally {
      await this.releaseJobLock(db);
    }
  }
}

/** Mức độ cảnh báo (spec v1.2 §6.1). */
export type FlashbackAlertLevel = 'high' | 'medium' | 'low';

/** Nhãn tiếng Việt của mức độ cảnh báo. */
export const FLASHBACK_ALERT_LEVEL_LABELS: Record<FlashbackAlertLevel, string> = {
  high: 'Cao',
  medium: 'Trung bình',
  low: 'Thấp',
};

/** Một dòng nhật ký tác vụ. */
export interface FlashbackJobLogRow {
  readonly runAt: Date;
  readonly step: string;
  readonly roundId: string | null;
  readonly result: string;
  readonly error: string | null;
  readonly level: FlashbackAlertLevel | null;
}

const toInt = (value: unknown, field: string): number => {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new RangeError(`${field} is not a safe integer`);
  return result;
};

const toBigInt = (value: unknown, field: string): bigint => {
  if (typeof value === 'bigint') return value;
  const text = String(value ?? '0');
  if (!/^-?\d+$/.test(text)) throw new RangeError(`${field} is not an integer`);
  return BigInt(text);
};

const toDate = (value: unknown): Date =>
  value instanceof Date ? value : new Date(String(value));

const toBars = (value: unknown): FlashbackBar[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = (item ?? {}) as Row;
    return {
      d: String(row.d ?? ''),
      o: Number(row.o ?? 0),
      h: Number(row.h ?? 0),
      l: Number(row.l ?? 0),
      c: Number(row.c ?? 0),
      v: Number(row.v ?? 0),
    };
  });
};

const toParamValue = (value: unknown): number | { lower: number; upper: number } => {
  if (value !== null && typeof value === 'object') {
    const row = value as Row;
    return { lower: Number(row.lower ?? 0), upper: Number(row.upper ?? 0) };
  }
  return Number(value ?? 0);
};

const toIndicators = (value: unknown): FlashbackIndicatorInstance[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = (item ?? {}) as Row;
    const params = (row.params ?? {}) as Row;
    return {
      id: String(row.id ?? ''),
      params: Object.fromEntries(
        Object.entries(params).map(([key, raw]) => [key, toParamValue(raw)]),
      ),
    };
  });
};

const mapRound = (row: Row): FlashbackRoundRow => ({
  id: String(row.id),
  roundNo: toInt(row.round_no, 'round_no'),
  status: String(row.status) as FlashbackRoundStatus,
  symbol: String(row.symbol),
  startDate: String(row.start_date),
  warmupBars: toBars(row.warmup_bars),
  bars: toBars(row.bars),
  scheduledOpenAt: toDate(row.scheduled_open_at),
  opensAt: row.opens_at ? toDate(row.opens_at) : null,
  closesAt: row.closes_at ? toDate(row.closes_at) : null,
  fallbackLevel: toInt(row.fallback_level, 'fallback_level'),
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at),
});

const mapEntry = (row: Row): FlashbackEntryRow => ({
  id: String(row.id),
  roundId: String(row.round_id),
  userId: String(row.user_id),
  joinedAt: toDate(row.joined_at),
  feeXu: toInt(row.fee_xu, 'fee_xu'),
  firstJoin: row.first_join === true,
  indicatorParams: toIndicators(row.indicator_params),
  step: toInt(row.step, 'step'),
  cash: toBigInt(row.cash, 'cash'),
  initialCash: toBigInt(row.initial_cash, 'initial_cash'),
  finishedAt: row.finished_at ? toDate(row.finished_at) : null,
  finalNav: row.final_nav === null || row.final_nav === undefined ? null : toBigInt(row.final_nav, 'final_nav'),
  pnlPct: row.pnl_pct === null || row.pnl_pct === undefined ? null : Number(row.pnl_pct),
  maxDrawdown:
    row.max_drawdown === null || row.max_drawdown === undefined
      ? null
      : Number(row.max_drawdown),
  rank: row.rank === null || row.rank === undefined ? null : toInt(row.rank, 'rank'),
  rewardXu: toInt(row.reward_xu, 'reward_xu'),
  status: String(row.status) as 'playing' | 'finished',
});

const mapLot = (row: Row): FlashbackLotRow => ({
  id: String(row.id),
  entryId: String(row.entry_id),
  qty: toInt(row.qty, 'qty'),
  price: toBigInt(row.price, 'price'),
  step: toInt(row.step, 'step'),
  sellableStep: toInt(row.sellable_step, 'sellable_step'),
  createdAt: toDate(row.created_at),
});

const mapOrder = (row: Row): FlashbackOrderRow => ({
  id: String(row.id),
  entryId: String(row.entry_id),
  side: String(row.side) as 'buy' | 'sell',
  qty: toInt(row.qty, 'qty'),
  price: toBigInt(row.price, 'price'),
  step: toInt(row.step, 'step'),
  amount: toBigInt(row.amount, 'amount'),
  fee: toBigInt(row.fee, 'fee'),
  tax: toBigInt(row.tax, 'tax'),
  idempotencyKey: row.idempotency_key === null ? null : String(row.idempotency_key),
  createdAt: toDate(row.created_at),
});

const ROUND_COLUMNS = `id, round_no, status, symbol, start_date, warmup_bars, bars,
  scheduled_open_at, opens_at, closes_at, fallback_level, created_at, updated_at`;

const ENTRY_COLUMNS = `id, round_id, user_id, joined_at, fee_xu, first_join, indicator_params,
  step, cash, initial_cash, finished_at, final_nav, pnl_pct, max_drawdown, rank, reward_xu, status`;

const LOT_COLUMNS = `id, entry_id, qty, price, step, sellable_step, created_at`;

const ORDER_COLUMNS = `id, entry_id, side, qty, price, step, amount, fee, tax,
  idempotency_key, created_at`;

/** Hiện thực PostgreSQL của kho Flashback. */
@Injectable()
export class PgFlashbackRepository extends FlashbackRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async openRound(db: SqlClient): Promise<FlashbackRoundRow | null> {
    const rows = await db.query<Row>(
      `select ${ROUND_COLUMNS} from flashback_rounds where status = 'open' limit 1`,
    );
    return rows[0] ? mapRound(rows[0]) : null;
  }

  async readyRound(db: SqlClient): Promise<FlashbackRoundRow | null> {
    const rows = await db.query<Row>(
      `select ${ROUND_COLUMNS} from flashback_rounds where status = 'ready' limit 1`,
    );
    return rows[0] ? mapRound(rows[0]) : null;
  }

  async roundById(db: SqlClient, id: string): Promise<FlashbackRoundRow | null> {
    const rows = await db.query<Row>(
      `select ${ROUND_COLUMNS} from flashback_rounds where id = $1 limit 1`,
      [id],
    );
    return rows[0] ? mapRound(rows[0]) : null;
  }

  async listRounds(db: SqlClient, limit: number): Promise<FlashbackRoundRow[]> {
    const rows = await db.query<Row>(
      `select ${ROUND_COLUMNS} from flashback_rounds order by round_no desc limit $1`,
      [limit],
    );
    return rows.map(mapRound);
  }

  async nextRoundNo(db: SqlClient): Promise<number> {
    const rows = await db.query<{ next: string }>(
      `select coalesce(max(round_no), 0)::text as next from flashback_rounds`,
    );
    return toInt(rows[0]?.next ?? '0', 'round_no') + 1;
  }

  async insertRound(
    tx: SqlClient,
    input: NewFlashbackRound,
  ): Promise<FlashbackRoundRow | null> {
    try {
      const rows = await tx.query<Row>(
        `insert into flashback_rounds
           (round_no, status, symbol, start_date, warmup_bars, bars, scheduled_open_at, fallback_level)
         values ($1, 'ready', $2, $3, $4::jsonb, $5::jsonb, $6, $7)
         on conflict do nothing
         returning ${ROUND_COLUMNS}`,
        [
          input.roundNo,
          input.symbol,
          input.startDate,
          JSON.stringify(input.warmupBars),
          JSON.stringify(input.bars),
          input.scheduledOpenAt,
          input.fallbackLevel,
        ],
      );
      return rows[0] ? mapRound(rows[0]) : null;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        return null;
      }
      throw error;
    }
  }

  async transitionRound(
    tx: SqlClient,
    id: string,
    from: readonly FlashbackRoundStatus[],
    to: FlashbackRoundStatus,
    extra?: { opensAt?: Date; closesAt?: Date },
  ): Promise<FlashbackRoundRow | null> {
    try {
      const rows = await tx.query<Row>(
        `update flashback_rounds
            set status = $3,
                opens_at = coalesce($4::timestamptz, opens_at),
                closes_at = coalesce($5::timestamptz, closes_at),
                updated_at = now()
          where id = $1 and status = any($2::text[])
          returning ${ROUND_COLUMNS}`,
        [id, [...from], to, extra?.opensAt ?? null, extra?.closesAt ?? null],
      );
      return rows[0] ? mapRound(rows[0]) : null;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        return null;
      }
      throw error;
    }
  }

  async recentRoundSymbols(db: SqlClient, limit: number): Promise<string[]> {
    const rows = await db.query<{ symbol: string }>(
      `select distinct symbol
         from (
           select symbol
             from flashback_rounds
            order by round_no desc
            limit $1
         ) recent`,
      [limit],
    );
    return rows.map((row) => row.symbol);
  }

  async roundWindowsBySymbol(
    db: SqlClient,
    symbol: string,
    limit: number,
  ): Promise<{ start: string; end: string }[]> {
    const rows = await db.query<{ start: string; end: string }>(
      `select start_date::text as start,
              (select bars->-1->>'d' from flashback_rounds r2 where r2.id = r.id)::text as end
         from flashback_rounds r
        where symbol = $1
        order by round_no desc
        limit $2`,
      [symbol, limit],
    );
    return rows
      .map((row) => ({ start: row.start, end: row.end }))
      .filter((row) => row.start !== 'null' && row.end !== 'null');
  }

  async roundChartDates(db: SqlClient, symbol: string, limit: number): Promise<string[][]> {
    const rows = await db.query<{ bars: unknown }>(
      `select bars from flashback_rounds where symbol = $1 order by round_no desc limit $2`,
      [symbol, limit],
    );
    return rows.map((row) =>
      toBars(row.bars)
        .map((bar) => bar.d)
        .filter((date) => date.length > 0),
    );
  }

  async roundsByStatus(
    db: SqlClient,
    status: FlashbackRoundStatus,
  ): Promise<FlashbackRoundRow[]> {
    const rows = await db.query<Row>(
      `select ${ROUND_COLUMNS} from flashback_rounds where status = $1 order by round_no`,
      [status],
    );
    return rows.map(mapRound);
  }

  async advanceEntryStep(
    tx: SqlClient,
    id: string,
    fromStep: number,
    toStep: number,
  ): Promise<FlashbackEntryRow | null> {
    const rows = await tx.query<Row>(
      `update flashback_entries set step = $3 where id = $1 and step = $2 returning ${ENTRY_COLUMNS}`,
      [id, fromStep, toStep],
    );
    return rows[0] ? mapEntry(rows[0]) : null;
  }

  async leaderboardEntries(
    db: SqlClient,
    roundId: string,
  ): Promise<FlashbackLeaderboardEntry[]> {
    const rows = await db.query<Row>(
      `select e.id, e.round_id, e.user_id, e.joined_at, e.fee_xu, e.first_join, e.indicator_params,
              e.step, e.cash, e.initial_cash, e.finished_at, e.final_nav, e.pnl_pct, e.max_drawdown,
              e.rank, e.reward_xu, e.status,
              coalesce(u.username, u.email) as username,
              u.phone_verified_at, u.created_at as account_created_at,
              coalesce(u.phone_e164, u.phone_number) as phone_e164
         from flashback_entries e
         join users u on u.id = e.user_id
        where e.round_id = $1
        order by e.joined_at, e.id`,
      [roundId],
    );
    return rows.map((row) => ({
      ...mapEntry(row),
      username: String(row.username ?? ''),
      phoneVerified:
        row.phone_verified_at !== null && row.phone_verified_at !== undefined,
      accountCreatedAt: toDate(row.account_created_at),
      phoneE164:
        row.phone_e164 === null || row.phone_e164 === undefined ? null : String(row.phone_e164),
    }));
  }

  async teamMemberIds(db: SqlClient, userId: string): Promise<string[]> {
    const rows = await db.query<{ id: string }>(
      `with me as (select group_lead_id from users where id = $1),
            lead as (
              select coalesce(
                       (select group_lead_id from me),
                       (select user_id from team_lead_profiles where user_id = $1)
                     ) as lead_id
            )
        select u.id::text as id
          from users u, lead l
         where l.lead_id is not null
           and (u.group_lead_id = l.lead_id or u.id = l.lead_id)`,
      [userId],
    );
    return rows.map((row) => row.id);
  }

  async entryByRoundUser(
    db: SqlClient,
    roundId: string,
    userId: string,
  ): Promise<FlashbackEntryRow | null> {
    const rows = await db.query<Row>(
      `select ${ENTRY_COLUMNS} from flashback_entries
        where round_id = $1 and user_id = $2 limit 1`,
      [roundId, userId],
    );
    return rows[0] ? mapEntry(rows[0]) : null;
  }

  async entryById(db: SqlClient, id: string): Promise<FlashbackEntryRow | null> {
    const rows = await db.query<Row>(
      `select ${ENTRY_COLUMNS} from flashback_entries where id = $1 limit 1`,
      [id],
    );
    return rows[0] ? mapEntry(rows[0]) : null;
  }

  async countEntriesByUser(db: SqlClient, userId: string): Promise<number> {
    const rows = await db.query<{ total: string }>(
      `select count(*)::text as total from flashback_entries where user_id = $1`,
      [userId],
    );
    return toInt(rows[0]?.total ?? '0', 'total');
  }

  async insertEntry(
    tx: SqlClient,
    input: NewFlashbackEntry,
  ): Promise<FlashbackEntryRow | null> {
    const rows = await tx.query<Row>(
      `insert into flashback_entries
         (round_id, user_id, fee_xu, first_join, cash, initial_cash, indicator_params, step, status)
       values ($1, $2, $3, $4, $5, $6, '[]'::jsonb, 0, 'playing')
       on conflict (round_id, user_id) do nothing
       returning ${ENTRY_COLUMNS}`,
      [
        input.roundId,
        input.userId,
        input.feeXu,
        input.firstJoin,
        input.cash.toString(),
        input.initialCash.toString(),
      ],
    );
    return rows[0] ? mapEntry(rows[0]) : null;
  }

  async updateEntryStep(
    tx: SqlClient,
    id: string,
    step: number,
  ): Promise<FlashbackEntryRow | null> {
    const rows = await tx.query<Row>(
      `update flashback_entries set step = $2 where id = $1 returning ${ENTRY_COLUMNS}`,
      [id, step],
    );
    return rows[0] ? mapEntry(rows[0]) : null;
  }

  async updateEntryCash(
    tx: SqlClient,
    id: string,
    cash: bigint,
  ): Promise<FlashbackEntryRow | null> {
    const rows = await tx.query<Row>(
      `update flashback_entries set cash = $2 where id = $1 returning ${ENTRY_COLUMNS}`,
      [id, cash.toString()],
    );
    return rows[0] ? mapEntry(rows[0]) : null;
  }

  async updateEntryIndicators(
    tx: SqlClient,
    id: string,
    indicators: readonly FlashbackIndicatorInstance[],
  ): Promise<FlashbackEntryRow | null> {
    const rows = await tx.query<Row>(
      `update flashback_entries set indicator_params = $2::jsonb where id = $1 returning ${ENTRY_COLUMNS}`,
      [id, JSON.stringify(indicators)],
    );
    return rows[0] ? mapEntry(rows[0]) : null;
  }

  async finishEntry(
    tx: SqlClient,
    id: string,
    result: FlashbackEntryFinish,
  ): Promise<FlashbackEntryRow | null> {
    const rows = await tx.query<Row>(
      `update flashback_entries
          set status = 'finished', finished_at = $2, final_nav = $3, pnl_pct = $4, max_drawdown = $5
        where id = $1 and status = 'playing'
        returning ${ENTRY_COLUMNS}`,
      [
        id,
        result.finishedAt,
        result.finalNav.toString(),
        result.pnlPct,
        result.maxDrawdown,
      ],
    );
    return rows[0] ? mapEntry(rows[0]) : null;
  }

  async assignEntryRanking(
    tx: SqlClient,
    id: string,
    rank: number,
    rewardXu: number,
  ): Promise<FlashbackEntryRow | null> {
    const rows = await tx.query<Row>(
      `update flashback_entries set rank = $2, reward_xu = $3 where id = $1 returning ${ENTRY_COLUMNS}`,
      [id, rank, rewardXu],
    );
    return rows[0] ? mapEntry(rows[0]) : null;
  }

  async listEntriesByRound(db: SqlClient, roundId: string): Promise<FlashbackEntryRow[]> {
    const rows = await db.query<Row>(
      `select ${ENTRY_COLUMNS} from flashback_entries where round_id = $1 order by joined_at, id`,
      [roundId],
    );
    return rows.map(mapEntry);
  }

  async countEntriesByRound(db: SqlClient, roundId: string): Promise<number> {
    const rows = await db.query<{ total: string }>(
      `select count(*)::text as total from flashback_entries where round_id = $1`,
      [roundId],
    );
    return toInt(rows[0]?.total ?? '0', 'total');
  }

  async holdingsByRound(db: SqlClient, roundId: string): Promise<Map<string, number>> {
    const rows = await db.query<{ entry_id: string; total: string }>(
      `select l.entry_id, sum(l.qty)::text as total
         from flashback_lots l
         join flashback_entries e on e.id = l.entry_id
        where e.round_id = $1
        group by l.entry_id`,
      [roundId],
    );
    return new Map(rows.map((row) => [row.entry_id, toInt(row.total, 'total')]));
  }

  async lotsByEntry(db: SqlClient, entryId: string): Promise<FlashbackLotRow[]> {
    const rows = await db.query<Row>(
      `select ${LOT_COLUMNS} from flashback_lots
        where entry_id = $1 and qty > 0
        order by sellable_step, step, created_at, id`,
      [entryId],
    );
    return rows.map(mapLot);
  }

  async insertLot(tx: SqlClient, input: NewFlashbackLot): Promise<FlashbackLotRow> {
    const rows = await tx.query<Row>(
      `insert into flashback_lots (entry_id, qty, price, step, sellable_step)
       values ($1, $2, $3, $4, $5)
       returning ${LOT_COLUMNS}`,
      [
        input.entryId,
        input.qty,
        input.price.toString(),
        input.step,
        input.sellableStep,
      ],
    );
    if (!rows[0]) throw new Error('Flashback lot insert returned no row');
    return mapLot(rows[0]);
  }

  async consumeLot(tx: SqlClient, lotId: string, qty: number): Promise<boolean> {
    const rows = await tx.query<Row>(
      `update flashback_lots set qty = qty - $2 where id = $1 and qty >= $2 returning id`,
      [lotId, qty],
    );
    return rows.length > 0;
  }

  async insertOrder(
    tx: SqlClient,
    input: NewFlashbackOrder,
  ): Promise<FlashbackOrderRow | null> {
    const rows = await tx.query<Row>(
      `insert into flashback_orders
         (entry_id, side, qty, price, step, amount, fee, tax, idempotency_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (entry_id, idempotency_key) where idempotency_key is not null do nothing
       returning ${ORDER_COLUMNS}`,
      [
        input.entryId,
        input.side,
        input.qty,
        input.price.toString(),
        input.step,
        input.amount.toString(),
        input.fee.toString(),
        input.tax.toString(),
        input.idempotencyKey,
      ],
    );
    return rows[0] ? mapOrder(rows[0]) : null;
  }

  async ordersByEntry(db: SqlClient, entryId: string): Promise<FlashbackOrderRow[]> {
    const rows = await db.query<Row>(
      `select ${ORDER_COLUMNS} from flashback_orders where entry_id = $1 order by created_at, id`,
      [entryId],
    );
    return rows.map(mapOrder);
  }

  async orderByIdempotencyKey(
    tx: SqlClient,
    entryId: string,
    key: string,
  ): Promise<FlashbackOrderRow | null> {
    const rows = await tx.query<Row>(
      `select ${ORDER_COLUMNS} from flashback_orders
        where entry_id = $1 and idempotency_key = $2 limit 1`,
      [entryId, key],
    );
    return rows[0] ? mapOrder(rows[0]) : null;
  }

  async lockWallet(tx: SqlClient, userId: string): Promise<FlashbackWalletState> {
    const lockSql = `select balance::text as balance, last_seq::text as last_seq
       from coin_wallets where user_id = $1 for update`;
    const existing = await tx.query<Row>(lockSql, [userId]);
    if (existing[0]) {
      return {
        balance: toInt(existing[0].balance, 'balance'),
        lastSeq: toInt(existing[0].last_seq, 'last_seq'),
      };
    }
    await tx.query(
      `insert into coin_wallets (user_id) values ($1) on conflict (user_id) do nothing`,
      [userId],
    );
    const locked = await tx.query<Row>(lockSql, [userId]);
    if (!locked[0]) throw new Error('Flashback could not lock the coin wallet');
    return {
      balance: toInt(locked[0].balance, 'balance'),
      lastSeq: toInt(locked[0].last_seq, 'last_seq'),
    };
  }

  async saveWallet(
    tx: SqlClient,
    userId: string,
    balance: number,
    lastSeq: number,
  ): Promise<void> {
    await tx.query(
      `update coin_wallets set balance = $2, last_seq = $3, updated_at = now() where user_id = $1`,
      [userId, balance, lastSeq],
    );
  }

  async appendLedger(tx: SqlClient, entry: FlashbackLedgerEntry): Promise<boolean> {
    const rows = await tx.query<Row>(
      `insert into coin_ledger
         (id, user_id, seq, kind, delta, balance_after, unique_key, ref, policy_version)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       on conflict (unique_key) do nothing
       returning id`,
      [
        entry.userId,
        entry.seq,
        entry.kind,
        entry.delta,
        entry.balanceAfter,
        entry.uniqueKey,
        JSON.stringify(entry.ref),
        entry.policyVersion,
      ],
    );
    return rows.length > 0;
  }

  async getSetting(db: SqlClient, key: string): Promise<unknown> {
    const rows = await db.query<{ value: unknown }>(
      `select value from flashback_settings where key = $1 limit 1`,
      [key],
    );
    return rows[0]?.value ?? null;
  }

  async setSetting(tx: SqlClient, key: string, value: unknown): Promise<void> {
    await tx.query(
      `insert into flashback_settings (key, value, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }

  async appendJobLog(
    tx: SqlClient,
    entry: {
      step: string;
      roundId: string | null;
      result: string;
      error: string | null;
      level?: FlashbackAlertLevel | null;
    },
  ): Promise<void> {
    await tx.query(
      `insert into flashback_job_log (run_at, step, round_id, result, error, level)
       values (now(), $1, $2, $3, $4, $5)`,
      [entry.step, entry.roundId, entry.result, entry.error, entry.level ?? null],
    );
  }

  async listJobLog(db: SqlClient, limit: number): Promise<FlashbackJobLogRow[]> {
    const rows = await db.query<Row>(
      `select run_at, step, round_id, result, error, level from flashback_job_log
        order by run_at desc, id desc limit $1`,
      [limit],
    );
    return rows.map((row) => ({
      runAt: toDate(row.run_at),
      step: String(row.step),
      roundId: row.round_id === null ? null : String(row.round_id),
      result: String(row.result ?? ''),
      error: row.error === null ? null : String(row.error),
      level:
        row.level === 'high' || row.level === 'medium' || row.level === 'low'
          ? (row.level as FlashbackAlertLevel)
          : null,
    }));
  }

  async hasRecentAlert(
    db: SqlClient,
    roundId: string | null,
    level: FlashbackAlertLevel,
    withinMinutes: number,
  ): Promise<boolean> {
    const rows = await db.query<{ total: string }>(
      `select count(*)::text as total
         from flashback_job_log
        where step = 'alert' and level = $2
          and (round_id = $1::uuid or ($1::uuid is null and round_id is null))
          and run_at > now() - make_interval(mins => $3::int)`,
      [roundId, level, withinMinutes],
    );
    return toInt(rows[0]?.total ?? '0', 'total') > 0;
  }

  async listCurrentVn30(db: SqlClient): Promise<string[]> {
    const rows = await db.query<{ symbol: string }>(
      `select symbol from vn30_constituents where effective_to is null order by symbol`,
    );
    return rows.map((row) => row.symbol);
  }

  async replaceVn30(
    tx: SqlClient,
    symbols: readonly string[],
    effectiveFrom: Date,
  ): Promise<void> {
    await tx.query(
      `update vn30_constituents set effective_to = $1 where effective_to is null`,
      [effectiveFrom],
    );
    for (const symbol of symbols) {
      await tx.query(
        `insert into vn30_constituents (symbol, effective_from) values ($1, $2)
         on conflict (symbol, effective_from) do nothing`,
        [symbol, effectiveFrom],
      );
    }
  }

  override async tryAcquireJobLock(db: SqlClient = this.database): Promise<boolean> {
    const rows = await db.query<{ locked: boolean }>(
      `select pg_try_advisory_lock(78291042) as locked`,
    );
    return rows[0]?.locked === true;
  }

  override async releaseJobLock(db: SqlClient = this.database): Promise<void> {
    await db.query(`select pg_advisory_unlock(78291042)`);
  }

  override async withJobLock<T>(
    dbOrFn: SqlClient | (() => Promise<T>),
    maybeFn?: () => Promise<T>,
  ): Promise<{ ran: boolean; result?: T }> {
    const fn = typeof dbOrFn === 'function' ? dbOrFn : maybeFn!;
    const db = typeof dbOrFn === 'function' ? this.database : dbOrFn;
    return super.withJobLock(db, fn);
  }
}
