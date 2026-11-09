/**
 * Kho dữ liệu của Flashback v2 · Phòng chơi (migration 0033; cấp, điểm, hạng ở migration 0038).
 *
 * Mọi ghi đi qua transaction của caller. Khoá dùng: dòng phòng (`FOR UPDATE`) cho vào/rời/bắt
 * đầu/chơi lại, dòng người chơi cho phiên tiếp/đặt lệnh/hoàn thành, dòng ván cho chốt ván, dòng
 * ví xu cho trừ/cộng xu. Ràng buộc unique của ledger chặn trừ cược hay cộng thưởng hai lần.
 */

import { Injectable } from '@nestjs/common';

import type { SqlClient } from '../../platform/database/database.service.js';
import type { FlashbackBar, FlashbackLotRow, FlashbackOrderRow } from './flashback.types.js';

type Row = Record<string, unknown>;

export const FLASHBACK_ROOMS_REPOSITORY = Symbol('FLASHBACK_ROOMS_REPOSITORY');

export type FbRoomStatus = 'waiting' | 'playing' | 'closed';
export type FbMatchStatus = 'playing' | 'finished' | 'paid';
export type FbLedgerKind = 'flashback_stake' | 'flashback_win' | 'flashback_refund';

export interface FbRoomRow {
  readonly id: string;
  readonly code: string;
  readonly ownerId: string;
  readonly viewBars: number;
  readonly playBars: number;
  readonly minutes: number;
  readonly maxPlayers: number;
  readonly stakeXu: number;
  readonly passwordHash: string | null;
  /** Chủ phòng bật chat khi tạo phòng (v2.4 §3.5). */
  readonly chatEnabled: boolean;
  readonly status: FbRoomStatus;
  readonly currentMatchId: string | null;
  readonly matchCount: number;
  readonly createdAt: Date;
  readonly waitingSince: Date;
  readonly closedAt: Date | null;
}

export interface FbRoomListRow extends FbRoomRow {
  readonly ownerName: string;
  readonly ownerAvatarUrl: string | null;
  /** Tổng điểm cấp của chủ phòng (v2.1 §3), để tính cấp. */
  readonly ownerTotalPoints: number;
  readonly memberCount: number;
}

export interface FbMemberRow {
  readonly roomId: string;
  readonly userId: string;
  readonly joinedAt: Date;
  readonly name: string;
  readonly avatarUrl: string | null;
  /** Tổng điểm cấp hiện tại của người này (v2.1 §3), để tính cấp. */
  readonly totalPoints: number;
  /** Đã bấm "Sẵn sàng" ở phòng chờ (`ready_at` khác null). Chủ phòng được tính ở service. */
  readonly ready: boolean;
}

/** Thông báo một lần của người bị đưa ra khỏi phòng và lý do rời (`kicked` khi bị chủ phòng đuổi). */
export interface FbTakenNotice {
  readonly notice: string;
  readonly reason: string | null;
}

export interface FbMatchRow {
  readonly id: string;
  readonly roomId: string;
  /** Chỉ server tới khi ván kết thúc. */
  readonly symbol: string;
  /** Chỉ server: ngày phiên xem đầu tiên (YYYY-MM-DD). */
  readonly startDate: string;
  /** Chỉ server: ngày phiên chơi cuối cùng (YYYY-MM-DD). */
  readonly endDate: string;
  readonly priceSource: string | null;
  readonly fallbackLevel: number;
  readonly viewBars: number;
  readonly playBars: number;
  readonly warmupBars: readonly FlashbackBar[];
  readonly bars: readonly FlashbackBar[];
  readonly minutes: number;
  readonly stakeXu: number;
  readonly playerCount: number;
  readonly potXu: number;
  readonly startedAt: Date;
  readonly endsAt: Date;
  readonly status: FbMatchStatus;
  readonly endedAt: Date | null;
  readonly endReason: 'all_finished' | 'timeout' | null;
  readonly paidAt: Date | null;
  /**
   * v2.2 §3.5: phiên bản kho và điểm cắt của đoạn dữ liệu (null hoặc thiếu với ván không cắt từ kho).
   * Chỉ server: dùng để tra mẫu nến tính sẵn (Candle Dojo v1.3 §5).
   */
  readonly datasetVersion?: number | null;
  readonly startIdx?: number | null;
}

export interface FbEntryRow {
  readonly id: string;
  readonly matchId: string;
  readonly userId: string;
  readonly stakeXu: number;
  readonly step: number;
  readonly cash: bigint;
  readonly initialCash: bigint;
  readonly navByStep: readonly bigint[];
  readonly joinedAt: Date;
  readonly finishedAt: Date | null;
  readonly autoFinished: boolean;
  readonly finalNav: bigint | null;
  readonly pnlPct: number | null;
  readonly rank: number | null;
  readonly winXu: number;
  readonly refundXu: number;
  readonly status: 'playing' | 'finished';
  /** Điểm cấp nhận từ ván này (v2.1 §3.1): 10, 3 hoặc 0. */
  readonly points: number;
  /** Thắng ván từ 2 người (hạng 1, gồm cả hoà); ván chơi 1 mình luôn false. */
  readonly isWin: boolean;
  /** Lúc đã cộng điểm; null là chưa cộng (mỗi (ván, người) chỉ cộng một lần). */
  readonly pointsAwardedAt: Date | null;
}

export interface FbEntryPlayerRow extends FbEntryRow {
  readonly name: string;
  readonly avatarUrl: string | null;
  /** Tổng điểm cấp hiện tại của người này, để tính cấp. */
  readonly totalPoints: number;
}

export interface NewFbRoom {
  readonly code: string;
  readonly ownerId: string;
  readonly viewBars: number;
  readonly playBars: number;
  readonly minutes: number;
  readonly maxPlayers: number;
  readonly stakeXu: number;
  readonly passwordHash: string | null;
  readonly chatEnabled: boolean;
  readonly now: Date;
}

export interface FbRoomPatch {
  readonly status?: FbRoomStatus;
  readonly ownerId?: string;
  readonly currentMatchId?: string | null;
  readonly matchCount?: number;
  readonly waitingSince?: Date;
  readonly closedAt?: Date | null;
  readonly closeReason?: string | null;
}

export interface NewFbMatch {
  readonly roomId: string;
  readonly symbol: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly priceSource: string | null;
  readonly fallbackLevel: number;
  readonly viewBars: number;
  readonly playBars: number;
  readonly warmupBars: readonly FlashbackBar[];
  readonly bars: readonly FlashbackBar[];
  /** v2.2 §3.5: phiên bản kho và điểm cắt (null với ván không cắt từ kho). */
  readonly datasetVersion?: number | null;
  readonly startIdx?: number | null;
  readonly minutes: number;
  readonly stakeXu: number;
  readonly playerCount: number;
  readonly potXu: number;
  readonly startedAt: Date;
  readonly endsAt: Date;
}

export interface FbMatchPatch {
  readonly status?: FbMatchStatus;
  readonly endedAt?: Date;
  readonly endReason?: 'all_finished' | 'timeout';
  readonly paidAt?: Date;
}

export interface NewFbEntry {
  readonly matchId: string;
  readonly userId: string;
  readonly stakeXu: number;
  readonly cash: bigint;
  readonly joinedAt: Date;
}

export interface FbEntryPatch {
  readonly step?: number;
  readonly cash?: bigint;
  readonly navByStep?: readonly bigint[];
  readonly status?: 'playing' | 'finished';
  readonly finishedAt?: Date;
  readonly autoFinished?: boolean;
  readonly finalNav?: bigint;
  readonly pnlPct?: number;
  readonly rank?: number;
  readonly winXu?: number;
  readonly refundXu?: number;
}

export interface FbLedgerEntry {
  readonly userId: string;
  readonly seq: number;
  readonly kind: FbLedgerKind;
  readonly delta: number;
  readonly balanceAfter: number;
  readonly uniqueKey: string;
  readonly ref: Record<string, unknown>;
}

export interface NewFbLot {
  readonly entryId: string;
  readonly qty: number;
  readonly price: bigint;
  readonly step: number;
  readonly sellableStep: number;
}

export interface NewFbOrder {
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

/** Cộng điểm cấp cho một người của một ván (v2.1 §3, §10.2). */
export interface FbAwardInput {
  readonly entryId: string;
  readonly userId: string;
  readonly points: number;
  readonly isWin: boolean;
  /** Ván từ 2 người: tính vào số ván và số thắng của bảng xếp hạng; ván chơi 1 mình thì không. */
  readonly counted: boolean;
  readonly at: Date;
}

/** Một dòng bảng xếp hạng (v2.1 §4). `rank` bắt đầu từ 1. */
export interface FbLeaderboardRow {
  readonly rank: number;
  readonly userId: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly points: number;
  readonly games: number;
  readonly wins: number;
}

/** Bộ lọc lịch sử đấu (v2.1 §5.3): kết quả và mốc thời gian bắt đầu (null = tất cả). */
export interface FbHistoryFilter {
  readonly result: 'all' | 'win' | 'lose' | 'solo';
  readonly since: Date | null;
}

/** Một ván trong lịch sử đấu của một người (v2.1 §5.2). */
export interface FbHistoryRow {
  readonly entryId: string;
  readonly matchId: string;
  readonly roomCode: string;
  readonly endedAt: Date;
  readonly playerCount: number;
  readonly viewBars: number;
  readonly playBars: number;
  readonly minutes: number;
  readonly matchStakeXu: number;
  readonly symbol: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly rank: number;
  /** Số người đồng hạng 1 của ván (để phân biệt Thắng và Hoà). */
  readonly topCount: number;
  readonly pnlPct: number;
  readonly cash: bigint;
  readonly finalNav: bigint;
  readonly stakeXu: number;
  readonly winXu: number;
  readonly refundXu: number;
  readonly points: number;
}

/** Một người chơi trong chi tiết một ván của lịch sử đấu. */
export interface FbHistoryPlayerRow {
  readonly matchId: string;
  readonly userId: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly totalPoints: number;
  readonly rank: number;
  readonly pnlPct: number;
  readonly stakeXu: number;
  readonly winXu: number;
  readonly refundXu: number;
  readonly points: number;
  readonly joinedAt: Date;
}

/** Sáu số tổng kết của lịch sử đấu trong một khoảng thời gian (v2.1 §5.1). */
export interface FbHistorySummaryRow {
  readonly games: number;
  readonly soloGames: number;
  /** Ván từ 2 người thắng, gồm cả hoà hạng 1. */
  readonly wins: number;
  /** Tổng xu nhận (thắng, hoàn) trừ xu cược đã mất. */
  readonly xuNet: number;
  readonly points: number;
  readonly avgPnlPct: number | null;
  readonly bestPnlPct: number | null;
  readonly bestSymbol: string | null;
}

/** Tối đa bấy nhiêu ván gần nhất được trả về trong lịch sử đấu (chủ sản phẩm chốt 200). */
export const FB_HISTORY_CAP = 200;

/** Phiên bản chính sách ghi vào `coin_ledger.policy_version`. */
export const FB_LEDGER_POLICY = 'iqx-flashback-v2-rooms';

/** Khoá ledger của một khoản xu trong một ván: `<kind>:<match_id>:<user_id>` (spec §8). */
export function fbLedgerKey(kind: FbLedgerKind, matchId: string, userId: string): string {
  return `${kind}:${matchId}:${userId}`;
}

export abstract class FlashbackRoomsRepository {
  // phòng
  abstract insertRoom(tx: SqlClient, input: NewFbRoom): Promise<FbRoomRow | null>;
  abstract roomByCode(db: SqlClient, code: string, lock?: boolean): Promise<FbRoomRow | null>;
  abstract roomById(db: SqlClient, id: string, lock?: boolean): Promise<FbRoomRow | null>;
  abstract listOpenRooms(
    db: SqlClient,
    status: 'all' | 'waiting' | 'playing',
    limit: number,
  ): Promise<FbRoomListRow[]>;
  abstract updateRoom(tx: SqlClient, id: string, patch: FbRoomPatch): Promise<FbRoomRow | null>;
  /** Phòng chờ quá hạn hoặc phòng có kết quả quá hạn mà chưa ai chơi lại. */
  abstract staleRoomIds(db: SqlClient, waitingBefore: Date, endedBefore: Date): Promise<string[]>;
  // thành viên
  abstract activeMembers(db: SqlClient, roomId: string): Promise<FbMemberRow[]>;
  abstract activeRoomIdOf(db: SqlClient, userId: string): Promise<string | null>;
  /** false khi tài khoản đang ở một phòng khác (unique một phòng mỗi tài khoản). */
  abstract addMember(tx: SqlClient, roomId: string, userId: string, at: Date): Promise<boolean>;
  abstract removeMember(
    tx: SqlClient,
    roomId: string,
    userId: string,
    reason: string,
    notice: string | null,
    at: Date,
  ): Promise<boolean>;
  abstract removeAllMembers(tx: SqlClient, roomId: string, reason: string, at: Date): Promise<void>;
  /** Đặt hoặc bỏ "Sẵn sàng" của một thành viên đang ở trong phòng; false khi không còn ở trong. */
  abstract setMemberReady(
    tx: SqlClient,
    roomId: string,
    userId: string,
    ready: boolean,
    at: Date,
  ): Promise<boolean>;
  /** Bỏ "Sẵn sàng" của mọi thành viên đang ở trong phòng. */
  abstract resetReady(tx: SqlClient, roomId: string): Promise<void>;
  /** Người này bị chủ phòng đuổi khỏi đúng phòng này từ mốc `since` trở lại đây? */
  abstract wasKickedSince(
    db: SqlClient,
    roomId: string,
    userId: string,
    since: Date,
  ): Promise<boolean>;
  /** Lấy và xoá thông báo một lần mới nhất của tài khoản (ví dụ bị đưa ra vì thiếu xu, bị đuổi). */
  abstract takeNotice(tx: SqlClient, userId: string): Promise<FbTakenNotice | null>;
  // ví xu
  abstract balance(db: SqlClient, userId: string): Promise<number>;
  abstract lockWallet(tx: SqlClient, userId: string): Promise<{ balance: number; lastSeq: number }>;
  abstract saveWallet(
    tx: SqlClient,
    userId: string,
    balance: number,
    lastSeq: number,
  ): Promise<void>;
  /** false khi khoá ledger đã có (đã trừ/cộng rồi). */
  abstract appendLedger(tx: SqlClient, entry: FbLedgerEntry): Promise<boolean>;
  // ván
  abstract insertMatch(tx: SqlClient, input: NewFbMatch): Promise<FbMatchRow>;
  abstract matchById(db: SqlClient, id: string, lock?: boolean): Promise<FbMatchRow | null>;
  abstract updateMatch(tx: SqlClient, id: string, patch: FbMatchPatch): Promise<FbMatchRow | null>;
  abstract dueMatchIds(db: SqlClient, now: Date): Promise<string[]>;
  // người chơi
  abstract insertEntry(tx: SqlClient, input: NewFbEntry): Promise<FbEntryRow>;
  abstract entryByMatchUser(
    db: SqlClient,
    matchId: string,
    userId: string,
    lock?: boolean,
  ): Promise<FbEntryRow | null>;
  abstract entriesByMatch(
    db: SqlClient,
    matchId: string,
    lock?: boolean,
  ): Promise<FbEntryPlayerRow[]>;
  abstract updateEntry(tx: SqlClient, id: string, patch: FbEntryPatch): Promise<FbEntryRow | null>;
  // lô và lệnh
  abstract lotsByEntry(db: SqlClient, entryId: string): Promise<FlashbackLotRow[]>;
  abstract insertLot(tx: SqlClient, input: NewFbLot): Promise<FlashbackLotRow>;
  abstract consumeLot(tx: SqlClient, lotId: string, qty: number): Promise<boolean>;
  abstract insertOrder(tx: SqlClient, input: NewFbOrder): Promise<FlashbackOrderRow | null>;
  abstract ordersByEntry(db: SqlClient, entryId: string): Promise<FlashbackOrderRow[]>;
  abstract orderByIdempotencyKey(
    db: SqlClient,
    entryId: string,
    key: string,
  ): Promise<FlashbackOrderRow | null>;
  // cấp, điểm, hạng (v2.1 §3, §4)
  /**
   * Cộng điểm cho một người của một ván đúng một lần: chỉ dòng `points_awarded_at IS NULL` được cập
   * nhật, rồi (ván từ 2 người) tăng `fb_player_stats`. false khi đã cộng rồi. Gọi trong transaction
   * chốt ván, theo thứ tự user_id để các transaction cùng khoá một thứ tự.
   */
  abstract awardEntry(tx: SqlClient, input: FbAwardInput): Promise<boolean>;
  /** Ván đã kết thúc mà còn người chưa được cộng điểm (ván chốt bởi bản cũ), cũ nhất trước. */
  abstract pendingAwardMatchIds(db: SqlClient, limit: number): Promise<string[]>;
  /** Top `limit` của bảng xếp hạng, theo thứ tự §4.1. Chỉ người đã chơi ít nhất 1 ván từ 2 người. */
  abstract leaderboard(db: SqlClient, limit: number): Promise<FbLeaderboardRow[]>;
  /** Dòng bảng xếp hạng của một người với đúng hạng; null khi chưa chơi ván nào từ 2 người. */
  abstract leaderboardRow(db: SqlClient, userId: string): Promise<FbLeaderboardRow | null>;
  /** Mã người dùng đang hạng 1, 2, 3 (theo thứ tự). */
  abstract top3(db: SqlClient): Promise<string[]>;
  /** Tổng điểm của người chơi ngay sau khi nhận điểm ở dòng này (tính tới và gồm cả dòng đó). */
  abstract pointsThroughEntry(db: SqlClient, entryId: string): Promise<number>;
  // lịch sử đấu (v2.1 §5)
  /** Ván đã kết thúc của người này, mới nhất trước, tối đa `FB_HISTORY_CAP`; `total` là số ván khớp (đã giới hạn). */
  abstract historyPage(
    db: SqlClient,
    userId: string,
    filter: FbHistoryFilter,
    offset: number,
    limit: number,
  ): Promise<{ total: number; rows: FbHistoryRow[] }>;
  abstract historyPlayers(
    db: SqlClient,
    matchIds: readonly string[],
  ): Promise<FbHistoryPlayerRow[]>;
  abstract historyOrders(db: SqlClient, entryIds: readonly string[]): Promise<FlashbackOrderRow[]>;
  abstract historySummary(
    db: SqlClient,
    userId: string,
    since: Date | null,
  ): Promise<FbHistorySummaryRow>;
}

// ------------------------------------------------------------------ ánh xạ dòng

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

const toDate = (value: unknown): Date => (value instanceof Date ? value : new Date(String(value)));
const toDateOrNull = (value: unknown): Date | null =>
  value === null || value === undefined ? null : toDate(value);
const toText = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value);

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

/** node-postgres trả `bigint[]` dạng mảng chuỗi (hoặc chuỗi `{1,2}` khi chưa có parser). */
const toBigIntArray = (value: unknown): bigint[] => {
  if (Array.isArray(value)) return value.map((item) => toBigInt(item, 'nav_by_step'));
  if (typeof value === 'string') {
    const inner = value.replace(/^\{|\}$/g, '').trim();
    return inner ? inner.split(',').map((item) => toBigInt(item.trim(), 'nav_by_step')) : [];
  }
  return [];
};

const mapRoom = (row: Row): FbRoomRow => ({
  id: String(row.id),
  code: String(row.code),
  ownerId: String(row.owner_id),
  viewBars: toInt(row.view_bars, 'view_bars'),
  playBars: toInt(row.play_bars, 'play_bars'),
  minutes: toInt(row.minutes, 'minutes'),
  maxPlayers: toInt(row.max_players, 'max_players'),
  stakeXu: toInt(row.stake_xu, 'stake_xu'),
  passwordHash: toText(row.password_hash),
  chatEnabled: row.chat_enabled !== false,
  status: String(row.status) as FbRoomStatus,
  currentMatchId: toText(row.current_match_id),
  matchCount: toInt(row.match_count, 'match_count'),
  createdAt: toDate(row.created_at),
  waitingSince: toDate(row.waiting_since),
  closedAt: toDateOrNull(row.closed_at),
});

const mapMatch = (row: Row): FbMatchRow => ({
  id: String(row.id),
  roomId: String(row.room_id),
  symbol: String(row.symbol),
  startDate: String(row.start_date_text),
  endDate: String(row.end_date_text),
  priceSource: toText(row.price_source),
  fallbackLevel: toInt(row.fallback_level, 'fallback_level'),
  viewBars: toInt(row.view_bars, 'view_bars'),
  playBars: toInt(row.play_bars, 'play_bars'),
  warmupBars: toBars(row.warmup_bars),
  bars: toBars(row.bars),
  minutes: toInt(row.minutes, 'minutes'),
  stakeXu: toInt(row.stake_xu, 'stake_xu'),
  playerCount: toInt(row.player_count, 'player_count'),
  potXu: toInt(row.pot_xu, 'pot_xu'),
  startedAt: toDate(row.started_at),
  endsAt: toDate(row.ends_at),
  status: String(row.status) as FbMatchStatus,
  endedAt: toDateOrNull(row.ended_at),
  endReason: (toText(row.end_reason) as FbMatchRow['endReason']) ?? null,
  paidAt: toDateOrNull(row.paid_at),
  datasetVersion:
    row.dataset_version === null || row.dataset_version === undefined
      ? null
      : toInt(row.dataset_version, 'dataset_version'),
  startIdx:
    row.start_idx === null || row.start_idx === undefined ? null : toInt(row.start_idx, 'start_idx'),
});

const mapEntry = (row: Row): FbEntryRow => ({
  id: String(row.id),
  matchId: String(row.match_id),
  userId: String(row.user_id),
  stakeXu: toInt(row.stake_xu, 'stake_xu'),
  step: toInt(row.step, 'step'),
  cash: toBigInt(row.cash, 'cash'),
  initialCash: toBigInt(row.initial_cash, 'initial_cash'),
  navByStep: toBigIntArray(row.nav_by_step),
  joinedAt: toDate(row.joined_at),
  finishedAt: toDateOrNull(row.finished_at),
  autoFinished: row.auto_finished === true,
  finalNav:
    row.final_nav === null || row.final_nav === undefined
      ? null
      : toBigInt(row.final_nav, 'final_nav'),
  pnlPct: row.pnl_pct === null || row.pnl_pct === undefined ? null : Number(row.pnl_pct),
  rank: row.rank === null || row.rank === undefined ? null : toInt(row.rank, 'rank'),
  winXu: toInt(row.win_xu, 'win_xu'),
  refundXu: toInt(row.refund_xu, 'refund_xu'),
  status: String(row.status) as 'playing' | 'finished',
  points: toInt(row.points, 'points'),
  isWin: row.is_win === true,
  pointsAwardedAt: toDateOrNull(row.points_awarded_at),
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
  idempotencyKey: toText(row.idempotency_key),
  createdAt: toDate(row.created_at),
});

const ROOM_COLUMNS = `r.id, r.code, r.owner_id, r.view_bars, r.play_bars, r.minutes, r.max_players,
  r.stake_xu, r.password_hash, r.chat_enabled, r.status, r.current_match_id, r.match_count, r.created_at,
  r.waiting_since, r.closed_at`;

const MATCH_COLUMNS = `id, room_id, symbol, to_char(start_date, 'YYYY-MM-DD') as start_date_text,
  to_char(end_date, 'YYYY-MM-DD') as end_date_text, price_source, fallback_level, view_bars,
  play_bars, warmup_bars, bars, minutes, stake_xu, player_count, pot_xu, started_at, ends_at,
  status, ended_at, end_reason, paid_at, dataset_version, start_idx`;

const ENTRY_COLUMNS = `e.id, e.match_id, e.user_id, e.stake_xu, e.step, e.cash, e.initial_cash,
  e.nav_by_step::text[] as nav_by_step, e.joined_at, e.finished_at, e.auto_finished, e.final_nav,
  e.pnl_pct, e.rank, e.win_xu, e.refund_xu, e.status, e.points, e.is_win, e.points_awarded_at`;

const LOT_COLUMNS = `id, entry_id, qty, price, step, sellable_step, created_at`;
const ORDER_COLUMNS = `id, entry_id, side, qty, price, step, amount, fee, tax, idempotency_key, created_at`;

/** Tên hiển thị trong phòng: tên đăng nhập, chưa đặt thì họ tên (không bao giờ dùng email). */
const DISPLAY_NAME = `coalesce(nullif(u.username, ''), nullif(u.full_name, ''), 'Người chơi')`;

/** Thứ tự bảng xếp hạng (v2.1 §4.1); khớp `compareRank` ở flashback-rooms.logic.ts. */
const RANK_ORDER = `order by s.points desc, s.wins desc, s.reached_points_at asc, s.user_id asc`;

/** Điều kiện SQL theo bộ lọc kết quả của lịch sử đấu (chuỗi cố định, không nhận từ người dùng). */
const HISTORY_RESULT_SQL: Record<FbHistoryFilter['result'], string> = {
  all: '',
  solo: 'and m.player_count < 2',
  win: 'and m.player_count >= 2 and e.rank = 1',
  lose: 'and m.player_count >= 2 and e.rank <> 1',
};

const mapLeaderboardRow = (row: Row): FbLeaderboardRow => ({
  rank: toInt(row.rank, 'rank'),
  userId: String(row.user_id),
  name: String(row.name ?? ''),
  avatarUrl: toText(row.avatar_url),
  points: toInt(row.points, 'points'),
  games: toInt(row.games, 'games'),
  wins: toInt(row.wins, 'wins'),
});

@Injectable()
export class PgFlashbackRoomsRepository extends FlashbackRoomsRepository {
  async insertRoom(tx: SqlClient, input: NewFbRoom): Promise<FbRoomRow | null> {
    const rows = await tx.query<Row>(
      `insert into fb_rooms as r
         (code, owner_id, view_bars, play_bars, minutes, max_players, stake_xu, password_hash,
          chat_enabled, status, created_at, waiting_since, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $10, 'waiting', $9, $9, $9)
       on conflict (code) where status <> 'closed' do nothing
       returning ${ROOM_COLUMNS}`,
      [
        input.code,
        input.ownerId,
        input.viewBars,
        input.playBars,
        input.minutes,
        input.maxPlayers,
        input.stakeXu,
        input.passwordHash,
        input.now,
        input.chatEnabled,
      ],
    );
    return rows[0] ? mapRoom(rows[0]) : null;
  }

  async roomByCode(db: SqlClient, code: string, lock = false): Promise<FbRoomRow | null> {
    const rows = await db.query<Row>(
      `select ${ROOM_COLUMNS} from fb_rooms r where r.code = $1 and r.status <> 'closed'
        limit 1 ${lock ? 'for update' : ''}`,
      [code],
    );
    return rows[0] ? mapRoom(rows[0]) : null;
  }

  async roomById(db: SqlClient, id: string, lock = false): Promise<FbRoomRow | null> {
    const rows = await db.query<Row>(
      `select ${ROOM_COLUMNS} from fb_rooms r where r.id = $1 limit 1 ${lock ? 'for update' : ''}`,
      [id],
    );
    return rows[0] ? mapRoom(rows[0]) : null;
  }

  async listOpenRooms(
    db: SqlClient,
    status: 'all' | 'waiting' | 'playing',
    limit: number,
  ): Promise<FbRoomListRow[]> {
    const rows = await db.query<Row>(
      `select ${ROOM_COLUMNS}, ${DISPLAY_NAME} as owner_name, u.avatar_url as owner_avatar_url,
              coalesce(s.points, 0) as owner_total_points,
              (select count(*) from fb_room_members m
                where m.room_id = r.id and m.left_at is null)::int as member_count
         from fb_rooms r
         join users u on u.id = r.owner_id
         left join fb_player_stats s on s.user_id = r.owner_id
        where r.status <> 'closed'
          and ($1::text = 'all' or r.status = $1::text)
        order by r.created_at desc, r.id
        limit $2`,
      [status, limit],
    );
    return rows.map((row) => ({
      ...mapRoom(row),
      ownerName: String(row.owner_name ?? ''),
      ownerAvatarUrl: toText(row.owner_avatar_url),
      ownerTotalPoints: toInt(row.owner_total_points, 'owner_total_points'),
      memberCount: toInt(row.member_count, 'member_count'),
    }));
  }

  async updateRoom(tx: SqlClient, id: string, patch: FbRoomPatch): Promise<FbRoomRow | null> {
    const sets: string[] = [];
    const values: unknown[] = [id];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (patch.status !== undefined) set('status', patch.status);
    if (patch.ownerId !== undefined) set('owner_id', patch.ownerId);
    if (patch.currentMatchId !== undefined) set('current_match_id', patch.currentMatchId);
    if (patch.matchCount !== undefined) set('match_count', patch.matchCount);
    if (patch.waitingSince !== undefined) set('waiting_since', patch.waitingSince);
    if (patch.closedAt !== undefined) set('closed_at', patch.closedAt);
    if (patch.closeReason !== undefined) set('close_reason', patch.closeReason);
    sets.push('updated_at = now()');
    const rows = await tx.query<Row>(
      `update fb_rooms r set ${sets.join(', ')} where r.id = $1 returning ${ROOM_COLUMNS}`,
      values,
    );
    return rows[0] ? mapRoom(rows[0]) : null;
  }

  async staleRoomIds(db: SqlClient, waitingBefore: Date, endedBefore: Date): Promise<string[]> {
    const rows = await db.query<{ id: string }>(
      `select r.id::text as id
         from fb_rooms r
         left join fb_matches m on m.id = r.current_match_id
        where (r.status = 'waiting' and r.waiting_since <= $1)
           or (r.status = 'playing' and m.status = 'paid' and m.paid_at <= $2)
        order by r.created_at
        limit 500`,
      [waitingBefore, endedBefore],
    );
    return rows.map((row) => row.id);
  }

  async activeMembers(db: SqlClient, roomId: string): Promise<FbMemberRow[]> {
    const rows = await db.query<Row>(
      `select m.room_id, m.user_id, m.joined_at, ${DISPLAY_NAME} as name, u.avatar_url,
              coalesce(s.points, 0) as total_points, (m.ready_at is not null) as ready
         from fb_room_members m
         join users u on u.id = m.user_id
         left join fb_player_stats s on s.user_id = m.user_id
        where m.room_id = $1 and m.left_at is null
        order by m.joined_at, m.id`,
      [roomId],
    );
    return rows.map((row) => ({
      roomId: String(row.room_id),
      userId: String(row.user_id),
      joinedAt: toDate(row.joined_at),
      name: String(row.name ?? ''),
      avatarUrl: toText(row.avatar_url),
      totalPoints: toInt(row.total_points, 'total_points'),
      ready: row.ready === true,
    }));
  }

  async activeRoomIdOf(db: SqlClient, userId: string): Promise<string | null> {
    const rows = await db.query<{ room_id: string }>(
      `select room_id::text as room_id from fb_room_members
        where user_id = $1 and left_at is null limit 1`,
      [userId],
    );
    return rows[0]?.room_id ?? null;
  }

  async addMember(tx: SqlClient, roomId: string, userId: string, at: Date): Promise<boolean> {
    const rows = await tx.query<{ id: string }>(
      `insert into fb_room_members (room_id, user_id, joined_at) values ($1, $2, $3)
       on conflict (user_id) where left_at is null do nothing
       returning id::text as id`,
      [roomId, userId, at],
    );
    return rows.length > 0;
  }

  async removeMember(
    tx: SqlClient,
    roomId: string,
    userId: string,
    reason: string,
    notice: string | null,
    at: Date,
  ): Promise<boolean> {
    const rows = await tx.query<{ id: string }>(
      `update fb_room_members set left_at = $3, left_reason = $4, notice = $5
        where room_id = $1 and user_id = $2 and left_at is null
       returning id::text as id`,
      [roomId, userId, at, reason, notice],
    );
    return rows.length > 0;
  }

  async removeAllMembers(tx: SqlClient, roomId: string, reason: string, at: Date): Promise<void> {
    await tx.query(
      `update fb_room_members set left_at = $2, left_reason = $3
        where room_id = $1 and left_at is null`,
      [roomId, at, reason],
    );
  }

  async setMemberReady(
    tx: SqlClient,
    roomId: string,
    userId: string,
    ready: boolean,
    at: Date,
  ): Promise<boolean> {
    const rows = await tx.query<{ id: string }>(
      `update fb_room_members set ready_at = $3
        where room_id = $1 and user_id = $2 and left_at is null
       returning id::text as id`,
      [roomId, userId, ready ? at : null],
    );
    return rows.length > 0;
  }

  async resetReady(tx: SqlClient, roomId: string): Promise<void> {
    await tx.query(
      `update fb_room_members set ready_at = null
        where room_id = $1 and left_at is null and ready_at is not null`,
      [roomId],
    );
  }

  async wasKickedSince(
    db: SqlClient,
    roomId: string,
    userId: string,
    since: Date,
  ): Promise<boolean> {
    const rows = await db.query<{ found: number }>(
      `select 1 as found from fb_room_members
        where room_id = $1 and user_id = $2 and left_reason = 'kicked' and left_at > $3
        limit 1`,
      [roomId, userId, since],
    );
    return rows.length > 0;
  }

  async takeNotice(tx: SqlClient, userId: string): Promise<FbTakenNotice | null> {
    const rows = await tx.query<{ notice: string; left_at: Date; left_reason: string | null }>(
      `with picked as (
         select id, notice, left_at, left_reason from fb_room_members
          where user_id = $1 and notice is not null
          for update
       )
       update fb_room_members m set notice = null
         from picked where m.id = picked.id
       returning picked.notice as notice, picked.left_at as left_at,
                 picked.left_reason as left_reason`,
      [userId],
    );
    const latest = [...rows].sort(
      (left, right) => toDate(right.left_at).getTime() - toDate(left.left_at).getTime(),
    )[0];
    return latest ? { notice: String(latest.notice), reason: toText(latest.left_reason) } : null;
  }

  async balance(db: SqlClient, userId: string): Promise<number> {
    const rows = await db.query<{ balance: string }>(
      `select balance::text as balance from coin_wallets where user_id = $1`,
      [userId],
    );
    return rows[0] ? toInt(rows[0].balance, 'balance') : 0;
  }

  async lockWallet(tx: SqlClient, userId: string): Promise<{ balance: number; lastSeq: number }> {
    const lockSql = `select balance::text as balance, last_seq::text as last_seq
       from coin_wallets where user_id = $1 for update`;
    let rows = await tx.query<Row>(lockSql, [userId]);
    if (!rows[0]) {
      await tx.query(
        `insert into coin_wallets (user_id) values ($1) on conflict (user_id) do nothing`,
        [userId],
      );
      rows = await tx.query<Row>(lockSql, [userId]);
    }
    if (!rows[0]) throw new Error('Flashback rooms could not lock the coin wallet');
    return {
      balance: toInt(rows[0].balance, 'balance'),
      lastSeq: toInt(rows[0].last_seq, 'last_seq'),
    };
  }

  async saveWallet(tx: SqlClient, userId: string, balance: number, lastSeq: number): Promise<void> {
    await tx.query(
      `update coin_wallets set balance = $2, last_seq = $3, updated_at = now() where user_id = $1`,
      [userId, balance, lastSeq],
    );
  }

  async appendLedger(tx: SqlClient, entry: FbLedgerEntry): Promise<boolean> {
    const rows = await tx.query<Row>(
      `insert into coin_ledger
         (id, user_id, seq, kind, delta, balance_after, unique_key, ref, policy_version)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       on conflict do nothing
       returning id`,
      [
        entry.userId,
        entry.seq,
        entry.kind,
        entry.delta,
        entry.balanceAfter,
        entry.uniqueKey,
        JSON.stringify(entry.ref),
        FB_LEDGER_POLICY,
      ],
    );
    return rows.length > 0;
  }

  async insertMatch(tx: SqlClient, input: NewFbMatch): Promise<FbMatchRow> {
    const rows = await tx.query<Row>(
      `insert into fb_matches
         (room_id, symbol, start_date, end_date, price_source, fallback_level, view_bars, play_bars,
          warmup_bars, bars, minutes, stake_xu, player_count, pot_xu, started_at, ends_at, status,
          dataset_version, start_idx)
       values ($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13,
               $14, $15, $16, 'playing', $17, $18)
       returning ${MATCH_COLUMNS}`,
      [
        input.roomId,
        input.symbol,
        input.startDate,
        input.endDate,
        input.priceSource,
        input.fallbackLevel,
        input.viewBars,
        input.playBars,
        JSON.stringify(input.warmupBars),
        JSON.stringify(input.bars),
        input.minutes,
        input.stakeXu,
        input.playerCount,
        input.potXu,
        input.startedAt,
        input.endsAt,
        input.datasetVersion ?? null,
        input.startIdx ?? null,
      ],
    );
    if (!rows[0]) throw new Error('Flashback rooms could not insert the match');
    return mapMatch(rows[0]);
  }

  async matchById(db: SqlClient, id: string, lock = false): Promise<FbMatchRow | null> {
    const rows = await db.query<Row>(
      `select ${MATCH_COLUMNS} from fb_matches where id = $1 limit 1 ${lock ? 'for update' : ''}`,
      [id],
    );
    return rows[0] ? mapMatch(rows[0]) : null;
  }

  async updateMatch(tx: SqlClient, id: string, patch: FbMatchPatch): Promise<FbMatchRow | null> {
    const sets: string[] = [];
    const values: unknown[] = [id];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (patch.status !== undefined) set('status', patch.status);
    if (patch.endedAt !== undefined) set('ended_at', patch.endedAt);
    if (patch.endReason !== undefined) set('end_reason', patch.endReason);
    if (patch.paidAt !== undefined) set('paid_at', patch.paidAt);
    if (sets.length === 0) return this.matchById(tx, id);
    const rows = await tx.query<Row>(
      `update fb_matches set ${sets.join(', ')} where id = $1 returning ${MATCH_COLUMNS}`,
      values,
    );
    return rows[0] ? mapMatch(rows[0]) : null;
  }

  async dueMatchIds(db: SqlClient, now: Date): Promise<string[]> {
    const rows = await db.query<{ id: string }>(
      `select id::text as id from fb_matches where status = 'playing' and ends_at <= $1
        order by ends_at limit 200`,
      [now],
    );
    return rows.map((row) => row.id);
  }

  async insertEntry(tx: SqlClient, input: NewFbEntry): Promise<FbEntryRow> {
    const rows = await tx.query<Row>(
      `insert into fb_entries as e
         (match_id, user_id, stake_xu, step, cash, initial_cash, nav_by_step, joined_at, status)
       values ($1, $2, $3, 0, $4::bigint, $4::bigint, array[$4::bigint], $5, 'playing')
       returning ${ENTRY_COLUMNS}`,
      [input.matchId, input.userId, input.stakeXu, input.cash.toString(), input.joinedAt],
    );
    if (!rows[0]) throw new Error('Flashback rooms could not insert the entry');
    return mapEntry(rows[0]);
  }

  async entryByMatchUser(
    db: SqlClient,
    matchId: string,
    userId: string,
    lock = false,
  ): Promise<FbEntryRow | null> {
    const rows = await db.query<Row>(
      `select ${ENTRY_COLUMNS} from fb_entries e where e.match_id = $1 and e.user_id = $2
        limit 1 ${lock ? 'for update' : ''}`,
      [matchId, userId],
    );
    return rows[0] ? mapEntry(rows[0]) : null;
  }

  async entriesByMatch(db: SqlClient, matchId: string, lock = false): Promise<FbEntryPlayerRow[]> {
    const rows = await db.query<Row>(
      `select ${ENTRY_COLUMNS}, ${DISPLAY_NAME} as name, u.avatar_url,
              coalesce(s.points, 0) as total_points
         from fb_entries e
         join users u on u.id = e.user_id
         left join fb_player_stats s on s.user_id = e.user_id
        where e.match_id = $1
        order by e.joined_at, e.id
        ${lock ? 'for update of e' : ''}`,
      [matchId],
    );
    return rows.map((row) => ({
      ...mapEntry(row),
      name: String(row.name ?? ''),
      avatarUrl: toText(row.avatar_url),
      totalPoints: toInt(row.total_points, 'total_points'),
    }));
  }

  async updateEntry(tx: SqlClient, id: string, patch: FbEntryPatch): Promise<FbEntryRow | null> {
    const sets: string[] = [];
    const values: unknown[] = [id];
    const set = (column: string, value: unknown, cast = '') => {
      values.push(value);
      sets.push(`${column} = $${values.length}${cast}`);
    };
    if (patch.step !== undefined) set('step', patch.step);
    if (patch.cash !== undefined) set('cash', patch.cash.toString());
    if (patch.navByStep !== undefined)
      set(
        'nav_by_step',
        patch.navByStep.map((nav) => nav.toString()),
        '::bigint[]',
      );
    if (patch.status !== undefined) set('status', patch.status);
    if (patch.finishedAt !== undefined) set('finished_at', patch.finishedAt);
    if (patch.autoFinished !== undefined) set('auto_finished', patch.autoFinished);
    if (patch.finalNav !== undefined) set('final_nav', patch.finalNav.toString());
    if (patch.pnlPct !== undefined) set('pnl_pct', patch.pnlPct);
    if (patch.rank !== undefined) set('rank', patch.rank);
    if (patch.winXu !== undefined) set('win_xu', patch.winXu);
    if (patch.refundXu !== undefined) set('refund_xu', patch.refundXu);
    if (sets.length === 0) return null;
    const rows = await tx.query<Row>(
      `update fb_entries e set ${sets.join(', ')} where e.id = $1 returning ${ENTRY_COLUMNS}`,
      values,
    );
    return rows[0] ? mapEntry(rows[0]) : null;
  }

  async lotsByEntry(db: SqlClient, entryId: string): Promise<FlashbackLotRow[]> {
    const rows = await db.query<Row>(
      `select ${LOT_COLUMNS} from fb_lots where entry_id = $1 and qty > 0
        order by step, created_at, id`,
      [entryId],
    );
    return rows.map(mapLot);
  }

  async insertLot(tx: SqlClient, input: NewFbLot): Promise<FlashbackLotRow> {
    const rows = await tx.query<Row>(
      `insert into fb_lots (entry_id, qty, price, step, sellable_step)
       values ($1, $2, $3, $4, $5) returning ${LOT_COLUMNS}`,
      [input.entryId, input.qty, input.price.toString(), input.step, input.sellableStep],
    );
    if (!rows[0]) throw new Error('Flashback rooms could not insert the lot');
    return mapLot(rows[0]);
  }

  async consumeLot(tx: SqlClient, lotId: string, qty: number): Promise<boolean> {
    const rows = await tx.query<{ id: string }>(
      `update fb_lots set qty = qty - $2 where id = $1 and qty >= $2 returning id::text as id`,
      [lotId, qty],
    );
    return rows.length > 0;
  }

  async insertOrder(tx: SqlClient, input: NewFbOrder): Promise<FlashbackOrderRow | null> {
    const rows = await tx.query<Row>(
      `insert into fb_orders (entry_id, side, qty, price, step, amount, fee, tax, idempotency_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict do nothing
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
      `select ${ORDER_COLUMNS} from fb_orders where entry_id = $1 order by created_at, id`,
      [entryId],
    );
    return rows.map(mapOrder);
  }

  async orderByIdempotencyKey(
    db: SqlClient,
    entryId: string,
    key: string,
  ): Promise<FlashbackOrderRow | null> {
    const rows = await db.query<Row>(
      `select ${ORDER_COLUMNS} from fb_orders where entry_id = $1 and idempotency_key = $2 limit 1`,
      [entryId, key],
    );
    return rows[0] ? mapOrder(rows[0]) : null;
  }

  // ------------------------------------------------------------------ cấp, điểm, hạng (v2.1)

  async awardEntry(tx: SqlClient, input: FbAwardInput): Promise<boolean> {
    // Chỉ dòng chưa cộng điểm được cập nhật: chạy lại hay hai transaction cùng lúc đều không cộng
    // hai lần (dòng bị khoá, bên sau thấy points_awarded_at đã có và không khớp điều kiện).
    const rows = await tx.query<{ id: string }>(
      `update fb_entries set points = $2, is_win = $3, points_awarded_at = $4
        where id = $1 and points_awarded_at is null
       returning id::text as id`,
      [input.entryId, input.points, input.isWin, input.at],
    );
    if (rows.length === 0) return false;
    if (input.counted) {
      await tx.query(
        `insert into fb_player_stats as s (user_id, points, games, wins, reached_points_at, updated_at)
         values ($1, $2, 1, $3, $4, $4)
         on conflict (user_id) do update set
           points = s.points + excluded.points,
           games = s.games + 1,
           wins = s.wins + excluded.wins,
           reached_points_at = case when excluded.points > 0
                                    then excluded.reached_points_at else s.reached_points_at end,
           updated_at = excluded.updated_at`,
        [input.userId, input.points, input.isWin ? 1 : 0, input.at],
      );
    }
    return true;
  }

  async pendingAwardMatchIds(db: SqlClient, limit: number): Promise<string[]> {
    const rows = await db.query<{ id: string }>(
      `select m.id::text as id
         from (select distinct e.match_id
                 from fb_entries e
                where e.points_awarded_at is null and e.status = 'finished') p
         join fb_matches m on m.id = p.match_id
        where m.status in ('finished', 'paid')
        order by m.ended_at nulls last, m.id
        limit $1`,
      [limit],
    );
    return rows.map((row) => row.id);
  }

  async leaderboard(db: SqlClient, limit: number): Promise<FbLeaderboardRow[]> {
    const rows = await db.query<Row>(
      `select row_number() over (${RANK_ORDER})::int as rank,
              s.user_id, ${DISPLAY_NAME} as name, u.avatar_url, s.points, s.games, s.wins
         from fb_player_stats s
         join users u on u.id = s.user_id
        where s.games > 0
        order by 1
        limit $1`,
      [limit],
    );
    return rows.map(mapLeaderboardRow);
  }

  async leaderboardRow(db: SqlClient, userId: string): Promise<FbLeaderboardRow | null> {
    const rows = await db.query<Row>(
      `select 1 + (
                select count(*) from fb_player_stats o
                 where o.games > 0 and (
                       o.points > s.points
                    or (o.points = s.points and o.wins > s.wins)
                    or (o.points = s.points and o.wins = s.wins
                        and o.reached_points_at < s.reached_points_at)
                    or (o.points = s.points and o.wins = s.wins
                        and o.reached_points_at = s.reached_points_at and o.user_id < s.user_id)
                 )
              )::int as rank,
              s.user_id, ${DISPLAY_NAME} as name, u.avatar_url, s.points, s.games, s.wins
         from fb_player_stats s
         join users u on u.id = s.user_id
        where s.user_id = $1 and s.games > 0`,
      [userId],
    );
    return rows[0] ? mapLeaderboardRow(rows[0]) : null;
  }

  async top3(db: SqlClient): Promise<string[]> {
    const rows = await db.query<{ user_id: string }>(
      `select s.user_id::text as user_id
         from fb_player_stats s
        where s.games > 0
        order by s.points desc, s.wins desc, s.reached_points_at asc, s.user_id asc
        limit 3`,
    );
    return rows.map((row) => row.user_id);
  }

  async pointsThroughEntry(db: SqlClient, entryId: string): Promise<number> {
    const rows = await db.query<{ total: string }>(
      `select coalesce(sum(p.points), 0)::text as total
         from fb_entries e
         join fb_entries p on p.user_id = e.user_id
        where e.id = $1
          and e.points_awarded_at is not null
          and p.points_awarded_at is not null
          and (p.points_awarded_at < e.points_awarded_at
               or (p.points_awarded_at = e.points_awarded_at and p.id <= e.id))`,
      [entryId],
    );
    return rows[0] ? toInt(rows[0].total, 'total') : 0;
  }

  async historyPage(
    db: SqlClient,
    userId: string,
    filter: FbHistoryFilter,
    offset: number,
    limit: number,
  ): Promise<{ total: number; rows: FbHistoryRow[] }> {
    const where = `e.user_id = $1 and m.status <> 'playing' and e.rank is not null
          and ($2::timestamptz is null or m.ended_at >= $2::timestamptz)
          ${HISTORY_RESULT_SQL[filter.result]}`;
    const counted = await db.query<{ total: number }>(
      `select count(*)::int as total from (
         select 1 from fb_entries e join fb_matches m on m.id = e.match_id
          where ${where}
          order by m.ended_at desc, m.id desc
          limit ${FB_HISTORY_CAP}
       ) latest`,
      [userId, filter.since],
    );
    const total = counted[0] ? toInt(counted[0].total, 'total') : 0;
    const pageLimit = Math.max(0, Math.min(limit, FB_HISTORY_CAP - offset));
    if (total === 0 || pageLimit === 0) return { total, rows: [] };
    const rows = await db.query<Row>(
      `select e.id as entry_id, e.match_id, r.code as room_code, m.ended_at, m.player_count,
              m.view_bars, m.play_bars, m.minutes, m.stake_xu as match_stake_xu, m.symbol,
              to_char(m.start_date, 'YYYY-MM-DD') as start_date_text,
              to_char(m.end_date, 'YYYY-MM-DD') as end_date_text,
              e.rank, e.pnl_pct, e.cash, e.final_nav, e.stake_xu, e.win_xu, e.refund_xu, e.points,
              (select count(*) from fb_entries t
                where t.match_id = e.match_id and t.rank = 1)::int as top_count
         from fb_entries e
         join fb_matches m on m.id = e.match_id
         join fb_rooms r on r.id = m.room_id
        where ${where}
        order by m.ended_at desc, m.id desc
        limit $3 offset $4`,
      [userId, filter.since, pageLimit, offset],
    );
    return {
      total,
      rows: rows.map((row): FbHistoryRow => ({
        entryId: String(row.entry_id),
        matchId: String(row.match_id),
        roomCode: String(row.room_code),
        endedAt: toDate(row.ended_at),
        playerCount: toInt(row.player_count, 'player_count'),
        viewBars: toInt(row.view_bars, 'view_bars'),
        playBars: toInt(row.play_bars, 'play_bars'),
        minutes: toInt(row.minutes, 'minutes'),
        matchStakeXu: toInt(row.match_stake_xu, 'match_stake_xu'),
        symbol: String(row.symbol),
        startDate: String(row.start_date_text),
        endDate: String(row.end_date_text),
        rank: toInt(row.rank, 'rank'),
        topCount: toInt(row.top_count, 'top_count'),
        pnlPct: Number(row.pnl_pct ?? 0),
        cash: toBigInt(row.cash, 'cash'),
        finalNav: toBigInt(row.final_nav ?? row.cash, 'final_nav'),
        stakeXu: toInt(row.stake_xu, 'stake_xu'),
        winXu: toInt(row.win_xu, 'win_xu'),
        refundXu: toInt(row.refund_xu, 'refund_xu'),
        points: toInt(row.points, 'points'),
      })),
    };
  }

  async historyPlayers(db: SqlClient, matchIds: readonly string[]): Promise<FbHistoryPlayerRow[]> {
    if (matchIds.length === 0) return [];
    const rows = await db.query<Row>(
      `select e.match_id, e.user_id, ${DISPLAY_NAME} as name, u.avatar_url, e.rank, e.pnl_pct,
              e.stake_xu, e.win_xu, e.refund_xu, e.points, e.joined_at,
              coalesce(s.points, 0) as total_points
         from fb_entries e
         join users u on u.id = e.user_id
         left join fb_player_stats s on s.user_id = e.user_id
        where e.match_id = any($1::uuid[])
        order by e.match_id, e.rank nulls last, e.joined_at, e.id`,
      [[...matchIds]],
    );
    return rows.map((row): FbHistoryPlayerRow => ({
      matchId: String(row.match_id),
      userId: String(row.user_id),
      name: String(row.name ?? ''),
      avatarUrl: toText(row.avatar_url),
      totalPoints: toInt(row.total_points, 'total_points'),
      rank: row.rank === null || row.rank === undefined ? 0 : toInt(row.rank, 'rank'),
      pnlPct: Number(row.pnl_pct ?? 0),
      stakeXu: toInt(row.stake_xu, 'stake_xu'),
      winXu: toInt(row.win_xu, 'win_xu'),
      refundXu: toInt(row.refund_xu, 'refund_xu'),
      points: toInt(row.points, 'points'),
      joinedAt: toDate(row.joined_at),
    }));
  }

  async historyOrders(db: SqlClient, entryIds: readonly string[]): Promise<FlashbackOrderRow[]> {
    if (entryIds.length === 0) return [];
    const rows = await db.query<Row>(
      `select ${ORDER_COLUMNS} from fb_orders where entry_id = any($1::uuid[])
        order by entry_id, created_at, id`,
      [[...entryIds]],
    );
    return rows.map(mapOrder);
  }

  async historySummary(
    db: SqlClient,
    userId: string,
    since: Date | null,
  ): Promise<FbHistorySummaryRow> {
    const rows = await db.query<Row>(
      `select count(*)::int as games,
              (count(*) filter (where m.player_count < 2))::int as solo_games,
              (count(*) filter (where m.player_count >= 2 and e.rank = 1))::int as wins,
              coalesce(sum(e.win_xu + e.refund_xu - e.stake_xu), 0)::text as xu_net,
              coalesce(sum(e.points), 0)::int as points,
              (avg(e.pnl_pct))::float8 as avg_pnl_pct,
              (max(e.pnl_pct))::float8 as best_pnl_pct,
              (select bm.symbol
                 from fb_entries be
                 join fb_matches bm on bm.id = be.match_id
                where be.user_id = $1 and bm.status <> 'playing' and be.rank is not null
                  and ($2::timestamptz is null or bm.ended_at >= $2::timestamptz)
                order by be.pnl_pct desc, bm.ended_at desc, bm.id desc
                limit 1) as best_symbol
         from fb_entries e
         join fb_matches m on m.id = e.match_id
        where e.user_id = $1 and m.status <> 'playing' and e.rank is not null
          and ($2::timestamptz is null or m.ended_at >= $2::timestamptz)`,
      [userId, since],
    );
    const row = rows[0] ?? {};
    const optional = (value: unknown) =>
      value === null || value === undefined ? null : Number(value);
    return {
      games: toInt(row.games ?? 0, 'games'),
      soloGames: toInt(row.solo_games ?? 0, 'solo_games'),
      wins: toInt(row.wins ?? 0, 'wins'),
      xuNet: toInt(row.xu_net ?? 0, 'xu_net'),
      points: toInt(row.points ?? 0, 'points'),
      avgPnlPct: optional(row.avg_pnl_pct),
      bestPnlPct: optional(row.best_pnl_pct),
      bestSymbol: toText(row.best_symbol),
    };
  }
}
