/**
 * Tác vụ định kỳ chấm điểm nghi lễ Thần Tài (contract: `trading-floor.ritual-score`, mỗi 5 phút).
 * Idempotent: chỉ chấm các phiên đã sau 15:00 mà đã có thanh VNINDEX của ngày đó (kể cả phiên cũ bị lỡ);
 * phiên chưa có dữ liệu để lại cho lần chạy sau. Chạy ở worker nên không phát được WebSocket; màn
 * hình web tự nạp lại bảng xếp hạng khi cần.
 */

import { Injectable } from '@nestjs/common';

import type { JobOutcome } from '../runtime/runtime.types.js';
import { FloorRitualService } from './floor-ritual.service.js';

/** Tên job trong runtime. */
export const FLOOR_RITUAL_JOB_NAME = 'trading-floor.ritual-score';

@Injectable()
export class FloorRitualJob {
  constructor(private readonly ritual: FloorRitualService) {}

  async run(now?: Date): Promise<JobOutcome> {
    const outcome = await this.ritual.scorePending(now);
    return {
      status: 'completed',
      detail: {
        scored: outcome.scored.map((item) => ({
          session: item.session,
          rituals: item.rituals,
          close: item.close,
          change: item.change,
          source: item.source,
        })),
        waiting: outcome.waiting,
      },
    };
  }
}
