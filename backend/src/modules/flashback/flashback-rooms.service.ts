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
  Optional,
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
import { FLASHBACK_NO_DATA_MESSAGE } from './flashback-dataset.config.js';
import { FlashbackRoomEvents } from './flashback-room-events.js';
import {
  FB_INITIAL_CASH_VND,
  FB_KICKED_NOTICE,
  FB_KICKED_REASON,
  FB_KICK_BLOCK_MS,
  FB_ROOM_ENDED_TTL_MS,
  FB_ROOM_WAITING_TTL_MS,
  formatXu,
  hashRoomPassword,
  historyResultOf,
  isRoomCode,
  joinCheck,
  levelInfo,
  levelOfPoints,
  matchPoints,
  membersNotReady,
  navAtStep,
  navOf,
  playersNotReadyMessage,
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
  type FbCrown,
  type FbHistoryResult,
  type FbPublicBar,
  type FbRoomSettingsInput,
} from './flashback-rooms.logic.js';
import {
  FB_REACTION_WINDOW_MS,
  FbReactionStore,
  isReactionEmoji,
  type FbReaction,
} from './flashback-rooms.reactions.js';
import {
  FB_HISTORY_CAP,
  FLASHBACK_ROOMS_REPOSITORY,
  FlashbackRoomsRepository,
  fbLedgerKey,
  type FbEntryPlayerRow,
  type FbEntryRow,
  type FbLeaderboardRow,
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

/** Bộ dữ liệu một ván: một mã VN100 và một đoạn W + H + P phiên đã điều chỉnh của kho (v2.2 §3). Chỉ server. */
export interface FbMatchDataset {
  readonly symbol: string;
  readonly warmupBars: readonly FlashbackBar[];
  /** view_bars + play_bars nến liên tục. */
  readonly bars: readonly FlashbackBar[];
  readonly priceSource: string | null;
  readonly fallbackLevel: number;
  /** v2.2: phiên bản kho và điểm cắt của đoạn dữ liệu (null/thiếu với đường dẫn cũ). */
  readonly datasetVersion?: number | null;
  readonly startIdx?: number | null;
}

/** Cắt một giai đoạn hợp lệ từ kho dữ liệu đang dùng (spec v2.2 §3). */
export interface FbDatasetPort {
  pick(now: Date, viewBars: number, playBars: number): Promise<FbMatchDataset | null>;
}

export const FB_DATASET = Symbol('FB_DATASET');

/** Thẻ nến hiện ở phiên vừa mở (Candle Dojo v1.3 §5). */
export interface FbShownCard {
  readonly id: string;
  readonly n: number;
}

/** Thẻ đã hiện của người chơi trong ván, để dựng lại khối "Thẻ trong ván" khi vào lại hoặc xem lại. */
export interface FbMatchCardView {
  readonly play_idx: number;
  readonly card_id: string;
  readonly card_n: number;
}

/**
 * Tra mẫu nến tính sẵn lúc chơi (Candle Dojo v1.3 §5). Không ném lỗi: thiếu dữ liệu hoặc lỗi tra thì
 * không có thẻ, ván vẫn chơi bình thường.
 */
export interface FbCardsPort {
  /**
   * Thẻ của Phiên `step` (1..P) cho người chơi: mẫu tính sẵn của phiên đó nếu người chơi sở hữu thẻ.
   * Ghi lại thẻ đã hiện (và "Đã gặp"). Chỉ phiên vừa mở, không bao giờ phiên chưa mở.
   */
  cardAt(input: { match: FbMatchRow; userId: string; step: number }): Promise<FbShownCard | null>;
  /** Thẻ đã hiện của người chơi từ Phiên 1 tới `upToStep`, tăng dần. */
  matchCards(input: { matchId: string; userId: string; upToStep: number }): Promise<FbMatchCardView[]>;
}

export const FB_CARDS = Symbol('FB_CARDS');

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

/** Cấp và vương miện hiện trên avatar ở mọi chỗ có người chơi (v2.1 §3.3, §4.3). */
export interface FbBadge {
  /** Cấp tính từ tổng điểm (1 khi chưa có điểm). */
  readonly level: number;
  /** 1 vàng, 2 bạc, 3 đồng khi đang hạng 1, 2, 3 toàn hệ thống; null khi không. */
  readonly crown: FbCrown | null;
}

export interface FbPlayerRef extends FbBadge {
  readonly user_id: string;
  readonly name: string;
  readonly avatar_url: string | null;
}

export interface FbRoomListItem {
  readonly id: string;
  readonly locked: boolean;
  /** Chủ phòng: tên, avatar, cấp và vương miện (sảnh không lộ user_id). */
  readonly owner: FbBadge & { readonly name: string; readonly avatar_url: string | null };
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
  /** Đã bấm "Sẵn sàng" ở phòng chờ. Chủ phòng luôn là true (được tính là sẵn sàng). */
  readonly ready: boolean;
}

export interface FbRoomView {
  readonly id: string;
  readonly locked: boolean;
  readonly chat_enabled: boolean;
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
  /** Phiên hiện tại của người này (v2.1 §6.2: "Đang chơi · {phiên}/{số phiên chơi}"). */
  readonly step: number;
  /**
   * % lợi nhuận (phân số): null trong lúc chơi, không ai thấy % của ai (v2.1 §6.2); chỉ sau khi
   * ván kết thúc mới trả % cuối.
   */
  readonly pnl_pct: number | null;
  readonly pnl_percent: number | null;
}

/** Một biểu cảm vừa gửi trong ván (v2.1 §6.4), lấy theo polling của `state`. */
export interface FbReactionView {
  readonly id: string;
  readonly user_id: string;
  readonly emoji: string;
  /** Đã gửi cách đây bao nhiêu mili giây khi server trả `state`. */
  readonly age_ms: number;
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
  /** Biểu cảm của vài giây gần đây; trống khi ván đã kết thúc. Máy khách bỏ trùng theo `id`. */
  readonly reactions: FbReactionView[];
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
  /** Candle Dojo v1.3 §5: thẻ đã hiện cho tôi trong ván (rỗng khi chưa có thẻ nào hoặc chưa tính mẫu). */
  readonly cards: FbMatchCardView[];
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
  /** Điểm cấp nhận từ ván (v2.1 §3.1): 10, 3 hoặc 0 (ván chơi 1 mình). */
  readonly points: number;
}

/** Tiến độ cấp của người xem sau ván (v2.1 §3.3): dòng "Điểm +10 · Cấp 3 · 75 điểm · còn 15 điểm lên cấp 4". */
export interface FbResultProgress {
  /** Điểm nhận từ ván này (0 khi chơi 1 mình). */
  readonly points: number;
  /** Tổng điểm sau ván này. */
  readonly total_points: number;
  readonly level: number;
  /** Cấp trước ván này. */
  readonly previous_level: number;
  readonly leveled_up: boolean;
  readonly level_base: number;
  readonly next_level_points: number;
  readonly remaining_points: number;
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
  readonly progress: FbResultProgress;
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

/** `GET me/level` (v2.1 §2.1, §10.2): thẻ cấp ở đầu sảnh. */
export interface FbMyLevel {
  readonly points: number;
  readonly level: number;
  /** Tổng điểm để đạt cấp hiện tại. */
  readonly level_base: number;
  /** Tổng điểm để đạt cấp kế tiếp. */
  readonly next_level_points: number;
  /** Còn thiếu bao nhiêu điểm để lên cấp kế tiếp. */
  readonly remaining_points: number;
  /** Hạng toàn hệ thống; null khi chưa chơi ván nào từ 2 người. */
  readonly rank: number | null;
  readonly games: number;
  readonly wins: number;
}

export interface FbLeaderboardItem extends FbPlayerRef {
  readonly rank: number;
  readonly points: number;
  readonly wins: number;
  readonly games: number;
  readonly is_me: boolean;
}

/** `GET leaderboard` (v2.1 §4.2): top theo `limit` và dòng của tôi nếu nằm ngoài top. */
export interface FbLeaderboardView {
  readonly rows: FbLeaderboardItem[];
  readonly me: FbLeaderboardItem | null;
}

/** `GET leaderboard/top3` (v2.1 §10.2): người đang hạng 1, 2, 3 để vẽ vương miện. */
export interface FbTop3View {
  readonly users: {
    readonly rank: FbCrown;
    readonly user_id: string;
    readonly name: string;
    readonly avatar_url: string | null;
    readonly level: number;
    readonly points: number;
  }[];
}

export interface FbHistoryPlayerView extends FbPlayerRef {
  readonly rank: number;
  readonly is_me: boolean;
  readonly pnl_pct: number;
  readonly pnl_percent: number;
  /** Xu thắng trừ xu cược của người này; 0 khi ván không cược. */
  readonly xu: number;
  readonly points: number;
}

/** Lệnh của chính người xem trong chi tiết một ván (v2.1 §5.2); không bao giờ có lệnh người khác. */
export interface FbHistoryOrderView {
  readonly id: string;
  readonly step: number;
  readonly side: 'buy' | 'sell';
  readonly qty: number;
  readonly price: string;
  readonly fee: string;
  readonly tax: string;
  readonly amount: string;
}

export interface FbHistoryItem {
  readonly match_id: string;
  readonly room_id: string;
  readonly ended_at: string;
  readonly player_count: number;
  readonly view_bars: number;
  readonly play_bars: number;
  readonly minutes: number;
  readonly stake_xu: number;
  readonly symbol: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly result: FbHistoryResult;
  readonly rank: number;
  readonly pnl_pct: number;
  readonly pnl_percent: number;
  /** Xu thắng, hoàn trừ xu cược của tôi; 0 khi ván không cược. */
  readonly xu: number;
  readonly points: number;
  /** Tiền mặt cuối ván so với tổng tài sản cuối ván, làm tròn phần trăm. */
  readonly cash_percent: number;
  readonly players: FbHistoryPlayerView[];
  readonly orders: FbHistoryOrderView[];
}

export interface FbHistoryView {
  readonly items: FbHistoryItem[];
  readonly page: number;
  readonly page_size: number;
  /** Số ván khớp bộ lọc, đã giới hạn ở 200 ván gần nhất. */
  readonly total: number;
  readonly pages: number;
}

/** Sáu số tổng kết của lịch sử đấu (v2.1 §5.1), tính trên mọi ván trong khoảng thời gian lọc. */
export interface FbHistorySummary {
  readonly games: number;
  readonly solo_games: number;
  readonly multi_games: number;
  readonly wins: number;
  /** Tỷ lệ thắng 0..1 trên ván từ 2 người; 0 khi chưa có ván nào. */
  readonly win_rate: number;
  readonly xu_net: number;
  readonly points: number;
  readonly avg_pnl_pct: number;
  readonly avg_pnl_percent: number;
  readonly best_pnl_pct: number | null;
  readonly best_pnl_percent: number | null;
  readonly best_symbol: string | null;
}

export interface FbReactionSent {
  readonly id: string;
  readonly user_id: string;
  readonly emoji: string;
}

export interface FbHistoryQuery {
  readonly result: 'all' | 'win' | 'lose' | 'solo';
  readonly days: '7' | '30' | 'all';
  readonly page: number;
}

/** Số phòng tối đa trả về cho sảnh. */
const LOBBY_LIMIT = 100;

/** Số ván mỗi trang của lịch sử đấu (v2.1 §5.3). */
export const FB_HISTORY_PAGE_SIZE = 20;

/** Bảng xếp hạng tối đa bấy nhiêu dòng (v2.1 §4.2 hiện tới hạng 50). */
export const FB_LEADERBOARD_DEFAULT_LIMIT = 50;
export const FB_LEADERBOARD_MAX_LIMIT = 100;

/** Số ván chờ cộng điểm được sửa mỗi lần chạy tác vụ định kỳ. */
const AWARD_REPAIR_BATCH = 50;

const iso = (value: Date) => value.toISOString();
const sumQty = (lots: readonly FlashbackLotRow[]) => lots.reduce((sum, lot) => sum + lot.qty, 0);

@Injectable()
export class FlashbackRoomsService {
  private readonly logger = new Logger(FlashbackRoomsService.name);
  /** Biểu cảm của các ván đang chơi (v2.1 §6.4): trong bộ nhớ, không lưu lịch sử. */
  private readonly reactions = new FbReactionStore();

  constructor(
    private readonly database: DatabaseService,
    @Inject(FLASHBACK_ROOMS_REPOSITORY) private readonly repository: FlashbackRoomsRepository,
    @Inject(FB_DATASET) private readonly dataset: FbDatasetPort,
    @Inject(FLASHBACK_CLOCK) private readonly clock: FlashbackClock,
    @Optional() private readonly events?: FlashbackRoomEvents,
    @Optional() @Inject(FB_CARDS) private readonly cards?: FbCardsPort,
  ) {}

  // ================================================================== sảnh

  async listRooms(status: 'all' | 'waiting' | 'playing'): Promise<{ rooms: FbRoomListItem[] }> {
    const rows = await this.repository.listOpenRooms(this.database, status, LOBBY_LIMIT);
    const crowns = await this.crownMap(this.database);
    return { rooms: rows.map((row) => this.listItem(row, crowns)) };
  }

  /** Phòng hiện tại của tôi (để vào lại phòng chờ hoặc chơi tiếp ván dở) và thông báo một lần. */
  async myRoom(
    userId: string,
  ): Promise<{ room: FbRoomView | null; notice: string | null; kicked: boolean }> {
    const roomId = await this.repository.activeRoomIdOf(this.database, userId);
    const room = roomId ? await this.repository.roomById(this.database, roomId) : null;
    const taken = await this.database.transaction((tx) => this.repository.takeNotice(tx, userId));
    const notice = taken?.notice ?? null;
    // `kicked`: lần hỏi này lấy được thông báo "bị chủ phòng đuổi" (một lần, như `notice`).
    const kicked = taken?.reason === FB_KICKED_REASON;
    if (!room || room.status === 'closed') return { room: null, notice, kicked };
    return { room: await this.roomView(this.database, room, userId), notice, kicked };
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
          chatEnabled: settings.chatEnabled,
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
      // Bị chủ phòng đuổi thì không vào lại đúng phòng này trong 10 phút (kể cả "Chơi phòng bất kỳ").
      if (
        await this.repository.wasKickedSince(
          tx,
          room.id,
          userId,
          new Date(now.getTime() - FB_KICK_BLOCK_MS),
        )
      )
        throw conflict(
          'FB_KICKED',
          'Bạn đã bị chủ phòng mời ra khỏi phòng này, hãy thử lại sau 10 phút',
        );
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
    const room = await this.database.transaction(async (tx) => {
      const room = await this.repository.roomByCode(tx, code, true);
      if (!room) throw roomNotFound(code);
      const members = await this.repository.activeMembers(tx, room.id);
      if (!members.some((member) => member.userId === userId))
        throw forbidden('NOT_IN_ROOM', 'Bạn không ở trong phòng này');
      await this.dropMember(tx, room, members, userId, 'leave', null, now);
      return room;
    });
    await this.announceDeparture(room, [userId]);
    return { left: true };
  }

  /**
   * Sẵn sàng / Huỷ sẵn sàng (chỉ phòng chờ). Chủ phòng luôn được tính là sẵn sàng nên bấm không đổi
   * gì (trả lại phòng). Trả phòng mới nhất để máy người bấm cập nhật ngay.
   */
  async setReady(userId: string, code: string, ready: boolean): Promise<FbRoomView> {
    this.assertCode(code);
    const now = this.clock.now();
    return this.database.transaction(async (tx) => {
      const room = await this.repository.roomByCode(tx, code, true);
      if (!room) throw roomNotFound(code);
      const members = await this.repository.activeMembers(tx, room.id);
      if (!members.some((member) => member.userId === userId))
        throw forbidden('NOT_IN_ROOM', 'Bạn không ở trong phòng này');
      if (room.status !== 'waiting') throw conflict('ROOM_PLAYING', 'Phòng đang chơi');
      if (room.ownerId !== userId) {
        // Không đủ xu cược thì không bấm Sẵn sàng được (v2.4 §5.2); huỷ thì luôn được.
        if (ready && room.stakeXu > 0) {
          const balance = await this.repository.balance(tx, userId);
          if (balance < room.stakeXu)
            throw conflict(
              'XU_INSUFFICIENT',
              `Không đủ ${formatXu(room.stakeXu)} xu để chơi phòng này`,
            );
        }
        await this.repository.setMemberReady(tx, room.id, userId, ready, now);
      }
      return this.roomView(tx, room, userId);
    });
  }

  /**
   * Chủ phòng đuổi một thành viên khỏi phòng chờ. Đi đúng đường rời phòng (`dropMember`): xu chỉ bị
   * trừ lúc bắt đầu ván nên ở phòng chờ không có gì để hoàn. Người bị đuổi nhận thông báo một lần
   * (`rooms/me`) và không vào lại phòng này trong 10 phút.
   */
  async kickMember(ownerId: string, code: string, targetUserId: string): Promise<FbRoomView> {
    this.assertCode(code);
    const now = this.clock.now();
    let kickedFrom: FbRoomRow | null = null;
    const view = await this.database.transaction(async (tx) => {
      const room = await this.repository.roomByCode(tx, code, true);
      if (!room) throw roomNotFound(code);
      const members = await this.repository.activeMembers(tx, room.id);
      if (!members.some((member) => member.userId === ownerId))
        throw forbidden('NOT_IN_ROOM', 'Bạn không ở trong phòng này');
      if (room.ownerId !== ownerId)
        throw forbidden('NOT_ROOM_OWNER', 'Chỉ chủ phòng được mời người ra khỏi phòng');
      if (targetUserId === ownerId)
        throw conflict('FB_KICK_SELF', 'Bạn không thể tự mời mình ra khỏi phòng');
      if (room.status !== 'waiting')
        throw conflict('ROOM_PLAYING', 'Đang chơi, chưa mời người ra khỏi phòng được');
      if (!members.some((member) => member.userId === targetUserId))
        throw notFound('FB_MEMBER_NOT_FOUND', 'Người chơi này không còn ở trong phòng');
      await this.dropMember(
        tx,
        room,
        members,
        targetUserId,
        FB_KICKED_REASON,
        FB_KICKED_NOTICE,
        now,
      );
      kickedFrom = room;
      return this.roomView(tx, room, ownerId);
    });
    if (kickedFrom) await this.announceDeparture(kickedFrom, [targetUserId]);
    return view;
  }

  /**
   * Bắt đầu ván (§4, §5, §8): chỉ chủ phòng; kiểm tra lại xu từng người (ai thiếu bị đưa ra kèm
   * thông báo), một mình thì không cược, trừ cược mỗi người đúng một lần, cắt mã VN100 và giai
   * đoạn ngẫu nhiên, tạo ván. Trả nến lịch sử và nến khởi tạo chỉ báo, không có mã hay ngày.
   */
  async startRoom(userId: string, code: string): Promise<FbStartResult> {
    this.assertCode(code);
    const before = await this.repository.roomByCode(this.database, code);
    if (!before) throw roomNotFound(code);
    this.assertCanStart(before, userId);
    const now = this.clock.now();
    const dataset = await this.dataset.pick(now, before.viewBars, before.playBars);
    // Không cắt được đề (spec v2.2 §3.3 bước 7): không bắt đầu, chưa trừ xu, chủ phòng đọc được
    // thông báo. Dùng 409 thay cho 503 vì bộ lọc lỗi chung thay MỌI thông báo 5xx bằng câu chung
    // "Dịch vụ tạm thời không khả dụng", nên chủ phòng sẽ không bao giờ thấy câu của spec.
    if (!dataset || dataset.bars.length !== before.viewBars + before.playBars)
      throw conflict('FLASHBACK_DATA_UNAVAILABLE', FLASHBACK_NO_DATA_MESSAGE);

    const outcome = await this.database.transaction(async (tx) => {
      const room = await this.repository.roomByCode(tx, code, true);
      if (!room) throw roomNotFound(code);
      this.assertCanStart(room, userId);
      if (room.viewBars !== before.viewBars || room.playBars !== before.playBars)
        throw conflict('ROOM_CHANGED', 'Phòng vừa thay đổi, hãy thử lại');
      const members = await this.repository.activeMembers(tx, room.id);
      // Mọi người (trừ chủ phòng, được tính là sẵn sàng) phải bấm "Sẵn sàng" trước khi bắt đầu.
      const waiting = membersNotReady(members, room.ownerId);
      if (waiting.length > 0)
        throw conflict('FB_PLAYERS_NOT_READY', playersNotReadyMessage(waiting.length));
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
        datasetVersion: dataset.datasetVersion ?? null,
        startIdx: dataset.startIdx ?? null,
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
      // Sẵn sàng chỉ có nghĩa trong một lần chờ: ván mới bắt đầu thì xoá hết.
      await this.repository.resetReady(tx, room.id);
      return { match, room: updated ?? room, removed };
    });

    if (outcome.removed.length > 0)
      await this.announceDeparture(
        outcome.room,
        outcome.removed.map((item) => item.user_id),
      );
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
      async (
        tx,
      ): Promise<
        { view: FbRoomView; error: null } | { view: null; error: string; room: FbRoomRow }
      > => {
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
          // Về phòng chờ sau ván: mọi người phải bấm "Sẵn sàng" lại.
          await this.repository.resetReady(tx, room.id);
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
            return {
              view: null,
              error: `Không đủ ${formatXu(current.stakeXu)} xu để chơi lại`,
              room: current,
            };
          }
        }
        return { view: await this.roomView(tx, current, userId), error: null };
      },
    );
    if (result.view === null) {
      if (result.room) await this.announceDeparture(result.room, [userId]);
      throw conflict('XU_INSUFFICIENT', result.error);
    }
    return result.view;
  }

  // ================================================================== ván chơi

  async matchSnapshot(userId: string, matchId: string): Promise<FbMatchSnapshot> {
    await this.settleIfDue(matchId);
    const { match, entry, entries, roomCode } = await this.loadForViewer(userId, matchId);
    const ended = match.status !== 'playing';
    const chart = publicChart(match, ended ? match.playBars : entry.step);
    const state = this.stateView(
      match,
      roomCode,
      entry,
      entries,
      await this.crownMap(this.database),
    );
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
      cards: (await this.cards?.matchCards({
        matchId: match.id,
        userId,
        upToStep: ended ? match.playBars : entry.step,
      })) ?? [],
    };
  }

  /** Phiên tiếp (§6.2, §9): ghi nhận bước mới rồi mới trả nến của bước đó. */
  async next(
    userId: string,
    matchId: string,
  ): Promise<{ bar: FbPublicBar; me: FbEntryView; card: FbShownCard | null }> {
    await this.settleIfDue(matchId);
    let roomId = '';
    const result = await this.database.transaction(async (tx) => {
      const entry = await this.repository.entryByMatchUser(tx, matchId, userId, true);
      if (!entry) throw matchNotFound();
      const match = await this.playableMatch(tx, matchId);
      roomId = match.roomId;
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
        match,
        step,
      };
    });
    // Sang phiên mới: ảnh trong chat của người đi trước có thể tới lượt (v2.4 §3.4).
    this.events?.positionChanged({ roomId, userId });
    // Candle Dojo v1.3 §5: tra mẫu tính sẵn của đúng phiên vừa mở, sau khi bước đã được ghi nhận.
    // Mua thẻ giữa ván có hiệu lực từ lần bấm này vì quyền sở hữu được kiểm ngay lúc tra.
    const card = (await this.cards?.cardAt({ match: result.match, userId, step: result.step })) ?? null;
    return { bar: result.bar, me: result.me, card };
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

  /**
   * Đồng hồ, ai đã hoàn thành, phiên của từng người và biểu cảm mới (v2.1 §6.2, §6.4). Trong lúc
   * chơi không có tài sản hay % của ai; sau khi kết thúc mới có % cuối.
   */
  async state(userId: string, matchId: string): Promise<FbStateView> {
    await this.settleIfDue(matchId);
    const { match, entry, entries, roomCode } = await this.loadForViewer(userId, matchId);
    return this.stateView(match, roomCode, entry, entries, await this.crownMap(this.database));
  }

  /** Kết quả (§7.3): chỉ sau khi ván kết thúc; lúc này mới gửi mã và thời gian. */
  async result(userId: string, matchId: string): Promise<FbResultView> {
    await this.settleIfDue(matchId);
    let loaded = await this.loadForViewer(userId, matchId);
    // Ván do bản cũ chốt có thể chưa cộng điểm: cộng bù một lần (idempotent) trước khi trả kết quả.
    if (
      loaded.match.status !== 'playing' &&
      loaded.entries.some((entry) => entry.pointsAwardedAt === null)
    ) {
      await this.awardPending(matchId);
      loaded = await this.loadForViewer(userId, matchId);
    }
    const { match, entries, roomCode } = loaded;
    if (match.status === 'playing') throw conflict('RESULT_NOT_READY', 'Ván chưa kết thúc');
    const crowns = await this.crownMap(this.database);
    const solo = entries.length === 1;
    const sorted = [...entries].sort(
      (left, right) =>
        (left.rank ?? 99) - (right.rank ?? 99) ||
        left.joinedAt.getTime() - right.joinedAt.getTime(),
    );
    const winners = sorted.filter((entry) => entry.rank === 1);
    const refund = entries.some((entry) => entry.refundXu > 0);
    const mine = entries.find((entry) => entry.userId === userId);
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
          ...this.badge(crowns, entry.userId, entry.totalPoints),
          rank: entry.rank ?? sorted.length,
          is_me: entry.userId === userId,
          is_winner: !solo && entry.rank === 1,
          pnl_pct: pnl,
          pnl_percent: pnl * 100,
          final_nav: (entry.finalNav ?? entry.cash).toString(),
          win_xu: entry.winXu,
          refund_xu: entry.refundXu,
          xu_label: resultXuLabel(entry),
          points: entry.points,
        };
      }),
      progress: await this.resultProgress(mine),
      symbol: match.symbol,
      start_date: match.startDate,
      end_date: match.endDate,
      played_bars: publicChart(match, match.playBars).played,
    };
  }

  // ================================================================== biểu cảm (v2.1 §6.4)

  /**
   * Gửi một biểu cảm trong ván đang chơi. Chỉ người của ván mới gửi được; emoji phải nằm trong danh
   * sách 12 cái; mỗi người 1 biểu cảm mỗi 1,5 giây. Không lưu lịch sử: các máy khác lấy biểu cảm ở
   * lần polling `state` kế tiếp (xem `flashback-rooms.reactions.ts`).
   */
  async sendReaction(userId: string, matchId: string, emoji: string): Promise<FbReactionSent> {
    if (!isReactionEmoji(emoji)) throw badRequest('REACTION_INVALID', 'Biểu cảm không hợp lệ');
    await this.settleIfDue(matchId);
    const match = await this.repository.matchById(this.database, matchId);
    if (!match) throw matchNotFound();
    const entry = await this.repository.entryByMatchUser(this.database, matchId, userId);
    if (!entry) throw matchNotFound();
    if (match.status !== 'playing') throw matchEnded();
    const sent = this.reactions.send({
      matchId,
      userId,
      emoji,
      now: this.clock.now().getTime(),
    });
    if (!sent.ok) {
      if (sent.reason === 'too_fast')
        throw fail(429, 'REACTION_TOO_FAST', 'Từ từ thôi 😄', [
          { retry_after_ms: sent.retryAfterMs },
        ]);
      throw badRequest('REACTION_INVALID', 'Biểu cảm không hợp lệ');
    }
    return { id: sent.reaction.id, user_id: userId, emoji: sent.reaction.emoji };
  }

  // ================================================================== cấp, hạng, lịch sử (v2.1)

  /** Thẻ cấp ở đầu sảnh (v2.1 §2.1): điểm, cấp, mốc điểm và hạng toàn hệ thống. */
  async myLevel(userId: string): Promise<FbMyLevel> {
    const row = await this.repository.leaderboardRow(this.database, userId);
    const info = levelInfo(row?.points ?? 0);
    return {
      points: info.points,
      level: info.level,
      level_base: info.levelBase,
      next_level_points: info.nextLevelPoints,
      remaining_points: info.remaining,
      rank: row?.rank ?? null,
      games: row?.games ?? 0,
      wins: row?.wins ?? 0,
    };
  }

  /** Bảng xếp hạng toàn hệ thống (v2.1 §4): top `limit` và dòng của tôi nếu nằm ngoài top. */
  async leaderboard(
    userId: string,
    limit: number = FB_LEADERBOARD_DEFAULT_LIMIT,
  ): Promise<FbLeaderboardView> {
    const size = Math.max(1, Math.min(Math.trunc(limit), FB_LEADERBOARD_MAX_LIMIT));
    const rows = await this.repository.leaderboard(this.database, size);
    const mine = rows.some((row) => row.userId === userId)
      ? null
      : await this.repository.leaderboardRow(this.database, userId);
    return {
      rows: rows.map((row) => this.leaderboardItem(row, userId)),
      me: mine ? this.leaderboardItem(mine, userId) : null,
    };
  }

  /** Người đang hạng 1, 2, 3 (v2.1 §10.2), để vẽ vương miện ở nơi chưa có `crown` trong dữ liệu. */
  async top3(): Promise<FbTop3View> {
    const rows = await this.repository.leaderboard(this.database, 3);
    return {
      users: rows.map((row) => ({
        rank: row.rank as FbCrown,
        user_id: row.userId,
        name: row.name,
        avatar_url: row.avatarUrl,
        level: levelOfPoints(row.points),
        points: row.points,
      })),
    };
  }

  /**
   * Lịch sử đấu của chính tôi (v2.1 §5): ván mới nhất trước, tối đa 200 ván gần nhất, 20 ván mỗi
   * trang. Mỗi ván kèm người chơi (không kèm lệnh của họ) và lệnh của riêng tôi. Không có biểu đồ.
   */
  async history(userId: string, query: FbHistoryQuery): Promise<FbHistoryView> {
    const filter = { result: query.result, since: this.historySince(query.days) };
    let page = Math.max(1, Math.trunc(query.page));
    const fetch = (at: number) =>
      this.repository.historyPage(
        this.database,
        userId,
        filter,
        (at - 1) * FB_HISTORY_PAGE_SIZE,
        FB_HISTORY_PAGE_SIZE,
      );
    let found = await fetch(page);
    const pages = Math.max(1, Math.ceil(found.total / FB_HISTORY_PAGE_SIZE));
    if (page > pages) {
      page = pages;
      found = await fetch(page);
    }
    const [players, orders, crowns] = await Promise.all([
      this.repository.historyPlayers(
        this.database,
        found.rows.map((row) => row.matchId),
      ),
      this.repository.historyOrders(
        this.database,
        found.rows.map((row) => row.entryId),
      ),
      this.crownMap(this.database),
    ]);
    const items = found.rows.map((row): FbHistoryItem => {
      const mine = orders.filter((order) => order.entryId === row.entryId);
      return {
        match_id: row.matchId,
        room_id: row.roomCode,
        ended_at: iso(row.endedAt),
        player_count: row.playerCount,
        view_bars: row.viewBars,
        play_bars: row.playBars,
        minutes: row.minutes,
        stake_xu: row.matchStakeXu,
        symbol: row.symbol,
        start_date: row.startDate,
        end_date: row.endDate,
        result: historyResultOf({
          playerCount: row.playerCount,
          rank: row.rank,
          topCount: row.topCount,
        }),
        rank: row.rank,
        pnl_pct: row.pnlPct,
        pnl_percent: row.pnlPct * 100,
        xu: row.winXu + row.refundXu - row.stakeXu,
        points: row.points,
        cash_percent:
          row.finalNav > 0n
            ? Math.max(
                0,
                Math.min(100, Math.round((Number(row.cash) * 100) / Number(row.finalNav))),
              )
            : 0,
        players: players
          .filter((player) => player.matchId === row.matchId)
          .map((player): FbHistoryPlayerView => ({
            user_id: player.userId,
            name: player.name,
            avatar_url: player.avatarUrl,
            ...this.badge(crowns, player.userId, player.totalPoints),
            rank: player.rank,
            is_me: player.userId === userId,
            pnl_pct: player.pnlPct,
            pnl_percent: player.pnlPct * 100,
            xu: player.winXu + player.refundXu - player.stakeXu,
            points: player.points,
          })),
        orders: mine.map((order) => ({
          id: order.id,
          step: order.step,
          side: order.side,
          qty: order.qty,
          price: order.price.toString(),
          fee: order.fee.toString(),
          tax: order.tax.toString(),
          amount: order.amount.toString(),
        })),
      };
    });
    return {
      items,
      page,
      page_size: FB_HISTORY_PAGE_SIZE,
      total: Math.min(found.total, FB_HISTORY_CAP),
      pages,
    };
  }

  /** Sáu số tổng kết của lịch sử đấu (v2.1 §5.1) trong khoảng thời gian đang lọc. */
  async historySummary(userId: string, days: FbHistoryQuery['days']): Promise<FbHistorySummary> {
    const row = await this.repository.historySummary(
      this.database,
      userId,
      this.historySince(days),
    );
    const multi = row.games - row.soloGames;
    const average = row.avgPnlPct ?? 0;
    return {
      games: row.games,
      solo_games: row.soloGames,
      multi_games: multi,
      wins: row.wins,
      win_rate: multi > 0 ? row.wins / multi : 0,
      xu_net: row.xuNet,
      points: row.points,
      avg_pnl_pct: average,
      avg_pnl_percent: average * 100,
      best_pnl_pct: row.bestPnlPct,
      best_pnl_percent: row.bestPnlPct === null ? null : row.bestPnlPct * 100,
      best_symbol: row.bestSymbol,
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
    let roomId: string | null = null;
    const settled = await this.settleInTransaction(matchId, (id) => {
      roomId = id;
    });
    // Ván kết thúc: mọi người đổi trạng thái, ảnh đang chờ của ván này được giao hết.
    if (settled && roomId) this.events?.positionChanged({ roomId });
    return settled;
  }

  private async settleInTransaction(
    matchId: string,
    onRoom: (roomId: string) => void,
  ): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const match = await this.repository.matchById(tx, matchId, true);
      if (!match || match.status !== 'playing') return false;
      onRoom(match.roomId);
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
      // Bước cuối của tác vụ kết thúc ván (v2.1 §10.2): cộng điểm cấp sau khi đã cộng xu.
      await this.awardPoints(
        tx,
        settlement.outcomes.map((outcome) => ({
          entryId: outcome.entryId,
          userId: outcome.userId,
          winner: outcome.winner,
        })),
        now,
      );
      await this.repository.updateMatch(tx, matchId, { status: 'paid', paidAt: now });
      return true;
    });
  }

  /**
   * Cộng điểm cấp cho từng người của một ván đã kết thúc (v2.1 §3, §10.2): thắng (kể cả đồng hạng
   * 1) +10, thua +3, ván chơi 1 mình 0 và không tính vào số ván. Mỗi (ván, người) chỉ một lần: kho
   * dữ liệu chỉ cập nhật dòng chưa có `points_awarded_at`, nên chạy lại hay hai tiến trình cùng lúc
   * đều không cộng hai lần. Cộng theo thứ tự user_id để các transaction khoá cùng một thứ tự.
   * Trả số người vừa được cộng.
   */
  private async awardPoints(
    tx: SqlClient,
    players: readonly { entryId: string; userId: string; winner: boolean }[],
    now: Date,
  ): Promise<number> {
    const solo = players.length === 1;
    let awarded = 0;
    for (const player of [...players].sort((a, b) => a.userId.localeCompare(b.userId))) {
      const winner = !solo && player.winner;
      const done = await this.repository.awardEntry(tx, {
        entryId: player.entryId,
        userId: player.userId,
        points: matchPoints({ solo, winner }),
        isWin: winner,
        counted: !solo,
        at: now,
      });
      if (done) awarded += 1;
    }
    return awarded;
  }

  /**
   * Cộng bù điểm cho ván đã kết thúc mà còn người chưa được cộng (ván do bản cũ chốt trước khi có
   * cấp). Dùng đúng đường cộng điểm của lúc chốt ván nên vẫn idempotent. Trả số người vừa được cộng.
   */
  private async awardPending(matchId: string): Promise<number> {
    return this.database.transaction(async (tx) => {
      const match = await this.repository.matchById(tx, matchId, true);
      if (!match || match.status === 'playing') return 0;
      const entries = await this.repository.entriesByMatch(tx, matchId, true);
      if (entries.every((entry) => entry.pointsAwardedAt !== null)) return 0;
      return this.awardPoints(
        tx,
        entries.map((entry) => ({
          entryId: entry.id,
          userId: entry.userId,
          winner: entry.rank === 1,
        })),
        match.endedAt ?? this.clock.now(),
      );
    });
  }

  /**
   * Tác vụ định kỳ: chốt ván hết giờ, cộng bù điểm cấp cho ván bản cũ đã chốt, đóng phòng chờ quá
   * 30 phút và phòng bỏ dở sau kết quả.
   */
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
    for (const matchId of await this.repository.pendingAwardMatchIds(
      this.database,
      AWARD_REPAIR_BATCH,
    )) {
      try {
        const awarded = await this.awardPending(matchId);
        if (awarded > 0)
          this.logger.warn(
            `Flashback rooms: cộng bù điểm cấp cho ${awarded} người của ván ${matchId}`,
          );
      } catch (error) {
        this.logger.error(
          `Flashback rooms: cộng điểm ván ${matchId} lỗi (${error instanceof Error ? error.message : 'không rõ'})`,
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
        if (!room || room.status === 'closed') return null;
        if (room.status === 'waiting' && room.waitingSince.getTime() > waitingBefore.getTime())
          return null;
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
            return null;
        }
        await this.closeRoom(
          tx,
          room,
          room.status === 'waiting' ? 'waiting_timeout' : 'ended_timeout',
          now,
        );
        return room;
      });
      if (done) {
        closed += 1;
        this.events?.roomClosed({ roomId: done.id, code: done.code });
      }
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

  /**
   * Báo cho máy chủ thời gian thực (sau khi transaction đã commit) rằng người chơi đã rời phòng, và
   * phòng đã đóng nếu đó là người cuối. Lỗi ở đây không được làm hỏng thao tác của người chơi.
   */
  private async announceDeparture(
    room: { id: string; code: string },
    userIds: readonly string[],
  ): Promise<void> {
    if (!this.events) return;
    for (const userId of userIds)
      this.events.memberLeft({ roomId: room.id, code: room.code, userId });
    try {
      const fresh = await this.repository.roomById(this.database, room.id);
      if (fresh?.status === 'closed') this.events.roomClosed({ roomId: room.id, code: room.code });
    } catch {
      // Máy chủ thời gian thực tự đối chiếu phòng đã đóng định kỳ.
    }
  }

  private async codeOfRoom(db: SqlClient, roomId: string | null): Promise<string | null> {
    if (!roomId) return null;
    return (await this.repository.roomById(db, roomId))?.code ?? null;
  }

  /** Đưa một thành viên ra khỏi phòng (rời hoặc bị đuổi), rồi chuyển chủ phòng hoặc đóng phòng nếu cần. */
  private async dropMember(
    tx: SqlClient,
    room: FbRoomRow,
    members: readonly FbMemberRow[],
    userId: string,
    reason: string,
    notice: string | null,
    now: Date,
  ): Promise<void> {
    await this.repository.removeMember(tx, room.id, userId, reason, notice, now);
    await this.afterMemberLeft(
      tx,
      room,
      members.filter((member) => member.userId !== userId),
      now,
    );
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

  /** Người đang hạng 1, 2, 3 toàn hệ thống → vương miện vàng, bạc, đồng (v2.1 §4.3). */
  private async crownMap(db: SqlClient): Promise<Map<string, FbCrown>> {
    const ids = await this.repository.top3(db);
    return new Map(ids.map((id, index) => [id, (index + 1) as FbCrown]));
  }

  /** Cấp (từ tổng điểm) và vương miện của một người, gắn vào mọi nơi trả thông tin người chơi. */
  private badge(
    crowns: ReadonlyMap<string, FbCrown>,
    userId: string,
    totalPoints: number,
  ): FbBadge {
    return { level: levelOfPoints(totalPoints), crown: crowns.get(userId) ?? null };
  }

  private leaderboardItem(row: FbLeaderboardRow, viewerId: string): FbLeaderboardItem {
    return {
      user_id: row.userId,
      name: row.name,
      avatar_url: row.avatarUrl,
      level: levelOfPoints(row.points),
      crown: row.rank <= 3 ? (row.rank as FbCrown) : null,
      rank: row.rank,
      points: row.points,
      wins: row.wins,
      games: row.games,
      is_me: row.userId === viewerId,
    };
  }

  /** Mốc bắt đầu của bộ lọc thời gian của lịch sử đấu: 7 hoặc 30 ngày gần nhất, hoặc tất cả (null). */
  private historySince(days: FbHistoryQuery['days']): Date | null {
    if (days === 'all') return null;
    return new Date(this.clock.now().getTime() - Number(days) * 86_400_000);
  }

  /**
   * Dòng tiến độ của người xem sau ván (v2.1 §3.3). Tổng điểm là tổng tính tới và gồm cả ván này
   * (không phải tổng hiện tại), nên mở lại kết quả sau khi đã chơi ván khác vẫn đúng cấp lúc đó.
   */
  private async resultProgress(mine: FbEntryPlayerRow | undefined): Promise<FbResultProgress> {
    const gained = mine?.points ?? 0;
    const total = mine
      ? mine.pointsAwardedAt
        ? await this.repository.pointsThroughEntry(this.database, mine.id)
        : mine.totalPoints
      : 0;
    const info = levelInfo(total);
    const previousLevel = levelOfPoints(Math.max(0, total - gained));
    return {
      points: gained,
      total_points: info.points,
      level: info.level,
      previous_level: previousLevel,
      leveled_up: info.level > previousLevel,
      level_base: info.levelBase,
      next_level_points: info.nextLevelPoints,
      remaining_points: info.remaining,
    };
  }

  /** Biểu cảm còn trong cửa sổ của ván đang chơi; ván đã kết thúc thì không còn (v2.1 §6.4). */
  private reactionViews(match: FbMatchRow): FbReactionView[] {
    if (match.status !== 'playing') return [];
    const now = this.clock.now().getTime();
    return this.reactions
      .recent(match.id, now)
      .filter((item: FbReaction) => now - item.at < FB_REACTION_WINDOW_MS)
      .map((item) => ({
        id: item.id,
        user_id: item.userId,
        emoji: item.emoji,
        age_ms: Math.max(0, now - item.at),
      }));
  }

  private stateView(
    match: FbMatchRow,
    roomCode: string,
    me: FbEntryRow,
    entries: readonly FbEntryPlayerRow[],
    crowns: ReadonlyMap<string, FbCrown>,
  ): FbStateView {
    const now = this.clock.now();
    const ended = match.status !== 'playing';
    const players = entries.map((entry): FbStatePlayer => {
      // Trong lúc chơi chỉ trả phiên hiện tại và trạng thái xong, không trả tài sản hay % của ai,
      // kể cả của chính mình (v2.1 §6.2). Sau khi kết thúc mới có % cuối.
      const pnl = ended
        ? pnlFraction(
            entry.finalNav ?? navAtStep(entry.navByStep, match.playBars),
            entry.initialCash,
          )
        : null;
      return {
        user_id: entry.userId,
        name: entry.name,
        avatar_url: entry.avatarUrl,
        ...this.badge(crowns, entry.userId, entry.totalPoints),
        is_me: entry.userId === me.userId,
        finished: entry.status === 'finished',
        step: entry.step,
        pnl_pct: pnl,
        pnl_percent: pnl === null ? null : pnl * 100,
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
      reactions: this.reactionViews(match),
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

  private listItem(row: FbRoomListRow, crowns: ReadonlyMap<string, FbCrown>): FbRoomListItem {
    return {
      id: row.code,
      locked: row.passwordHash !== null,
      owner: {
        name: row.ownerName,
        avatar_url: row.ownerAvatarUrl,
        ...this.badge(crowns, row.ownerId, row.ownerTotalPoints),
      },
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
    const crowns = await this.crownMap(db);
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
      chat_enabled: fresh.chatEnabled,
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
        ...this.badge(crowns, member.userId, member.totalPoints),
        is_owner: member.userId === fresh.ownerId,
        is_me: member.userId === userId,
        joined_at: iso(member.joinedAt),
        ready: member.userId === fresh.ownerId || member.ready,
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
