/**
 * Chọn dữ liệu cho một ván phòng chơi (spec v2 §5): ngẫu nhiên một mã trong rổ VN30 hiện hành và
 * một giai đoạn có đủ `phiên xem + phiên chơi` liên tục cộng 252 phiên khởi tạo chỉ báo.
 *
 * Dùng lại bộ dựng đề v1.2 (§4.2, §4.3 của BoSung: từ 2012, cách hiện tại ít nhất 12 tháng, liên
 * tục, có thanh khoản, đủ dao động, dữ liệu sạch, giá đã điều chỉnh) nhưng bỏ điều kiện "không
 * trùng giai đoạn với đề cũ" và không loại mã của các đề gần nhất. Rổ, lịch giao dịch và nến được
 * giữ trong bộ nhớ 6 giờ để nút Bắt đầu không phải tải lại lịch sử mỗi lần.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import { FLASHBACK_CONFIG_KEY, FLASHBACK_WARMUP_SESSIONS } from './flashback.constants.js';
import { FLASHBACK_REPOSITORY, FlashbackRepository } from './flashback.repository.js';
import {
  FlashbackCalendarUnavailableError,
  FlashbackRoundBuilder,
  readFlashbackConfig,
} from './flashback.round-builder.js';
import type { FbDatasetPort, FbMatchDataset } from './flashback-rooms.service.js';

/** Thời gian giữ rổ VN30, lịch và nến trong bộ nhớ. */
const DATASET_CACHE_MS = 6 * 3_600_000;

@Injectable()
export class FlashbackRoomDataset implements FbDatasetPort {
  private readonly logger = new Logger(FlashbackRoomDataset.name);

  constructor(
    private readonly database: DatabaseService,
    @Inject(FLASHBACK_REPOSITORY) private readonly repository: FlashbackRepository,
    private readonly builder: FlashbackRoundBuilder,
  ) {}

  async pick(now: Date, viewBars: number, playBars: number): Promise<FbMatchDataset | null> {
    const stored = await this.repository.getSetting(this.database, FLASHBACK_CONFIG_KEY);
    const config = {
      ...readFlashbackConfig(stored),
      warmupSessions: FLASHBACK_WARMUP_SESSIONS,
      historySessions: viewBars,
      playSessions: playBars,
    };
    // Mức 0 = nguyên luật; mức 1..3 nới thanh khoản/dao động theo thang §6.3 của v1.2.
    for (let level = 0; level <= 3; level += 1) {
      try {
        const built = await this.builder.build(now, level, config, {
          excludeRecentSymbols: false,
          avoidOverlap: false,
          cacheMs: DATASET_CACHE_MS,
        });
        if (built && built.bars.length === viewBars + playBars) {
          return {
            symbol: built.symbol,
            warmupBars: built.warmupBars,
            bars: built.bars,
            priceSource: built.priceSource,
            fallbackLevel: built.fallbackLevel,
          };
        }
      } catch (error) {
        this.logger.warn(
          `Flashback rooms: lỗi khi chọn dữ liệu mức ${level} (${
            error instanceof Error ? error.message : 'không rõ'
          })`,
        );
        if (error instanceof FlashbackCalendarUnavailableError) break;
      }
    }
    return null;
  }
}
