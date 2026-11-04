import { describe, expect, it, vi } from 'vitest';

import {
  DATASET_STALE_BUILD_MS,
  type DatasetBuildResult,
  type FlashbackDatasetBuilder,
} from '../../src/modules/flashback/flashback-dataset.builder.js';
import {
  FLASHBACK_DATASET_JOB_NAME,
  FlashbackDatasetJob,
  requestedByFromJobId,
} from '../../src/modules/flashback/flashback-dataset.job.js';
import { RUNTIME_JOB_NAMES } from '../../src/modules/runtime/runtime.types.js';
import { defaultRuntimeSchedules } from '../../src/modules/runtime/runtime.schedules.js';
import { healthySeries, weekdaysFrom } from './helpers/flashback-dataset-fixtures.js';
import { MemoryDatasetRepository } from './helpers/flashback-dataset-memory.js';

/** 10:00 giờ Việt Nam, 2026-11-04; mốc làm mới gần nhất theo quy tắc mặc định là 2026-08-10. */
const NOW = new Date('2026-11-04T03:00:00.000Z');
const at = (iso: string) => new Date(`${iso}T05:00:00.000Z`);

const activeResult: DatasetBuildResult = {
  status: 'active',
  version: 9,
  okCount: 97,
  excludedCount: 3,
  durationMs: 1_234,
  log: {} as never,
};

function setup(result: DatasetBuildResult = activeResult) {
  const repository = new MemoryDatasetRepository(() => NOW);
  const build = vi.fn(async () => result);
  const job = new FlashbackDatasetJob({ build } as unknown as FlashbackDatasetBuilder, repository);
  const seedActive = (createdAt: Date) =>
    repository.seedActive({ AAA: healthySeries(weekdaysFrom('2014-01-06', 400)) }, { createdAt });
  return { repository, build, job, seedActive };
}

describe('FlashbackDatasetJob · đăng ký trong runtime', () => {
  it('tên job nằm trong danh sách cho phép và có lịch chạy hằng ngày lúc 03:15 giờ Việt Nam', () => {
    expect(FLASHBACK_DATASET_JOB_NAME).toBe('flashback.dataset-refresh');
    expect(RUNTIME_JOB_NAMES).toContain('flashback.dataset-refresh');
    const schedule = defaultRuntimeSchedules().find((item) => item.name === 'flashback.dataset-refresh');
    expect(schedule).toMatchObject({ pattern: '0 15 3 * * *', tradingDay: false });
    expect(typeof schedule?.enabled).toBe('boolean');
  });
});

describe('requestedByFromJobId', () => {
  it('lấy id người yêu cầu từ id job thủ công của JobsService.runNow', () => {
    const uuid = '3f2a9c1e-5b7d-4e8a-9c01-0123456789ab';
    expect(requestedByFromJobId(`manual-flashback.dataset-refresh-${uuid}-58123456`)).toBe(uuid);
    expect(requestedByFromJobId('manual-flashback.dataset-refresh-adminexamplecom-1730000000')).toBe('adminexamplecom');
  });

  it('job theo lịch, người yêu cầu "system" hoặc job khác thì không có người yêu cầu', () => {
    expect(requestedByFromJobId('manual-flashback.dataset-refresh-system-1730000000')).toBeNull();
    expect(requestedByFromJobId('repeat:flashback.dataset-refresh:1730000000000')).toBeNull();
    expect(requestedByFromJobId('manual-reports.daily-admin-1730000000')).toBeNull();
  });
});

describe('FlashbackDatasetJob · chạy theo lịch (chỉ dựng khi tới hạn)', () => {
  it('chưa có phiên bản đang dùng: dựng ngay', async () => {
    const { job, build } = setup();
    const outcome = await job.run({ manual: false, now: NOW });
    expect(build).toHaveBeenCalledOnce();
    expect(build).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'scheduled', now: NOW }));
    expect(outcome).toEqual({
      status: 'completed',
      detail: { outcome: 'active', version: 9, ok: 97, excluded: 3, duration_ms: 1_234 },
    });
  });

  it('kho tạo sau mốc làm mới gần nhất: bỏ qua, không gọi bộ dựng (chạy lại trong cùng kỳ không tạo thêm phiên bản)', async () => {
    const { job, build, seedActive } = setup();
    seedActive(at('2026-08-11'));
    const outcome = await job.run({ manual: false, now: NOW });
    expect(outcome).toMatchObject({ status: 'skipped', reason: 'up-to-date', detail: { anchor: '2026-08-10' } });
    expect(build).not.toHaveBeenCalled();
    // Chạy lại nhiều lần vẫn thế.
    await job.run({ manual: false, now: new Date(NOW.getTime() + 86_400_000) });
    await job.run({ manual: false, now: new Date(NOW.getTime() + 2 * 86_400_000) });
    expect(build).not.toHaveBeenCalled();
  });

  it('kho tạo trước mốc làm mới đã qua: dựng phiên bản mới', async () => {
    const { job, build, seedActive } = setup();
    seedActive(at('2026-08-01'));
    const outcome = await job.run({ manual: false, now: NOW });
    expect(build).toHaveBeenCalledOnce();
    expect(outcome.status).toBe('completed');
  });

  it('chưa tới độ trễ sau kỳ cơ cấu: chưa dựng; tới mốc (03/08 + 7 ngày): dựng', async () => {
    const { job, build, seedActive } = setup();
    seedActive(at('2026-02-20'));
    expect(await job.run({ manual: false, now: at('2026-08-09') })).toMatchObject({
      status: 'skipped',
      reason: 'up-to-date',
    });
    expect(build).not.toHaveBeenCalled();
    await job.run({ manual: false, now: at('2026-08-10') });
    expect(build).toHaveBeenCalledOnce();
  });

  it('lần dựng trước đã thất bại trong hôm nay: chờ tới mai (mỗi ngày thử lại một lần)', async () => {
    const { job, build, seedActive, repository } = setup();
    seedActive(at('2026-08-01'));
    const failed = repository.seedFailed(at('2026-11-04'));
    const outcome = await job.run({ manual: false, now: NOW });
    expect(outcome).toMatchObject({
      status: 'skipped',
      reason: 'retry-tomorrow',
      detail: { failed_version: failed, reason: 'rebalance_passed' },
    });
    expect(build).not.toHaveBeenCalled();
    // Sang ngày mai thì thử lại.
    await job.run({ manual: false, now: at('2026-11-05') });
    expect(build).toHaveBeenCalledOnce();
  });

  it('lần dựng thất bại của hôm qua không chặn lần thử hôm nay', async () => {
    const { job, build, seedActive, repository } = setup();
    seedActive(at('2026-08-01'));
    repository.seedFailed(at('2026-11-03'));
    await job.run({ manual: false, now: NOW });
    expect(build).toHaveBeenCalledOnce();
  });

  it('dùng ngày VN để so ngày tạo: 23:30 UTC ngày 03/11 đã là 04/11 giờ Việt Nam', async () => {
    const { job, build, seedActive, repository } = setup();
    seedActive(at('2026-08-01'));
    repository.seedFailed(new Date('2026-11-03T23:30:00.000Z'));
    await job.run({ manual: false, now: NOW });
    expect(build).not.toHaveBeenCalled();
  });
});

describe('FlashbackDatasetJob · nút "Làm mới kho" (thủ công)', () => {
  it('luôn dựng một phiên bản mới dù kho còn mới và dù hôm nay đã có lần thất bại, kèm người yêu cầu', async () => {
    const { job, build, seedActive, repository } = setup();
    seedActive(at('2026-11-03'));
    repository.seedFailed(at('2026-11-04'));
    const outcome = await job.run({ manual: true, requestedBy: 'admin-1', now: NOW });
    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'manual', requestedBy: 'admin-1', now: NOW }),
    );
    expect(outcome.status).toBe('completed');
  });
});

describe('FlashbackDatasetJob · không chạy hai lần cùng lúc', () => {
  it.each([[true], [false]])('đang có lần dựng còn báo nhịp (manual = %s): bỏ qua, không gọi bộ dựng', async (manual) => {
    const { job, build, repository } = setup();
    const running = repository.seedBuilding(60_000);
    const outcome = await job.run({ manual, now: NOW });
    expect(outcome).toEqual({ status: 'skipped', reason: 'already-running', detail: { version: running } });
    expect(build).not.toHaveBeenCalled();
  });

  it('lần dựng đã mất nhịp quá 10 phút không chặn: bộ dựng được gọi để đánh dấu lỗi và dựng lại', async () => {
    const { job, build, repository } = setup();
    repository.seedBuilding(DATASET_STALE_BUILD_MS + 1_000);
    await job.run({ manual: true, now: NOW });
    expect(build).toHaveBeenCalledOnce();
  });

  it('bộ dựng báo already_running (hai tiến trình đua nhau) thì job ghi nhận là bỏ qua', async () => {
    const { job } = setup({ status: 'already_running', version: 4 });
    expect(await job.run({ manual: true, now: NOW })).toEqual({
      status: 'skipped',
      reason: 'already-running',
      detail: { version: 4 },
    });
  });
});

describe('FlashbackDatasetJob · kết quả của lần dựng thất bại', () => {
  it('không ném lỗi (BullMQ không chạy lại ngay): trả completed với outcome = failed và lý do', async () => {
    const { job } = setup({
      status: 'failed',
      version: 9,
      reason: 'Kho mới chỉ có 79 mã hợp lệ',
      okCount: 79,
      excludedCount: 21,
      durationMs: 900,
      log: {} as never,
    });
    expect(await job.run({ manual: true, now: NOW })).toEqual({
      status: 'completed',
      detail: {
        outcome: 'failed',
        version: 9,
        reason: 'Kho mới chỉ có 79 mã hợp lệ',
        ok: 79,
        excluded: 21,
        duration_ms: 900,
      },
    });
  });
});
