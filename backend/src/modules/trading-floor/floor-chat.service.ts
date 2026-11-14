/**
 * Nhắn tin với SACO (port 1:1 từ `server/chat.ts` của IQX-KhuGiaoDich, danh tính là tài khoản IQX):
 * hộp thư, nhắn trực tiếp, gửi / đã xem / đang soạn, công tắc Đang trực, và Chat SACO (khớp theo thứ
 * tự, mỗi SACO 5 giây để nhận lời). Lời mời đang chờ và lượt tìm của từng người nằm trong bộ nhớ của
 * tiến trình API; tin nhắn, cuộc trò chuyện và nhật ký lời mời nằm trong PostgreSQL.
 *
 * Sự kiện đi qua `FloorEvents`; "online" do `FloorPresence` trả lời.
 */

import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import { CHAT_RULES, cleanText, floorChatTiming } from './floor-chat.logic.js';
import {
  FLOOR_CHAT_REPOSITORY,
  type ChatConvView,
  type FloorChatRepository,
} from './floor-chat.repository.js';
import { FLOOR_CLOCK, type FloorClock } from './floor-clock.js';
import { FloorEvents } from './floor-events.js';
import { FloorPresence } from './floor-presence.js';
import { FloorProfileService } from './floor-profile.service.js';
import {
  FLOOR_SACO_REPOSITORY,
  toSacoSelf,
  type FloorSacoRepository,
  type FloorSacoRow,
} from './floor-saco.repository.js';
import type {
  ChatMessage,
  ConvDetail,
  ConvSummary,
  Inbox,
  InviteEvent,
  InviteResult,
  MatchEvent,
  SacoSelf,
} from './floor-types.js';

interface Pending {
  readonly id: number;
  readonly userId: string;
  readonly userName: string;
  readonly deadline: number;
  readonly timer: ReturnType<typeof setTimeout>;
  resolve(result: InviteResult): void;
}

interface Run {
  readonly id: string;
  cancelled: boolean;
  current: Pending | null;
}

const convNotFound = () =>
  new NotFoundException({ code: 'CONV_NOT_FOUND', message: 'Không tìm thấy cuộc trò chuyện.' });

@Injectable()
export class FloorChatService implements OnApplicationShutdown {
  private readonly logger = new Logger(FloorChatService.name);
  private readonly lastSend = new Map<string, number>();
  /** Lời mời đang chờ, theo mã SACO: mỗi SACO chỉ một lời mời tại một thời điểm. */
  private readonly pending = new Map<string, Pending>();
  /** Lượt tìm đang chạy, theo tài khoản: mỗi người một lượt. */
  private readonly runs = new Map<string, Run>();
  private inviteSeq = 0;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly database: DatabaseService,
    @Inject(FLOOR_CHAT_REPOSITORY) private readonly chat: FloorChatRepository,
    @Inject(FLOOR_SACO_REPOSITORY) private readonly sacos: FloorSacoRepository,
    private readonly profiles: FloorProfileService,
    private readonly presence: FloorPresence,
    private readonly events: FloorEvents,
    @Inject(FLOOR_CLOCK) private readonly clock: FloorClock,
  ) {
    // Đóng tab hoặc mất mạng khi đang tìm thì coi như huỷ; lời mời đang chờ bị thu hồi.
    this.unsubscribe = this.presence.onUserGone((userId) => this.cancelMatch(userId));
  }

  onApplicationShutdown(): void {
    this.unsubscribe();
    for (const run of this.runs.values()) run.cancelled = true;
    for (const pending of [...this.pending.values()]) pending.resolve('cancel');
  }

  // ================================================================== hộp thư và cuộc trò chuyện

  async inbox(userId: string): Promise<Inbox> {
    const saco = await this.sacos.findByUser(this.database, userId);
    const [mine, theirs, matched] = await Promise.all([
      this.chat.userConvs(this.database, userId, CHAT_RULES.inboxLimit),
      saco?.active
        ? this.chat.sacoConvs(this.database, saco.id, CHAT_RULES.inboxLimit)
        : Promise.resolve([] as ChatConvView[]),
      this.chat.matchedConv(this.database, userId),
    ]);
    return {
      saco: saco ? toSacoSelf(saco) : null,
      asUser: mine.map((conv) => this.summary(conv, 'user')),
      asSaco: theirs.map((conv) => this.summary(conv, 'saco')),
      matchedConvId: matched?.id ?? null,
    };
  }

  async conversation(userId: string, convId: string): Promise<ConvDetail> {
    const { conv, side } = await this.member(userId, convId);
    const messages = await this.chat.messages(this.database, convId, CHAT_RULES.history);
    const peerRead = side === 'user' ? conv.sacoReadAt : conv.userReadAt;
    return { ...this.summary(conv, side), messages, peerReadAt: peerRead?.getTime() ?? 0 };
  }

  /** "Nhắn SACO" trên thẻ nhận định: mở (hoặc dùng lại) cuộc trò chuyện trực tiếp, bật cờ nhắn trực tiếp. */
  async openDirect(userId: string, sacoId: string): Promise<ConvSummary> {
    const saco = await this.sacos.findById(this.database, sacoId);
    if (!saco || !saco.active) {
      throw new NotFoundException({
        code: 'SACO_NOT_FOUND',
        message: 'SACO này không còn hoạt động.',
      });
    }
    if (saco.userId === userId) {
      throw new BadRequestException({
        code: 'SELF_CHAT',
        message: 'Bạn không thể tự nhắn cho chính mình.',
      });
    }
    const id = await this.chat.ensureConv(this.database, userId, sacoId, this.clock.now(), {
      direct: true,
    });
    const view = await this.chat.convView(this.database, id, 'user');
    return this.summary(view!, 'user');
  }

  async send(userId: string, convId: string, raw: unknown): Promise<ChatMessage> {
    const now = this.clock.now();
    const nowMs = now.getTime();
    const { conv, side } = await this.member(userId, convId);
    if (!conv.sacoActive) {
      throw new ForbiddenException({
        code: 'SACO_INACTIVE',
        message: 'SACO này không còn hoạt động. Bạn vẫn xem được tin nhắn cũ.',
      });
    }
    const text = cleanText(raw);
    if (!text) {
      throw new BadRequestException({
        code: 'MESSAGE_INVALID',
        message: `Tin nhắn trống hoặc dài quá ${CHAT_RULES.maxText} ký tự.`,
      });
    }
    const previous = this.lastSend.get(userId);
    if (previous !== undefined && nowMs >= previous && nowMs - previous < CHAT_RULES.sendMinMs) {
      throw new HttpException(
        { code: 'SEND_TOO_FAST', message: 'Bạn gửi nhanh quá, chờ một chút.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.lastSend.set(userId, nowMs);
    if (this.lastSend.size > 2000) this.pruneSendLog(nowMs);
    // Viết trả lời nghĩa là người gửi đã đọc cuộc trò chuyện.
    const message = await this.database.transaction(async (tx) => {
      const saved = await this.chat.insertMessage(tx, convId, side === 'user' ? 'u' : 's', text, now);
      await this.chat.markRead(tx, convId, side, now);
      return saved;
    });
    this.broadcast(conv, { type: 'chat:msg', convId, message });
    return message;
  }

  async markRead(userId: string, convId: string): Promise<void> {
    const now = this.clock.now();
    const { conv, side } = await this.member(userId, convId);
    await this.chat.markRead(this.database, convId, side, now);
    this.broadcast(conv, { type: 'chat:read', convId, side, at: now.getTime() });
  }

  /** "Đang soạn": báo cho bên kia; người không thuộc cuộc trò chuyện thì bỏ qua lặng lẽ. */
  async typing(userId: string, convId: string): Promise<void> {
    let found: { conv: ChatConvView; side: 'user' | 'saco' };
    try {
      found = await this.member(userId, convId);
    } catch {
      return;
    }
    const { conv, side } = found;
    const message = { type: 'chat:typing', convId, side };
    if (side === 'user') this.events.toSaco(conv.sacoId, message);
    else this.events.toUser(conv.userId, message);
  }

  async setDuty(userId: string, on: boolean): Promise<SacoSelf> {
    const saco = await this.sacos.findByUser(this.database, userId);
    if (!saco || !saco.active) {
      throw new ForbiddenException({
        code: 'NOT_SACO',
        message: 'Tài khoản này không phải SACO.',
      });
    }
    await this.sacos.setDuty(this.database, saco.id, on, this.clock.now());
    this.presence.bindSaco(saco.id, userId);
    if (!on) this.pending.get(saco.id)?.resolve('decline');
    await this.notifyPeers(saco.id);
    return toSacoSelf((await this.sacos.findById(this.database, saco.id))!);
  }

  /** Người đang chat với SACO làm mới hộp thư (trạng thái, chỉ đọc); chính SACO cũng làm mới. */
  async notifyPeers(sacoId: string): Promise<void> {
    const convs = await this.chat.convIdsOfSaco(this.database, sacoId);
    for (const userId of new Set(convs.map((conv) => conv.userId))) {
      this.events.toUser(userId, { type: 'chat:inbox' });
    }
    this.events.toSaco(sacoId, { type: 'chat:inbox' });
  }

  // ================================================================== Chat SACO

  /** Lời mời mà một SACO còn phải thấy, cho socket kết nối giữa lúc có lời mời. */
  pendingInvite(sacoId: string): InviteEvent | null {
    const pending = this.pending.get(sacoId);
    return pending
      ? { id: pending.id, userName: pending.userName, deadline: pending.deadline }
      : null;
  }

  /** Thu hồi lời mời đang chờ của SACO (tính là từ chối): dùng khi SACO bị gỡ quyền. */
  revokeInvite(sacoId: string): void {
    this.pending.get(sacoId)?.resolve('decline');
  }

  /**
   * Chat SACO: hỏi lần lượt các SACO còn hoạt động từ số 1 xuống, mỗi SACO `inviteMs`. SACO vắng, không
   * online hoặc đang giữ lời mời khác thì bỏ qua ngay. Tiến trình gửi cho người dùng bằng `chat:match`.
   */
  async startMatch(userId: string): Promise<{ convId: string } | { running: true }> {
    if (this.runs.has(userId)) return { running: true };
    const existing = await this.chat.matchedConv(this.database, userId);
    if (existing) return { convId: existing.id };
    // Giữa hai lần kiểm tra có `await`: kiểm tra lại rồi đặt ngay để mỗi người chỉ có một lượt.
    if (this.runs.has(userId)) return { running: true };
    const run: Run = { id: randomUUID(), cancelled: false, current: null };
    this.runs.set(userId, run);
    void this.runMatch(userId, run)
      .catch((error: unknown) => {
        this.logger.warn(
          `Chat SACO run failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.events.toUser(userId, { type: 'chat:match', event: { state: 'none' } satisfies MatchEvent });
      })
      .finally(() => {
        if (this.runs.get(userId) === run) this.runs.delete(userId);
      });
    return { running: true };
  }

  cancelMatch(userId: string): void {
    const run = this.runs.get(userId);
    if (!run) return;
    run.cancelled = true;
    run.current?.resolve('cancel');
  }

  async answerInvite(userId: string, inviteId: number, accept: boolean): Promise<void> {
    const saco = await this.sacos.findByUser(this.database, userId);
    const pending = saco?.active ? this.pending.get(saco.id) : undefined;
    if (!saco || !pending || pending.id !== inviteId) {
      throw new GoneException({ code: 'INVITE_EXPIRED', message: 'Lời mời đã hết hạn.' });
    }
    pending.resolve(accept ? 'accept' : 'decline');
  }

  private async runMatch(userId: string, run: Run): Promise<void> {
    const tell = (event: MatchEvent): void =>
      this.events.toUser(userId, { type: 'chat:match', event });
    const userName = await this.profiles.displayName(userId);
    let turn = 0;
    let found: FloorSacoRow | null = null;
    // Lượt tìm đang chạy giữ thứ tự cũ: danh sách chụp một lần, từng SACO đọc lại trước khi hỏi.
    for (const listed of await this.sacos.listActive(this.database)) {
      if (run.cancelled) break;
      const saco = await this.sacos.findById(this.database, listed.id);
      if (!saco || !saco.active || saco.userId === userId) continue;
      if (!this.sacoOnline(saco)) {
        await this.logInvite(run, userId, saco.id, 'skip-off');
        continue;
      }
      if (this.pending.has(saco.id)) {
        await this.logInvite(run, userId, saco.id, 'skip-busy');
        continue;
      }
      turn += 1;
      const deadline = Date.now() + floorChatTiming.inviteMs;
      tell({ state: 'asking', turn, deadline });
      const result = await this.ask(saco, userId, userName, run, deadline);
      await this.logInvite(run, userId, saco.id, result);
      if (result === 'cancel') break;
      if (result === 'accept') {
        found = saco;
        break;
      }
    }
    if (run.cancelled) return tell({ state: 'cancelled' });
    if (!found) return tell({ state: 'none' });
    const now = this.clock.now();
    const matched = found;
    const { convId, message } = await this.database.transaction(async (tx) => {
      const id = await this.chat.ensureConv(tx, userId, matched.id, now);
      await this.chat.markMatched(tx, id, now);
      const saved = await this.chat.insertMessage(
        tx,
        id,
        'x',
        `${userName} được khớp với ${matched.name} qua Chat SACO`,
        now,
      );
      return { convId: id, message: saved };
    });
    this.broadcast(
      { userId, sacoId: matched.id },
      { type: 'chat:msg', convId, message },
    );
    this.events.toSaco(matched.id, { type: 'chat:inbox' });
    tell({ state: 'matched', convId });
  }

  private ask(
    saco: FloorSacoRow,
    userId: string,
    userName: string,
    run: Run,
    deadline: number,
  ): Promise<InviteResult> {
    return new Promise((resolve) => {
      const id = ++this.inviteSeq;
      const timer = setTimeout(() => pending.resolve('timeout'), floorChatTiming.inviteMs);
      timer.unref?.();
      const pending: Pending = {
        id,
        userId,
        userName,
        deadline,
        timer,
        resolve: (result) => {
          if (this.pending.get(saco.id) !== pending) return;
          clearTimeout(timer);
          this.pending.delete(saco.id);
          run.current = null;
          this.events.toSaco(saco.id, { type: 'chat:invite:end', id });
          resolve(result);
        },
      };
      this.pending.set(saco.id, pending);
      run.current = pending;
      this.events.toSaco(saco.id, {
        type: 'chat:invite',
        invite: { id, userName, deadline } satisfies InviteEvent,
      });
    });
  }

  private async logInvite(
    run: Run,
    userId: string,
    sacoId: string,
    result: InviteResult,
  ): Promise<void> {
    try {
      await this.chat.insertInvite(this.database, {
        runId: run.id,
        userId,
        sacoId,
        result,
        at: this.clock.now(),
      });
    } catch (error) {
      this.logger.warn(
        `Invite log failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ================================================================== nội bộ

  /** SACO online để khớp: còn hoạt động, đang trực và chủ tài khoản có socket. */
  private sacoOnline(saco: Pick<FloorSacoRow, 'active' | 'onDuty' | 'userId'>): boolean {
    return saco.active && saco.onDuty && this.presence.userOnline(saco.userId);
  }

  private summary(conv: ChatConvView, side: 'user' | 'saco'): ConvSummary {
    return {
      id: conv.id,
      side,
      peerName: side === 'user' ? conv.sacoName : conv.userName,
      peerIcon: side === 'user' ? conv.sacoIcon : '',
      matched: conv.matched,
      writable: conv.sacoActive,
      online:
        side === 'user'
          ? this.sacoOnline({
              active: conv.sacoActive,
              onDuty: conv.sacoOnDuty,
              userId: conv.sacoUserId,
            })
          : this.presence.userOnline(conv.userId),
      last: conv.last,
      unread: conv.unread,
    };
  }

  /** Cuộc trò chuyện và phía của `userId`; người ngoài cuộc nhận 404. */
  private async member(
    userId: string,
    convId: string,
  ): Promise<{ conv: ChatConvView; side: 'user' | 'saco' }> {
    const probe = await this.chat.convView(this.database, convId, 'user');
    if (!probe) throw convNotFound();
    if (probe.userId === userId) return { conv: probe, side: 'user' };
    if (probe.sacoUserId !== userId) throw convNotFound();
    // Số chưa đọc của probe tính cho phía người dùng; phía SACO cần tính lại.
    const conv = await this.chat.convView(this.database, convId, 'saco');
    if (!conv) throw convNotFound();
    return { conv, side: 'saco' };
  }

  private broadcast(conv: { userId: string; sacoId: string }, message: { type: string; [key: string]: unknown }): void {
    this.events.toUser(conv.userId, message);
    this.events.toSaco(conv.sacoId, message);
  }

  private pruneSendLog(now: number): void {
    for (const [userId, at] of this.lastSend) if (now - at > 60_000) this.lastSend.delete(userId);
  }
}
