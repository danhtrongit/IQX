/**
 * Tác vụ định kỳ của phòng chơi (spec v2 §7, §10.2; DESIGN #3): chốt các ván đã hết giờ (kể cả
 * khi không còn ai mở màn chơi), đóng phòng chờ quá 30 phút và phòng đã có kết quả mà không ai
 * chơi lại sau 30 phút. Mọi bước idempotent: chốt ván khoá dòng ván và dùng khoá ledger, đóng
 * phòng kiểm tra lại điều kiện dưới khoá dòng phòng.
 */

import { Injectable } from '@nestjs/common';

import type { JobOutcome } from '../runtime/runtime.types.js';
import { FlashbackRoomsService } from './flashback-rooms.service.js';

/** Tên job trong runtime. */
export const FLASHBACK_ROOMS_JOB_NAME = 'flashback.rooms-sweep';

@Injectable()
export class FlashbackRoomsJob {
  constructor(private readonly rooms: FlashbackRoomsService) {}

  async run(now?: Date): Promise<JobOutcome> {
    const detail = await this.rooms.sweep(now);
    return { status: 'completed', detail };
  }
}
