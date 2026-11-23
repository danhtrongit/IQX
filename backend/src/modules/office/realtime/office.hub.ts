/**
 * Real-time presence, movement, and sync hub for Khu Văn phòng (/api/v2/office/ws).
 * Strictly isolated per team_id. Mirrors FloorHub's first-frame JWT auth, rate-limiting,
 * sequential per-socket queue, backpressure protection, and optional Redis pub/sub bridge
 * for cross-process worker cron broadcasts.
 */
import { randomUUID } from 'node:crypto';

import {
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
  type OnModuleInit,
} from '@nestjs/common';
import type { Redis } from 'ioredis';

import { RedisService } from '../../../platform/redis/index.js';
import { AuthService } from '../../auth/auth.service.js';
import {
  OFFICE_DESK_COLS,
  OFFICE_DESK_COL_STEP,
  OFFICE_DESK_ROW_STEP,
  OFFICE_DESK_START_X,
  OFFICE_DESK_START_Y,
  OFFICE_DESK_W,
  OFFICE_FACINGS,
  OFFICE_SYNC_SCOPES,
  OFFICE_WORLD_HEIGHT,
  OFFICE_WORLD_WIDTH,
  computeOfficeWorldHeight,
  type OfficeFacing,
  type OfficePeer,
  type OfficeSyncScope,
} from '../office.types.js';
import { OfficeAccessService } from '../services/office-access.service.js';

export const OFFICE_HUB_OPTIONS = Symbol('OFFICE_HUB_OPTIONS');

export interface OfficeHubOptions {
  now?: () => number;
  authTimeoutMs?: number;
}

export interface OfficeHubSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly bufferedAmount?: number;
}

export const OFFICE_CLOSE_AUTH = 4401;
export const OFFICE_CLOSE_FORBIDDEN = 4403;
export const OFFICE_CLOSE_TOO_MANY = 4429;
const OFFICE_CLOSE_RATE = 1008;

const INBOUND_PER_MINUTE = 1_800;
const STATE_BURST = 30;
const STATE_PER_SECOND = 25;
const MAX_SOCKETS_PER_USER = 4;
const HARD_BUFFERED_BYTES = 1_000_000;
const MAX_BUFFERED_BYTES = 256_000;

type Conn = {
  readonly socket: OfficeHubSocket;
  peerId: string;
  userId: string | null;
  teamId: string | null;
  peer: OfficePeer | null;
  windowStartedAt: number;
  inbound: number;
  stateTokens: number;
  stateRefilledAt: number;
  authTimer: ReturnType<typeof setTimeout> | null;
  queue: Promise<void>;
  closed: boolean;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const isFacing = (value: unknown): value is OfficeFacing =>
  typeof value === 'string' && (OFFICE_FACINGS as readonly string[]).includes(value);

const isSyncScope = (value: unknown): value is OfficeSyncScope =>
  typeof value === 'string' && (OFFICE_SYNC_SCOPES as readonly string[]).includes(value);

const clampCoord = (value: unknown, max: number): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(max, Math.round(value * 10) / 10));
};

/**
 * Default spawn spot matching frontend `office-layout.ts` (`OFFICE_BOSS_SPAWN` & `deskSlotCoords`):
 * - Boss: `{ x: 440, y: 310 }`
 * - Staff: `x = 150 + col * 270 + 95`, `y = 720 + row * 330 + 150` (unclamped vertically for >12 staff).
 */
export function defaultOfficeSpawn(
  role: 'boss' | 'staff',
  deskIndex: number | null,
): { x: number; y: number } {
  if (role === 'boss') return { x: 440, y: 310 };
  const idx = Math.max(0, Math.floor(deskIndex ?? 0));
  const row = Math.floor(idx / OFFICE_DESK_COLS);
  const col = idx % OFFICE_DESK_COLS;
  const x = OFFICE_DESK_START_X + col * OFFICE_DESK_COL_STEP + OFFICE_DESK_W / 2;
  const y = OFFICE_DESK_START_Y + row * OFFICE_DESK_ROW_STEP + 150;
  return { x, y };
}

@Injectable()
export class OfficeHub implements OnModuleInit {
  private readonly logger = new Logger(OfficeHub.name);
  private readonly instanceId = randomUUID();
  private readonly conns = new Map<OfficeHubSocket, Conn>();
  private readonly byTeam = new Map<string, Set<Conn>>();
  private readonly byUser = new Map<string, Set<Conn>>();
  private readonly teamWorldHeight = new Map<string, number>();
  private readonly now: () => number;
  private readonly authTimeoutMs: number;
  private subscriber: Redis | null = null;

  constructor(
    @Inject(AuthService) private readonly auth: Pick<AuthService, 'authenticate'>,
    private readonly access: OfficeAccessService,
    @Optional() private readonly redis?: RedisService,
    @Optional() @Inject(OFFICE_HUB_OPTIONS) options?: OfficeHubOptions,
  ) {
    this.now = options?.now ?? Date.now;
    this.authTimeoutMs = options?.authTimeoutMs ?? 10_000;
  }

  async onModuleInit(): Promise<void> {
    if (!this.redis?.isEnabled()) return;
    try {
      const base = await this.redis.getClient();
      const sub = base.duplicate();
      const channel = this.redis.key('office', 'sync');
      sub.on('message', (_ch, payload) => this.onRedisSyncMessage(payload));
      await sub.subscribe(channel);
      this.subscriber = sub;
    } catch (error) {
      this.logger.warn(
        `OfficeHub Redis sync subscription unavailable: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  connect(socket: OfficeHubSocket): void {
    const now = this.now();
    const conn: Conn = {
      socket,
      peerId: randomUUID(),
      userId: null,
      teamId: null,
      peer: null,
      windowStartedAt: now,
      inbound: 0,
      stateTokens: STATE_BURST,
      stateRefilledAt: now,
      authTimer: null,
      queue: Promise.resolve(),
      closed: false,
    };
    conn.authTimer = setTimeout(() => {
      if (!conn.userId) this.forceClose(conn, OFFICE_CLOSE_AUTH, 'auth timeout');
    }, this.authTimeoutMs);
    conn.authTimer.unref?.();
    this.conns.set(socket, conn);
  }

  message(socket: OfficeHubSocket, raw: string): Promise<void> {
    const conn = this.conns.get(socket);
    if (!conn || conn.closed) return Promise.resolve();
    const now = this.now();
    if (now - conn.windowStartedAt >= 60_000) {
      conn.windowStartedAt = now;
      conn.inbound = 0;
    }
    conn.inbound += 1;
    if (conn.inbound > INBOUND_PER_MINUTE) {
      this.forceClose(conn, OFFICE_CLOSE_RATE, 'message rate exceeded');
      return Promise.resolve();
    }
    conn.queue = conn.queue.then(() => this.handle(conn, raw)).catch(() => undefined);
    return conn.queue;
  }

  disconnect(socket: OfficeHubSocket): void {
    const conn = this.conns.get(socket);
    if (conn) this.detach(conn);
  }

  shutdown(): void {
    for (const conn of this.conns.values()) {
      if (conn.authTimer) clearTimeout(conn.authTimer);
    }
    this.conns.clear();
    this.byTeam.clear();
    this.byUser.clear();
    this.teamWorldHeight.clear();
    if (this.subscriber) {
      this.subscriber.disconnect();
      this.subscriber = null;
    }
  }

  onlineUserIds(teamId: string): string[] {
    const room = this.byTeam.get(teamId);
    if (!room) return [];
    const unique = new Set<string>();
    for (const conn of room) {
      if (conn.userId) unique.add(conn.userId);
    }
    return [...unique];
  }

  broadcastSync(teamId: string, scope: OfficeSyncScope, targetUserIds?: readonly string[]): void {
    const room = this.byTeam.get(teamId);
    if (!room || room.size === 0) return;
    const filter = targetUserIds ? new Set(targetUserIds) : null;
    const payload = { type: 'office:sync', scope, teamId, at: this.now() };
    for (const conn of room) {
      if (filter && (!conn.userId || !filter.has(conn.userId))) continue;
      this.send(conn, payload, false);
    }
  }

  broadcastSyncAllTeams(scope: OfficeSyncScope): void {
    for (const teamId of this.byTeam.keys()) {
      this.broadcastSync(teamId, scope);
    }
  }

  async publishSyncAcrossProcesses(
    teamId: string | 'all',
    scope: OfficeSyncScope,
    targetUserIds?: readonly string[],
  ): Promise<void> {
    if (teamId === 'all') this.broadcastSyncAllTeams(scope);
    else this.broadcastSync(teamId, scope, targetUserIds);

    if (!this.redis?.isEnabled()) return;
    try {
      const channel = this.redis.key('office', 'sync');
      await this.redis.execute((client) =>
        client.publish(
          channel,
          JSON.stringify({ originId: this.instanceId, teamId, scope, targetUserIds }),
        ),
      );
    } catch {
      // Local broadcast already delivered; best-effort cross-process fanout.
    }
  }

  private onRedisSyncMessage(raw: string): void {
    try {
      const parsed = asRecord(JSON.parse(raw));
      if (!parsed || !isSyncScope(parsed.scope)) return;
      if (parsed.originId === this.instanceId) return;
      const teamId = parsed.teamId;
      const targets = Array.isArray(parsed.targetUserIds)
        ? parsed.targetUserIds.filter((item): item is string => typeof item === 'string')
        : undefined;
      if (teamId === 'all') this.broadcastSyncAllTeams(parsed.scope);
      else if (typeof teamId === 'string') this.broadcastSync(teamId, parsed.scope, targets);
    } catch {
      // Ignore malformed pubsub payload.
    }
  }

  private async handle(conn: Conn, raw: string): Promise<void> {
    if (conn.closed) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.sendError(conn, 'BAD_MESSAGE', 'Thông điệp không hợp lệ');
      return;
    }
    const msg = asRecord(parsed);
    if (!msg || typeof msg.type !== 'string') {
      this.sendError(conn, 'BAD_MESSAGE', 'Thông điệp không hợp lệ');
      return;
    }

    if (!conn.userId) {
      if (msg.type === 'auth') {
        await this.onAuth(conn, msg);
      } else {
        this.sendError(conn, 'AUTH_REQUIRED', 'Cần xác thực trước');
        this.forceClose(conn, OFFICE_CLOSE_AUTH, 'auth required');
      }
      return;
    }

    switch (msg.type) {
      case 'ping':
        this.send(conn, { type: 'pong' }, false);
        return;
      case 'state':
        this.onState(conn, msg);
        return;
      default:
        this.sendError(conn, 'BAD_MESSAGE', 'Loại thông điệp không được hỗ trợ');
    }
  }

  private async onAuth(conn: Conn, msg: Record<string, unknown>): Promise<void> {
    const token = typeof msg.token === 'string' ? msg.token.trim() : '';
    if (!token) {
      this.sendError(conn, 'AUTH_INVALID', 'Thiếu access token');
      this.forceClose(conn, OFFICE_CLOSE_AUTH, 'invalid token');
      return;
    }

    let authUser;
    try {
      authUser = await this.auth.authenticate(token);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.sendError(conn, 'AUTH_INVALID', 'Access token không hợp lệ hoặc đã hết hạn');
        this.forceClose(conn, OFFICE_CLOSE_AUTH, 'invalid token');
        return;
      }
      this.sendError(conn, 'INTERNAL', 'Không thể xác thực lúc này');
      this.forceClose(conn, 1011, 'auth unavailable');
      return;
    }

    let resolved;
    try {
      resolved = await this.access.resolveAccess(authUser);
    } catch {
      this.sendError(conn, 'INTERNAL', 'Không thể tải thông tin văn phòng');
      this.forceClose(conn, 1011, 'access lookup failed');
      return;
    }

    if (conn.closed) return;

    if (!resolved.member) {
      this.sendError(
        conn,
        'OFFICE_NOT_MEMBER',
        'Bạn chưa thuộc nhóm nào. Liên hệ trưởng nhóm để được thêm vào văn phòng.',
      );
      this.forceClose(conn, OFFICE_CLOSE_FORBIDDEN, 'not an office member');
      return;
    }

    if (conn.authTimer) clearTimeout(conn.authTimer);
    conn.authTimer = null;

    const teamId = resolved.team.id;
    const userId = authUser.id;
    conn.userId = userId;
    conn.teamId = teamId;

    let userSockets = this.byUser.get(userId);
    if (!userSockets) this.byUser.set(userId, (userSockets = new Set()));
    userSockets.add(conn);
    while (userSockets.size > MAX_SOCKETS_PER_USER) {
      const oldest = userSockets.values().next().value as Conn;
      this.forceClose(oldest, OFFICE_CLOSE_TOO_MANY, 'too many connections');
    }

    const staffMembers = resolved.members
      .filter((m) => m.role === 'staff')
      .slice()
      .sort((a, b) => {
        const ia = a.deskIndex ?? Number.MAX_SAFE_INTEGER;
        const ib = b.deskIndex ?? Number.MAX_SAFE_INTEGER;
        if (ia !== ib) return ia - ib;
        return a.displayName.localeCompare(b.displayName, 'vi');
      });
    const slotIdx =
      resolved.role === 'staff' ? staffMembers.findIndex((m) => m.userId === userId) : -1;
    const effectiveDeskIndex = slotIdx >= 0 ? slotIdx : resolved.self.deskIndex;
    const dynamicWorldH = computeOfficeWorldHeight(
      Math.max(staffMembers.length, effectiveDeskIndex !== null ? effectiveDeskIndex + 1 : 0),
    );
    this.teamWorldHeight.set(teamId, dynamicWorldH);

    let room = this.byTeam.get(teamId);
    if (!room) this.byTeam.set(teamId, (room = new Set()));

    let existingSelfConn: Conn | null = null;
    const uniqueOthers = new Map<string, OfficePeer>();
    for (const other of room) {
      if (!other.peer || !other.userId) continue;
      if (other.userId === userId) {
        existingSelfConn = other;
      } else {
        uniqueOthers.set(other.userId, other.peer);
      }
    }
    if (existingSelfConn) {
      conn.peerId = existingSelfConn.peerId;
    }

    const spawn = defaultOfficeSpawn(resolved.role, effectiveDeskIndex);
    const peer: OfficePeer = {
      peerId: conn.peerId,
      userId,
      role: resolved.role,
      name: resolved.self.displayName,
      avatar: resolved.self.avatar,
      avatarColor: resolved.self.avatarColor,
      accentColor: resolved.self.accentColor,
      deskIndex: resolved.self.deskIndex,
      x: existingSelfConn?.peer?.x ?? spawn.x,
      y: existingSelfConn?.peer?.y ?? spawn.y,
      facing: existingSelfConn?.peer?.facing ?? 'down',
      moving: existingSelfConn?.peer?.moving ?? false,
    };
    conn.peer = peer;
    room.add(conn);

    const others = [...uniqueOthers.values()];
    const onlineCount = this.onlineUserIds(teamId).length;
    this.send(conn, { type: 'welcome', self: peer, peers: others, onlineCount }, false);
    if (!existingSelfConn) {
      this.toTeam(teamId, { type: 'peer:join', peer, onlineCount }, conn, false);
    }
  }

  private onState(conn: Conn, msg: Record<string, unknown>): void {
    if (!conn.peer || !conn.teamId) return;
    const now = this.now();
    const elapsedSec = Math.max(0, (now - conn.stateRefilledAt) / 1000);
    conn.stateTokens = Math.min(STATE_BURST, conn.stateTokens + elapsedSec * STATE_PER_SECOND);
    conn.stateRefilledAt = now;
    if (conn.stateTokens < 1) return;
    conn.stateTokens -= 1;

    const maxY = this.teamWorldHeight.get(conn.teamId) ?? OFFICE_WORLD_HEIGHT;
    const x = clampCoord(msg.x, OFFICE_WORLD_WIDTH);
    const y = clampCoord(msg.y, maxY);
    const facing = isFacing(msg.facing) ? msg.facing : conn.peer.facing;
    const moving = typeof msg.moving === 'boolean' ? msg.moving : false;
    if (x === null || y === null) {
      this.sendError(conn, 'BAD_STATE', 'Toạ độ di chuyển không hợp lệ');
      return;
    }

    conn.peer.x = x;
    conn.peer.y = y;
    conn.peer.facing = facing;
    conn.peer.moving = moving;

    const room = this.byTeam.get(conn.teamId);
    if (room && conn.userId) {
      for (const sibling of room) {
        if (sibling !== conn && sibling.userId === conn.userId && sibling.peer) {
          sibling.peer.x = x;
          sibling.peer.y = y;
          sibling.peer.facing = facing;
          sibling.peer.moving = moving;
        }
      }
    }

    this.toTeam(
      conn.teamId,
      {
        type: 'peer:state',
        peerId: conn.peerId,
        userId: conn.userId,
        x,
        y,
        facing,
        moving,
      },
      conn,
      true,
    );
  }

  private detach(conn: Conn): void {
    if (conn.closed) return;
    conn.closed = true;
    if (conn.authTimer) clearTimeout(conn.authTimer);
    conn.authTimer = null;
    this.conns.delete(conn.socket);

    if (conn.userId) {
      const userSet = this.byUser.get(conn.userId);
      userSet?.delete(conn);
      if (userSet && userSet.size === 0) this.byUser.delete(conn.userId);
    }

    if (conn.teamId) {
      const room = this.byTeam.get(conn.teamId);
      room?.delete(conn);
      const onlineCount = this.onlineUserIds(conn.teamId).length;
      if (!room || room.size === 0) {
        this.byTeam.delete(conn.teamId);
        this.teamWorldHeight.delete(conn.teamId);
      } else if (conn.peer) {
        const userStillInTeam =
          conn.userId !== null && [...room].some((other) => other.userId === conn.userId);
        if (!userStillInTeam) {
          this.toTeam(
            conn.teamId,
            { type: 'peer:leave', peerId: conn.peerId, userId: conn.userId, onlineCount },
            conn,
            false,
          );
        }
      }
    }
  }

  private forceClose(conn: Conn, code: number, reason: string): void {
    this.detach(conn);
    try {
      conn.socket.close(code, reason);
    } catch {
      // Socket already closed.
    }
  }

  private toTeam(
    teamId: string,
    payload: Record<string, unknown>,
    exclude?: Conn,
    droppable = false,
  ): void {
    const room = this.byTeam.get(teamId);
    if (!room) return;
    const encoded = JSON.stringify(payload);
    for (const conn of [...room]) {
      if (conn === exclude) continue;
      this.sendEncoded(conn, encoded, droppable);
    }
  }

  private send(conn: Conn, payload: Record<string, unknown>, droppable: boolean): void {
    this.sendEncoded(conn, JSON.stringify(payload), droppable);
  }

  private sendError(conn: Conn, code: string, message: string): void {
    this.send(conn, { type: 'error', code, message }, false);
  }

  private sendEncoded(conn: Conn, encoded: string, droppable: boolean): void {
    if (conn.closed) return;
    const buffered = conn.socket.bufferedAmount ?? 0;
    if (buffered > HARD_BUFFERED_BYTES) {
      this.forceClose(conn, 1008, 'backpressure');
      return;
    }
    if (droppable && buffered > MAX_BUFFERED_BYTES) return;
    try {
      conn.socket.send(encoded);
    } catch {
      this.detach(conn);
    }
  }
}
