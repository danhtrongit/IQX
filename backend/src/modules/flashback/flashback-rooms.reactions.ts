/**
 * Biểu cảm (emoji) trong ván (v2.1 §6.4).
 *
 * Server chỉ nhận emoji nằm trong danh sách 12 cái, mỗi người 1 biểu cảm mỗi 1,5 giây, và không
 * lưu lịch sử: biểu cảm chỉ nằm trong bộ nhớ vài giây để các máy khác lấy ở lần polling kế tiếp
 * của `GET matches/:id/state` (2 giây một lần). Cổng realtime hiện có (`modules/realtime`) là luồng
 * dữ liệu thị trường công khai, không xác thực và chỉ đăng ký theo mã cổ phiếu, nên biểu cảm đi
 * theo luồng polling của ván thay vì mở thêm một kênh đẩy có xác thực.
 *
 * Giới hạn đã biết: bộ nhớ này thuộc từng tiến trình API. Triển khai hiện tại chạy một tiến trình
 * API nên mọi người trong ván thấy nhau; nếu sau này chạy nhiều tiến trình thì cần chuyển sang
 * Redis (lưu `fb:reactions:<match>` với TTL vài giây) hoặc kênh đẩy.
 */

import { randomUUID } from 'node:crypto';

/** 12 biểu cảm theo đúng thứ tự của bảng chọn (6 cột x 2 hàng). */
export const FB_REACTION_EMOJIS = [
  '😂',
  '😎',
  '🚀',
  '📉',
  '😭',
  '🔥',
  '👏',
  '🤡',
  '💸',
  '🙏',
  '😱',
  '🤑',
] as const;

export type FbReactionEmoji = (typeof FB_REACTION_EMOJIS)[number];

export const isReactionEmoji = (value: string): value is FbReactionEmoji =>
  (FB_REACTION_EMOJIS as readonly string[]).includes(value);

/** Mỗi người 1 biểu cảm mỗi 1,5 giây. */
export const FB_REACTION_COOLDOWN_MS = 1500;

/**
 * Biểu cảm còn nằm trong `state` bấy nhiêu mili giây: dài hơn một chu kỳ polling (2 giây) để máy
 * nào cũng lấy được ít nhất một lần, đủ ngắn để người mở lại màn chơi không thấy biểu cảm cũ.
 */
export const FB_REACTION_WINDOW_MS = 4000;

export interface FbReaction {
  readonly id: string;
  readonly matchId: string;
  readonly userId: string;
  readonly emoji: FbReactionEmoji;
  /** Mili giây epoch lúc gửi. */
  readonly at: number;
}

export type FbReactionSend =
  | { readonly ok: true; readonly reaction: FbReaction }
  | { readonly ok: false; readonly reason: 'invalid_emoji' }
  | { readonly ok: false; readonly reason: 'too_fast'; readonly retryAfterMs: number };

export class FbReactionStore {
  private readonly byMatch = new Map<string, FbReaction[]>();
  private readonly lastSentAt = new Map<string, number>();

  /** Nhận một biểu cảm: kiểm tra danh sách emoji rồi giới hạn tốc độ theo người gửi. */
  send(input: {
    readonly matchId: string;
    readonly userId: string;
    readonly emoji: string;
    readonly now: number;
  }): FbReactionSend {
    if (!isReactionEmoji(input.emoji)) return { ok: false, reason: 'invalid_emoji' };
    this.prune(input.now);
    const last = this.lastSentAt.get(input.userId);
    if (last !== undefined && input.now - last < FB_REACTION_COOLDOWN_MS)
      return {
        ok: false,
        reason: 'too_fast',
        retryAfterMs: FB_REACTION_COOLDOWN_MS - (input.now - last),
      };
    const reaction: FbReaction = {
      id: randomUUID(),
      matchId: input.matchId,
      userId: input.userId,
      emoji: input.emoji,
      at: input.now,
    };
    this.lastSentAt.set(input.userId, input.now);
    const list = this.byMatch.get(input.matchId) ?? [];
    list.push(reaction);
    this.byMatch.set(input.matchId, list);
    return { ok: true, reaction };
  }

  /** Biểu cảm còn trong cửa sổ của một ván, cũ nhất trước. */
  recent(matchId: string, now: number): FbReaction[] {
    this.prune(now);
    return [...(this.byMatch.get(matchId) ?? [])];
  }

  /** Bỏ biểu cảm quá cửa sổ và mốc giới hạn tốc độ đã hết hạn để bộ nhớ không tăng mãi. */
  private prune(now: number): void {
    for (const [matchId, list] of this.byMatch) {
      const alive = list.filter((item) => now - item.at < FB_REACTION_WINDOW_MS);
      if (alive.length === 0) this.byMatch.delete(matchId);
      else if (alive.length !== list.length) this.byMatch.set(matchId, alive);
    }
    for (const [userId, at] of this.lastSentAt)
      if (now - at >= FB_REACTION_COOLDOWN_MS) this.lastSentAt.delete(userId);
  }
}
