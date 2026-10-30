/**
 * Nghiệp vụ Flashback v2 · Phòng chơi (docs/flashback-v2-rooms/IQX-Flashback-SPEC.md, DESIGN.md).
 *
 * Luồng: Sảnh → Phòng chờ → Màn chơi → Kết quả → Chơi lại / Về sảnh. Server là nguồn chuẩn (§9):
 * giá khớp, phí, thuế, T+2, đồng hồ và nến kế tiếp đều do server quyết định; mã, ngày thật và nến
 * tương lai không bao giờ rời server trước khi ván kết thúc. Cập nhật phòng và thanh người chơi
 * dùng polling (DESIGN: "realtime hoặc làm mới mỗi vài giây").
 */

import { randomInt } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/database.service.js';
import { roundBasisPoints } from '../trading/trading.service.js';
import {
  FLASHBACK_FEE_BPS,
  FLASHBACK_SETTLEMENT_SESSIONS,
  FLASHBACK_TAX_BPS,
} from './flashback.constants.js';
import {
  FB_INITIAL_CASH_VND,
  FB_ROOM_ENDED_TTL_MS,
  FB_ROOM_WAITING_TTL_MS,
  formatXu,
  hashRoomPassword,
  isRoomCode,
  joinCheck,
  navAtStep,
  navOf,
  pnlFraction,
  priceAtStep,
  publicChart,
  randomJoinCandidates,
  resultTitle,
  resultXuLabel,
  settleMatch,
  toPublicBar,
  barAtStep,
  validateRoomSettings,
  verifyRoomPassword,
  visibleStep,
  type FbPublicBar,
  type FbRoomSettingsInput,
} from './flashback-rooms.logic.js';
import {
  FLASHBACK_ROOMS_REPOSITORY,
  FlashbackRoomsRepository,
  fbLedgerKey,
  type FbEntryPlayerRow,
  type FbEntryRow,
  type FbLedgerKind,
  type FbMatchRow,
  type FbMemberRow,
  type FbRoomListRow,
  type FbRoomRow,
} from './flashback-rooms.repository.js';
import {
  FLASHBACK_CLOCK,
  maxBuyQty,
  type FlashbackClock,
  type FlashbackOrderView,
  type FlashbackPositionView,
} from './flashback.service.js';
import type { FlashbackBar, FlashbackLotRow, FlashbackOrderRow } from './flashback.types.js';

// ------------------------------------------------------------------ cổng dữ liệu ván

/** Bộ dữ liệu một ván: mã VN30 và giai đoạn đã điều chỉnh (§5). Chỉ server. */
export interface FbMatchDataset {
  readonly symbol: string;
  readonly warmupBars: readonly FlashbackBar[];
  /** view_bars + play_bars nến liên tục. */
  readonly bars: readonly FlashbackBar[];
  readonly priceSource: string | null;
  readonly fallbackLevel: number;
}

/** Chọn ngẫu nhiên một mã VN30 hiện hành và một giai đoạn hợp lệ (spec v2 §5). */
export interface FbDatasetPort {
  pick(now: Date, viewBars: number, playBars: number): Promise<FbMatchDataset | null>;
}

export const FB_DATASET = Symbol('FB_DATASET');

// ------------------------------------------------------------------ lỗi

const fail = (status: number, code: string, message: string, details?: unknown[]) =>
  new HttpException({ code, message, ...(details ? { details } : {}) }, status);
const notFound = (code: string, message: string) => new NotFoundException({ code, message });
const conflict = (code: string, message: string) => new ConflictException({ code, message });
const forbidden = (code: string, message: string) => new ForbiddenException({ code, message });
const badRequest = (code: string, message: string) => new BadRequestException({ code, message });
const invalid = (code: string, message: string) =>
  new UnprocessableEntityException({ code, message });

const roomNotFound = (code: string) => notFound('ROOM_NOT_FOUND', `Không tìm thấy phòng ${code}`);
const matchNotFound = () => notFound('MATCH_NOT_FOUND', 'Không tìm thấy ván chơi');
const matchEnded = () => conflict('MATCH_ENDED', 'Ván đã kết thúc');

// ------------------------------------------------------------------ dạng trả về

export interface FbPlayerRef {
  readonly user_id: string;
  readonly name: string;
  readonly avatar_url: string | null;
}

export interface FbRoomListItem {
  readonly id: string;
  readonly locked: boolean;
  /** Chủ phòng: chỉ tên và avatar (sảnh không lộ user_id). */
  readonly owner: { readonly name: string; readonly avatar_url: string | null };
  readonly view_bars: number;
  readonly play_bars: number;
  readonly minutes: number;
  readonly member_count: number;
  readonly max_players: number;
  readonly stake_xu: number;
  readonly status: 'waiting' | 'playing';
  readonly full: boolean;
  readonly created_at: string;
}

export interface FbRoomMemberView extends FbPlayerRef {
  readonly is_owner: boolean;
  readonly is_me: boolean;
  readonly joined_at: string;
}

export interface FbRoomView {
  readonly id: string;
  readonly locked: boolean;
  readonly owner_id: string;
  readonly is_owner: boolean;
  readonly view_bars: number;
  readonly play_bars: number;
  readonly minutes: number;
  readonly max_players: number;
  readonly stake_xu: number;
  readonly status: 'waiting' | 'playing';
  readonly members: FbRoomMemberView[];
  /** Ván hiện tại của phòng (đang chơi hoặc vừa kết thúc); null khi phòng đang chờ ván đầu. */
  readonly match: {
    readonly id: string;
    readonly status: 'playing' | 'ended';
    readonly started_at: string;
    readonly ends_at: string;
    /** Người xem có tham gia ván này không. */
    readonly joined: boolean;
  } | null;
  readonly created_at: string;
  /** Mốc tự đóng của phòng chờ (30 phút sau khi bắt đầu chờ); null khi đang chơi. */
  readonly auto_close_at: string | null;
  readonly server_now: string;
}

export interface FbEntryView {
  readonly step: number;
  readonly play_bars: number;
  readonly cash: string;
  /** Tổng cổ phiếu đang giữ, kể cả chưa về. */
  readonly holdings: number;
  /** Cổ phiếu đã về (bán được). */
  readonly sellable: number;
  readonly price: string;
  readonly total_assets: string;
  readonly pnl_pct: number;
  readonly pnl_percent: number;
  readonly max_buy_qty: number;
  readonly finished: boolean;
  readonly auto_finished: boolean;
  readonly positions: FlashbackPositionView[];
  readonly orders: FlashbackOrderView[];
}

export interface FbStatePlayer extends FbPlayerRef {
  readonly is_me: boolean;
  readonly finished: boolean;
  /** % lợi nhuận (phân số) tại `min(phiên của họ, phiên của mình)`; sau khi kết thúc là % cuối. */
  readonly pnl_pct: number;
  readonly pnl_percent: number;
}

export interface FbStateView {
  readonly match_id: string;
  readonly room_id: string;
  readonly status: 'playing' | 'ended';
  readonly started_at: string;
  readonly ends_at: string;
  readonly server_now: string;
  readonly remaining_ms: number;
  readonly my_step: number;
  readonly my_finished: boolean;
  /** Số người chưa bấm Hoàn thành (dùng cho "Còn n người đang chơi"). */
  readonly playing_count: number;
  readonly players: FbStatePlayer[];
}

export interface FbMatchSnapshot extends FbStateView {
  readonly view_bars: number;
  readonly play_bars: number;
  readonly minutes: number;
  readonly stake_xu: number;
  readonly pot_xu: number;
  readonly initial_cash: string;
  /** 252 nến khởi tạo chỉ báo (không vẽ). Không có ngày, không có mã. */
  readonly warmup_bars: FbPublicBar[];
  readonly history_bars: FbPublicBar[];
  /** Phiên chơi đã mở: 1..phiên của tôi (sau khi kết thúc: đủ mọi phiên). */
  readonly played_bars: FbPublicBar[];
  readonly me: FbEntryView;
}

export interface FbResultRow extends FbPlayerRef {
  readonly rank: number;
  readonly is_me: boolean;
  readonly is_winner: boolean;
  readonly pnl_pct: number;
  readonly pnl_percent: number;
  readonly final_nav: string;
  readonly win_xu: number;
  readonly refund_xu: number;
  /** "+400 xu", "Hoàn xu cược" hoặc null (chỉ dòng người thắng có xu). */
  readonly xu_label: string | null;
}

export interface FbResultView {
  readonly match_id: string;
  readonly room_id: string;
  readonly title: string;
  readonly solo: boolean;
  readonly stake_xu: number;
  readonly pot_xu: number;
  readonly refund: boolean;
  readonly end_reason: 'all_finished' | 'timeout' | null;
  readonly rows: FbResultRow[];
  readonly symbol: string;
  /** Ngày phiên xem đầu tiên (YYYY-MM-DD). */
  readonly start_date: string;
  /** Ngày phiên chơi cuối cùng (YYYY-MM-DD). */
  readonly end_date: string;
  /** Mọi phiên chơi (1..play) để "Xem lại biểu đồ". */
  readonly played_bars: FbPublicBar[];
}

export interface FbStartResult {
  readonly match: FbMatchSnapshot;
  readonly room: FbRoomView;
  /** Người bị đưa ra khỏi phòng vì không đủ xu (§8). */
  readonly removed: { readonly user_id: string; readonly name: string; readonly message: string }[];
}

/** Số phòng tối đa trả về cho sảnh. */
const LOBBY_LIMIT = 100;

const iso = (value: Date) => value.toISOString();
const sumQty = (lots: readonly FlashbackLotRow[]) => lots.reduce((sum, lot) => sum + lot.qty, 0);

@Injectable()
export class FlashbackRoomsService {
  private readonly logger = new Logger(FlashbackRoomsService.name);

  constructor(
    private readonly database: DatabaseService,
    @Inject(FLASHBACK_ROOMS_REPOSITORY) private readonly repository: FlashbackRoomsRepository,
    @Inject(FB_DATASET) private readonly dataset: FbDatasetPort,
    @Inject(FLASHBACK_CLOCK) private readonly clock: FlashbackClock,
  ) {}

  // ================================================================== sảnh

  async listRooms(status: 'all' | 'waiting' | 'playing'): Promise<{ rooms: FbRoomListItem[] }> {
    const rows = await this.repository.listOpenRooms(this.database, status, LOBBY_LIMIT);
    return { rooms: rows.map((row) => this.listItem(row)) };
  }

  /** Phòng hiện tại của tôi (để vào lại phòng chờ hoặc chơi tiếp ván dở) và thông báo một lần. */
  async myRoom(userId: string): Promise<{ room: FbRoomView | null; notice: string | null }> {
    const roomId = await this.repository.activeRoomIdOf(this.database, userId);
    const room = roomId ? await this.repository.roomById(this.database, roomId) : null;
    const notice = await this.database.transaction((tx) => this.repository.takeNotice(tx, userId));
    if (!room || room.status === 'closed') return { room: null, notice };
    return { room: await this.roomView(this.database, room, userId), notice };
  }

  async getRoom(userId: string, code: string): Promise<FbRoomView> {
    this.assertCode(code);
    const room = await this.repository.roomByCode(this.database, code);
    if (!room) throw roomNotFound(code);
    const members = await this.repository.activeMembers(this.database, room.id);
    if (!members.some((member) => member.userId === userId))
      throw forbidden('NOT_IN_ROOM', 'Bạn không ở trong phòng này');
    return this.roomView(this.database, room, userId, members);
  }

  async createRoom(userId: string, input: FbRoomSettingsInput): Promise<FbRoomView> {
    const balance = await this.repository.balance(this.database, userId);
    const checked = validateRoomSettings(input, balance);
    if (!checked.ok) throw invalid('ROOM_INVALID', checked.message);
    const settings = checked.value;
    const passwordHash = settings.password ? await hashRoomPassword(settings.password) : null;
    const now = this.clock.now();
    return this.database.transaction(async (tx) => {
      if (await this.repository.activeRoomIdOf(tx, userId)) throw this.alreadyInRoom();
      let room: FbRoomRow | null = null;
      for (let attempt = 0; attempt < 30 && !room; attempt += 1) {
        room = await this.repository.insertRoom(tx, {
          code: String(randomInt(0, 1_000_000)).padStart(6, '0'),
          ownerId: userId,
          viewBars: settings.viewBars,
          playBars: settings.playBars,
          minutes: settings.minutes,
          maxPlayers: settings.maxPlayers,
          stakeXu: settings.stakeXu,
          passwordHash,
          now,
        });
      }
      if (!room)
        throw new ServiceUnavailableException({
          code: 'ROOM_CODE_EXHAUSTED',
          message: 'Chưa cấp được ID phòng, hãy thử lại',
        });
      if (!(await this.repository.addMember(tx, room.id, userId, now))) throw this.alreadyInRoom();
      return this.roomView(tx, room, userId);
    });
  }

  async randomJoin(userId: string): Promise<FbRoomView> {
    if (await this.repository.activeRoomIdOf(this.database, userId)) throw this.alreadyInRoom();
    const balance = await this.repository.balance(this.database, userId);
    const rooms = await this.repository.listOpenRooms(this.database, 'waiting', LOBBY_LIMIT);
    const candidates = randomJoinCandidates(
      rooms.map((room) => ({ ...room, locked: room.passwordHash !== null })),
      balance,
    );
    // Thử theo thứ tự ngẫu nhiên; phòng vừa đầy hay vừa bắt đầu thì thử phòng khác.
    for (let left = candidates.length; left > 0; left -= 1) {
      const pick = candidates.splice(randomInt(left), 1)[0]!;
      try {
        return await this.joinRoom(userId, pick.code, null, true);
      } catch (error) {
        const code = this.errorCode(error);
        if (code === 'ALREADY_IN_ROOM') throw error;
        if (code === null) throw error;
      }
    }
    throw notFound('NO_ROOM_AVAILABLE', 'Chưa có phòng mở phù hợp, hãy tạo phòng');
  }

  /**
   * Vào phòng theo §2.3. Đã ở trong phòng thì trả lại phòng (vào lại). Người đã rời giữa ván mà
   * ván còn giờ thì được vào lại để chơi tiếp (DESIGN #6).
   */
  async joinRoom(
    userId: string,
    code: string,
    password: string | null,
    randomOnly = false,
  ): Promise<FbRoomView> {
    this.assertCode(code);
    const room0 = await this.repository.roomByCode(this.database, code);
    if (!room0) throw roomNotFound(code);
    const passwordGiven = typeof password === 'string' && password.trim().length > 0;
    const passwordOk =
      room0.passwordHash !== null && passwordGiven
        ? await verifyRoomPassword(password!, room0.passwordHash)
        : false;
    const now = this.clock.now();
    return this.database.transaction(async (tx) => {
      const room = await this.repository.roomByCode(tx, code, true);
      if (!room) throw roomNotFound(code);
      const members = await this.repository.activeMembers(tx, room.id);
      if (members.some((member) => member.userId === userId))
        return this.roomView(tx, room, userId, members);
      const otherRoom = await this.repository.activeRoomIdOf(tx, userId);

      if (room.status === 'playing' && room.currentMatchId && !randomOnly) {
        const match = await this.repository.matchById(tx, room.currentMatchId);
        const entry = await this.repository.entryByMatchUser(tx, room.currentMatchId, userId);
        if (match && entry && match.status === 'playing') {
          if (otherRoom) throw this.alreadyInRoom();
          if (!(await this.repository.addMember(tx, room.id, userId, now)))
            throw this.alreadyInRoom();
          return this.roomView(tx, room, userId);
        }
      }

      const balance = await this.repository.balance(tx, userId);
      const locked = room.passwordHash !== null;
      if (randomOnly && locked) throw conflict('ROOM_LOCKED', 'Phòng có mật khẩu');
      const error = joinCheck({
        status: room.status,
        memberCount: members.length,
        maxPlayers: room.maxPlayers,
        stakeXu: room.stakeXu,
        balanceXu: balance,
        locked,
        passwordGiven,
        passwordOk: passwordOk && room.passwordHash === room0.passwordHash,
        inOtherRoom: otherRoom !== null,
      });
      if (error) {
        const status =
          error.code === 'PASSWORD_REQUIRED' || error.code === 'WRONG_PASSWORD' ? 403 : 409;
        throw fail(
          status,
          error.code,
          error.message,
          error.code === 'ALREADY_IN_ROOM'
            ? [{ room_id: await this.codeOfRoom(tx, otherRoom) }]
            : undefined,
        );
      }
      if (!(await this.repository.addMember(tx, room.id, userId, now))) throw this.alreadyInRoom();
      return this.roomView(tx, room, userId);
    });
  }

  /**
   * Rời phòng (§4). Chủ phòng rời thì chuyển quyền cho người vào sớm nhất; không còn ai thì đóng
   * phòng (DESIGN #2). Rời giữa ván vẫn giữ lượt chơi: vị thế được tính ở phiên cuối, không hoàn
   * cược (DESIGN #6).
   */
  async leaveRoom(userId: string, code: string): Promise<{ left: true }> {
    this.assertCode(code);
    const now = this.clock.now();
    await this.database.transaction(async (tx) => {
      const room = await this.repository.roomByCode(tx, code, true);
      if (!room) throw roomNotFound(code);
      const members = await this.repository.activeMembers(tx, room.id);
      if (!members.some((member) => member.userId === userId))
        throw forbidden('NOT_IN_ROOM', 'Bạn không ở trong phòng này');
      await this.repository.removeMember(tx, room.id, userId, 'leave', null, now);
      await this.afterMemberLeft(
        tx,
        room,
        members.filter((member) => member.userId !== userId),
        now,
      );
    });
    return { left: true };
  }

  /**
   * Bắt đầu ván (§4, §5, §8): chỉ chủ phòng; kiểm tra lại xu từng người (ai thiếu bị đưa ra kèm
   * thông báo), một mình thì không cược, trừ cược mỗi người đúng một lần, chọn mã VN30 và giai
   * đoạn ngẫu nhiên, tạo ván. Trả nến lịch sử và nến khởi tạo chỉ báo, không có mã hay ngày.
   */
  async startRoom(userId: string, code: string): Promise<FbStartResult> {
    this.assertCode(code);
    const before = await this.repository.roomByCode(this.database, code);
    if (!before) throw roomNotFound(code);
    this.assertCanStart(before, userId);
    const now = this.clock.now();
    const dataset = await this.dataset.pick(now, before.viewBars, before.playBars);
    if (!dataset || dataset.bars.length !== before.viewBars + before.playBars)
      throw new ServiceUnavailableException({
        code: 'FLASHBACK_DATA_UNAVAILABLE',
        message: 'Chưa chuẩn bị được dữ liệu ván chơi, hãy thử lại',
      });

    const outcome = await this.database.transaction(async (tx) => {
      const room = await this.repository.roomByCode(tx, code, true);
      if (!room) throw roomNotFound(code);
      this.assertCanStart(room, userId);
      if (room.viewBars !== before.viewBars || room.playBars !== before.playBars)
        throw conflict('ROOM_CHANGED', 'Phòng vừa thay đổi, hãy thử lại');
      const members = await this.repository.activeMembers(tx, room.id);
      const replay = room.matchCount > 0;
      const shortMessage = replay
        ? `Không đủ ${formatXu(room.stakeXu)} xu để chơi lại`
        : `Không đủ xu để vào phòng cược ${formatXu(room.stakeXu)} xu`;
      const wallets = new Map<string, { balance: number; lastSeq: number }>();
      const removed: FbStartResult['removed'] = [];
      let players: FbMemberRow[] = members;

      if (room.stakeXu > 0 && members.length > 1) {
        // Khoá ví theo thứ tự user_id để hai transaction không khoá chéo nhau.
        for (const member of [...members].sort((a, b) => a.userId.localeCompare(b.userId)))
          wallets.set(member.userId, await this.repository.lockWallet(tx, member.userId));
        const short = members.filter(
          (member) => wallets.get(member.userId)!.balance < room.stakeXu,
        );
        if (short.some((member) => member.userId === room.ownerId))
          throw conflict(
            'XU_INSUFFICIENT',
            replay
              ? `Không đủ ${formatXu(room.stakeXu)} xu để chơi lại`
              : `Không đủ ${formatXu(room.stakeXu)} xu để bắt đầu`,
          );
        for (const member of short) {
          await this.repository.removeMember(
            tx,
            room.id,
            member.userId,
            'xu_insufficient',
            shortMessage,
            now,
          );
          removed.push({ user_id: member.userId, name: member.name, message: shortMessage });
        }
        players = members.filter((member) => !short.includes(member));
      }

      // Chỉ còn một người: chơi một mình, không cược, không trừ xu (§4).
      const stakeXu = players.length > 1 ? room.stakeXu : 0;
      const viewBars = room.viewBars;
      const playBars = room.playBars;
      const match = await this.repository.insertMatch(tx, {
        roomId: room.id,
        symbol: dataset.symbol,
        startDate: dataset.bars[0]!.d,
        endDate: dataset.bars[viewBars + playBars - 1]!.d,
        priceSource: dataset.priceSource,
        fallbackLevel: dataset.fallbackLevel,
        viewBars,
        playBars,
        warmupBars: dataset.warmupBars,
        bars: dataset.bars,
        minutes: room.minutes,
        stakeXu,
        playerCount: players.length,
        potXu: stakeXu * players.length,
        startedAt: now,
        endsAt: new Date(now.getTime() + room.minutes * 60_000),
      });
      for (const [index, player] of players.entries()) {
        await this.repository.insertEntry(tx, {
          matchId: match.id,
          userId: player.userId,
          stakeXu,
          cash: FB_INITIAL_CASH_VND,
          // Giữ thứ tự vào phòng để hoà hạng hiển thị ổn định.
          joinedAt: new Date(now.getTime() + index),
        });
        if (stakeXu > 0) {
          await this.credit(tx, wallets.get(player.userId)!, {
            userId: player.userId,
            kind: 'flashback_stake',
            delta: -stakeXu,
            match,
            roomCode: room.code,
          });
        }
      }
      const updated = await this.repository.updateRoom(tx, room.id, {
        status: 'playing',
        currentMatchId: match.id,
        matchCount: room.matchCount + 1,
      });
      return { match, room: updated ?? room, removed };
    });

    return {
      match: await this.matchSnapshot(userId, outcome.match.id),
      room: await this.roomView(this.database, outcome.room, userId),
      removed: outcome.removed,
    };
  }

  /**
   * Chơi lại (§7.3): đưa phòng về trạng thái chờ, giữ ID, thiết lập và người chơi. Người không
   * đủ xu cược thì nhận "Không đủ {n} xu để chơi lại" và rời phòng (về sảnh).
   */
  async replayRoom(userId: string, code: string): Promise<FbRoomView> {
    this.assertCode(code);
    const before = await this.repository.roomByCode(this.database, code);
    if (before?.currentMatchId) await this.settleIfDue(before.currentMatchId);
    const now = this.clock.now();
    const result = await this.database.transaction(
      async (tx): Promise<{ view: FbRoomView; error: null } | { view: null; error: string }> => {
        const room = await this.repository.roomByCode(tx, code, true);
        if (!room) throw roomNotFound(code);
        const members = await this.repository.activeMembers(tx, room.id);
        if (!members.some((member) => member.userId === userId))
          throw forbidden('NOT_IN_ROOM', 'Bạn không ở trong phòng này');
        let current = room;
        if (room.status === 'playing') {
          const match = room.currentMatchId
            ? await this.repository.matchById(tx, room.currentMatchId)
            : null;
          if (match && match.status === 'playing')
            throw conflict('ROOM_PLAYING', 'Ván đang chơi, chưa chơi lại được');
          current =
            (await this.repository.updateRoom(tx, room.id, {
              status: 'waiting',
              waitingSince: now,
            })) ?? room;
        }
        if (current.stakeXu > 0) {
          const balance = await this.repository.balance(tx, userId);
          if (balance < current.stakeXu) {
            await this.repository.removeMember(
              tx,
              current.id,
              userId,
              'xu_insufficient',
              null,
              now,
            );
            await this.afterMemberLeft(
              tx,
              current,
              members.filter((m) => m.userId !== userId),
              now,
            );
            return { view: null, error: `Không đủ ${formatXu(current.stakeXu)} xu để chơi lại` };
          }
        }
        return { view: await this.roomView(tx, current, userId), error: null };
      },
    );
    if (result.view === null) throw conflict('XU_INSUFFICIENT', result.error);
    return result.view;
  }

  // ================================================================== ván chơi

  async matchSnapshot(userId: string, matchId: string): Promise<FbMatchSnapshot> {
    await this.settleIfDue(matchId);
    const { match, entry, entries, roomCode } = await this.loadForViewer(userId, matchId);
    const ended = match.status !== 'playing';
    const chart = publicChart(match, ended ? match.playBars : entry.step);
    const state = this.stateView(match, roomCode, entry, entries);
    return {
      ...state,
      view_bars: match.viewBars,
      play_bars: match.playBars,
      minutes: match.minutes,
      stake_xu: match.stakeXu,
      pot_xu: match.potXu,
      initial_cash: FB_INITIAL_CASH_VND.toString(),
      warmup_bars: chart.warmup,
      history_bars: chart.history,
      played_bars: chart.played,
      me: await this.entryView(this.database, match, entry),
    };
  }

  /** Phiên tiếp (§6.2, §9): ghi nhận bước mới rồi mới trả nến của bước đó. */
  async next(userId: string, matchId: string): Promise<{ bar: FbPublicBar; me: FbEntryView }> {
    await this.settleIfDue(matchId);
    return this.database.transaction(async (tx) => {
      const entry = await this.repository.entryByMatchUser(tx, matchId, userId, true);
      if (!entry) throw matchNotFound();
      const match = await this.playableMatch(tx, matchId);
      if (entry.status === 'finished')
        throw conflict('ALREADY_FINISHED', 'Bạn đã hoàn thành ván này');
      if (entry.step >= match.playBars)
        throw conflict('AT_LAST_BAR', 'Đã tới phiên cuối, hãy bấm Hoàn thành');
      const step = entry.step + 1;
      const holdings = sumQty(await this.repository.lotsByEntry(tx, entry.id));
      const nav = navOf(entry.cash, holdings, priceAtStep(match.bars, match.viewBars, step));
      const navByStep = [...entry.navByStep.slice(0, step)];
      while (navByStep.length < step) navByStep.push(navAtStep(entry.navByStep, navByStep.length));
      navByStep.push(nav);
      const updated = await this.repository.updateEntry(tx, entry.id, { step, navByStep });
      if (!updated) throw matchNotFound();
      return {
        bar: toPublicBar(barAtStep(match.bars, match.viewBars, step), step),
        me: await this.entryView(tx, match, updated),
      };
    });
  }

  /** Đặt lệnh (§6.3): giá đóng cửa phiên đang hiện, phí 0,15%, thuế bán 0,1%, T+2. */
  async placeOrder(
    userId: string,
    matchId: string,
    input: { side: 'buy' | 'sell'; qty: number; idempotencyKey?: string | null },
  ): Promise<{ order: FlashbackOrderView; me: FbEntryView }> {
    if (!Number.isInteger(input.qty) || input.qty < 1)
      throw badRequest('INVALID_QTY', 'Số lượng phải là số nguyên lớn hơn 0');
    await this.settleIfDue(matchId);
    return this.database.transaction(async (tx) => {
      const entry = await this.repository.entryByMatchUser(tx, matchId, userId, true);
      if (!entry) throw matchNotFound();
      const match = await this.playableMatch(tx, matchId);
      if (entry.status === 'finished')
        throw conflict('ALREADY_FINISHED', 'Bạn đã hoàn thành ván này');
      if (input.idempotencyKey) {
        const replay = await this.repository.orderByIdempotencyKey(
          tx,
          entry.id,
          input.idempotencyKey,
        );
        if (replay)
          return { order: this.orderView(replay), me: await this.entryView(tx, match, entry) };
      }
      const price = priceAtStep(match.bars, match.viewBars, entry.step);
      const amount = price * BigInt(input.qty);
      const fee = roundBasisPoints(amount, FLASHBACK_FEE_BPS);
      const lots = await this.repository.lotsByEntry(tx, entry.id);
      const held = sumQty(lots);
      let cash: bigint;
      let holdings: number;
      let order: FlashbackOrderRow | null;
      if (input.side === 'buy') {
        const total = amount + fee;
        if (total > entry.cash) throw badRequest('INSUFFICIENT_CASH', 'Không đủ tiền mặt');
        cash = entry.cash - total;
        holdings = held + input.qty;
        order = await this.repository.insertOrder(tx, {
          entryId: entry.id,
          side: 'buy',
          qty: input.qty,
          price,
          step: entry.step,
          amount,
          fee,
          tax: 0n,
          idempotencyKey: input.idempotencyKey ?? null,
        });
        if (!order) throw conflict('ORDER_CONFLICT', 'Lệnh bị từ chối, hãy thử lại');
        await this.repository.insertLot(tx, {
          entryId: entry.id,
          qty: input.qty,
          price,
          step: entry.step,
          sellableStep: entry.step + FLASHBACK_SETTLEMENT_SESSIONS,
        });
      } else {
        const tax = roundBasisPoints(amount, FLASHBACK_TAX_BPS);
        const sellable = lots.filter((lot) => lot.sellableStep <= entry.step);
        const settled = sumQty(sellable);
        if (input.qty > settled) {
          if (settled < held && input.qty <= held)
            throw badRequest('NOT_SETTLED_YET', 'Cổ phiếu mua chưa đủ T+2, chưa bán được');
          throw badRequest('NOT_ENOUGH_SHARES', 'Vượt số cổ phiếu đang có');
        }
        let remaining = input.qty;
        for (const lot of sellable) {
          if (remaining <= 0) break;
          const take = Math.min(lot.qty, remaining);
          if (!(await this.repository.consumeLot(tx, lot.id, take)))
            throw conflict('LOT_CHANGED', 'Số cổ phiếu đã thay đổi, hãy thử lại');
          remaining -= take;
        }
        cash = entry.cash + amount - fee - tax;
        holdings = held - input.qty;
        order = await this.repository.insertOrder(tx, {
          entryId: entry.id,
          side: 'sell',
          qty: input.qty,
          price,
          step: entry.step,
          amount,
          fee,
          tax,
          idempotencyKey: input.idempotencyKey ?? null,
        });
        if (!order) throw conflict('ORDER_CONFLICT', 'Lệnh bị từ chối, hãy thử lại');
      }
      // % đổi ngay khi mua bán (phí, thuế): cập nhật tài sản của bước hiện tại.
      const navByStep = [...entry.navByStep];
      while (navByStep.length < entry.step + 1)
        navByStep.push(navAtStep(entry.navByStep, navByStep.length));
      navByStep[entry.step] = navOf(cash, holdings, price);
      const updated = await this.repository.updateEntry(tx, entry.id, {
        cash,
        navByStep: navByStep.slice(0, entry.step + 1),
      });
      if (!updated) throw matchNotFound();
      return { order: this.orderView(order), me: await this.entryView(tx, match, updated) };
    });
  }

  /** Hoàn thành (§6.2): chỉ ở phiên cuối; người cuối cùng hoàn thành thì chốt ván ngay. */
  async finish(
    userId: string,
    matchId: string,
  ): Promise<{ me: FbEntryView; ended: boolean; playing_count: number }> {
    await this.settleIfDue(matchId);
    await this.database.transaction(async (tx) => {
      const entry = await this.repository.entryByMatchUser(tx, matchId, userId, true);
      if (!entry) throw matchNotFound();
      if (entry.status === 'finished') return;
      const match = await this.playableMatch(tx, matchId);
      if (entry.step < match.playBars)
        throw conflict('NOT_AT_END', 'Chỉ hoàn thành được ở phiên cuối');
      const holdings = sumQty(await this.repository.lotsByEntry(tx, entry.id));
      const finalNav = navOf(
        entry.cash,
        holdings,
        priceAtStep(match.bars, match.viewBars, match.playBars),
      );
      await this.repository.updateEntry(tx, entry.id, {
        status: 'finished',
        finishedAt: this.clock.now(),
        finalNav,
        pnlPct: pnlFraction(finalNav, entry.initialCash),
      });
    });
    await this.settle(matchId);
    const { match, entry, entries } = await this.loadForViewer(userId, matchId);
    return {
      me: await this.entryView(this.database, match, entry),
      ended: match.status !== 'playing',
      playing_count: entries.filter((item) => item.status !== 'finished').length,
    };
  }

  /** Đồng hồ, % từng người theo §6.1 và ai đã hoàn thành. */
  async state(userId: string, matchId: string): Promise<FbStateView> {
    await this.settleIfDue(matchId);
    const { match, entry, entries, roomCode } = await this.loadForViewer(userId, matchId);
    return this.stateView(match, roomCode, entry, entries);
  }

  /** Kết quả (§7.3): chỉ sau khi ván kết thúc; lúc này mới gửi mã và thời gian. */
  async result(userId: string, matchId: string): Promise<FbResultView> {
    await this.settleIfDue(matchId);
    const { match, entries, roomCode } = await this.loadForViewer(userId, matchId);
    if (match.status === 'playing') throw conflict('RESULT_NOT_READY', 'Ván chưa kết thúc');
    const solo = entries.length === 1;
    const sorted = [...entries].sort(
      (left, right) =>
        (left.rank ?? 99) - (right.rank ?? 99) ||
        left.joinedAt.getTime() - right.joinedAt.getTime(),
    );
    const winners = sorted.filter((entry) => entry.rank === 1);
    const refund = entries.some((entry) => entry.refundXu > 0);
    return {
      match_id: match.id,
      room_id: roomCode,
      title: resultTitle({
        solo,
        winners: winners.map((entry) => ({ userId: entry.userId, name: entry.name })),
        viewerId: userId,
      }),
      solo,
      stake_xu: match.stakeXu,
      pot_xu: match.potXu,
      refund,
      end_reason: match.endReason,
      rows: sorted.map((entry) => {
        const pnl = entry.pnlPct ?? 0;
        return {
          user_id: entry.userId,
          name: entry.name,
          avatar_url: entry.avatarUrl,
          rank: entry.rank ?? sorted.length,
          is_me: entry.userId === userId,
          is_winner: !solo && entry.rank === 1,
          pnl_pct: pnl,
          pnl_percent: pnl * 100,
          final_nav: (entry.finalNav ?? entry.cash).toString(),
          win_xu: entry.winXu,
          refund_xu: entry.refundXu,
          xu_label: resultXuLabel(entry),
        };
      }),
      symbol: match.symbol,
      start_date: match.startDate,
      end_date: match.endDate,
      played_bars: publicChart(match, match.playBars).played,
    };
  }

  // ================================================================== chốt ván và dọn phòng

  /** Chốt ván khi hết giờ (gọi trước mọi thao tác trên ván). */
  async settleIfDue(matchId: string): Promise<void> {
    const match = await this.repository.matchById(this.database, matchId);
    if (match && match.status === 'playing' && this.clock.now().getTime() >= match.endsAt.getTime())
      await this.settle(matchId);
  }

  /**
   * Tác vụ kết thúc ván (§7, §10.2): khi mọi người đã hoàn thành hoặc đã hết giờ thì kéo người
   * chưa xong tới phiên cuối, xếp hạng, cộng xu và đổi ván sang `paid`, tất cả trong một
   * transaction. Chạy lại nhiều lần không cộng xu hai lần: ván đã qua `playing` thì bỏ qua, và mỗi
   * khoản xu có khoá ledger `<kind>:<match>:<user>`.
   */
  async settle(matchId: string): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const match = await this.repository.matchById(tx, matchId, true);
      if (!match || match.status !== 'playing') return false;
      const now = this.clock.now();
      const entries = await this.repository.entriesByMatch(tx, matchId, true);
      const allFinished =
        entries.length > 0 && entries.every((entry) => entry.status === 'finished');
      const timeUp = now.getTime() >= match.endsAt.getTime();
      if (!allFinished && !timeUp) return false;

      const players = [];
      for (const entry of entries)
        players.push({
          entryId: entry.id,
          userId: entry.userId,
          joinedAt: entry.joinedAt,
          step: entry.step,
          cash: entry.cash,
          holdings: sumQty(await this.repository.lotsByEntry(tx, entry.id)),
          navByStep: entry.navByStep,
          finished: entry.status === 'finished',
          initialCash: entry.initialCash,
        });
      const settlement = settleMatch({
        players,
        playBars: match.playBars,
        priceAt: (step) => priceAtStep(match.bars, match.viewBars, step),
        stakeXu: match.stakeXu,
      });
      for (const outcome of settlement.outcomes) {
        const entry = entries.find((item) => item.id === outcome.entryId)!;
        await this.repository.updateEntry(tx, outcome.entryId, {
          step: match.playBars,
          navByStep: outcome.navByStep,
          status: 'finished',
          finishedAt: entry.finishedAt ?? now,
          autoFinished: outcome.autoFinished,
          finalNav: outcome.finalNav,
          pnlPct: outcome.pnlPct,
          rank: outcome.rank,
          winXu: outcome.winXu,
          refundXu: outcome.refundXu,
        });
      }
      await this.repository.updateMatch(tx, matchId, {
        status: 'finished',
        endedAt: now,
        endReason: allFinished ? 'all_finished' : 'timeout',
      });
      const room = await this.repository.roomById(tx, match.roomId);
      const payouts = settlement.outcomes
        .filter((outcome) => outcome.winXu > 0 || outcome.refundXu > 0)
        .sort((a, b) => a.userId.localeCompare(b.userId));
      for (const outcome of payouts) {
        const wallet = await this.repository.lockWallet(tx, outcome.userId);
        await this.credit(tx, wallet, {
          userId: outcome.userId,
          kind: outcome.refundXu > 0 ? 'flashback_refund' : 'flashback_win',
          delta: outcome.refundXu > 0 ? outcome.refundXu : outcome.winXu,
          match,
          roomCode: room?.code ?? null,
          rank: outcome.rank,
        });
      }
      await this.repository.updateMatch(tx, matchId, { status: 'paid', paidAt: now });
      return true;
    });
  }

  /** Tác vụ định kỳ: chốt ván hết giờ, đóng phòng chờ quá 30 phút và phòng bỏ dở sau kết quả. */
  async sweep(now: Date = this.clock.now()): Promise<{ settled: number; closed: number }> {
    let settled = 0;
    for (const matchId of await this.repository.dueMatchIds(this.database, now)) {
      try {
        if (await this.settle(matchId)) settled += 1;
      } catch (error) {
        this.logger.error(
          `Flashback rooms: chốt ván ${matchId} lỗi (${error instanceof Error ? error.message : 'không rõ'})`,
        );
      }
    }
    let closed = 0;
    const waitingBefore = new Date(now.getTime() - FB_ROOM_WAITING_TTL_MS);
    const endedBefore = new Date(now.getTime() - FB_ROOM_ENDED_TTL_MS);
    for (const roomId of await this.repository.staleRoomIds(
      this.database,
      waitingBefore,
      endedBefore,
    )) {
      const done = await this.database.transaction(async (tx) => {
        const room = await this.repository.roomById(tx, roomId, true);
        if (!room || room.status === 'closed') return false;
        if (room.status === 'waiting' && room.waitingSince.getTime() > waitingBefore.getTime())
          return false;
        if (room.status === 'playing') {
          const match = room.currentMatchId
            ? await this.repository.matchById(tx, room.currentMatchId)
            : null;
          if (
            !match ||
            match.status !== 'paid' ||
            !match.paidAt ||
            match.paidAt.getTime() > endedBefore.getTime()
          )
            return false;
        }
        await this.closeRoom(
          tx,
          room,
          room.status === 'waiting' ? 'waiting_timeout' : 'ended_timeout',
          now,
        );
        return true;
      });
      if (done) closed += 1;
    }
    return { settled, closed };
  }

  // ================================================================== nội bộ

  private assertCode(code: string): void {
    if (!isRoomCode(code)) throw badRequest('ROOM_ID_INVALID', 'ID phòng gồm 6 chữ số');
  }

  private assertCanStart(room: FbRoomRow, userId: string): void {
    if (room.ownerId !== userId) throw forbidden('NOT_ROOM_OWNER', 'Chỉ chủ phòng được bắt đầu');
    if (room.status !== 'waiting') throw conflict('ROOM_PLAYING', 'Phòng đang chơi');
  }

  private alreadyInRoom() {
    return conflict('ALREADY_IN_ROOM', 'Bạn đang ở một phòng khác, hãy rời phòng đó trước');
  }

  private errorCode(error: unknown): string | null {
    if (!(error instanceof HttpException)) return null;
    const body = error.getResponse();
    return body && typeof body === 'object' && 'code' in body ? String(body.code) : null;
  }

  private async codeOfRoom(db: SqlClient, roomId: string | null): Promise<string | null> {
    if (!roomId) return null;
    return (await this.repository.roomById(db, roomId))?.code ?? null;
  }

  private async afterMemberLeft(
    tx: SqlClient,
    room: FbRoomRow,
    remaining: readonly FbMemberRow[],
    now: Date,
  ): Promise<void> {
    if (remaining.length === 0) {
      await this.closeRoom(tx, room, 'empty', now);
      return;
    }
    if (!remaining.some((member) => member.userId === room.ownerId))
      await this.repository.updateRoom(tx, room.id, { ownerId: remaining[0]!.userId });
  }

  private async closeRoom(
    tx: SqlClient,
    room: FbRoomRow,
    reason: string,
    now: Date,
  ): Promise<void> {
    await this.repository.removeAllMembers(tx, room.id, 'closed', now);
    await this.repository.updateRoom(tx, room.id, {
      status: 'closed',
      closedAt: now,
      closeReason: reason,
    });
  }

  /** Ghi một khoản xu (âm hoặc dương) dưới khoá ví đã giữ; khoá ledger chặn ghi lần hai. */
  private async credit(
    tx: SqlClient,
    wallet: { balance: number; lastSeq: number },
    input: {
      userId: string;
      kind: FbLedgerKind;
      delta: number;
      match: FbMatchRow;
      roomCode: string | null;
      rank?: number;
    },
  ): Promise<boolean> {
    const seq = wallet.lastSeq + 1;
    const balanceAfter = wallet.balance + input.delta;
    if (balanceAfter < 0) throw conflict('XU_INSUFFICIENT', 'Không đủ xu');
    const appended = await this.repository.appendLedger(tx, {
      userId: input.userId,
      seq,
      kind: input.kind,
      delta: input.delta,
      balanceAfter,
      uniqueKey: fbLedgerKey(input.kind, input.match.id, input.userId),
      ref: {
        match_id: input.match.id,
        room_code: input.roomCode,
        ...(input.rank !== undefined ? { rank: input.rank } : {}),
      },
    });
    if (!appended) return false;
    await this.repository.saveWallet(tx, input.userId, balanceAfter, seq);
    wallet.balance = balanceAfter;
    wallet.lastSeq = seq;
    return true;
  }

  private async playableMatch(tx: SqlClient, matchId: string): Promise<FbMatchRow> {
    const match = await this.repository.matchById(tx, matchId);
    if (!match) throw matchNotFound();
    if (match.status !== 'playing' || this.clock.now().getTime() >= match.endsAt.getTime())
      throw matchEnded();
    return match;
  }

  private async loadForViewer(userId: string, matchId: string) {
    const match = await this.repository.matchById(this.database, matchId);
    if (!match) throw matchNotFound();
    const entries = await this.repository.entriesByMatch(this.database, matchId);
    const entry = entries.find((item) => item.userId === userId);
    if (!entry) throw matchNotFound();
    const room = await this.repository.roomById(this.database, match.roomId);
    return { match, entry, entries, roomCode: room?.code ?? '' };
  }

  private stateView(
    match: FbMatchRow,
    roomCode: string,
    me: FbEntryRow,
    entries: readonly FbEntryPlayerRow[],
  ): FbStateView {
    const now = this.clock.now();
    const ended = match.status !== 'playing';
    const players = entries.map((entry): FbStatePlayer => {
      let nav: bigint;
      if (ended) nav = entry.finalNav ?? navAtStep(entry.navByStep, match.playBars);
      else if (entry.userId === me.userId) nav = navAtStep(entry.navByStep, entry.step);
      // % của người khác chỉ tính tới phiên mình đang xem (§6.1).
      else nav = navAtStep(entry.navByStep, visibleStep(entry.step, me.step));
      const pnl = pnlFraction(nav, entry.initialCash);
      return {
        user_id: entry.userId,
        name: entry.name,
        avatar_url: entry.avatarUrl,
        is_me: entry.userId === me.userId,
        finished: entry.status === 'finished',
        pnl_pct: pnl,
        pnl_percent: pnl * 100,
      };
    });
    return {
      match_id: match.id,
      room_id: roomCode,
      status: ended ? 'ended' : 'playing',
      started_at: iso(match.startedAt),
      ends_at: iso(match.endsAt),
      server_now: iso(now),
      remaining_ms: ended ? 0 : Math.max(0, match.endsAt.getTime() - now.getTime()),
      my_step: me.step,
      my_finished: me.status === 'finished',
      playing_count: entries.filter((entry) => entry.status !== 'finished').length,
      players,
    };
  }

  private async entryView(
    db: SqlClient,
    match: FbMatchRow,
    entry: FbEntryRow,
  ): Promise<FbEntryView> {
    const lots = await this.repository.lotsByEntry(db, entry.id);
    const orders = await this.repository.ordersByEntry(db, entry.id);
    const price = priceAtStep(match.bars, match.viewBars, entry.step);
    const holdings = sumQty(lots);
    const sellable = sumQty(lots.filter((lot) => lot.sellableStep <= entry.step));
    const total = navOf(entry.cash, holdings, price);
    const pnl = pnlFraction(total, entry.initialCash);
    return {
      step: entry.step,
      play_bars: match.playBars,
      cash: entry.cash.toString(),
      holdings,
      sellable,
      price: price.toString(),
      total_assets: total.toString(),
      pnl_pct: pnl,
      pnl_percent: pnl * 100,
      max_buy_qty: entry.status === 'finished' ? 0 : maxBuyQty(entry.cash, price),
      finished: entry.status === 'finished',
      auto_finished: entry.autoFinished,
      positions: lots.map((lot) => ({
        qty: lot.qty,
        price: lot.price.toString(),
        step: lot.step,
        sellable_step: lot.sellableStep,
        status: lot.sellableStep <= entry.step ? 'settled' : 'pending',
        sessions_left: Math.max(0, lot.sellableStep - entry.step),
        pnl_pct: lot.price > 0n ? Number(price - lot.price) / Number(lot.price) : 0,
        value: (BigInt(lot.qty) * price).toString(),
      })),
      orders: orders.map((order) => this.orderView(order)),
    };
  }

  private orderView(order: FlashbackOrderRow): FlashbackOrderView {
    return {
      id: order.id,
      side: order.side,
      qty: order.qty,
      price: order.price.toString(),
      step: order.step,
      amount: order.amount.toString(),
      fee: order.fee.toString(),
      tax: order.tax.toString(),
      created_at: order.createdAt.toISOString(),
    };
  }

  private listItem(row: FbRoomListRow): FbRoomListItem {
    return {
      id: row.code,
      locked: row.passwordHash !== null,
      owner: { name: row.ownerName, avatar_url: row.ownerAvatarUrl },
      view_bars: row.viewBars,
      play_bars: row.playBars,
      minutes: row.minutes,
      member_count: row.memberCount,
      max_players: row.maxPlayers,
      stake_xu: row.stakeXu,
      status: row.status === 'playing' ? 'playing' : 'waiting',
      full: row.memberCount >= row.maxPlayers,
      created_at: iso(row.createdAt),
    };
  }

  private async roomView(
    db: SqlClient,
    room: FbRoomRow,
    userId: string,
    knownMembers?: readonly FbMemberRow[],
  ): Promise<FbRoomView> {
    // Đọc lại phòng để có chủ phòng và trạng thái mới nhất sau các thay đổi trong transaction.
    const fresh = (await this.repository.roomById(db, room.id)) ?? room;
    const members = knownMembers ?? (await this.repository.activeMembers(db, fresh.id));
    let match: FbRoomView['match'] = null;
    if (fresh.status === 'playing' && fresh.currentMatchId) {
      const row = await this.repository.matchById(db, fresh.currentMatchId);
      if (row) {
        const joined = (await this.repository.entryByMatchUser(db, row.id, userId)) !== null;
        match = {
          id: row.id,
          status: row.status === 'playing' ? 'playing' : 'ended',
          started_at: iso(row.startedAt),
          ends_at: iso(row.endsAt),
          joined,
        };
      }
    }
    return {
      id: fresh.code,
      locked: fresh.passwordHash !== null,
      owner_id: fresh.ownerId,
      is_owner: fresh.ownerId === userId,
      view_bars: fresh.viewBars,
      play_bars: fresh.playBars,
      minutes: fresh.minutes,
      max_players: fresh.maxPlayers,
      stake_xu: fresh.stakeXu,
      status: fresh.status === 'playing' ? 'playing' : 'waiting',
      members: members.map((member) => ({
        user_id: member.userId,
        name: member.name,
        avatar_url: member.avatarUrl,
        is_owner: member.userId === fresh.ownerId,
        is_me: member.userId === userId,
        joined_at: iso(member.joinedAt),
      })),
      match,
      created_at: iso(fresh.createdAt),
      auto_close_at:
        fresh.status === 'waiting'
          ? iso(new Date(fresh.waitingSince.getTime() + FB_ROOM_WAITING_TTL_MS))
          : null,
      server_now: iso(this.clock.now()),
    };
  }
}
