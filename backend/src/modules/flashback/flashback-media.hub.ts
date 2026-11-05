/**
 * Máy chủ thời gian thực của phòng Flashback: ảnh trong chat, danh sách cuộc gọi và chuyển tín hiệu
 * WebRTC. Mọi trạng thái nằm trong bộ nhớ của tiến trình API (API chạy một tiến trình duy nhất), không
 * có gì được lưu xuống cơ sở dữ liệu, đĩa hay `shared/media`.
 *
 * Giao thức JSON trên `/api/v2/flashback/ws` (xem `flashback-ws.gateway.ts`; kiểu phía trình duyệt ở
 * `frontend/src/pages/demo-trading/flashback/room-socket-protocol.ts`). `roomId` trên dây là mã phòng
 * 6 chữ số.
 *
 * Ảnh theo cùng quy tắc với tin chữ (spec v2.4 §3): `chat_enabled`, tắt tiếng và quy tắc `phien`
 * (§3.4). Ảnh gửi ở phiên P chỉ giao cho người đã tới phiên P: ảnh chưa tới lượt được giữ chờ trong
 * bộ nhớ và giao khi người nhận tới (sự kiện `positionChanged` của dịch vụ phòng, cộng vòng kiểm tra
 * 3 giây vì ván cũng được chốt ở tiến trình worker). Tắt tiếng áp dụng lúc giao: ảnh của người đã bị
 * tắt tiếng bị bỏ qua cho người đó, bỏ tắt tiếng sau đó không giao lại ảnh cũ trong phiên kết nối này
 * (vào lại phòng thì tính lại từ đầu).
 */

import { HttpException, Inject, Injectable } from '@nestjs/common';

import { AuthService } from '../auth/auth.service.js';
import { chatVisibleTo } from './flashback-chat.logic.js';
import { FlashbackChatService, type FbMediaContext } from './flashback-chat.service.js';
import {
  checkImage,
  FbImageRateLimiter,
  FbImageStore,
  sanitizeMedia,
  type FbImageMime,
  type FbMediaState,
  type FbStoredImage,
} from './flashback-media.logic.js';
import { FlashbackRoomEvents } from './flashback-room-events.js';

export const FLASHBACK_MEDIA_OPTIONS = 'FLASHBACK_MEDIA_OPTIONS';

export interface FbIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface FbMediaHubOptions {
  iceServers: FbIceServer[];
  now?: () => number;
  /** Chưa xác thực sau bấy nhiêu ms thì đóng (mặc định 10 giây). */
  authTimeoutMs?: number;
}

/** Phần của socket `ws` mà hub dùng. */
export interface FbHubSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly bufferedAmount?: number;
}

export const FB_CLOSE_AUTH = 4401;
export const FB_CLOSE_LEFT_ROOM = 4403;
export const FB_CLOSE_ROOM_CLOSED = 4410;
const CLOSE_RATE = 1008;

/** Mỗi socket tối đa bấy nhiêu thông điệp mỗi phút (đủ cho ICE candidate dồn dập). */
const INBOUND_PER_MINUTE = 1200;
/** Không đẩy thêm ảnh vào socket đang nghẽn quá ngưỡng này. */
const MAX_BUFFERED_BYTES = 4_000_000;
const TICK_MS = 3000;
/** Cứ bấy nhiêu vòng thì đối chiếu với cơ sở dữ liệu xem phòng còn mở không (15 giây). */
const RECONCILE_EVERY = 5;

const ROOM_CODE = /^\d{6}$/;

type Conn = {
  readonly socket: FbHubSocket;
  userId: string | null;
  name: string;
  roomCode: string | null;
  inCall: boolean;
  media: FbMediaState;
  /** Ảnh đã giao hoặc đã bỏ qua cho socket này. */
  readonly delivered: Set<string>;
  windowStartedAt: number;
  inbound: number;
  authTimer: ReturnType<typeof setTimeout> | null;
  queue: Promise<void>;
  closed: boolean;
  /** Còn ảnh chưa giao cho socket này vì chưa tới phiên. */
  pending: boolean;
  delivering: boolean;
  dirty: boolean;
};

type RoomState = {
  readonly code: string;
  readonly id: string;
  readonly conns: Set<Conn>;
};

const errorCodeOf = (error: unknown): { code: string; message: string } => {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (body && typeof body === 'object') {
      const record = body as { code?: unknown; message?: unknown };
      return {
        code: typeof record.code === 'string' ? record.code : 'INTERNAL',
        message: typeof record.message === 'string' ? record.message : 'Có lỗi xảy ra',
      };
    }
  }
  return { code: 'INTERNAL', message: 'Có lỗi xảy ra, thử lại sau' };
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

@Injectable()
export class FlashbackMediaHub {
  private readonly conns = new Map<FbHubSocket, Conn>();
  private readonly rooms = new Map<string, RoomState>();
  private readonly images = new FbImageStore();
  private readonly limiter = new FbImageRateLimiter();
  private readonly now: () => number;
  private readonly authTimeoutMs: number;
  private readonly iceServers: FbIceServer[];
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private tickCount = 0;
  private readonly unsubscribe: Array<() => void> = [];

  constructor(
    @Inject(AuthService)
    private readonly auth: Pick<AuthService, 'authenticate'>,
    @Inject(FlashbackChatService)
    private readonly roomsPort: Pick<FlashbackChatService, 'mediaContext' | 'mediaRoomId'>,
    @Inject(FlashbackRoomEvents) events: FlashbackRoomEvents,
    @Inject(FLASHBACK_MEDIA_OPTIONS) options: FbMediaHubOptions,
  ) {
    this.now = options.now ?? Date.now;
    this.authTimeoutMs = options.authTimeoutMs ?? 10_000;
    this.iceServers = options.iceServers;
    this.unsubscribe.push(
      events.onRoomClosed(({ code }) => this.roomClosed(code)),
      events.onMemberLeft(({ code, userId }) => this.memberLeft(code, userId)),
      events.onPosition(({ roomId, userId }) => {
        const room = [...this.rooms.values()].find((item) => item.id === roomId);
        if (!room) return;
        for (const conn of room.conns)
          if (conn.pending && (!userId || conn.userId === userId)) void this.deliverTo(conn, room);
      }),
    );
  }

  // ================================================================== vòng đời kết nối

  connect(socket: FbHubSocket): void {
    const conn: Conn = {
      socket,
      userId: null,
      name: '',
      roomCode: null,
      inCall: false,
      media: { audio: false, video: false, screen: false },
      delivered: new Set(),
      windowStartedAt: this.now(),
      inbound: 0,
      authTimer: null,
      queue: Promise.resolve(),
      closed: false,
      pending: false,
      delivering: false,
      dirty: false,
    };
    conn.authTimer = setTimeout(() => {
      if (!conn.userId) this.forceClose(conn, FB_CLOSE_AUTH, 'auth timeout');
    }, this.authTimeoutMs);
    conn.authTimer.unref?.();
    this.conns.set(socket, conn);
  }

  /** Nhận một thông điệp văn bản; xử lý tuần tự theo thứ tự tới của từng socket. */
  message(socket: FbHubSocket, raw: string): Promise<void> {
    const conn = this.conns.get(socket);
    if (!conn || conn.closed) return Promise.resolve();
    const now = this.now();
    if (now - conn.windowStartedAt >= 60_000) {
      conn.windowStartedAt = now;
      conn.inbound = 0;
    }
    conn.inbound += 1;
    if (conn.inbound > INBOUND_PER_MINUTE) {
      this.forceClose(conn, CLOSE_RATE, 'message rate exceeded');
      return Promise.resolve();
    }
    conn.queue = conn.queue.then(() => this.handle(conn, raw)).catch(() => undefined);
    return conn.queue;
  }

  /** Socket đã đóng (hoặc bị coi là chết): rời cuộc gọi, rời phòng. */
  disconnect(socket: FbHubSocket): void {
    const conn = this.conns.get(socket);
    if (!conn) return;
    this.detach(conn);
  }

  shutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const stop of this.unsubscribe) stop();
    this.unsubscribe.length = 0;
    for (const conn of this.conns.values()) if (conn.authTimer) clearTimeout(conn.authTimer);
    this.conns.clear();
    for (const code of this.images.roomCodes()) this.images.clearRoom(code);
    this.rooms.clear();
  }

  // ================================================================== thống kê (cho test và vận hành)

  get stats() {
    return {
      connections: this.conns.size,
      rooms: this.rooms.size,
      imageBytes: this.images.totalBytes,
      imageRooms: this.images.roomCodes().length,
    };
  }

  // ================================================================== sự kiện từ dịch vụ phòng

  /** Phòng giải tán hoặc kết thúc: báo, xoá ảnh và cuộc gọi, đóng mọi socket của phòng. */
  roomClosed(code: string): void {
    const room = this.rooms.get(code);
    if (room) this.closeRoomState(room);
    else this.images.clearRoom(code);
  }

  /** Rời phòng hoặc bị mời ra: rời cuộc gọi (báo người khác), đóng socket của người đó. */
  memberLeft(code: string, userId: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    for (const conn of [...room.conns]) {
      if (conn.userId !== userId) continue;
      this.leaveCall(conn);
      room.conns.delete(conn);
      conn.roomCode = null;
      this.forceClose(conn, FB_CLOSE_LEFT_ROOM, 'left room');
    }
    this.pruneRoom(room);
  }

  // ================================================================== vòng định kỳ

  /** Giao ảnh đã tới lượt và đối chiếu phòng đã đóng; chạy định kỳ khi có phòng. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      this.tickCount += 1;
      this.limiter.prune(this.now());
      for (const room of [...this.rooms.values()])
        for (const conn of [...room.conns]) if (conn.pending) await this.deliverTo(conn, room);
      if (this.tickCount % RECONCILE_EVERY === 0) await this.reconcile();
    } finally {
      this.ticking = false;
      if (this.rooms.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }
  }

  /** Phòng đã đóng ở tiến trình khác (tác vụ quét chạy ở worker) thì dọn ở đây. */
  async reconcile(): Promise<void> {
    for (const room of [...this.rooms.values()]) {
      let current: string | null;
      try {
        current = await this.roomsPort.mediaRoomId(room.code);
      } catch {
        continue;
      }
      if (current !== room.id && this.rooms.get(room.code) === room) this.closeRoomState(room);
    }
  }

  // ================================================================== xử lý thông điệp

  private async handle(conn: Conn, raw: string): Promise<void> {
    if (conn.closed) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.error(conn, 'BAD_MESSAGE', 'Thông điệp không hợp lệ');
      return;
    }
    const message = asRecord(parsed);
    if (!message || typeof message.type !== 'string') {
      this.error(conn, 'BAD_MESSAGE', 'Thông điệp không hợp lệ');
      return;
    }
    try {
      if (!conn.userId) {
        if (message.type === 'auth') await this.onAuth(conn, message);
        else {
          this.error(conn, 'AUTH_REQUIRED', 'Cần xác thực trước');
          this.forceClose(conn, FB_CLOSE_AUTH, 'auth required');
        }
        return;
      }
      switch (message.type) {
        case 'ping':
          this.send(conn, { type: 'pong' });
          return;
        case 'room:join':
          await this.onJoin(conn, message);
          return;
        case 'image:send':
          await this.onImage(conn, message);
          return;
        case 'call:join':
          this.onCallJoin(conn, message);
          return;
        case 'call:leave':
          if (this.joinedTo(conn, message)) this.leaveCall(conn);
          return;
        case 'call:media':
          this.onCallMedia(conn, message);
          return;
        case 'rtc:signal':
          this.onSignal(conn, message);
          return;
        default:
          this.error(conn, 'BAD_MESSAGE', 'Loại thông điệp không được hỗ trợ');
      }
    } catch {
      this.error(conn, 'INTERNAL', 'Có lỗi xảy ra, thử lại sau');
    }
  }

  private async onAuth(conn: Conn, message: Record<string, unknown>): Promise<void> {
    const token = typeof message.token === 'string' ? message.token.trim() : '';
    if (!token) {
      this.error(conn, 'AUTH_INVALID', 'Thiếu access token');
      this.forceClose(conn, FB_CLOSE_AUTH, 'invalid token');
      return;
    }
    try {
      const user = await this.auth.authenticate(token);
      if (conn.closed) return;
      conn.userId = user.id;
      if (conn.authTimer) clearTimeout(conn.authTimer);
      conn.authTimer = null;
      this.send(conn, { type: 'ready', userId: user.id });
    } catch {
      this.error(conn, 'AUTH_INVALID', 'Access token không hợp lệ hoặc đã hết hạn');
      this.forceClose(conn, FB_CLOSE_AUTH, 'invalid token');
    }
  }

  private async onJoin(conn: Conn, message: Record<string, unknown>): Promise<void> {
    const code = typeof message.roomId === 'string' ? message.roomId : '';
    if (!ROOM_CODE.test(code)) {
      this.error(conn, 'BAD_MESSAGE', 'Mã phòng gồm 6 chữ số');
      return;
    }
    if (conn.roomCode && conn.roomCode !== code) {
      this.error(conn, 'ALREADY_JOINED', 'Mỗi kết nối chỉ ở một phòng');
      return;
    }
    const result = await this.context(conn.userId!, code);
    if (conn.closed) return;
    if (!result.ok) {
      this.error(conn, result.code, result.message);
      return;
    }
    const ctx = result.ctx;
    let room = this.rooms.get(code);
    // Cùng mã nhưng là phòng khác (phòng cũ đã đóng ở tiến trình khác): dọn phòng cũ trước.
    if (room && room.id !== ctx.roomId) {
      this.closeRoomState(room);
      room = undefined;
    }
    if (!room) {
      room = {
        code,
        id: ctx.roomId,
        conns: new Set(),
      };
      this.rooms.set(code, room);
    }
    room.conns.add(conn);
    conn.roomCode = code;
    conn.name = ctx.name;
    conn.delivered.clear();
    conn.pending = false;
    const visible: FbStoredImage[] = [];
    for (const image of this.images.list(code)) {
      const verdict = this.verdict(image, conn.userId!, ctx);
      if (verdict === 'deliver') visible.push(image);
      if (verdict !== 'wait') conn.delivered.add(image.id);
      else conn.pending = true;
    }
    this.send(conn, {
      type: 'room:state',
      roomId: code,
      images: visible.map((image) => this.imageView(image, null)),
      call: this.callList(room),
      iceServers: this.iceServers,
    });
    this.ensureTimer();
  }

  private async onImage(conn: Conn, message: Record<string, unknown>): Promise<void> {
    const clientId = typeof message.clientId === 'string' ? message.clientId : '';
    if (!clientId || clientId.length > 64) {
      this.error(conn, 'BAD_MESSAGE', 'Thiếu mã ảnh');
      return;
    }
    const fail = (code: string, text: string) => this.error(conn, code, text, clientId);
    if (!conn.roomCode || message.roomId !== conn.roomCode) {
      fail('NOT_JOINED', 'Hãy vào phòng trước khi gửi ảnh');
      return;
    }
    const userId = conn.userId!;
    const rate = this.limiter.take(userId, this.now());
    if (!rate.ok) {
      fail(
        rate.code,
        rate.code === 'IMAGE_TOO_FAST'
          ? 'Từ từ thôi, mỗi 2 giây một ảnh'
          : 'Bạn gửi ảnh nhiều quá, tối đa 20 ảnh mỗi phút',
      );
      return;
    }
    const checked = checkImage({ mime: message.mime, data: message.data });
    if (!checked.ok) {
      fail(checked.code, checked.message);
      return;
    }
    const code = conn.roomCode;
    const result = await this.context(userId, code);
    if (conn.closed || conn.roomCode !== code) return;
    if (!result.ok) {
      fail(result.code, result.message);
      return;
    }
    const ctx = result.ctx;
    if (!ctx.chatEnabled) {
      fail('CHAT_DISABLED', 'Phòng này đã tắt chat');
      return;
    }
    const room = this.rooms.get(code);
    if (!room || room.id !== ctx.roomId || !room.conns.has(conn)) return;
    const image: FbStoredImage = {
      id: crypto.randomUUID(),
      seq: this.images.nextSeq(),
      roomCode: code,
      userId,
      name: ctx.name,
      matchId: ctx.position.matchId,
      phien: ctx.position.phien,
      mime: message.mime as FbImageMime,
      buffer: checked.buffer,
      width: checked.width,
      height: checked.height,
      sentAt: new Date(this.now()).toISOString(),
    };
    this.images.add(image);
    // Người gửi nhận lại ngay bản có clientId để biết ảnh đã đi.
    conn.delivered.add(image.id);
    this.send(conn, this.imageView(image, clientId, 'image'));
    for (const other of room.conns)
      if (other !== conn) {
        other.pending = true;
        void this.deliverTo(other, room);
      }
    this.ensureTimer();
  }

  private onCallJoin(conn: Conn, message: Record<string, unknown>): void {
    if (!this.joinedTo(conn, message)) return;
    const media = sanitizeMedia(message.media);
    if (!media) {
      this.error(conn, 'BAD_MESSAGE', 'Thiếu trạng thái micro, camera, màn hình');
      return;
    }
    const room = this.rooms.get(conn.roomCode!);
    if (!room) return;
    // Kết nối mới của cùng người thay kết nối cũ (vừa mất mạng, chưa kịp bị coi là chết).
    for (const other of room.conns)
      if (other !== conn && other.userId === conn.userId && other.inCall) this.leaveCall(other);
    const wasIn = conn.inCall;
    conn.inCall = true;
    conn.media = media;
    this.send(conn, { type: 'call:joined', roomId: room.code, peers: this.callList(room, conn) });
    if (wasIn) this.toCall(room, conn, { type: 'call:media', userId: conn.userId, media });
    else
      this.toCall(room, conn, {
        type: 'call:peer-joined',
        userId: conn.userId,
        name: conn.name,
        media,
      });
  }

  private onCallMedia(conn: Conn, message: Record<string, unknown>): void {
    if (!this.joinedTo(conn, message)) return;
    if (!conn.inCall) {
      this.error(conn, 'NOT_IN_CALL', 'Bạn chưa vào cuộc gọi');
      return;
    }
    const media = sanitizeMedia(message.media);
    if (!media) {
      this.error(conn, 'BAD_MESSAGE', 'Thiếu trạng thái micro, camera, màn hình');
      return;
    }
    conn.media = media;
    const room = this.rooms.get(conn.roomCode!);
    if (room) this.toCall(room, conn, { type: 'call:media', userId: conn.userId, media });
  }

  /** Chuyển nguyên `data` giữa hai người cùng đang trong cuộc gọi của một phòng; không đọc nội dung. */
  private onSignal(conn: Conn, message: Record<string, unknown>): void {
    if (!this.joinedTo(conn, message)) return;
    if (!conn.inCall) {
      this.error(conn, 'NOT_IN_CALL', 'Bạn chưa vào cuộc gọi');
      return;
    }
    const to = typeof message.to === 'string' ? message.to : '';
    if (!to || to === conn.userId || message.data === undefined || message.data === null) {
      this.error(conn, 'BAD_MESSAGE', 'Tín hiệu không hợp lệ');
      return;
    }
    const room = this.rooms.get(conn.roomCode!);
    const target = room ? [...room.conns].find((c) => c.userId === to && c.inCall) : undefined;
    if (!target) {
      this.error(conn, 'PEER_NOT_IN_CALL', 'Người nhận không còn trong cuộc gọi');
      return;
    }
    this.send(target, { type: 'rtc:signal', from: conn.userId, data: message.data });
  }

  // ================================================================== giao ảnh

  /** Quyết định cho một ảnh với một người nhận: giao, bỏ qua vĩnh viễn, hoặc chờ tới phiên. */
  private verdict(
    image: FbStoredImage,
    userId: string,
    ctx: FbMediaContext,
  ): 'deliver' | 'skip' | 'wait' {
    if (!ctx.chatEnabled) return 'skip';
    if (image.userId === userId) return 'deliver';
    if (ctx.muted.includes(image.userId)) return 'skip';
    return chatVisibleTo(
      { userId: image.userId, matchId: image.matchId, phien: image.phien },
      ctx.viewer,
    )
      ? 'deliver'
      : 'wait';
  }

  /** Giao cho một socket các ảnh đã tới lượt; ảnh chưa tới lượt giữ chờ (`conn.pending`). */
  private async deliverTo(conn: Conn, room: RoomState): Promise<void> {
    if (conn.delivering) {
      conn.dirty = true;
      return;
    }
    conn.delivering = true;
    try {
      do {
        conn.dirty = false;
        if (conn.closed || !conn.userId || this.rooms.get(room.code) !== room) return;
        const waiting = this.images.list(room.code).filter((item) => !conn.delivered.has(item.id));
        if (waiting.length === 0) {
          conn.pending = false;
          continue;
        }
        const result = await this.context(conn.userId, room.code);
        if (conn.closed || this.rooms.get(room.code) !== room) return;
        if (!result.ok) {
          if (result.code === 'ROOM_NOT_FOUND') this.closeRoomState(room);
          else if (result.code === 'NOT_IN_ROOM') this.memberLeft(room.code, conn.userId);
          continue;
        }
        let pending = false;
        for (const image of waiting) {
          const verdict = this.verdict(image, conn.userId, result.ctx);
          if (verdict === 'wait') {
            pending = true;
            continue;
          }
          if (verdict === 'deliver') {
            if ((conn.socket.bufferedAmount ?? 0) > MAX_BUFFERED_BYTES) {
              pending = true;
              continue;
            }
            this.send(conn, this.imageView(image, null, 'image'));
          }
          conn.delivered.add(image.id);
        }
        conn.pending = pending;
      } while (conn.dirty);
    } finally {
      conn.delivering = false;
    }
  }

  // ================================================================== trạng thái phòng và cuộc gọi

  private joinedTo(conn: Conn, message: Record<string, unknown>): boolean {
    if (conn.roomCode && message.roomId === conn.roomCode) return true;
    this.error(conn, 'NOT_JOINED', 'Hãy vào phòng trước');
    return false;
  }

  private callList(
    room: RoomState,
    except?: Conn,
  ): Array<{ userId: string; name: string; media: FbMediaState }> {
    const seen = new Set<string>();
    const list = [];
    for (const conn of room.conns) {
      if (!conn.inCall || !conn.userId || conn === except || conn.userId === except?.userId)
        continue;
      if (seen.has(conn.userId)) continue;
      seen.add(conn.userId);
      list.push({ userId: conn.userId, name: conn.name, media: conn.media });
    }
    return list;
  }

  /** Gửi cho mọi người khác đang trong cuộc gọi của phòng. */
  private toCall(room: RoomState, from: Conn, payload: unknown): void {
    for (const conn of room.conns)
      if (conn !== from && conn.inCall && conn.userId !== from.userId) this.send(conn, payload);
  }

  private leaveCall(conn: Conn): void {
    if (!conn.inCall) return;
    conn.inCall = false;
    const room = conn.roomCode ? this.rooms.get(conn.roomCode) : undefined;
    if (room && conn.userId)
      this.toCall(room, conn, { type: 'call:peer-left', userId: conn.userId });
  }

  private closeRoomState(room: RoomState): void {
    this.rooms.delete(room.code);
    this.images.clearRoom(room.code);
    for (const conn of [...room.conns]) {
      conn.inCall = false;
      conn.roomCode = null;
      this.send(conn, { type: 'room:closed', roomId: room.code });
      this.forceClose(conn, FB_CLOSE_ROOM_CLOSED, 'room closed');
    }
    room.conns.clear();
  }

  private pruneRoom(room: RoomState): void {
    if (room.conns.size === 0 && this.images.list(room.code).length === 0)
      this.rooms.delete(room.code);
  }

  /** Bỏ kết nối khỏi mọi sổ sách (socket đã đóng hoặc sắp đóng). */
  private detach(conn: Conn): void {
    if (conn.authTimer) clearTimeout(conn.authTimer);
    conn.authTimer = null;
    this.leaveCall(conn);
    const room = conn.roomCode ? this.rooms.get(conn.roomCode) : undefined;
    room?.conns.delete(conn);
    conn.roomCode = null;
    conn.closed = true;
    this.conns.delete(conn.socket);
    if (room) this.pruneRoom(room);
  }

  private forceClose(conn: Conn, code: number, reason: string): void {
    if (!conn.closed) this.detach(conn);
    try {
      conn.socket.close(code, reason);
    } catch {
      // Socket đã đóng.
    }
  }

  private async context(
    userId: string,
    code: string,
  ): Promise<{ ok: true; ctx: FbMediaContext } | { ok: false; code: string; message: string }> {
    try {
      return { ok: true, ctx: await this.roomsPort.mediaContext(userId, code) };
    } catch (error) {
      return { ok: false, ...errorCodeOf(error) };
    }
  }

  private ensureTimer(): void {
    if (this.timer || this.rooms.size === 0) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  // ================================================================== gửi

  private imageView(image: FbStoredImage, clientId: string | null, type?: 'image') {
    return {
      ...(type ? { type } : {}),
      id: image.id,
      clientId,
      roomId: image.roomCode,
      userId: image.userId,
      name: image.name,
      mime: image.mime,
      data: image.buffer.toString('base64'),
      width: image.width,
      height: image.height,
      sentAt: image.sentAt,
    };
  }

  private error(conn: Conn, code: string, message: string, clientId?: string): void {
    this.send(conn, { type: 'error', ...(clientId ? { clientId } : {}), code, message });
  }

  private send(conn: Conn, payload: unknown): void {
    this.sendRaw(conn, JSON.stringify(payload));
  }

  private sendRaw(conn: Conn, encoded: string): void {
    if (conn.closed) return;
    try {
      conn.socket.send(encoded);
    } catch {
      // Socket đã đóng: sự kiện close sẽ dọn.
    }
  }
}
