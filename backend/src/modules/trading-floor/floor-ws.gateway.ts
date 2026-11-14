/**
 * Cổng WebSocket `/api/v2/trading-floor/ws` của Khu giao dịch. Chỉ là lớp mỏng: toàn bộ quy tắc nằm ở
 * `FloorHub`. Xác thực bằng thông điệp `auth` đầu tiên (không đặt token trong URL). Ping của giao thức
 * ws mỗi 25 giây; kết nối không trả pong thì bị cắt và coi như rời sàn.
 */

import { Inject, Logger, type OnApplicationShutdown } from '@nestjs/common';
import {
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';

import { FloorHub } from './floor.hub.js';

/** Chu kỳ ping/pong (ms). */
export const FLOOR_WS_PING_MS = 25_000;
/** Thông điệp của client đều rất nhỏ (toạ độ, emote, id cuộc trò chuyện). */
export const FLOOR_WS_MAX_PAYLOAD = 8 * 1024;

type RawSocket = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  terminate?(): void;
  ping?(): void;
  readonly bufferedAmount?: number;
  on(
    event: 'message',
    listener: (data: Buffer | ArrayBuffer | Buffer[], isBinary?: boolean) => void,
  ): void;
  on(event: 'pong', listener: () => void): void;
};

@WebSocketGateway({
  path: '/api/v2/trading-floor/ws',
  transports: ['websocket'],
  maxPayload: FLOOR_WS_MAX_PAYLOAD,
})
export class FloorWsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnApplicationShutdown
{
  private readonly logger = new Logger(FloorWsGateway.name);
  private readonly alive = new Map<RawSocket, boolean>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(@Inject(FloorHub) private readonly hub: FloorHub) {}

  handleConnection(socket: RawSocket): void {
    this.alive.set(socket, true);
    this.hub.connect(socket);
    socket.on('pong', () => this.alive.set(socket, true));
    socket.on('message', (data, isBinary) => {
      if (isBinary === true) {
        socket.close(1003, 'binary frames not supported');
        return;
      }
      const text = Array.isArray(data)
        ? Buffer.concat(data).toString('utf8')
        : Buffer.from(data as ArrayBuffer).toString('utf8');
      void this.hub.message(socket, text).catch((error: unknown) => {
        this.logger.debug(
          `Floor ws message failed: ${error instanceof Error ? error.name : 'unknown'}`,
        );
      });
    });
    this.ensureHeartbeat();
  }

  handleDisconnect(socket: RawSocket): void {
    this.alive.delete(socket);
    this.hub.disconnect(socket);
  }

  onApplicationShutdown(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.hub.shutdown();
  }

  private ensureHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => this.sweep(), FLOOR_WS_PING_MS);
    this.heartbeat.unref?.();
  }

  /** Mỗi chu kỳ: socket chưa trả pong của lần trước thì cắt, còn lại gửi ping mới. */
  private sweep(): void {
    for (const [socket, alive] of [...this.alive]) {
      if (!alive) {
        if (socket.terminate) socket.terminate();
        else socket.close(1001, 'ping timeout');
        this.alive.delete(socket);
        this.hub.disconnect(socket);
        continue;
      }
      this.alive.set(socket, false);
      try {
        socket.ping?.();
      } catch {
        // Socket đã đóng.
      }
    }
    if (this.alive.size === 0 && this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }
}
