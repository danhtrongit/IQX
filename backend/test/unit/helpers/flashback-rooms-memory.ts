/**
 * Kho phòng chơi Flashback v2 trong bộ nhớ (cho test đơn vị của FlashbackRoomsService).
 * Bắt chước các ràng buộc quan trọng của migration 0033: code duy nhất trong phòng chưa đóng, mỗi
 * tài khoản một phòng, khoá ledger duy nhất, ví không âm.
 */

import { randomUUID } from 'node:crypto';

import type {
  DatabaseService,
  SqlClient,
} from '../../../src/platform/database/database.service.js';
import {
  FlashbackRoomsRepository,
  type FbEntryPatch,
  type FbEntryPlayerRow,
  type FbEntryRow,
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

  private user(userId: string) {
    return this.state.users.get(userId) ?? { name: userId, avatarUrl: null };
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
}
