/**
 * Sự kiện phòng Flashback trong cùng tiến trình: dịch vụ phòng báo (sau khi transaction đã commit),
 * máy chủ thời gian thực (`FlashbackMediaHub`) nghe để đóng socket, dọn ảnh và trạng thái cuộc gọi.
 * Một người nghe lỗi không bao giờ làm hỏng luồng game.
 *
 * Tác vụ quét phòng chạy ở tiến trình worker nên sự kiện của nó không tới được tiến trình API; hub tự
 * đối chiếu định kỳ với cơ sở dữ liệu để bắt các phòng đã đóng ở đó.
 */

import { Injectable } from '@nestjs/common';

type Listener<T> = (event: T) => void;

export interface FbRoomClosedEvent {
  readonly roomId: string;
  readonly code: string;
}

export interface FbMemberLeftEvent extends FbRoomClosedEvent {
  readonly userId: string;
}

export interface FbPositionEvent {
  readonly roomId: string;
  /** Người vừa sang phiên mới; bỏ trống khi ván kết thúc (mọi người đổi trạng thái). */
  readonly userId?: string;
}

@Injectable()
export class FlashbackRoomEvents {
  private readonly closed = new Set<Listener<FbRoomClosedEvent>>();
  private readonly left = new Set<Listener<FbMemberLeftEvent>>();
  private readonly position = new Set<Listener<FbPositionEvent>>();

  onRoomClosed(listener: Listener<FbRoomClosedEvent>): () => void {
    this.closed.add(listener);
    return () => this.closed.delete(listener);
  }

  onMemberLeft(listener: Listener<FbMemberLeftEvent>): () => void {
    this.left.add(listener);
    return () => this.left.delete(listener);
  }

  onPosition(listener: Listener<FbPositionEvent>): () => void {
    this.position.add(listener);
    return () => this.position.delete(listener);
  }

  roomClosed(event: FbRoomClosedEvent): void {
    this.emit(this.closed, event);
  }

  memberLeft(event: FbMemberLeftEvent): void {
    this.emit(this.left, event);
  }

  /** Phiên của ai đó trong phòng đổi, hoặc ván kết thúc: ảnh chờ có thể tới lượt. */
  positionChanged(event: FbPositionEvent): void {
    this.emit(this.position, event);
  }

  private emit<T>(listeners: Set<Listener<T>>, event: T): void {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        // Người nghe lỗi không được làm hỏng luồng game.
      }
    }
  }
}
