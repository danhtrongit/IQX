/**
 * Chat phòng Flashback (spec v2.4 §3).
 *
 * Giao tin bằng polling qua `GET rooms/:code/chat`, cùng cách làm với trạng thái phòng và biểu cảm
 * (DESIGN: cổng realtime hiện có là luồng dữ liệu thị trường công khai, không xác thực). Mỗi lần đọc
 * server tính lại danh sách từ phiên hiện tại của người đọc, nên tin chưa tới lượt không bao giờ
 * xuống trình duyệt và trình duyệt không thể yêu cầu tin của phiên sau.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/database.service.js';
import { recordAudit, type AuditContext } from '../users/audit.js';
import {
  chatVisibleTo,
  compareChat,
  FB_CHAT_BANNED_MAX,
  FB_CHAT_BANNED_WORD_MAX_LENGTH,
  FB_CHAT_COOLDOWN_MS,
  FB_CHAT_LIST_LIMIT,
  FB_CHAT_MAX_LENGTH,
  FB_CHAT_REPORT_CONTEXT,
  FB_CHAT_RETENTION_MS,
  FB_CHAT_SCAN_LIMIT,
  FB_CHAT_TOO_FAST_MESSAGE,
  maskBannedWords,
  normalizeBannedWords,
  normalizeChatText,
  type FbChatViewer,
} from './flashback-chat.logic.js';
import {
  FLASHBACK_CHAT_REPOSITORY,
  FlashbackChatRepository,
  type FbChatMatchInfo,
  type FbChatMessageRow,
  type FbChatMutedUser,
  type FbChatReportContextItem,
  type FbChatReportStatus,
} from './flashback-chat.repository.js';
import {
  FLASHBACK_ROOMS_REPOSITORY,
  FlashbackRoomsRepository,
  type FbRoomRow,
} from './flashback-rooms.repository.js';
import { FlashbackRoomsService } from './flashback-rooms.service.js';
import { FLASHBACK_CLOCK, type FlashbackClock } from './flashback.service.js';

/** Số báo cáo trả về mỗi lần cho màn quản trị. */
const REPORTS_LIMIT = 100;

export interface FbChatMessageView {
  readonly id: string;
  readonly user_id: string;
  readonly name: string;
  readonly is_me: boolean;
  /** true: gửi ở phòng chờ (nhãn "Phòng chờ"); false: nhãn "Phiên {phien}". */
  readonly waiting: boolean;
  readonly phien: number;
  readonly text: string;
  readonly created_at: string;
}

export interface FbChatMutedView {
  readonly user_id: string;
  readonly name: string;
}

export interface FbChatView {
  readonly enabled: boolean;
  readonly messages: FbChatMessageView[];
  readonly muted: FbChatMutedView[];
}

export interface FbChatReportView {
  readonly id: string;
  readonly room_code: string;
  readonly reporter_name: string;
  readonly reported_user_id: string;
  readonly reported_name: string;
  readonly text: string;
  readonly phien: number;
  readonly message_at: string;
  readonly context: readonly FbChatReportContextItem[];
  readonly status: FbChatReportStatus;
  readonly created_at: string;
  readonly decided_at: string | null;
}

/** Mọi thứ máy chủ thời gian thực cần biết về một người trong một phòng (ảnh, cuộc gọi). */
export interface FbMediaContext {
  readonly roomId: string;
  readonly name: string;
  readonly chatEnabled: boolean;
  /** Phiên hiện tại của người này, dùng để quyết định ảnh nào đã tới lượt (§3.4). */
  readonly viewer: FbChatViewer;
  /** Vị trí gắn vào ảnh người này gửi lúc này, giống tin chữ. */
  readonly position: { matchId: string | null; phien: number };
  /** Những người mà người này đã tắt tiếng trong phòng. */
  readonly muted: readonly string[];
}

const roomNotFound = (code: string) =>
  new NotFoundException({ code: 'ROOM_NOT_FOUND', message: `Không tìm thấy phòng ${code}` });
const notInRoom = () =>
  new ForbiddenException({ code: 'NOT_IN_ROOM', message: 'Bạn không ở trong phòng này' });
const chatDisabled = () =>
  new ConflictException({ code: 'CHAT_DISABLED', message: 'Phòng này đã tắt chat' });
const messageNotFound = () =>
  new NotFoundException({ code: 'CHAT_MESSAGE_NOT_FOUND', message: 'Không tìm thấy tin nhắn' });

const mutedView = (user: FbChatMutedUser): FbChatMutedView => ({
  user_id: user.userId,
  name: user.name,
});

@Injectable()
export class FlashbackChatService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(FLASHBACK_ROOMS_REPOSITORY) private readonly rooms: FlashbackRoomsRepository,
    @Inject(FLASHBACK_CHAT_REPOSITORY) private readonly chat: FlashbackChatRepository,
    private readonly roomsService: FlashbackRoomsService,
    @Inject(FLASHBACK_CLOCK) private readonly clock: FlashbackClock,
  ) {}

  // ================================================================== người chơi

  /** Các tin đã tới lượt của người đọc (§3.4, §3.6), kèm danh sách người mình đã tắt tiếng. */
  async list(userId: string, code: string): Promise<FbChatView> {
    const room = await this.memberRoom(this.database, userId, code);
    if (!room.chatEnabled) return { enabled: false, messages: [], muted: [] };
    const viewer = await this.viewer(room, userId);
    const muted = await this.chat.mutedUsers(this.database, room.id, userId);
    const mutedIds = new Set(muted.map((user) => user.userId));
    const rows = await this.chat.recentMessages(this.database, room.id, FB_CHAT_SCAN_LIMIT);
    const messages = rows
      .filter((row) => chatVisibleTo(row, viewer) && !mutedIds.has(row.userId))
      .sort(compareChat)
      .slice(-FB_CHAT_LIST_LIMIT)
      .map((row) => this.messageView(row, userId));
    return { enabled: true, messages, muted: muted.map(mutedView) };
  }

  /**
   * Gửi tin (§3.3, §3.5). `phien` do server gắn theo trạng thái của người gửi, không nhận từ trình
   * duyệt. Từ cấm được thay bằng `***` trước khi lưu.
   */
  async send(userId: string, code: string, raw: string): Promise<FbChatMessageView> {
    const text = normalizeChatText(raw);
    if (!text)
      throw new UnprocessableEntityException({ code: 'CHAT_EMPTY', message: 'Hãy nhập tin nhắn' });
    if (text.length > FB_CHAT_MAX_LENGTH)
      throw new UnprocessableEntityException({
        code: 'CHAT_TOO_LONG',
        message: `Tin nhắn tối đa ${FB_CHAT_MAX_LENGTH} ký tự`,
      });
    const before = await this.memberRoom(this.database, userId, code);
    if (!before.chatEnabled) throw chatDisabled();
    // Ván hết giờ thì chốt trước, để tin gửi lúc này được giao cho mọi người.
    await this.settleIfExpired(before, userId);
    return this.database.transaction(async (tx) => {
      const room = await this.memberRoom(tx, userId, code);
      await this.chat.lockSender(tx, userId);
      const now = this.clock.now();
      const last = await this.chat.lastSentAt(tx, userId);
      if (last) {
        const waitMs = FB_CHAT_COOLDOWN_MS - (now.getTime() - last.getTime());
        if (waitMs > 0)
          throw new HttpException(
            {
              code: 'CHAT_TOO_FAST',
              message: FB_CHAT_TOO_FAST_MESSAGE,
              details: [{ retry_after_ms: waitMs }],
            },
            429,
          );
      }
      const position = await this.senderPosition(tx, room, userId);
      const saved = await this.chat.insertMessage(tx, {
        roomId: room.id,
        matchId: position.matchId,
        userId,
        phien: position.phien,
        text: maskBannedWords(text, await this.chat.bannedWords(tx)),
        createdAt: now,
      });
      return this.messageView(saved, userId);
    });
  }

  /** Tắt tiếng hoặc bỏ tắt tiếng một người trong phòng này; người kia không biết (§3.5). */
  async setMuted(
    userId: string,
    code: string,
    targetId: string,
    muted: boolean,
  ): Promise<{ muted: FbChatMutedView[] }> {
    if (targetId === userId)
      throw new BadRequestException({
        code: 'CHAT_MUTE_SELF',
        message: 'Bạn không thể tắt tiếng chính mình',
      });
    return this.database.transaction(async (tx) => {
      const room = await this.memberRoom(tx, userId, code);
      await this.chat.setMuted(tx, room.id, userId, targetId, muted, this.clock.now());
      return { muted: (await this.chat.mutedUsers(tx, room.id, userId)).map(mutedView) };
    });
  }

  /**
   * Báo cáo một tin (§3.5): gửi tin đó kèm 10 tin trước vào Quản trị. Chỉ báo cáo được tin đã tới lượt
   * mình, nên endpoint này không dùng để dò tin của phiên sau; báo cáo lại cùng một tin thì bỏ qua.
   */
  async report(userId: string, code: string, messageId: string): Promise<{ reported: true }> {
    const before = await this.memberRoom(this.database, userId, code);
    const viewer = await this.viewer(before, userId);
    await this.database.transaction(async (tx) => {
      const message = await this.chat.messageById(tx, before.id, messageId);
      if (!message || !chatVisibleTo(message, viewer)) throw messageNotFound();
      if (message.userId === userId)
        throw new BadRequestException({
          code: 'CHAT_REPORT_SELF',
          message: 'Bạn không thể báo cáo tin của chính mình',
        });
      const previous = await this.chat.messagesBefore(tx, message, FB_CHAT_REPORT_CONTEXT);
      await this.chat.insertReport(tx, {
        messageId: message.id,
        roomCode: before.code,
        reporterId: userId,
        reportedUserId: message.userId,
        messageText: message.text,
        messagePhien: message.phien,
        messageAt: message.createdAt,
        context: previous.reverse().map((item) => ({
          name: item.name,
          phien: item.phien,
          waiting: item.matchId === null,
          text: item.text,
          at: item.createdAt.toISOString(),
        })),
        createdAt: this.clock.now(),
      });
      await this.chat.markReported(tx, message.id);
    });
    return { reported: true };
  }

  // ================================================================== ảnh và cuộc gọi (WebSocket)

  /**
   * Ngữ cảnh của một thành viên cho máy chủ thời gian thực: cùng nguồn sự thật với chat chữ (thành
   * viên, `chat_enabled`, tắt tiếng, phiên). Ném `ROOM_NOT_FOUND` / `NOT_IN_ROOM` như các API chat.
   */
  async mediaContext(userId: string, code: string): Promise<FbMediaContext> {
    const room = await this.rooms.roomByCode(this.database, code);
    if (!room) throw roomNotFound(code);
    const members = await this.rooms.activeMembers(this.database, room.id);
    const me = members.find((member) => member.userId === userId);
    if (!me) throw notInRoom();
    const viewer = await this.viewer(room, userId);
    const position = await this.senderPosition(this.database, room, userId);
    const muted = await this.chat.mutedUsers(this.database, room.id, userId);
    return {
      roomId: room.id,
      name: me.name,
      chatEnabled: room.chatEnabled,
      viewer,
      position,
      muted: muted.map((user) => user.userId),
    };
  }

  /** Id của phòng đang mở có mã này; null nếu không còn (đã đóng). */
  async mediaRoomId(code: string): Promise<string | null> {
    return (await this.rooms.roomByCode(this.database, code))?.id ?? null;
  }

  // ================================================================== quản trị

  async bannedWords(): Promise<{ words: string[] }> {
    // Sắp theo tiếng Việt ở đây: thứ tự của cơ sở dữ liệu phụ thuộc collation, khác lúc vừa lưu.
    return { words: normalizeBannedWords(await this.chat.bannedWords(this.database)) };
  }

  /** Thay cả danh sách từ cấm. Chỉ áp dụng cho tin gửi từ lúc này, tin đã lưu giữ nguyên. */
  async replaceBannedWords(
    words: readonly string[],
    audit: AuditContext,
  ): Promise<{ words: string[] }> {
    const clean = normalizeBannedWords(words);
    if (clean.length > FB_CHAT_BANNED_MAX)
      throw new UnprocessableEntityException({
        code: 'CHAT_BANNED_TOO_MANY',
        message: `Tối đa ${FB_CHAT_BANNED_MAX} từ cấm`,
      });
    if (clean.some((word) => word.length > FB_CHAT_BANNED_WORD_MAX_LENGTH))
      throw new UnprocessableEntityException({
        code: 'CHAT_BANNED_TOO_LONG',
        message: `Mỗi từ cấm tối đa ${FB_CHAT_BANNED_WORD_MAX_LENGTH} ký tự`,
      });
    await this.database.transaction(async (tx) => {
      await this.chat.replaceBannedWords(tx, clean, audit.adminId, this.clock.now());
      await recordAudit(tx, audit, {
        action: 'flashback.chat_banned_words',
        targetEntity: 'fb_chat_banned_words',
        note: `Danh sách từ cấm: ${clean.length} từ`,
      });
    });
    return { words: clean };
  }

  async reports(status: FbChatReportStatus): Promise<{ reports: FbChatReportView[] }> {
    const rows = await this.chat.reports(this.database, status, REPORTS_LIMIT);
    return {
      reports: rows.map((row) => ({
        id: row.id,
        room_code: row.roomCode,
        reporter_name: row.reporterName,
        reported_user_id: row.reportedUserId,
        reported_name: row.reportedName,
        text: row.messageText,
        phien: row.messagePhien,
        message_at: row.messageAt.toISOString(),
        context: row.context,
        status: row.status,
        created_at: row.createdAt.toISOString(),
        decided_at: row.decidedAt ? row.decidedAt.toISOString() : null,
      })),
    };
  }

  async decideReport(
    reportId: string,
    status: 'resolved' | 'dismissed',
    audit: AuditContext,
  ): Promise<{ id: string; status: 'resolved' | 'dismissed' }> {
    await this.database.transaction(async (tx) => {
      const done = await this.chat.decideReport(
        tx,
        reportId,
        status,
        audit.adminId,
        this.clock.now(),
      );
      if (!done)
        throw new NotFoundException({
          code: 'CHAT_REPORT_NOT_FOUND',
          message: 'Không tìm thấy báo cáo đang chờ xử lý',
        });
      await recordAudit(tx, audit, {
        action: 'flashback.chat_report',
        targetEntity: 'fb_chat_reports',
        targetId: reportId,
        note: status === 'resolved' ? 'Đã xử lý báo cáo chat' : 'Bỏ qua báo cáo chat',
      });
    });
    return { id: reportId, status };
  }

  /** Xoá tin quá 7 ngày (§3.6); báo cáo giữ bản sao riêng nên vẫn đọc được. */
  async purgeExpired(now: Date = this.clock.now()): Promise<number> {
    return this.chat.purge(this.database, new Date(now.getTime() - FB_CHAT_RETENTION_MS));
  }

  // ================================================================== nội bộ

  private async memberRoom(db: SqlClient, userId: string, code: string): Promise<FbRoomRow> {
    const room = await this.rooms.roomByCode(db, code);
    if (!room) throw roomNotFound(code);
    const members = await this.rooms.activeMembers(db, room.id);
    if (!members.some((member) => member.userId === userId)) throw notInRoom();
    return room;
  }

  /** Ván của phòng nếu phòng đang ở trong một ván; sau "Chơi lại" phòng chờ không còn thuộc ván nào. */
  private async currentMatch(
    db: SqlClient,
    room: FbRoomRow,
    userId: string,
  ): Promise<FbChatMatchInfo | null> {
    if (room.status !== 'playing' || !room.currentMatchId) return null;
    return this.chat.currentMatch(db, room.currentMatchId, userId);
  }

  private async settleIfExpired(room: FbRoomRow, userId: string): Promise<FbChatMatchInfo | null> {
    const match = await this.currentMatch(this.database, room, userId);
    if (!match?.live || match.endsAt.getTime() > this.clock.now().getTime()) return match;
    await this.roomsService.settleIfDue(match.matchId);
    return this.currentMatch(this.database, room, userId);
  }

  private async viewer(room: FbRoomRow, userId: string): Promise<FbChatViewer> {
    const match = await this.settleIfExpired(room, userId);
    if (!match?.live) return { userId, liveMatchId: null, step: null };
    return {
      userId,
      liveMatchId: match.matchId,
      step: match.finished ? match.playBars : match.step,
    };
  }

  /**
   * Vị trí của người gửi (§3.4): phòng chờ là `phien = 0`; đang chơi là phiên đang đứng; đã Hoàn thành
   * hoặc ván đã kết thúc là phiên cuối.
   */
  private async senderPosition(
    tx: SqlClient,
    room: FbRoomRow,
    userId: string,
  ): Promise<{ matchId: string | null; phien: number }> {
    const match = await this.currentMatch(tx, room, userId);
    if (!match) return { matchId: null, phien: 0 };
    const atEnd = !match.live || match.finished || match.step === null;
    return { matchId: match.matchId, phien: atEnd ? match.playBars : (match.step ?? 0) };
  }

  private messageView(row: FbChatMessageRow, userId: string): FbChatMessageView {
    return {
      id: row.id,
      user_id: row.userId,
      name: row.name,
      is_me: row.userId === userId,
      waiting: row.matchId === null,
      phien: row.phien,
      text: row.text,
      created_at: row.createdAt.toISOString(),
    };
  }
}
