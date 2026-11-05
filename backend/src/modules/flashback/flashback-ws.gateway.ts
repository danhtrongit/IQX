/**
 * Cổng WebSocket `/api/v2/flashback/ws` của phòng Flashback (ảnh chat, cuộc gọi, tín hiệu WebRTC).
 * Chỉ là lớp mỏng: toàn bộ quy tắc nằm ở `FlashbackMediaHub`. Xác thực bằng thông điệp `auth` đầu tiên
 * (không đặt token trong URL). Ping của giao thức ws mỗi 25 giây; kết nối không trả pong thì bị cắt và
 * coi như rời cuộc gọi.
 */

import { Inject, Logger, type OnApplicationShutdown } from '@nestjs/common';
import {
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';

import { FB_WS_MAX_PAYLOAD } from './flashback-media.logic.js';
import { FlashbackMediaHub } from './flashback-media.hub.js';

/** Chu kỳ ping/pong (giây). */
export const FB_WS_PING_MS = 25_000;

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
  path: '/api/v2/flashback/ws',
  transports: ['websocket'],
  maxPayload: FB_WS_MAX_PAYLOAD,
})
export class FlashbackWsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnApplicationShutdown
{
  private readonly logger = new Logger(FlashbackWsGateway.name);
  private readonly alive = new Map<RawSocket, boolean>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(@Inject(FlashbackMediaHub) private readonly hub: FlashbackMediaHub) {}

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
          `Flashback ws message failed: ${error instanceof Error ? error.name : 'unknown'}`,
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
    this.heartbeat = setInterval(() => this.sweep(), FB_WS_PING_MS);
    this.heartbeat.unref?.();
  }

  /** Mỗi chu kỳ: socket chưa trả pong của lần trước thì cắt, còn lại gửi ping mới. */
  private sweep(): void {
    for (const [socket, alive] of [...this.alive]) {
      if (!alive) {
        // Cắt hẳn; sự kiện close sẽ gọi handleDisconnect và dọn cuộc gọi.
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
