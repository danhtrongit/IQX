/**
 * Kho phòng chơi Flashback v2 trong bộ nhớ (cho test đơn vị của FlashbackRoomsService).
 * Bắt chước các ràng buộc quan trọng của migration 0033: code duy nhất trong phòng chưa đóng, mỗi
 * tài khoản một phòng, khoá ledger duy nhất, ví không âm; và của migration 0038: điểm chỉ cộng cho
 * dòng chưa có points_awarded_at, bảng xếp hạng theo điểm, ván thắng, mốc đạt điểm.
 */

import { randomUUID } from 'node:crypto';

import type {
  DatabaseService,
  SqlClient,
} from '../../../src/platform/database/database.service.js';
import { compareRank } from '../../../src/modules/flashback/flashback-rooms.logic.js';
import {
  FB_HISTORY_CAP,
  FlashbackRoomsRepository,
  type FbAwardInput,
  type FbEntryPatch,
  type FbEntryPlayerRow,
  type FbEntryRow,
  type FbHistoryFilter,
  type FbHistoryPlayerRow,
  type FbHistoryRow,
  type FbHistorySummaryRow,
  type FbLeaderboardRow,
  type FbLedgerEntry,
  type FbMatchPatch,
  type FbMatchRow,
  type FbMemberRow,
  type FbRoomListRow,
  type FbRoomPatch,
  type FbRoomRow,
  type NewFbEntry,
  type NewFbLot,
  type NewFbMatch,
  type NewFbOrder,
  type NewFbRoom,
} from '../../../src/modules/flashback/flashback-rooms.repository.js';
import type {
  FlashbackLotRow,
  FlashbackOrderRow,
} from '../../../src/modules/flashback/flashback.types.js';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

interface MemberRecord {
  id: string;
  roomId: string;
  userId: string;
  joinedAt: Date;
  leftAt: Date | null;
  leftReason: string | null;
  notice: string | null;
}

export interface MemoryRoomsState {
  users: Map<string, { name: string; avatarUrl: string | null }>;
  rooms: Mutable<FbRoomRow>[];
  members: MemberRecord[];
  matches: Mutable<FbMatchRow>[];
  entries: Mutable<FbEntryRow>[];
  lots: Mutable<FlashbackLotRow>[];
  orders: FlashbackOrderRow[];
  wallets: Map<string, { balance: number; lastSeq: number }>;
  ledger: (FbLedgerEntry & { createdAt: Date })[];
  /** fb_player_stats: chỉ người đã chơi ván từ 2 người (hoặc được đặt sẵn trong test). */
  stats: Map<string, MemoryStats>;
}

export interface MemoryStats {
  points: number;
  games: number;
  wins: number;
  reachedPointsAt: Date;
}

export function memoryDatabase(): DatabaseService {
  const client = { query: async () => [] } as unknown as SqlClient;
  return {
    query: async () => [],
    transaction: async (operation: (tx: SqlClient) => Promise<unknown>) => operation(client),
    withDedicatedClient: async (operation: (tx: SqlClient) => Promise<unknown>) =>
      operation(client),
  } as unknown as DatabaseService;
}

export class MemoryRoomsRepository extends FlashbackRoomsRepository {
  readonly state: MemoryRoomsState = {
    users: new Map(),
    rooms: [],
    members: [],
    matches: [],
    entries: [],
    lots: [],
    orders: [],
    wallets: new Map(),
    ledger: [],
    stats: new Map(),
  };

  /** Mã phòng cấp lần lượt khi test cần mã cố định. */
  forcedCodes: string[] = [];
  private seq = 0;

  addUser(id: string, name: string, balance = 0): void {
    this.state.users.set(id, { name, avatarUrl: null });
    this.state.wallets.set(id, { balance, lastSeq: 0 });
  }

  balanceOf(userId: string): number {
    return this.state.wallets.get(userId)?.balance ?? 0;
  }

  /** Đặt sẵn bảng điểm của một người (để dựng bảng xếp hạng trong test). */
  setStats(userId: string, stats: Partial<MemoryStats> & { points: number }): void {
    this.state.stats.set(userId, { games: 1, wins: 0, reachedPointsAt: new Date(0), ...stats });
  }

  totalPointsOf(userId: string): number {
    return this.state.stats.get(userId)?.points ?? 0;
  }

  private user(userId: string) {
    return this.state.users.get(userId) ?? { name: userId, avatarUrl: null };
  }

  private ranked(): (FbLeaderboardRow & { reachedPointsAt: Date })[] {
    return [...this.state.stats.entries()]
      .filter(([, stats]) => stats.games > 0)
      .map(([userId, stats]) => ({ userId, ...stats }))
      .sort(compareRank)
      .map((row, index) => ({
        rank: index + 1,
        userId: row.userId,
        name: this.user(row.userId).name,
        avatarUrl: this.user(row.userId).avatarUrl,
        points: row.points,
        games: row.games,
        wins: row.wins,
        reachedPointsAt: row.reachedPointsAt,
      }));
  }

  async insertRoom(_tx: SqlClient, input: NewFbRoom): Promise<FbRoomRow | null> {
    const code = this.forcedCodes.shift() ?? input.code;
    if (this.state.rooms.some((room) => room.code === code && room.status !== 'closed'))
      return null;
    const room: Mutable<FbRoomRow> = {
      id: randomUUID(),
      code,
      ownerId: input.ownerId,
      viewBars: input.viewBars,
      playBars: input.playBars,
      minutes: input.minutes,
      maxPlayers: input.maxPlayers,
      stakeXu: input.stakeXu,
      passwordHash: input.passwordHash,
      status: 'waiting',
      currentMatchId: null,
      matchCount: 0,
      createdAt: new Date(input.now.getTime() + this.seq++),
      waitingSince: input.now,
      closedAt: null,
    };
    this.state.rooms.push(room);
    return { ...room };
  }

  async roomByCode(_db: SqlClient, code: string): Promise<FbRoomRow | null> {
    const room = this.state.rooms.find((item) => item.code === code && item.status !== 'closed');
    return room ? { ...room } : null;
  }

  async roomById(_db: SqlClient, id: string): Promise<FbRoomRow | null> {
    const room = this.state.rooms.find((item) => item.id === id);
    return room ? { ...room } : null;
  }

  async listOpenRooms(
    _db: SqlClient,
    status: 'all' | 'waiting' | 'playing',
    limit: number,
  ): Promise<FbRoomListRow[]> {
    return this.state.rooms
      .filter((room) => room.status !== 'closed' && (status === 'all' || room.status === status))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit)
      .map((room) => ({
        ...room,
        ownerName: this.user(room.ownerId).name,
        ownerAvatarUrl: null,
        ownerTotalPoints: this.totalPointsOf(room.ownerId),
        memberCount: this.state.members.filter((m) => m.roomId === room.id && !m.leftAt).length,
      }));
  }

  async updateRoom(_tx: SqlClient, id: string, patch: FbRoomPatch): Promise<FbRoomRow | null> {
    const room = this.state.rooms.find((item) => item.id === id);
    if (!room) return null;
    if (patch.status !== undefined) room.status = patch.status;
    if (patch.ownerId !== undefined) room.ownerId = patch.ownerId;
    if (patch.currentMatchId !== undefined) room.currentMatchId = patch.currentMatchId;
    if (patch.matchCount !== undefined) room.matchCount = patch.matchCount;
    if (patch.waitingSince !== undefined) room.waitingSince = patch.waitingSince;
    if (patch.closedAt !== undefined) room.closedAt = patch.closedAt;
    return { ...room };
  }

  async staleRoomIds(_db: SqlClient, waitingBefore: Date, endedBefore: Date): Promise<string[]> {
    return this.state.rooms
      .filter((room) => {
        if (room.status === 'waiting')
          return room.waitingSince.getTime() <= waitingBefore.getTime();
        if (room.status !== 'playing') return false;
        const match = this.state.matches.find((item) => item.id === room.currentMatchId);
        return match?.status === 'paid' && !!match.paidAt && match.paidAt <= endedBefore;
      })
      .map((room) => room.id);
  }

  async activeMembers(_db: SqlClient, roomId: string): Promise<FbMemberRow[]> {
    return this.state.members
      .filter((member) => member.roomId === roomId && !member.leftAt)
      .sort((left, right) => left.joinedAt.getTime() - right.joinedAt.getTime())
      .map((member) => ({
        roomId: member.roomId,
        userId: member.userId,
        joinedAt: member.joinedAt,
        name: this.user(member.userId).name,
        avatarUrl: null,
        totalPoints: this.totalPointsOf(member.userId),
      }));
  }

  async activeRoomIdOf(_db: SqlClient, userId: string): Promise<string | null> {
    return this.state.members.find((m) => m.userId === userId && !m.leftAt)?.roomId ?? null;
  }

  async addMember(_tx: SqlClient, roomId: string, userId: string, at: Date): Promise<boolean> {
    if (this.state.members.some((m) => m.userId === userId && !m.leftAt)) return false;
    this.state.members.push({
      id: randomUUID(),
      roomId,
      userId,
      joinedAt: new Date(at.getTime() + this.seq++),
      leftAt: null,
      leftReason: null,
      notice: null,
    });
    return true;
  }

  async removeMember(
    _tx: SqlClient,
    roomId: string,
    userId: string,
    reason: string,
    notice: string | null,
    at: Date,
  ): Promise<boolean> {
    const member = this.state.members.find(
      (m) => m.roomId === roomId && m.userId === userId && !m.leftAt,
    );
    if (!member) return false;
    member.leftAt = at;
    member.leftReason = reason;
    member.notice = notice;
    return true;
  }

  async removeAllMembers(_tx: SqlClient, roomId: string, reason: string, at: Date): Promise<void> {
    for (const member of this.state.members)
      if (member.roomId === roomId && !member.leftAt) {
        member.leftAt = at;
        member.leftReason = reason;
      }
  }

  async takeNotice(_tx: SqlClient, userId: string): Promise<string | null> {
    const withNotice = this.state.members
      .filter((m) => m.userId === userId && m.notice)
      .sort((left, right) => (right.leftAt?.getTime() ?? 0) - (left.leftAt?.getTime() ?? 0));
    const latest = withNotice[0]?.notice ?? null;
    for (const member of withNotice) member.notice = null;
    return latest;
  }

  async balance(_db: SqlClient, userId: string): Promise<number> {
    return this.balanceOf(userId);
  }

  async lockWallet(_tx: SqlClient, userId: string): Promise<{ balance: number; lastSeq: number }> {
    const wallet = this.state.wallets.get(userId) ?? { balance: 0, lastSeq: 0 };
    this.state.wallets.set(userId, wallet);
    return { ...wallet };
  }

  async saveWallet(
    _tx: SqlClient,
    userId: string,
    balance: number,
    lastSeq: number,
  ): Promise<void> {
    if (balance < 0) throw new Error('ck_coin_wallets_balance_non_negative');
    this.state.wallets.set(userId, { balance, lastSeq });
  }

  async appendLedger(_tx: SqlClient, entry: FbLedgerEntry): Promise<boolean> {
    if (this.state.ledger.some((row) => row.uniqueKey === entry.uniqueKey)) return false;
    this.state.ledger.push({ ...entry, createdAt: new Date() });
    return true;
  }

  async insertMatch(_tx: SqlClient, input: NewFbMatch): Promise<FbMatchRow> {
    const match: Mutable<FbMatchRow> = {
      id: randomUUID(),
      ...input,
      status: 'playing',
      endedAt: null,
      endReason: null,
      paidAt: null,
    };
    this.state.matches.push(match);
    return { ...match };
  }

  async matchById(_db: SqlClient, id: string): Promise<FbMatchRow | null> {
    const match = this.state.matches.find((item) => item.id === id);
    return match ? { ...match } : null;
  }

  async updateMatch(_tx: SqlClient, id: string, patch: FbMatchPatch): Promise<FbMatchRow | null> {
    const match = this.state.matches.find((item) => item.id === id);
    if (!match) return null;
    if (patch.status !== undefined) match.status = patch.status;
    if (patch.endedAt !== undefined) match.endedAt = patch.endedAt;
    if (patch.endReason !== undefined) match.endReason = patch.endReason;
    if (patch.paidAt !== undefined) match.paidAt = patch.paidAt;
    return { ...match };
  }

  async dueMatchIds(_db: SqlClient, now: Date): Promise<string[]> {
    return this.state.matches
      .filter((match) => match.status === 'playing' && match.endsAt <= now)
      .map((match) => match.id);
  }

  async insertEntry(_tx: SqlClient, input: NewFbEntry): Promise<FbEntryRow> {
    if (this.state.entries.some((e) => e.matchId === input.matchId && e.userId === input.userId))
      throw new Error('uq_fb_entries_match_user');
    const entry: Mutable<FbEntryRow> = {
      id: randomUUID(),
      matchId: input.matchId,
      userId: input.userId,
      stakeXu: input.stakeXu,
      step: 0,
      cash: input.cash,
      initialCash: input.cash,
      navByStep: [input.cash],
      joinedAt: input.joinedAt,
      finishedAt: null,
      autoFinished: false,
      finalNav: null,
      pnlPct: null,
      rank: null,
      winXu: 0,
      refundXu: 0,
      status: 'playing',
      points: 0,
      isWin: false,
      pointsAwardedAt: null,
    };
    this.state.entries.push(entry);
    return { ...entry };
  }

  async entryByMatchUser(
    _db: SqlClient,
    matchId: string,
    userId: string,
  ): Promise<FbEntryRow | null> {
    const entry = this.state.entries.find((e) => e.matchId === matchId && e.userId === userId);
    return entry ? { ...entry, navByStep: [...entry.navByStep] } : null;
  }

  async entriesByMatch(_db: SqlClient, matchId: string): Promise<FbEntryPlayerRow[]> {
    return this.state.entries
      .filter((entry) => entry.matchId === matchId)
      .sort((left, right) => left.joinedAt.getTime() - right.joinedAt.getTime())
      .map((entry) => ({
        ...entry,
        navByStep: [...entry.navByStep],
        name: this.user(entry.userId).name,
        avatarUrl: null,
        totalPoints: this.totalPointsOf(entry.userId),
      }));
  }

  async updateEntry(_tx: SqlClient, id: string, patch: FbEntryPatch): Promise<FbEntryRow | null> {
    const entry = this.state.entries.find((item) => item.id === id);
    if (!entry) return null;
    if (patch.cash !== undefined && patch.cash < 0n) throw new Error('ck_fb_entries_cash');
    Object.assign(
      entry,
      Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
    );
    if (patch.navByStep) entry.navByStep = [...patch.navByStep];
    return { ...entry, navByStep: [...entry.navByStep] };
  }

  async lotsByEntry(_db: SqlClient, entryId: string): Promise<FlashbackLotRow[]> {
    return this.state.lots
      .filter((lot) => lot.entryId === entryId && lot.qty > 0)
      .map((lot) => ({ ...lot }));
  }

  async insertLot(_tx: SqlClient, input: NewFbLot): Promise<FlashbackLotRow> {
    const lot: Mutable<FlashbackLotRow> = { id: randomUUID(), ...input, createdAt: new Date() };
    this.state.lots.push(lot);
    return { ...lot };
  }

  async consumeLot(_tx: SqlClient, lotId: string, qty: number): Promise<boolean> {
    const lot = this.state.lots.find((item) => item.id === lotId);
    if (!lot || lot.qty < qty) return false;
    lot.qty -= qty;
    return true;
  }

  async insertOrder(_tx: SqlClient, input: NewFbOrder): Promise<FlashbackOrderRow | null> {
    if (
      input.idempotencyKey &&
      this.state.orders.some(
        (o) => o.entryId === input.entryId && o.idempotencyKey === input.idempotencyKey,
      )
    )
      return null;
    const order: FlashbackOrderRow = { id: randomUUID(), ...input, createdAt: new Date() };
    this.state.orders.push(order);
    return order;
  }

  async ordersByEntry(_db: SqlClient, entryId: string): Promise<FlashbackOrderRow[]> {
    return this.state.orders.filter((order) => order.entryId === entryId);
  }

  async orderByIdempotencyKey(
    _db: SqlClient,
    entryId: string,
    key: string,
  ): Promise<FlashbackOrderRow | null> {
    return this.state.orders.find((o) => o.entryId === entryId && o.idempotencyKey === key) ?? null;
  }

  // ------------------------------------------------------------------ cấp, điểm, hạng (0038)

  async awardEntry(_tx: SqlClient, input: FbAwardInput): Promise<boolean> {
    const entry = this.state.entries.find((item) => item.id === input.entryId);
    if (!entry || entry.pointsAwardedAt) return false;
    entry.points = input.points;
    entry.isWin = input.isWin;
    entry.pointsAwardedAt = input.at;
    if (input.counted) {
      const stats = this.state.stats.get(input.userId) ?? {
        points: 0,
        games: 0,
        wins: 0,
        reachedPointsAt: input.at,
      };
      stats.points += input.points;
      stats.games += 1;
      stats.wins += input.isWin ? 1 : 0;
      if (input.points > 0) stats.reachedPointsAt = input.at;
      this.state.stats.set(input.userId, stats);
    }
    return true;
  }

  async pendingAwardMatchIds(_db: SqlClient, limit: number): Promise<string[]> {
    return this.state.matches
      .filter(
        (match) =>
          match.status !== 'playing' &&
          this.state.entries.some(
            (entry) =>
              entry.matchId === match.id &&
              entry.status === 'finished' &&
              entry.pointsAwardedAt === null,
          ),
      )
      .sort((left, right) => (left.endedAt?.getTime() ?? 0) - (right.endedAt?.getTime() ?? 0))
      .slice(0, limit)
      .map((match) => match.id);
  }

  async leaderboard(_db: SqlClient, limit: number): Promise<FbLeaderboardRow[]> {
    return this.ranked()
      .slice(0, limit)
      .map(({ reachedPointsAt: _at, ...row }) => row);
  }

  async leaderboardRow(_db: SqlClient, userId: string): Promise<FbLeaderboardRow | null> {
    const found = this.ranked().find((row) => row.userId === userId);
    if (!found) return null;
    const { reachedPointsAt: _at, ...row } = found;
    return row;
  }

  async top3(_db: SqlClient): Promise<string[]> {
    return this.ranked()
      .slice(0, 3)
      .map((row) => row.userId);
  }

  async pointsThroughEntry(_db: SqlClient, entryId: string): Promise<number> {
    const entry = this.state.entries.find((item) => item.id === entryId);
    if (!entry?.pointsAwardedAt) return 0;
    const at = entry.pointsAwardedAt.getTime();
    return this.state.entries
      .filter(
        (other) =>
          other.userId === entry.userId &&
          other.pointsAwardedAt !== null &&
          (other.pointsAwardedAt.getTime() < at ||
            (other.pointsAwardedAt.getTime() === at && other.id <= entry.id)),
      )
      .reduce((sum, other) => sum + other.points, 0);
  }

  private historyEntries(userId: string, filter: FbHistoryFilter) {
    return this.state.entries
      .map((entry) => ({ entry, match: this.state.matches.find((m) => m.id === entry.matchId) }))
      .filter(
        (item): item is { entry: Mutable<FbEntryRow>; match: Mutable<FbMatchRow> } =>
          item.match !== undefined,
      )
      .filter(({ entry, match }) => {
        if (entry.userId !== userId || match.status === 'playing' || entry.rank === null)
          return false;
        if (filter.since && (!match.endedAt || match.endedAt < filter.since)) return false;
        const multi = match.playerCount >= 2;
        if (filter.result === 'solo') return !multi;
        if (filter.result === 'win') return multi && entry.rank === 1;
        if (filter.result === 'lose') return multi && entry.rank !== 1;
        return true;
      })
      .sort(
        (left, right) =>
          (right.match.endedAt?.getTime() ?? 0) - (left.match.endedAt?.getTime() ?? 0) ||
          (right.match.id < left.match.id ? -1 : right.match.id > left.match.id ? 1 : 0),
      );
  }

  async historyPage(
    _db: SqlClient,
    userId: string,
    filter: FbHistoryFilter,
    offset: number,
    limit: number,
  ): Promise<{ total: number; rows: FbHistoryRow[] }> {
    const all = this.historyEntries(userId, filter).slice(0, FB_HISTORY_CAP);
    const pageLimit = Math.max(0, Math.min(limit, FB_HISTORY_CAP - offset));
    const rows = all.slice(offset, offset + pageLimit).map(({ entry, match }): FbHistoryRow => {
      const room = this.state.rooms.find((item) => item.id === match.roomId);
      return {
        entryId: entry.id,
        matchId: match.id,
        roomCode: room?.code ?? '',
        endedAt: match.endedAt ?? new Date(0),
        playerCount: match.playerCount,
        viewBars: match.viewBars,
        playBars: match.playBars,
        minutes: match.minutes,
        matchStakeXu: match.stakeXu,
        symbol: match.symbol,
        startDate: match.startDate,
        endDate: match.endDate,
        rank: entry.rank ?? 0,
        topCount: this.state.entries.filter((t) => t.matchId === match.id && t.rank === 1).length,
        pnlPct: entry.pnlPct ?? 0,
        cash: entry.cash,
        finalNav: entry.finalNav ?? entry.cash,
        stakeXu: entry.stakeXu,
        winXu: entry.winXu,
        refundXu: entry.refundXu,
        points: entry.points,
      };
    });
    return { total: all.length, rows };
  }

  async historyPlayers(_db: SqlClient, matchIds: readonly string[]): Promise<FbHistoryPlayerRow[]> {
    return this.state.entries
      .filter((entry) => matchIds.includes(entry.matchId))
      .sort(
        (left, right) =>
          (left.rank ?? 99) - (right.rank ?? 99) ||
          left.joinedAt.getTime() - right.joinedAt.getTime(),
      )
      .map((entry): FbHistoryPlayerRow => ({
        matchId: entry.matchId,
        userId: entry.userId,
        name: this.user(entry.userId).name,
        avatarUrl: null,
        totalPoints: this.totalPointsOf(entry.userId),
        rank: entry.rank ?? 0,
        pnlPct: entry.pnlPct ?? 0,
        stakeXu: entry.stakeXu,
        winXu: entry.winXu,
        refundXu: entry.refundXu,
        points: entry.points,
        joinedAt: entry.joinedAt,
      }));
  }

  async historyOrders(_db: SqlClient, entryIds: readonly string[]): Promise<FlashbackOrderRow[]> {
    return this.state.orders.filter((order) => entryIds.includes(order.entryId));
  }

  async historySummary(
    _db: SqlClient,
    userId: string,
    since: Date | null,
  ): Promise<FbHistorySummaryRow> {
    const items = this.historyEntries(userId, { result: 'all', since });
    const best = [...items].sort(
      (left, right) =>
        (right.entry.pnlPct ?? 0) - (left.entry.pnlPct ?? 0) ||
        (right.match.endedAt?.getTime() ?? 0) - (left.match.endedAt?.getTime() ?? 0),
    )[0];
    return {
      games: items.length,
      soloGames: items.filter(({ match }) => match.playerCount < 2).length,
      wins: items.filter(({ entry, match }) => match.playerCount >= 2 && entry.rank === 1).length,
      xuNet: items.reduce(
        (sum, { entry }) => sum + entry.winXu + entry.refundXu - entry.stakeXu,
        0,
      ),
      points: items.reduce((sum, { entry }) => sum + entry.points, 0),
      avgPnlPct: items.length
        ? items.reduce((sum, { entry }) => sum + (entry.pnlPct ?? 0), 0) / items.length
        : null,
      bestPnlPct: best ? (best.entry.pnlPct ?? 0) : null,
      bestSymbol: best?.match.symbol ?? null,
    };
  }
}
