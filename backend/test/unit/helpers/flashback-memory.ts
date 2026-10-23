/**
 * Kho Flashback trong bộ nhớ cho test vòng đời nhiều đề (spec 22-10 QA-01..QA-05).
 *
 * - Nhiều đề, nhiều người chơi, ví xu, ledger (khoá duy nhất), thưởng đang giữ, rổ VN30.
 * - `transaction` chụp và khôi phục toàn bộ trạng thái khi lỗi, giống rollback của Postgres.
 * - Khoá phiên của tác vụ gắn với kết nối do `withDedicatedClient` cấp, như `pg_advisory_lock`.
 */

import type {
  DatabaseService,
  SqlClient,
} from '../../../src/platform/database/database.service.js';
import {
  FlashbackRepository,
  type FlashbackAlertLevel,
  type FlashbackEntryFinish,
  type FlashbackJobLogRow,
  type FlashbackLedgerEntry,
  type FlashbackPlayerEligibility,
  type NewFlashbackEntry,
  type NewFlashbackLot,
  type NewFlashbackOrder,
  type NewFlashbackRewardHold,
  type NewFlashbackRound,
} from '../../../src/modules/flashback/flashback.repository.js';
import type { FlashbackRoundStatus } from '../../../src/modules/flashback/flashback.constants.js';
import type {
  FlashbackEntryRow,
  FlashbackEntrySignal,
  FlashbackIndicatorInstance,
  FlashbackLeaderboardEntry,
  FlashbackLotRow,
  FlashbackOrderRow,
  FlashbackRewardHoldRow,
  FlashbackRewardHoldStatus,
  FlashbackRoundRow,
} from '../../../src/modules/flashback/flashback.types.js';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface MemoryUser {
  username: string;
  displayName: string | null;
  phone: string | null;
  phoneVerified: boolean;
  createdAt: Date;
}

export interface MemoryState {
  rounds: Mutable<FlashbackRoundRow>[];
  entries: (Mutable<FlashbackEntryRow> & { deviceId: string | null; joinIp: string | null })[];
  lots: Mutable<FlashbackLotRow>[];
  orders: FlashbackOrderRow[];
  wallets: Record<string, { balance: number; lastSeq: number }>;
  ledger: FlashbackLedgerEntry[];
  holds: FlashbackRewardHoldRow[];
  settings: Record<string, unknown>;
  jobLog: FlashbackJobLogRow[];
  vn30: { symbol: string; from: Date; to: Date | null }[];
  users: Record<string, MemoryUser>;
  seq: number;
}

export function emptyMemoryState(): MemoryState {
  return {
    rounds: [],
    entries: [],
    lots: [],
    orders: [],
    wallets: {},
    ledger: [],
    holds: [],
    settings: {},
    jobLog: [],
    vn30: [],
    users: {},
    seq: 0,
  };
}

/** Một lỗi giả lập chèn vào một bước của kho (để test ngắt giữa chừng). */
export type FaultHook = (method: string) => void;

export class MemoryFlashbackRepository extends FlashbackRepository {
  /** Kết nối đang giữ khoá tác vụ (null = chưa ai giữ). */
  lockHolder: SqlClient | null = null;
  lockAttempts = 0;
  fault: FaultHook | null = null;

  constructor(
    readonly state: MemoryState,
    private readonly now: () => Date,
  ) {
    super();
  }

  private id(prefix: string): string {
    this.state.seq += 1;
    return `${prefix}-${this.state.seq}`;
  }

  private check(method: string): void {
    this.fault?.(method);
  }

  // ------------------------------------------------------------------ đề
  async openRound() {
    return this.state.rounds.find((round) => round.status === 'open') ?? null;
  }
  async readyRound() {
    return this.state.rounds.find((round) => round.status === 'ready') ?? null;
  }
  async roundById(_db: SqlClient, id: string) {
    return this.state.rounds.find((round) => round.id === id) ?? null;
  }
  async listRounds(_db: SqlClient, limit: number) {
    this.check('listRounds');
    return [...this.state.rounds].sort((a, b) => b.roundNo - a.roundNo).slice(0, limit);
  }
  async nextRoundNo() {
    return this.state.rounds.reduce((max, round) => Math.max(max, round.roundNo), 0) + 1;
  }
  async insertRound(_tx: SqlClient, input: NewFlashbackRound) {
    // Ràng buộc unique: một đề `ready` và số đề không trùng.
    if (this.state.rounds.some((round) => round.status === 'ready')) return null;
    if (this.state.rounds.some((round) => round.roundNo === input.roundNo)) return null;
    const now = this.now();
    const round: Mutable<FlashbackRoundRow> = {
      id: this.id('round'),
      roundNo: input.roundNo,
      status: 'ready',
      symbol: input.symbol,
      startDate: input.startDate,
      warmupBars: input.warmupBars,
      bars: input.bars,
      scheduledOpenAt: input.scheduledOpenAt,
      opensAt: null,
      closesAt: null,
      fallbackLevel: input.fallbackLevel,
      priceSource: input.priceSource ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.state.rounds.push(round);
    return round;
  }
  async transitionRound(
    _tx: SqlClient,
    id: string,
    from: readonly FlashbackRoundStatus[],
    to: FlashbackRoundStatus,
    extra?: { opensAt?: Date; closesAt?: Date },
  ) {
    const round = this.state.rounds.find((item) => item.id === id);
    if (!round || !from.includes(round.status)) return null;
    // Ràng buộc unique: không bao giờ có hai đề `open`.
    if (
      to === 'open' &&
      round.status !== 'open' &&
      this.state.rounds.some((r) => r.status === 'open')
    )
      throw new Error('unique violation: two open rounds');
    round.status = to;
    if (extra?.opensAt) round.opensAt = extra.opensAt;
    if (extra?.closesAt) round.closesAt = extra.closesAt;
    round.updatedAt = this.now();
    return round;
  }
  async recentRoundSymbols(_db: SqlClient, limit: number) {
    return [...this.state.rounds]
      .sort((a, b) => b.roundNo - a.roundNo)
      .slice(0, limit)
      .map((round) => round.symbol);
  }
  async roundWindowsBySymbol() {
    return [];
  }
  async roundChartDates(_db: SqlClient, symbol: string) {
    return this.state.rounds
      .filter((round) => round.symbol === symbol)
      .map((round) => round.bars.map((bar) => bar.d));
  }
  async roundsByStatus(_db: SqlClient, status: FlashbackRoundStatus) {
    return this.state.rounds.filter((round) => round.status === status);
  }

  // ------------------------------------------------------------- lượt chơi
  async advanceEntryStep(_tx: SqlClient, id: string, fromStep: number, toStep: number) {
    const entry = this.state.entries.find((item) => item.id === id);
    if (!entry || entry.step !== fromStep || entry.status !== 'playing') return null;
    entry.step = toStep;
    return entry;
  }
  async leaderboardEntries(_db: SqlClient, roundId: string): Promise<FlashbackLeaderboardEntry[]> {
    return this.state.entries
      .filter((entry) => entry.roundId === roundId)
      .map((entry) => {
        const user = this.state.users[entry.userId];
        return {
          ...entry,
          username: user?.username ?? entry.userId,
          displayName: user ? user.displayName : entry.userId,
          phoneVerified: user?.phoneVerified ?? true,
          accountCreatedAt: user?.createdAt ?? new Date(0),
          phoneE164: user?.phone ?? null,
        };
      });
  }
  async teamMemberIds() {
    return [];
  }
  async entrySignals(_db: SqlClient, roundId: string): Promise<FlashbackEntrySignal[]> {
    return this.state.entries
      .filter((entry) => entry.roundId === roundId)
      .map((entry) => ({
        entryId: entry.id,
        userId: entry.userId,
        username: this.state.users[entry.userId]?.username ?? entry.userId,
        deviceId: entry.deviceId,
        joinIp: entry.joinIp,
        phone: this.state.users[entry.userId]?.phone ?? null,
      }));
  }
  async playerEligibility(
    _db: SqlClient,
    userId: string,
  ): Promise<FlashbackPlayerEligibility | null> {
    const user = this.state.users[userId];
    if (!user) return { phoneVerified: true, accountCreatedAt: new Date(0) };
    return { phoneVerified: user.phoneVerified, accountCreatedAt: user.createdAt };
  }
  async entryByRoundUser(_db: SqlClient, roundId: string, userId: string) {
    return (
      this.state.entries.find((entry) => entry.roundId === roundId && entry.userId === userId) ??
      null
    );
  }
  async entryById(_db: SqlClient, id: string) {
    return this.state.entries.find((entry) => entry.id === id) ?? null;
  }
  async countEntriesByUser(_db: SqlClient, userId: string) {
    return this.state.entries.filter((entry) => entry.userId === userId).length;
  }
  async insertEntry(_tx: SqlClient, input: NewFlashbackEntry) {
    if (this.state.entries.some((e) => e.roundId === input.roundId && e.userId === input.userId))
      return null;
    const entry = {
      id: this.id('entry'),
      roundId: input.roundId,
      userId: input.userId,
      joinedAt: this.now(),
      feeXu: input.feeXu,
      firstJoin: input.firstJoin,
      indicatorParams: [] as FlashbackIndicatorInstance[],
      step: 0,
      cash: input.cash,
      initialCash: input.initialCash,
      finishedAt: null,
      finalNav: null,
      pnlPct: null,
      maxDrawdown: null,
      rank: null,
      rewardXu: 0,
      status: 'playing' as const,
      deviceId: input.deviceId ?? null,
      joinIp: input.joinIp ?? null,
    };
    this.state.entries.push(entry);
    return entry;
  }
  async updateEntryStep(_tx: SqlClient, id: string, step: number) {
    const entry = this.state.entries.find((item) => item.id === id);
    if (!entry) return null;
    entry.step = step;
    return entry;
  }
  async updateEntryCash(_tx: SqlClient, id: string, cash: bigint) {
    const entry = this.state.entries.find((item) => item.id === id);
    if (!entry) return null;
    entry.cash = cash;
    return entry;
  }
  async updateEntryIndicators(
    _tx: SqlClient,
    id: string,
    indicators: readonly FlashbackIndicatorInstance[],
  ) {
    const entry = this.state.entries.find((item) => item.id === id);
    if (!entry) return null;
    entry.indicatorParams = [...indicators];
    return entry;
  }
  async finishEntry(_tx: SqlClient, id: string, result: FlashbackEntryFinish) {
    const entry = this.state.entries.find((item) => item.id === id);
    if (!entry || entry.status !== 'playing') return null;
    entry.status = 'finished';
    entry.finalNav = result.finalNav;
    entry.pnlPct = result.pnlPct;
    entry.maxDrawdown = result.maxDrawdown;
    entry.finishedAt = result.finishedAt;
    return entry;
  }
  async assignEntryRanking(_tx: SqlClient, id: string, rank: number, rewardXu: number) {
    const entry = this.state.entries.find((item) => item.id === id);
    if (!entry) return null;
    entry.rank = rank;
    entry.rewardXu = rewardXu;
    return entry;
  }
  async listEntriesByRound(_db: SqlClient, roundId: string) {
    return this.state.entries.filter((entry) => entry.roundId === roundId);
  }
  async countEntriesByRound(_db: SqlClient, roundId: string) {
    return this.state.entries.filter((entry) => entry.roundId === roundId).length;
  }
  async holdingsByRound(_db: SqlClient, roundId: string) {
    const map = new Map<string, number>();
    for (const lot of this.state.lots) {
      const entry = this.state.entries.find((item) => item.id === lot.entryId);
      if (!entry || entry.roundId !== roundId) continue;
      map.set(lot.entryId, (map.get(lot.entryId) ?? 0) + lot.qty);
    }
    return map;
  }

  // ------------------------------------------------------------- lô và lệnh
  async lotsByEntry(_db: SqlClient, entryId: string) {
    return this.state.lots.filter((lot) => lot.entryId === entryId && lot.qty > 0);
  }
  async insertLot(_tx: SqlClient, input: NewFlashbackLot) {
    const lot = { id: this.id('lot'), ...input, createdAt: this.now() };
    this.state.lots.push(lot);
    return lot;
  }
  async consumeLot(_tx: SqlClient, id: string, qty: number) {
    const lot = this.state.lots.find((item) => item.id === id);
    if (!lot || lot.qty < qty) return false;
    lot.qty -= qty;
    return true;
  }
  async insertOrder(_tx: SqlClient, input: NewFlashbackOrder) {
    const order: FlashbackOrderRow = { id: this.id('order'), ...input, createdAt: this.now() };
    this.state.orders.push(order);
    return order;
  }
  async ordersByEntry(_db: SqlClient, entryId: string) {
    return this.state.orders.filter((order) => order.entryId === entryId);
  }
  async orderByIdempotencyKey(_db: SqlClient, entryId: string, key: string) {
    return (
      this.state.orders.find(
        (order) => order.entryId === entryId && order.idempotencyKey === key,
      ) ?? null
    );
  }

  // ------------------------------------------------------------------ ví
  async lockWallet(_tx: SqlClient, userId: string) {
    return { ...(this.state.wallets[userId] ?? { balance: 0, lastSeq: 0 }) };
  }
  async saveWallet(_tx: SqlClient, userId: string, balance: number, lastSeq: number) {
    this.state.wallets[userId] = { balance, lastSeq };
  }
  async appendLedger(_tx: SqlClient, entry: FlashbackLedgerEntry) {
    this.check('appendLedger');
    if (this.state.ledger.some((item) => item.uniqueKey === entry.uniqueKey)) return false;
    this.state.ledger.push(entry);
    return true;
  }

  // ------------------------------------------------------- thưởng đang giữ
  async insertRewardHold(_tx: SqlClient, input: NewFlashbackRewardHold) {
    if (this.state.holds.some((h) => h.roundId === input.roundId && h.userId === input.userId))
      return false;
    const round = this.state.rounds.find((item) => item.id === input.roundId);
    this.state.holds.push({
      id: this.id('hold'),
      roundId: input.roundId,
      roundNo: round?.roundNo ?? 0,
      userId: input.userId,
      username: this.state.users[input.userId]?.username ?? input.userId,
      entryId: input.entryId,
      amount: input.amount,
      reason: input.reason,
      status: 'held',
      decidedBy: null,
      decidedAt: null,
      createdAt: this.now(),
    });
    return true;
  }
  async listRewardHolds(
    _db: SqlClient,
    filter: { status?: FlashbackRewardHoldStatus; roundId?: string; limit: number },
  ) {
    return this.state.holds
      .filter(
        (hold) =>
          (!filter.status || hold.status === filter.status) &&
          (!filter.roundId || hold.roundId === filter.roundId),
      )
      .slice(0, filter.limit);
  }
  async lockRewardHold(_tx: SqlClient, id: string) {
    return this.state.holds.find((hold) => hold.id === id) ?? null;
  }
  async decideRewardHold(
    _tx: SqlClient,
    id: string,
    status: Exclude<FlashbackRewardHoldStatus, 'held'>,
    decidedBy: string,
    decidedAt: Date,
  ) {
    const index = this.state.holds.findIndex((hold) => hold.id === id && hold.status === 'held');
    if (index < 0) return false;
    this.state.holds[index] = { ...this.state.holds[index]!, status, decidedBy, decidedAt };
    return true;
  }

  // -------------------------------------------------------------- cấu hình
  async getSetting(_db: SqlClient, key: string) {
    return this.state.settings[key] ?? null;
  }
  async setSetting(_tx: SqlClient, key: string, value: unknown) {
    this.state.settings[key] = value;
  }

  // -------------------------------------------------------------- nhật ký
  async appendJobLog(
    _tx: SqlClient,
    entry: {
      step: string;
      roundId: string | null;
      result: string;
      error: string | null;
      level?: FlashbackAlertLevel | null;
    },
  ) {
    this.state.jobLog.push({
      runAt: this.now(),
      step: entry.step,
      roundId: entry.roundId,
      result: entry.result,
      error: entry.error,
      level: entry.level ?? null,
    });
  }
  async listJobLog(_db: SqlClient, limit: number) {
    return [...this.state.jobLog].reverse().slice(0, limit);
  }
  async hasRecentAlert(
    _db: SqlClient,
    roundId: string | null,
    level: FlashbackAlertLevel,
    withinMinutes: number,
  ) {
    const since = this.now().getTime() - withinMinutes * 60_000;
    return this.state.jobLog.some(
      (row) =>
        row.step === 'alert' &&
        row.roundId === roundId &&
        row.level === level &&
        row.runAt.getTime() >= since,
    );
  }

  // ------------------------------------------------------------------ VN30
  async listCurrentVn30() {
    return this.state.vn30
      .filter((row) => row.to === null)
      .map((row) => row.symbol)
      .sort();
  }
  async syncVn30(_tx: SqlClient, symbols: readonly string[], at: Date) {
    const current = new Set(await this.listCurrentVn30());
    const next = new Set(symbols);
    const removed = [...current].filter((symbol) => !next.has(symbol)).sort();
    const added = [...next].filter((symbol) => !current.has(symbol)).sort();
    for (const row of this.state.vn30) {
      if (row.to === null && removed.includes(row.symbol)) row.to = at;
    }
    for (const symbol of added) this.state.vn30.push({ symbol, from: at, to: null });
    return { added, removed };
  }

  // -------------------------------------------------------------- khoá job
  override async tryAcquireJobLock(client: SqlClient) {
    this.lockAttempts += 1;
    await Promise.resolve();
    if (this.lockHolder !== null && this.lockHolder !== client) return false;
    this.lockHolder = client;
    return true;
  }
  override async releaseJobLock(client: SqlClient) {
    if (this.lockHolder === client) this.lockHolder = null;
  }
}

/** DatabaseService giả: transaction có rollback, kết nối riêng huỷ khoá khi lỗi. */
export function memoryDatabase(repository: MemoryFlashbackRepository): DatabaseService {
  const client = (): SqlClient => ({ query: async () => [] }) as SqlClient;
  return {
    query: async () => [],
    transaction: async <T>(operation: (tx: SqlClient) => Promise<T>): Promise<T> => {
      const snapshot = structuredClone(repository.state);
      try {
        return await operation(client());
      } catch (error) {
        Object.assign(repository.state, snapshot);
        throw error;
      }
    },
    withDedicatedClient: async <T>(operation: (client: SqlClient) => Promise<T>): Promise<T> => {
      const dedicated = client();
      try {
        return await operation(dedicated);
      } catch (error) {
        // Kết nối lỗi bị huỷ: Postgres tự nhả khoá phiên của nó.
        if (repository.lockHolder === dedicated) repository.lockHolder = null;
        throw error;
      }
    },
  } as unknown as DatabaseService;
}

/** Bộ sinh số giả ngẫu nhiên có hạt giống (mulberry32), để test lặp lại được. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
