/**
 * Nhắn tin với SACO (port 1:1 từ `server/chat.ts` của IQX-KhuGiaoDich, danh tính là tài khoản IQX hoặc
 * khách): hộp thư, nhắn trực tiếp, gửi / đã xem / đang soạn, công tắc Đang trực, và Chat SACO.
 *
 * Chat SACO "nhắn trước" (`start`): người chat gửi tin ngay, máy chủ giữ tin trong hàng đợi của lượt
 * phân phối rồi hỏi lần lượt các SACO đang trực (mỗi SACO 5 giây, lời mời kèm bản xem trước). Không ai
 * nhận lời thì cuộc chat tự chuyển cho SACO xếp cao nhất đang có socket, không có thì SACO xếp cao nhất.
 * `startMatch` (`chat/match`) là đường cũ, giữ cho tab chưa tải lại: tìm không kèm tin, không tự chuyển.
 *
 * Lời mời đang chờ và lượt phân phối của từng người nằm trong bộ nhớ của tiến trình API; tin nhắn, cuộc
 * trò chuyện và nhật ký lời mời nằm trong PostgreSQL.
 *
 * Người chat (phía "user") được gọi là `ownerId`: uuid tài khoản, hoặc `g:<uuid khách>` với khách chưa
 * đăng nhập, cùng quy ước với `conn.userId` của `FloorHub` nên `toUser(ownerId)` tới đúng socket. Phía
 * SACO luôn là tài khoản.
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
  ServiceUnavailableException,
} from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import { isGuestKey } from './floor-actor.js';
import {
  CHAT_RULES,
  cleanText,
  DISPATCH_RULES,
  floorChatTiming,
  guestLabel,
  invitePreview,
  pickFallbackSaco,
} from './floor-chat.logic.js';
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
  StartResult,
} from './floor-types.js';

interface Pending {
  readonly id: number;
  readonly userId: string;
  readonly userName: string;
  readonly preview: string | undefined;
  readonly deadline: number;
  readonly timer: ReturnType<typeof setTimeout>;
  resolve(result: InviteResult): void;
}

interface Run {
  readonly id: string;
  cancelled: boolean;
  current: Pending | null;
  /** Tin người chat gửi khi chưa có SACO, theo thứ tự; ghi vào cuộc chat lúc phân phối. */
  readonly queue: string[];
  /**
   * Đã chốt kết quả (hàng đợi không nhận thêm): tin tới sau phải chờ `done` rồi gửi thẳng vào cuộc chat.
   * Đặt đồng bộ ngay khi vòng hỏi kết thúc, trước mọi `await`, để không tin nào lọt vào hàng đợi đã chụp.
   */
  closed: boolean;
  /** Cuộc chat được phân phối, null khi không có (không còn SACO, huỷ, lỗi). */
  readonly done: Promise<string | null>;
}

const convNotFound = () =>
  new NotFoundException({ code: 'CONV_NOT_FOUND', message: 'Không tìm thấy cuộc trò chuyện.' });

const noSaco = () =>
  new ServiceUnavailableException({
    code: 'NO_SACO',
    message: 'Hiện chưa có SACO nào, bạn thử lại sau nhé.',
  });

@Injectable()
export class FloorChatService implements OnApplicationShutdown {
  private readonly logger = new Logger(FloorChatService.name);
  private readonly lastSend = new Map<string, number>();
  /** Lời mời đang chờ, theo mã SACO: mỗi SACO chỉ một lời mời tại một thời điểm. */
  private readonly pending = new Map<string, Pending>();
  /** Lượt tìm đang chạy, theo tài khoản: mỗi người một lượt. */
  private readonly runs = new Map<string, Run>();
  private inviteSeq = 0;
  /** Đang tắt: lượt phân phối dừng mà không ghi gì nữa. */
  private stopping = false;
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
    // Đóng tab hoặc mất mạng khi đang tìm thì coi như huỷ; lời mời đang chờ bị thu hồi. Lượt có tin chờ
    // vẫn được chuyển ngay cho một SACO (xem `runMatch`) để tin không mất.
    this.unsubscribe = this.presence.onUserGone((userId) => this.cancelMatch(userId));
  }

  onApplicationShutdown(): void {
    this.stopping = true;
    this.unsubscribe();
    for (const run of this.runs.values()) run.cancelled = true;
    for (const pending of [...this.pending.values()]) pending.resolve('cancel');
  }

  // ================================================================== hộp thư và cuộc trò chuyện

  async inbox(ownerId: string): Promise<Inbox> {
    // Khách không bao giờ là SACO.
    const saco = isGuestKey(ownerId) ? null : await this.sacos.findByUser(this.database, ownerId);
    const [mine, theirs, matched] = await Promise.all([
      this.chat.userConvs(this.database, ownerId, CHAT_RULES.inboxLimit),
      saco?.active
        ? this.chat.sacoConvs(this.database, saco.id, CHAT_RULES.inboxLimit)
        : Promise.resolve([] as ChatConvView[]),
      this.chat.matchedConv(this.database, ownerId),
    ]);
    return {
      saco: saco ? toSacoSelf(saco) : null,
      asUser: mine.map((conv) => this.summary(conv, 'user')),
      asSaco: theirs.map((conv) => this.summary(conv, 'saco')),
      matchedConvId: matched?.id ?? null,
    };
  }

  async conversation(ownerId: string, convId: string): Promise<ConvDetail> {
    const { conv, side } = await this.member(ownerId, convId);
    const messages = await this.chat.messages(this.database, convId, CHAT_RULES.history);
    const peerRead = side === 'user' ? conv.sacoReadAt : conv.userReadAt;
    return { ...this.summary(conv, side), messages, peerReadAt: peerRead?.getTime() ?? 0 };
  }

  /** "Nhắn SACO" trên thẻ nhận định: mở (hoặc dùng lại) cuộc trò chuyện trực tiếp, bật cờ nhắn trực tiếp. */
  async openDirect(ownerId: string, sacoId: string): Promise<ConvSummary> {
    const saco = await this.sacos.findById(this.database, sacoId);
    if (!saco || !saco.active) {
      throw new NotFoundException({
        code: 'SACO_NOT_FOUND',
        message: 'SACO này không còn hoạt động.',
      });
    }
    if (saco.userId === ownerId) {
      throw new BadRequestException({
        code: 'SELF_CHAT',
        message: 'Bạn không thể tự nhắn cho chính mình.',
      });
    }
    const id = await this.chat.ensureConv(this.database, ownerId, sacoId, this.clock.now(), {
      direct: true,
    });
    const view = await this.chat.convView(this.database, id, 'user');
    return this.summary(view!, 'user');
  }

  async send(ownerId: string, convId: string, raw: unknown): Promise<ChatMessage> {
    const found = await this.writableMember(ownerId, convId);
    const text = requireText(raw);
    this.throttle(ownerId);
    return this.insertText(found, text);
  }

  async markRead(ownerId: string, convId: string): Promise<void> {
    const now = this.clock.now();
    const { conv, side } = await this.member(ownerId, convId);
    await this.chat.markRead(this.database, convId, side, now);
    this.broadcast(conv, { type: 'chat:read', convId, side, at: now.getTime() });
  }

  /** "Đang soạn": báo cho bên kia; người không thuộc cuộc trò chuyện thì bỏ qua lặng lẽ. */
  async typing(ownerId: string, convId: string): Promise<void> {
    let found: { conv: ChatConvView; side: 'user' | 'saco' };
    try {
      found = await this.member(ownerId, convId);
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
    return pending ? inviteEvent(pending) : null;
  }

  /** Thu hồi lời mời đang chờ của SACO (tính là từ chối): dùng khi SACO bị gỡ quyền. */
  revokeInvite(sacoId: string): void {
    this.pending.get(sacoId)?.resolve('decline');
  }

  /**
   * Chat SACO nhắn trước: tin đầu tiên (và các tin sau, tới khi có SACO) đi qua đây. Đã có cuộc chat
   * khớp còn viết được thì gửi thẳng vào đó; ngược lại tin vào hàng đợi của lượt phân phối (bắt đầu lượt
   * nếu chưa có) và trả lời ngay. Kết quả tới người chat qua `chat:match`.
   */
  async start(ownerId: string, raw: unknown): Promise<StartResult> {
    const text = requireText(raw);
    this.throttle(ownerId);
    // Kiểm tra lượt đang chạy trước cuộc chat khớp: một lượt chỉ biến mất sau khi đã ghi xong cuộc chat.
    const running = this.runs.get(ownerId);
    if (running) return this.joinRun(ownerId, running, text);
    const existing = await this.chat.matchedConv(this.database, ownerId);
    if (existing) {
      const found = await this.writableMember(ownerId, existing.id);
      return { convId: existing.id, message: await this.insertText(found, text) };
    }
    // Giữa hai lần kiểm tra có `await`: kiểm tra lại rồi đặt ngay để mỗi người chỉ có một lượt.
    const again = this.runs.get(ownerId);
    if (again) return this.joinRun(ownerId, again, text);
    this.launch(ownerId, [text]);
    return { pending: true };
  }

  /**
   * Đường cũ (`chat/match`, tab chưa tải lại): tìm không kèm tin. Trả cuộc chat khớp nếu có, ngược lại
   * bắt đầu hỏi; không ai nhận thì báo `none` như trước.
   */
  async startMatch(ownerId: string): Promise<{ convId: string } | { running: true }> {
    const userId = ownerId;
    if (this.runs.has(userId)) return { running: true };
    const existing = await this.chat.matchedConv(this.database, userId);
    if (existing) return { convId: existing.id };
    // Giữa hai lần kiểm tra có `await`: kiểm tra lại rồi đặt ngay để mỗi người chỉ có một lượt.
    if (this.runs.has(userId)) return { running: true };
    this.launch(userId, []);
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

  /** Tin tới khi lượt đang chạy: vào hàng đợi, hoặc (lượt đã chốt) chờ cuộc chat rồi gửi thẳng vào đó. */
  private async joinRun(ownerId: string, run: Run, text: string): Promise<StartResult> {
    if (!run.closed) {
      if (run.queue.length >= DISPATCH_RULES.maxQueued) {
        throw new HttpException(
          {
            code: 'QUEUE_FULL',
            message: `Bạn đã gửi ${DISPATCH_RULES.maxQueued} tin, chờ SACO nhận rồi nhắn tiếp nhé.`,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      run.queue.push(text);
      return { pending: true };
    }
    const convId = await run.done;
    if (!convId) throw noSaco();
    const found = await this.writableMember(ownerId, convId);
    return { convId, message: await this.insertText(found, text) };
  }

  /** Bắt đầu một lượt phân phối; lượt tự gỡ khỏi `runs` khi xong (kể cả khi lỗi hoặc bị huỷ). */
  private launch(ownerId: string, queue: string[]): void {
    let settle: (convId: string | null) => void = () => undefined;
    const done = new Promise<string | null>((resolve) => {
      settle = resolve;
    });
    const run: Run = {
      id: randomUUID(),
      cancelled: false,
      current: null,
      queue,
      closed: false,
      done,
    };
    this.runs.set(ownerId, run);
    let convId: string | null = null;
    void this.runMatch(ownerId, run)
      .then((id) => {
        convId = id;
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Chat SACO run failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.events.toUser(ownerId, {
          type: 'chat:match',
          event: { state: 'none' } satisfies MatchEvent,
        });
      })
      .finally(() => {
        run.closed = true;
        if (this.runs.get(ownerId) === run) this.runs.delete(ownerId);
        settle(convId);
      });
  }

  /**
   * Một lượt: hỏi lần lượt các SACO còn hoạt động từ số 1 xuống, mỗi SACO `inviteMs`. SACO vắng, không
   * online hoặc đang giữ lời mời khác thì bỏ qua ngay. Không ai nhận mà có tin chờ thì chuyển theo thứ
   * hạng (`pickFallbackSaco`). Trả về cuộc chat được phân phối.
   */
  private async runMatch(userId: string, run: Run): Promise<string | null> {
    const tell = (event: MatchEvent): void =>
      this.events.toUser(userId, { type: 'chat:match', event });
    const userName = await this.profiles.displayName(userId);
    // SACO thấy khách được đánh dấu; tin hệ thống trong cuộc chat giữ tên gốc.
    const inviteName = guestLabel(userName, isGuestKey(userId));
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
      const first = run.queue[0];
      const preview = first === undefined ? undefined : invitePreview(first);
      const result = await this.ask(saco, userId, inviteName, preview, run, deadline);
      await this.logInvite(run, userId, saco.id, result);
      if (result === 'cancel') break;
      if (result === 'accept') {
        found = saco;
        break;
      }
    }
    // Chốt đồng bộ: từ đây tin mới không vào hàng đợi nữa mà chờ `done`.
    run.closed = true;
    const queued = [...run.queue];
    if (queued.length === 0) {
      // Lượt kiểu cũ (không kèm tin): giữ nguyên hành vi trước.
      if (run.cancelled) {
        tell({ state: 'cancelled' });
        return null;
      }
      if (!found) {
        tell({ state: 'none' });
        return null;
      }
    }
    if (this.stopping) return null;
    let target = found;
    if (!target) {
      const ranking = await this.sacos.listActive(this.database);
      const picked = pickFallbackSaco(
        ranking.map((saco) => ({
          id: saco.id,
          userId: saco.userId,
          active: saco.active,
          onDuty: saco.onDuty,
          online: this.presence.userOnline(saco.userId),
        })),
        userId,
      );
      target = ranking.find((saco) => saco.id === picked) ?? null;
      if (!target) {
        tell({ state: 'none' });
        return null;
      }
      await this.logInvite(run, userId, target.id, 'auto');
    }
    const assigned = target;
    const notice = found
      ? `${userName} được khớp với ${assigned.name} qua Chat SACO`
      : `${userName} được chuyển tới ${assigned.name}`;
    const now = this.clock.now();
    const { convId, messages } = await this.database.transaction(async (tx) => {
      const id = await this.chat.ensureConv(tx, userId, assigned.id, now);
      await this.chat.markMatched(tx, id, now);
      const saved = [await this.chat.insertMessage(tx, id, 'x', notice, now)];
      for (const text of queued) saved.push(await this.chat.insertMessage(tx, id, 'u', text, now));
      // Người chat đã đọc những gì mình viết; phía SACO thấy các tin này là chưa đọc.
      if (queued.length) await this.chat.markRead(tx, id, 'user', now);
      return { convId: id, messages: saved };
    });
    for (const message of messages) {
      this.broadcast({ userId, sacoId: assigned.id }, { type: 'chat:msg', convId, message });
    }
    this.events.toSaco(assigned.id, { type: 'chat:inbox' });
    tell({ state: 'matched', convId });
    return convId;
  }

  private ask(
    saco: FloorSacoRow,
    userId: string,
    userName: string,
    preview: string | undefined,
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
        preview,
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
        invite: inviteEvent(pending),
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
        ownerId: userId,
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
      peerName: side === 'user' ? conv.sacoName : guestLabel(conv.userName, conv.userGuest),
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

  /** Thành viên của một cuộc chat còn viết được (SACO còn hoạt động). */
  private async writableMember(
    ownerId: string,
    convId: string,
  ): Promise<{ conv: ChatConvView; side: 'user' | 'saco' }> {
    const found = await this.member(ownerId, convId);
    if (!found.conv.sacoActive) {
      throw new ForbiddenException({
        code: 'SACO_INACTIVE',
        message: 'SACO này không còn hoạt động. Bạn vẫn xem được tin nhắn cũ.',
      });
    }
    return found;
  }

  /** Giới hạn chung cho mọi tin (chữ, ảnh, Chat SACO) của một người. */
  private throttle(ownerId: string): void {
    const nowMs = this.clock.now().getTime();
    const previous = this.lastSend.get(ownerId);
    if (previous !== undefined && nowMs >= previous && nowMs - previous < CHAT_RULES.sendMinMs) {
      throw new HttpException(
        { code: 'SEND_TOO_FAST', message: 'Bạn gửi nhanh quá, chờ một chút.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.lastSend.set(ownerId, nowMs);
    if (this.lastSend.size > 2000) this.pruneSendLog(nowMs);
  }

  private async insertText(
    { conv, side }: { conv: ChatConvView; side: 'user' | 'saco' },
    text: string,
  ): Promise<ChatMessage> {
    const now = this.clock.now();
    // Viết trả lời nghĩa là người gửi đã đọc cuộc trò chuyện.
    const message = await this.database.transaction(async (tx) => {
      const saved = await this.chat.insertMessage(tx, conv.id, side === 'user' ? 'u' : 's', text, now);
      await this.chat.markRead(tx, conv.id, side, now);
      return saved;
    });
    this.broadcast(conv, { type: 'chat:msg', convId: conv.id, message });
    return message;
  }

  /** Cuộc trò chuyện và phía của `userId` (`ownerId` hoặc tài khoản SACO); người ngoài cuộc nhận 404. */
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

const inviteEvent = (pending: Pending): InviteEvent => ({
  id: pending.id,
  userName: pending.userName,
  deadline: pending.deadline,
  ...(pending.preview === undefined ? {} : { preview: pending.preview }),
});

function requireText(raw: unknown): string {
  const text = cleanText(raw);
  if (!text) {
    throw new BadRequestException({
      code: 'MESSAGE_INVALID',
      message: `Tin nhắn trống hoặc dài quá ${CHAT_RULES.maxText} ký tự.`,
    });
  }
  return text;
}
