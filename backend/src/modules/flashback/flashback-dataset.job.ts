/**
 * Tác vụ làm mới kho dữ liệu Flashback (IQX-Flashback-SPEC-DuLieu.md §2.1).
 *
 * Chạy hằng ngày nhưng gần như luôn là một phép kiểm tra rẻ: chỉ dựng kho mới khi
 * - chưa có phiên bản đang dùng, hoặc
 * - một kỳ cơ cấu định kỳ của VN100 (cộng `refresh_delay_days`) đã qua mà phiên bản đang dùng được
 *   tạo trước mốc đó.
 * Nhờ vậy chạy lại nhiều lần trong cùng một kỳ không tạo thêm phiên bản, và mỗi ngày chỉ thử lại
 * tối đa một lần nếu lần dựng trước thất bại.
 *
 * Nút "Làm mới kho" của quản trị đi qua cùng tác vụ này với `manual = true` (luôn dựng một phiên
 * bản mới, trừ khi đang có một lần dựng khác).
 */

import { Inject, Injectable } from '@nestjs/common';

import type { JobOutcome } from '../runtime/runtime.types.js';
import { vietnamDate } from './flashback.round-builder.js';
import {
  DATASET_STALE_BUILD_MS,
  FlashbackDatasetBuilder,
  type DatasetBuildResult,
} from './flashback-dataset.builder.js';
import { decideScheduledRefresh, readFlashbackDatasetConfig } from './flashback-dataset.config.js';
import {
  FLASHBACK_DATASET_REPOSITORY,
  FlashbackDatasetRepository,
} from './flashback-dataset.repository.js';

/** Tên job trong runtime. */
export const FLASHBACK_DATASET_JOB_NAME = 'flashback.dataset-refresh';

export interface DatasetJobOptions {
  /** `true`: do quản trị bấm nút (luôn dựng). `false`: tác vụ theo lịch (chỉ dựng khi tới hạn). */
  readonly manual: boolean;
  readonly requestedBy?: string | null;
  readonly now?: Date;
}

/** Id của job thủ công là `manual-<tên job>-<người yêu cầu>-<khung 30 giây>` (xem `JobsService.runNow`). */
export function requestedByFromJobId(jobId: string): string | null {
  const match = new RegExp(`^manual-${FLASHBACK_DATASET_JOB_NAME.replaceAll('.', '\\.')}-(.+)-\\d+$`).exec(
    jobId,
  );
  return match?.[1] && match[1] !== 'system' ? match[1] : null;
}

function outcomeOf(result: DatasetBuildResult): JobOutcome {
  if (result.status === 'already_running')
    return { status: 'skipped', reason: 'already-running', detail: { version: result.version } };
  // Lỗi đã được ghi vào phiên bản (failed), nhật ký và cảnh báo; không ném lỗi để BullMQ không tự
  // chạy lại ngay một lần dựng kho nặng.
  if (result.status === 'failed')
    return {
      status: 'completed',
      detail: {
        outcome: 'failed',
        version: result.version,
        reason: result.reason,
        ok: result.okCount,
        excluded: result.excludedCount,
        duration_ms: result.durationMs,
      },
    };
  return {
    status: 'completed',
    detail: {
      outcome: 'active',
      version: result.version,
      ok: result.okCount,
      excluded: result.excludedCount,
      duration_ms: result.durationMs,
    },
  };
}

@Injectable()
export class FlashbackDatasetJob {
  constructor(
    private readonly builder: FlashbackDatasetBuilder,
    @Inject(FLASHBACK_DATASET_REPOSITORY) private readonly repository: FlashbackDatasetRepository,
  ) {}

  async run(options: DatasetJobOptions): Promise<JobOutcome> {
    const now = options.now ?? new Date();
    const building = await this.repository.buildingVersion();
    if (building && now.getTime() - building.heartbeatAt.getTime() < DATASET_STALE_BUILD_MS)
      return { status: 'skipped', reason: 'already-running', detail: { version: building.version } };

    if (!options.manual) {
      const today = vietnamDate(now);
      const { config } = readFlashbackDatasetConfig(await this.repository.readConfig());
      const active = await this.repository.activeVersion();
      const decision = decideScheduledRefresh(
        today,
        active ? vietnamDate(active.createdAt) : null,
        config,
      );
      if (!decision.due)
        return {
          status: 'skipped',
          reason: 'up-to-date',
          detail: { version: active?.version ?? null, anchor: decision.anchor },
        };
      const failed = await this.repository.latestFailedVersion();
      if (failed && vietnamDate(failed.createdAt) === today)
        return {
          status: 'skipped',
          reason: 'retry-tomorrow',
          detail: { failed_version: failed.version, reason: decision.reason },
        };
    }

    return outcomeOf(
      await this.builder.build({
        trigger: options.manual ? 'manual' : 'scheduled',
        requestedBy: options.requestedBy ?? null,
        now,
      }),
    );
  }
}
