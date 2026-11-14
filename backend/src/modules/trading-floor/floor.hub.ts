/**
 * Máy chủ thời gian thực của Khu giao dịch: hiện diện (ai đang đứng ở đâu), emote, và chuyển các sự kiện
 * của dịch vụ (`FloorEvents`) tới đúng socket. Giao thức JSON trên `/api/v2/trading-floor/ws` (xem
 * `floor-ws.gateway.ts`); xác thực bằng thông điệp `auth` đầu tiên, giống Flashback.
 *
 * Trạng thái nằm trong bộ nhớ của tiến trình API. `id` của một nhân vật là mã kết nối, không bao giờ là
 * id tài khoản: cùng một người mở hai tab là hai nhân vật. Hồ sơ lấy từ `tf_profiles`, không tin trình
 * duyệt.
 *
 * Client → server: `hello`, `state`, `emote`, `chat:typing`, `ping`. Server → client: xem hợp đồng WS.
 */

import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Optional } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import { AuthService } from '../auth/auth.service.js';
import { FloorBots } from './floor-bots.js';
import { FLOOR_CAPACITY } from './floor-bots.logic.js';
import { FloorChatService } from './floor-chat.service.js';
import { FloorEvents, type FloorMessage, type FloorTarget } from './floor-events.js';
import { FloorPresence } from './floor-presence.js';
import {
  cleanEmote,
  cleanState,
  FLOOR_EMOTE_MIN_MS,
  FLOOR_TYPING_MIN_MS,
  stateGate,
} from './floor-profile.logic.js';
import {
  FLOOR_PROFILE_REPOSITORY,
  type FloorProfileRepository,
} from './floor-profile.repository.js';
import { FLOOR_SACO_REPOSITORY, type FloorSacoRepository } from './floor-saco.repository.js';
import type { FloorPeer, FloorPeerState, FloorProfile } from './floor-types.js';

export const FLOOR_HUB_OPTIONS = Symbol('FLOOR_HUB_OPTIONS');

export interface FloorHubOptions {
  now?: () => number;
  /** Chưa xác thực sau bấy nhiêu ms thì đóng (mặc định 10 giây). */
  authTimeoutMs?: number;
}

/** Phần của socket `ws` mà hub dùng. */
export interface FloorHubSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly bufferedAmount?: number;
}

export const FLOOR_CLOSE_AUTH = 4401;
const CLOSE_RATE = 1008;
/** Thông điệp tối đa mỗi phút của một socket: di chuyển liên tục khoảng 20 thông điệp mỗi giây. */
const INBOUND_PER_MINUTE = 1_800;
/**
 * Xô token cho khung `state`: đầy 30, nạp 25 mỗi giây. Khung đổi hướng hay dừng không bị giới hạn
 * 50 ms, nên thiếu xô này một tài khoản có thể bắn hàng nghìn khung "đổi hướng" và hub phát lại
 * từng khung cho cả sàn.
 */
const STATE_BURST = 30;
const STATE_PER_SECOND = 25;
/** Mỗi tài khoản giữ tối đa bấy nhiêu socket; mở thêm thì đóng cái cũ nhất. */
const MAX_SOCKETS_PER_USER = 4;
const CLOSE_TOO_MANY = 4429;
/** Socket nhận nghẽn quá ngưỡng này bị đóng hẳn, kể cả với khung quan trọng. */
const HARD_BUFFERED_BYTES = 1_000_000;
/** Khung di chuyển không quan trọng bị bỏ khi socket nhận đang nghẽn quá ngưỡng này. */
const MAX_BUFFERED_BYTES = 256_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Conn = {
  readonly socket: FloorHubSocket;
  readonly peerId: string;
  userId: string | null;
  /** Có khi đã `hello`: nhân vật đang đứng trên sàn. */
  peer: FloorPeer | null;
  /** Đã `hello` nhưng sảnh đầy người thật: đang xếp hàng với vị trí mới nhất mình báo. */
  waiting: FloorPeerState | null;
  windowStartedAt: number;
  inbound: number;
  lastState: number;
  stateTokens: number;
  stateRefilledAt: number;
  lastEmote: number;
  lastTyping: number;
  authTimer: ReturnType<typeof setTimeout> | null;
  queue: Promise<void>;
  closed: boolean;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

@Injectable()
export class FloorHub {
  private readonly conns = new Map<FloorHubSocket, Conn>();
  private readonly byUser = new Map<string, Set<Conn>>();
  /** Các kết nối đã `hello`, theo thứ tự vào. */
  private readonly floor = new Set<Conn>();
  /** Đã `hello` khi sảnh đủ người thật, theo thứ tự tới. */
  private readonly queue: Conn[] = [];
  private admitting = false;
  private readonly now: () => number;
  private readonly authTimeoutMs: number;
  private readonly unsubscribe: Array<() => void> = [];

  constructor(
    private readonly database: DatabaseService,
    @Inject(AuthService) private readonly auth: Pick<AuthService, 'authenticate'>,
    private readonly presence: FloorPresence,
    events: FloorEvents,
    private readonly chat: FloorChatService,
    @Inject(FLOOR_PROFILE_REPOSITORY) private readonly profiles: FloorProfileRepository,
    @Inject(FLOOR_SACO_REPOSITORY) private readonly sacos: FloorSacoRepository,
    @Optional() @Inject(FLOOR_HUB_OPTIONS) options?: FloorHubOptions,
    @Optional() private readonly bots?: FloorBots,
  ) {
    this.now = options?.now ?? Date.now;
    this.authTimeoutMs = options?.authTimeoutMs ?? 10_000;
    this.unsubscribe.push(
      events.subscribe((target, message) => this.relay(target, message)),
      presence.onProfileChanged((userId, profile) => this.profileChanged(userId, profile)),
    );
    bots?.attach({
      humans: () => [...this.floor].map((conn) => conn.peer!),
      broadcast: (payload, droppable) => this.toFloor(payload, undefined, droppable),
    });
  }

  // ================================================================== vòng đời kết nối

  connect(socket: FloorHubSocket): void {
    const conn: Conn = {
      socket,
      peerId: randomUUID(),
      userId: null,
      peer: null,
      waiting: null,
      windowStartedAt: this.now(),
      inbound: 0,
      lastState: 0,
      stateTokens: STATE_BURST,
      stateRefilledAt: this.now(),
      lastEmote: 0,
      lastTyping: 0,
      authTimer: null,
      queue: Promise.resolve(),
      closed: false,
    };
    conn.authTimer = setTimeout(() => {
      if (!conn.userId) this.forceClose(conn, FLOOR_CLOSE_AUTH, 'auth timeout');
    }, this.authTimeoutMs);
    conn.authTimer.unref?.();
    this.conns.set(socket, conn);
  }

  /** Nhận một thông điệp văn bản; xử lý tuần tự theo thứ tự tới của từng socket. */
  message(socket: FloorHubSocket, raw: string): Promise<void> {
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

  disconnect(socket: FloorHubSocket): void {
    const conn = this.conns.get(socket);
    if (conn) this.detach(conn);
  }

  shutdown(): void {
    for (const stop of this.unsubscribe) stop();
    this.unsubscribe.length = 0;
    this.bots?.stop();
    this.queue.length = 0;
    for (const conn of this.conns.values()) if (conn.authTimer) clearTimeout(conn.authTimer);
    this.conns.clear();
    this.byUser.clear();
    this.floor.clear();
  }

  /** Số liệu cho test và vận hành. */
  get stats() {
    return {
      connections: this.conns.size,
      onFloor: this.floor.size,
      users: this.byUser.size,
      bots: this.bots?.count ?? 0,
      queued: this.queue.length,
    };
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
          this.forceClose(conn, FLOOR_CLOSE_AUTH, 'auth required');
        }
        return;
      }
      switch (message.type) {
        case 'ping':
          this.send(conn, { type: 'pong' });
          return;
        case 'hello':
          await this.onHello(conn, message);
          return;
        case 'state':
          this.onState(conn, message);
          return;
        case 'emote':
          this.onEmote(conn, message);
          return;
        case 'chat:typing':
          await this.onTyping(conn, message);
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
      this.forceClose(conn, FLOOR_CLOSE_AUTH, 'invalid token');
      return;
    }
    let userId: string;
    try {
      userId = (await this.auth.authenticate(token)).id;
    } catch {
      this.error(conn, 'AUTH_INVALID', 'Access token không hợp lệ hoặc đã hết hạn');
      this.forceClose(conn, FLOOR_CLOSE_AUTH, 'invalid token');
      return;
    }
    if (conn.closed) return;
    conn.userId = userId;
    if (conn.authTimer) clearTimeout(conn.authTimer);
    conn.authTimer = null;
    this.presence.connected(userId);
    let sockets = this.byUser.get(userId);
    if (!sockets) this.byUser.set(userId, (sockets = new Set()));
    sockets.add(conn);
    while (sockets.size > MAX_SOCKETS_PER_USER) {
      const oldest = sockets.values().next().value as Conn;
      this.forceClose(oldest, CLOSE_TOO_MANY, 'too many connections');
    }
    this.send(conn, { type: 'ready', userId });
    await this.bindSaco(conn, userId);
  }

  /** Tài khoản giữ quyền SACO còn hoạt động: nối với mã SACO và gửi lại lời mời đang chờ (nếu có). */
  private async bindSaco(conn: Conn, userId: string): Promise<void> {
    try {
      const saco = await this.sacos.findByUser(this.database, userId);
      if (!saco?.active || conn.closed) return;
      this.presence.bindSaco(saco.id, userId);
      const invite = this.chat.pendingInvite(saco.id);
      if (invite) this.send(conn, { type: 'chat:invite', invite });
    } catch {
      // Không tra được quyền SACO lúc này: hộp thư và công tắc trực vẫn nối lại khi gọi REST.
    }
  }

  private async onHello(conn: Conn, message: Record<string, unknown>): Promise<void> {
    if (conn.peer) {
      this.error(conn, 'ALREADY_JOINED', 'Bạn đã ở trong khu');
      return;
    }
    const state = cleanState(message);
    if (!state) {
      this.error(conn, 'BAD_STATE', 'Vị trí không hợp lệ');
      return;
    }
    if (conn.waiting) {
      conn.waiting = state;
      this.sendQueue(conn);
      return;
    }
    await this.enter(conn, state);
  }

  /**
   * Vào sảnh. Sảnh chứa tối đa `FLOOR_CAPACITY` nhân vật: nhân vật tự động nhường chỗ trước; khi chỉ
   * riêng người thật đã đủ thì xếp hàng.
   */
  private async enter(conn: Conn, state: FloorPeerState): Promise<boolean> {
    const profile = await this.profiles.find(this.database, conn.userId!);
    if (!profile) {
      this.error(conn, 'NO_PROFILE', 'Hãy tạo nhân vật trước khi vào khu');
      return false;
    }
    if (conn.closed || conn.peer) return false;
    if (
      this.floor.size >= FLOOR_CAPACITY ||
      (this.queue.length > 0 && !this.queue.includes(conn))
    ) {
      if (!this.queue.includes(conn)) this.queue.push(conn);
      conn.waiting = state;
      this.sendQueue(conn);
      // Còn chỗ mà vẫn có người chờ trước: mời hàng vào theo thứ tự.
      if (this.floor.size < FLOOR_CAPACITY) void this.admitQueued().catch(() => undefined);
      return false;
    }
    const at = this.queue.indexOf(conn);
    if (at >= 0) this.queue.splice(at, 1);
    conn.waiting = null;
    this.bots?.wake();
    this.bots?.fit(FLOOR_CAPACITY - this.floor.size - 1);
    const peer: FloorPeer = { id: conn.peerId, ...profile, ...state };
    const others = [...[...this.floor].map((other) => other.peer!), ...(this.bots?.peers() ?? [])];
    conn.peer = peer;
    this.floor.add(conn);
    this.send(conn, { type: 'welcome', self: peer, peers: others });
    this.toFloor({ type: 'peer:join', peer }, conn);
    this.bots?.humanJoined(peer);
    return true;
  }

  /** Còn chỗ thì cho người đầu hàng vào; báo lại vị trí cho người còn chờ. */
  private async admitQueued(): Promise<void> {
    if (this.admitting) return;
    this.admitting = true;
    try {
      await this.drainQueue();
    } finally {
      this.admitting = false;
    }
    for (const conn of this.queue) this.sendQueue(conn);
  }

  private async drainQueue(): Promise<void> {
    while (this.queue.length > 0 && this.floor.size < FLOOR_CAPACITY) {
      const next = this.queue[0]!;
      if (next.closed || !next.waiting) {
        this.queue.shift();
        continue;
      }
      const entered = await this.enter(next, next.waiting);
      if (!entered && this.queue[0] === next) {
        // Không vào được (mất hồ sơ, đã đóng): bỏ khỏi hàng để người sau không phải chờ mãi.
        this.queue.shift();
        next.waiting = null;
      }
    }
  }

  private sendQueue(conn: Conn): void {
    const position = this.queue.indexOf(conn) + 1;
    if (position > 0)
      this.send(conn, {
        type: 'queue',
        position,
        total: this.queue.length,
        capacity: FLOOR_CAPACITY,
      });
  }

  private onState(conn: Conn, message: Record<string, unknown>): void {
    const peer = conn.peer;
    const state = cleanState(message);
    if (!state) return;
    if (!peer) {
      if (conn.waiting) conn.waiting = state;
      return;
    }
    const now = this.now();
    const gate = stateGate(peer, state, conn.lastState, now);
    if (!gate.allow) return;
    conn.stateTokens = Math.min(
      STATE_BURST,
      conn.stateTokens + ((now - conn.stateRefilledAt) / 1000) * STATE_PER_SECOND,
    );
    conn.stateRefilledAt = now;
    if (conn.stateTokens < 1) return;
    conn.stateTokens -= 1;
    conn.lastState = now;
    Object.assign(peer, state);
    this.toFloor({ type: 'peer:state', id: peer.id, ...state }, conn, !gate.reliable);
  }

  private onEmote(conn: Conn, message: Record<string, unknown>): void {
    const now = this.now();
    if (!conn.peer || typeof message.text !== 'string') return;
    if (now - conn.lastEmote < FLOOR_EMOTE_MIN_MS) return;
    conn.lastEmote = now;
    const text = cleanEmote(message.text);
    if (!text) return;
    this.toFloor({ type: 'peer:emote', id: conn.peer.id, text });
    this.bots?.humanSaid(conn.peer, text);
  }

  private async onTyping(conn: Conn, message: Record<string, unknown>): Promise<void> {
    const now = this.now();
    const convId = message.convId;
    if (now - conn.lastTyping < FLOOR_TYPING_MIN_MS) return;
    if (typeof convId !== 'string' || !UUID.test(convId)) return;
    conn.lastTyping = now;
    await this.chat.typing(conn.userId!, convId);
  }

  // ================================================================== sự kiện từ dịch vụ

  private relay(target: FloorTarget, message: FloorMessage): void {
    const frame = JSON.stringify(message);
    switch (target.kind) {
      case 'all':
        for (const conn of this.conns.values()) if (conn.userId) this.sendRaw(conn, frame);
        return;
      case 'user':
        for (const conn of this.byUser.get(target.userId) ?? []) this.sendRaw(conn, frame);
        return;
      case 'saco': {
        const owner = this.presence.sacoOwner(target.sacoId);
        if (owner) for (const conn of this.byUser.get(owner) ?? []) this.sendRaw(conn, frame);
      }
    }
  }

  /** Hồ sơ đổi: mọi nhân vật của tài khoản đang đứng trên sàn mặc lại, và cả sàn thấy ngay. */
  private profileChanged(userId: string, profile: FloorProfile): void {
    for (const conn of this.byUser.get(userId) ?? []) {
      if (!conn.peer) continue;
      Object.assign(conn.peer, profile);
      this.toFloor({ type: 'peer:update', peer: conn.peer });
    }
  }

  // ================================================================== nội bộ

  /** Gửi cho mọi kết nối đã vào khu (trừ `except`); `droppable` cho phép bỏ khung với socket nghẽn. */
  private toFloor(payload: unknown, except?: Conn, droppable = false): void {
    const frame = JSON.stringify(payload);
    for (const conn of this.floor) {
      if (conn === except) continue;
      if (droppable && (conn.socket.bufferedAmount ?? 0) > MAX_BUFFERED_BYTES) continue;
      this.sendRaw(conn, frame);
    }
  }

  private detach(conn: Conn): void {
    if (conn.closed) return;
    conn.closed = true;
    if (conn.authTimer) clearTimeout(conn.authTimer);
    conn.authTimer = null;
    this.conns.delete(conn.socket);
    const queued = this.queue.indexOf(conn);
    if (queued >= 0) {
      this.queue.splice(queued, 1);
      for (const other of this.queue) this.sendQueue(other);
    }
    if (this.floor.delete(conn) && conn.peer) {
      this.toFloor({ type: 'peer:leave', id: conn.peer.id });
      if (this.queue.length) void this.admitQueued().catch(() => undefined);
    }
    const userId = conn.userId;
    if (userId) {
      const sockets = this.byUser.get(userId);
      sockets?.delete(conn);
      if (sockets && sockets.size === 0) this.byUser.delete(userId);
      this.presence.disconnected(userId);
    }
  }

  private forceClose(conn: Conn, code: number, reason: string): void {
    this.detach(conn);
    try {
      conn.socket.close(code, reason);
    } catch {
      // Socket đã đóng.
    }
  }

  private error(conn: Conn, code: string, message: string): void {
    this.send(conn, { type: 'error', code, message });
  }

  private send(conn: Conn, payload: unknown): void {
    this.sendRaw(conn, JSON.stringify(payload));
  }

  private sendRaw(conn: Conn, encoded: string): void {
    if (conn.closed) return;
    if ((conn.socket.bufferedAmount ?? 0) > HARD_BUFFERED_BYTES) {
      this.forceClose(conn, CLOSE_RATE, 'receiver too slow');
      return;
    }
    try {
      conn.socket.send(encoded);
    } catch {
      // Socket đã đóng: sự kiện close sẽ dọn.
    }
  }
}
