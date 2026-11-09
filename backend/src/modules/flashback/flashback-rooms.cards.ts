/**
 * Tra mẫu nến tính sẵn lúc chơi Flashback (Candle Dojo v1.3 §5).
 *
 * Mỗi lần người chơi bấm Phiên tiếp, phiên vừa mở là Phiên `k` của ván, ứng với
 * `idx = start_idx + W + H + k − 1` trong kho (W = số phiên khởi tạo, H = số phiên xem). Một lần tra theo
 * khoá chính trên `fb_dataset_patterns` với `detector_version` của lần tính `done` mới nhất của phiên
 * bản kho của ván; không chạy bộ nhận diện lúc chơi. Có mẫu thì chỉ hiện nếu người chơi sở hữu thẻ.
 *
 * - Không lộ dữ liệu: chỉ tra đúng phiên vừa mở; phần phiên xem không có thẻ (k bắt đầu từ 1).
 * - Mua thẻ giữa ván: quyền sở hữu được kiểm ngay lúc bấm, nên có hiệu lực từ lần bấm kế tiếp, không
 *   hiện bù cho các phiên đã qua.
 * - Một ván dùng một `detector_version` từ lần tra đầu tiên tới hết ván (ghi nhớ trong bộ nhớ), để đổi
 *   bộ nhận diện giữa chừng không làm thẻ của ván đang chơi đổi.
 * - Lỗi bất kỳ (chưa có bảng, chưa tính mẫu, CSDL lỗi) chỉ có nghĩa là không có thẻ; ván vẫn chơi.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';

import type { FbCardsPort, FbMatchCardView, FbShownCard } from './flashback-rooms.service.js';
import type { FbMatchRow } from './flashback-rooms.repository.js';
import {
  FLASHBACK_PATTERNS_REPOSITORY,
  FlashbackPatternsRepository,
} from './flashback-patterns.repository.js';

/** Thời gian ghi nhớ lần tính `done` mới nhất của một phiên bản kho. */
export const FB_CARDS_DETECTOR_TTL_MS = 60_000;

/** Số ván tối đa ghi nhớ `detector_version` (xoá ván cũ nhất trước). */
const MAX_PINNED_MATCHES = 5_000;

@Injectable()
export class FlashbackRoomCards implements FbCardsPort {
  private readonly logger = new Logger(FlashbackRoomCards.name);
  private readonly latest = new Map<number, { detector: number | null; at: number }>();
  private readonly pinned = new Map<string, number>();

  constructor(
    @Inject(FLASHBACK_PATTERNS_REPOSITORY) private readonly repository: FlashbackPatternsRepository,
  ) {}

  /** Bỏ ghi nhớ lần tính mới nhất (gọi sau khi một lần tính kết thúc để có hiệu lực ngay). */
  invalidate(): void {
    this.latest.clear();
  }

  async cardAt(input: {
    match: FbMatchRow;
    userId: string;
    step: number;
    now?: number;
  }): Promise<FbShownCard | null> {
    const { match, userId, step } = input;
    try {
      const version = match.datasetVersion;
      const startIdx = match.startIdx;
      if (version === null || version === undefined || startIdx === null || startIdx === undefined) return null;
      if (!Number.isInteger(step) || step < 1 || step > match.playBars) return null;
      const detector = await this.detectorOf(match.id, version, input.now ?? Date.now());
      if (detector === null) return null;
      const idx = startIdx + match.warmupBars.length + match.viewBars + step - 1;
      const pattern = await this.repository.patternAt(version, match.symbol, idx, detector);
      if (!pattern) return null;
      const owned = await this.repository.recordCard({
        matchId: match.id,
        userId,
        playIdx: step,
        cardId: pattern.cardId,
        cardN: pattern.cardN,
      });
      return owned ? { id: pattern.cardId, n: pattern.cardN } : null;
    } catch (error) {
      this.logger.warn(`Flashback: không tra được thẻ nến (${error instanceof Error ? error.message : 'lỗi'})`);
      return null;
    }
  }

  async matchCards(input: {
    matchId: string;
    userId: string;
    upToStep: number;
  }): Promise<FbMatchCardView[]> {
    try {
      const rows = await this.repository.matchCards(input.matchId, input.userId, input.upToStep);
      return rows.map((row) => ({ play_idx: row.playIdx, card_id: row.cardId, card_n: row.cardN }));
    } catch (error) {
      this.logger.warn(`Flashback: không đọc được thẻ của ván (${error instanceof Error ? error.message : 'lỗi'})`);
      return [];
    }
  }

  /** `detector_version` của ván: ghim từ lần tra đầu; chưa có lần tính `done` thì chưa có thẻ. */
  private async detectorOf(matchId: string, version: number, now: number): Promise<number | null> {
    const pinned = this.pinned.get(matchId);
    if (pinned !== undefined) return pinned;
    let entry = this.latest.get(version);
    if (!entry || now - entry.at >= FB_CARDS_DETECTOR_TTL_MS) {
      const run = await this.repository.latestDoneRun(version);
      entry = { detector: run?.detectorVersion ?? null, at: now };
      this.latest.set(version, entry);
    }
    if (entry.detector === null) return null;
    if (this.pinned.size >= MAX_PINNED_MATCHES) {
      const oldest = this.pinned.keys().next().value;
      if (oldest !== undefined) this.pinned.delete(oldest);
    }
    this.pinned.set(matchId, entry.detector);
    return entry.detector;
  }
}
