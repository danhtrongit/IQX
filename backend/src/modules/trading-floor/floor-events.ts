/**
 * Sự kiện thời gian thực của Khu giao dịch trong cùng tiến trình API. Các dịch vụ (chat, nghi lễ,
 * nhận định) gọi `emit` sau khi transaction đã commit; `FloorHub` nghe và chuyển tới các socket.
 * Một người nghe lỗi không bao giờ làm hỏng luồng nghiệp vụ.
 *
 * Trạng thái nằm trong bộ nhớ của một tiến trình API, giống máy chủ phòng Flashback.
 */

import { Injectable, Module } from '@nestjs/common';

/** Người nhận một sự kiện. */
export type FloorTarget =
  /** Mọi socket đã vào khu. */
  | { readonly kind: 'all' }
  /** Mọi socket của một tài khoản. */
  | { readonly kind: 'user'; readonly userId: string }
  /** Mọi socket của tài khoản đang giữ quyền SACO này. */
  | { readonly kind: 'saco'; readonly sacoId: string };

/** Thông điệp gửi xuống trình duyệt: luôn có `type`, phần còn lại theo hợp đồng WS. */
export interface FloorMessage {
  readonly type: string;
  readonly [key: string]: unknown;
}

export type FloorListener = (target: FloorTarget, message: FloorMessage) => void;

@Injectable()
export class FloorEvents {
  private readonly listeners = new Set<FloorListener>();

  subscribe(listener: FloorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(target: FloorTarget, message: FloorMessage): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(target, message);
      } catch {
        // Người nghe tự ghi log; sự kiện thời gian thực không được làm hỏng nghiệp vụ.
      }
    }
  }

  toAll(message: FloorMessage): void {
    this.emit({ kind: 'all' }, message);
  }

  toUser(userId: string, message: FloorMessage): void {
    this.emit({ kind: 'user', userId }, message);
  }

  toSaco(sacoId: string, message: FloorMessage): void {
    this.emit({ kind: 'saco', sacoId }, message);
  }
}

/** Mô-đun nhỏ để cả `TradingFloorModule` và `SacoPostsModule` dùng chung một `FloorEvents`. */
@Module({ providers: [FloorEvents], exports: [FloorEvents] })
export class FloorEventsModule {}
