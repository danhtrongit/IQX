import { Injectable, Logger } from '@nestjs/common';

import type { JobOutcome } from '../runtime/runtime.types.js';
import { BulletinDataService } from './bulletin-data.service.js';
import { BulletinTrackingService } from './bulletin-tracking.service.js';
import { MarketBulletinsService } from './bulletins.service.js';

/** Tên job trong runtime. */
export const MARKET_BULLETIN_JOB_NAME = 'market.bulletin-draft';

/**
 * Job mỗi phiên (spec §2 bước 1, §5.3, §5.4): khi dữ liệu phiên chốt thì tạo bản nháp và điền số liệu VN-Index, độ
 * rộng, giá trị giao dịch; áp quy tắc theo dõi (20 phiên, dừng lỗ 7%); xoá bản tin quá 6 tháng. Mọi bước idempotent
 * nên chạy dày (5 phút) vẫn rẻ và tự phục hồi sau khi worker khởi động lại.
 */
@Injectable()
export class MarketBulletinsJob {
  private readonly logger = new Logger(MarketBulletinsJob.name);

  constructor(
    private readonly data: BulletinDataService,
    private readonly tracking: BulletinTrackingService,
    private readonly bulletins: MarketBulletinsService,
  ) {}

  async run(now = new Date()): Promise<JobOutcome> {
    const data = await this.data.ensureDraftAndData(now);
    // Theo dõi và dọn hạn lưu không phụ thuộc việc có phiên mới hay chưa.
    const tracking = await this.tracking.evaluate();
    const expired = await this.bulletins.sweepExpired(now);
    if (expired.length) this.logger.log(`Expired bulletins removed: ${expired.join(', ')}`);
    if (
      data.status === 'skipped' &&
      tracking.exited === 0 &&
      tracking.repriced === 0 &&
      !expired.length
    )
      return { status: 'skipped', reason: data.reason, detail: { ...data } };
    return {
      status: 'completed',
      detail: { data: { ...data }, tracking: { ...tracking }, expired: expired.length },
    };
  }
}
