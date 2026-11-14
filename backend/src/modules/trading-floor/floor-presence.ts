/**
 * Sổ "ai đang có socket" của Khu giao dịch, nhỏ và không phụ thuộc gì khác để cả `FloorHub` (giao thức
 * WebSocket) lẫn các dịch vụ (chat, SACO, hồ sơ) cùng dùng mà không vòng phụ thuộc.
 *
 * - Người dùng online = có ít nhất một socket đã xác thực (không cần `hello`).
 * - SACO online (cho khớp và hiển thị) = còn hoạt động, đang trực và chủ tài khoản có socket; hai điều
 *   kiện đầu do dịch vụ kiểm tra trên dữ liệu, ở đây chỉ trả lời câu hỏi socket.
 * - `bindSaco` nối mã SACO với tài khoản đang giữ quyền để `FloorEvents.toSaco` biết gửi cho ai.
 *
 * Trạng thái nằm trong bộ nhớ của một tiến trình API, giống Flashback.
 */

import { Injectable } from '@nestjs/common';

import type { FloorProfile } from './floor-types.js';

type UserListener = (userId: string) => void;
type ProfileListener = (userId: string, profile: FloorProfile) => void;

@Injectable()
export class FloorPresence {
  private readonly sockets = new Map<string, number>();
  private readonly owners = new Map<string, string>();
  private readonly gone = new Set<UserListener>();
  private readonly profiles = new Set<ProfileListener>();

  /** Một socket của `userId` vừa xác thực xong. */
  connected(userId: string): void {
    this.sockets.set(userId, (this.sockets.get(userId) ?? 0) + 1);
  }

  /** Một socket đã xác thực của `userId` đóng; socket cuối cùng đóng thì báo `onUserGone`. */
  disconnected(userId: string): void {
    const left = (this.sockets.get(userId) ?? 0) - 1;
    if (left > 0) {
      this.sockets.set(userId, left);
      return;
    }
    this.sockets.delete(userId);
    for (const listener of [...this.gone]) {
      try {
        listener(userId);
      } catch {
        // Người nghe tự ghi log; không để lỗi làm hỏng việc đóng socket.
      }
    }
  }

  userOnline(userId: string): boolean {
    return (this.sockets.get(userId) ?? 0) > 0;
  }

  /** `userId` null: gỡ liên kết (SACO bị gỡ quyền). */
  bindSaco(sacoId: string, userId: string | null): void {
    if (userId === null) this.owners.delete(sacoId);
    else this.owners.set(sacoId, userId);
  }

  sacoOwner(sacoId: string): string | null {
    return this.owners.get(sacoId) ?? null;
  }

  /** Kết nối của tài khoản `userId` đã có chủ SACO online hay chưa (theo mã SACO). */
  sacoConnected(sacoId: string): boolean {
    const owner = this.owners.get(sacoId);
    return owner !== undefined && this.userOnline(owner);
  }

  /** Người dùng không còn socket nào (đóng tab, mất mạng). */
  onUserGone(listener: UserListener): () => void {
    this.gone.add(listener);
    return () => this.gone.delete(listener);
  }

  /** Hồ sơ vừa đổi: hub cập nhật các nhân vật đang đứng trên sàn của tài khoản này. */
  onProfileChanged(listener: ProfileListener): () => void {
    this.profiles.add(listener);
    return () => this.profiles.delete(listener);
  }

  profileChanged(userId: string, profile: FloorProfile): void {
    for (const listener of [...this.profiles]) {
      try {
        listener(userId, profile);
      } catch {
        // Người nghe tự ghi log.
      }
    }
  }
}
