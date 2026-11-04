import { describe, expect, it, vi } from 'vitest';

import { DomainRuntimeJobs } from '../../src/platform/domain-runtime.module.js';

/** `DomainRuntimeJobs` với 10 phụ thuộc bắt buộc giả và tác vụ kho dữ liệu ở vị trí cuối cùng. */
function jobs(flashbackDataset?: { run: ReturnType<typeof vi.fn> }) {
  return new DomainRuntimeJobs(
    ...(Array.from({ length: 10 }, () => ({})) as [never, never, never, never, never, never, never, never, never, never]),
    undefined,
    undefined,
    undefined,
    undefined,
    flashbackDataset as never,
  );
}

const tick = (jobId: string) => ({
  jobId,
  name: 'flashback.dataset-refresh' as const,
  scheduledFor: new Date('2026-11-04T20:15:00.000Z'),
});

describe('flashback.dataset-refresh trong DomainRuntimeJobs', () => {
  it('tác vụ theo lịch chỉ dựng khi tới hạn (manual = false, không có người yêu cầu)', async () => {
    const run = vi.fn(async () => ({ status: 'skipped' as const, reason: 'up-to-date' }));
    const handler = jobs({ run }).handlers()['flashback.dataset-refresh']!;
    expect(await handler(tick('repeat:flashback.dataset-refresh:1730000000000'))).toEqual({
      status: 'skipped',
      reason: 'up-to-date',
    });
    expect(run).toHaveBeenCalledWith({ manual: false, requestedBy: null });
  });

  it('nút "Làm mới kho" (job manual-...) luôn dựng và mang theo id người bấm', async () => {
    const run = vi.fn(async () => ({ status: 'completed' as const }));
    const handler = jobs({ run }).handlers()['flashback.dataset-refresh']!;
    await handler(tick('manual-flashback.dataset-refresh-3f2a9c1e-5b7d-4e8a-9c01-0123456789ab-58123456'));
    expect(run).toHaveBeenCalledWith({
      manual: true,
      requestedBy: '3f2a9c1e-5b7d-4e8a-9c01-0123456789ab',
    });
  });

  it('thiếu FlashbackDatasetJob (module không nạp) thì bỏ qua thay vì ném lỗi', async () => {
    const handler = jobs().handlers()['flashback.dataset-refresh']!;
    expect(await handler(tick('repeat:flashback.dataset-refresh:1'))).toEqual({
      status: 'skipped',
      reason: 'flashback-dataset-unavailable',
    });
  });
});
