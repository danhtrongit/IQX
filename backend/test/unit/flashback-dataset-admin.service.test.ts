import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DATASET_STALE_BUILD_MS } from '../../src/modules/flashback/flashback-dataset.builder.js';
import {
  FlashbackDatasetAdminService,
  type DatasetJobsPort,
} from '../../src/modules/flashback/flashback-dataset-admin.service.js';
import type { FlashbackDatasetJob } from '../../src/modules/flashback/flashback-dataset.job.js';
import type { DatabaseService } from '../../src/platform/database/database.service.js';
import type { AuditContext } from '../../src/modules/users/audit.js';
import { healthySeries, weekdaysFrom } from './helpers/flashback-dataset-fixtures.js';
import { MemoryDatasetRepository } from './helpers/flashback-dataset-memory.js';

const NOW = new Date('2026-11-04T03:00:00.000Z');
const audit: AuditContext = {
  adminId: 'admin-1',
  actorRole: 'admin',
  ip: '10.0.0.1',
  userAgent: 'vitest',
  requestId: 'req-1',
};
const day = (iso: string) => new Date(`${iso}T05:00:00.000Z`);
const series = () => ({ AAA: healthySeries(weekdaysFrom('2014-01-06', 400)) });

function setup(options: { jobs?: { isEnabled(): boolean; runNow: ReturnType<typeof vi.fn> } } = {}) {
  const clock = { at: NOW };
  const repository = new MemoryDatasetRepository(() => clock.at);
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const tx = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return [];
    }),
  };
  const database = { transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) };
  const run = vi.fn(async () => ({ status: 'completed' as const }));
  const service = new FlashbackDatasetAdminService(
    database as unknown as DatabaseService,
    repository,
    { run } as unknown as FlashbackDatasetJob,
    options.jobs as unknown as DatasetJobsPort | undefined,
  );
  return { clock, repository, service, database, queries, run };
}

const codes = (warnings: Array<{ code: string }>) => warnings.map((warning) => warning.code);

describe('FlashbackDatasetAdminService.status', () => {
  it('chưa có kho: cảnh báo mức Cao "chưa có phiên bản đang dùng", lịch báo tới hạn, tham số là mặc định', async () => {
    const { service } = setup();
    const status = await service.status(NOW);
    expect(status.active).toBeNull();
    expect(status.building).toBeNull();
    expect(status.latest_failed).toBeNull();
    expect(status.warnings).toEqual([
      expect.objectContaining({ code: 'no_active_version', level: 'high' }),
    ]);
    expect(status.schedule).toEqual({ due: true, reason: 'no_active_version', anchor: null });
    expect(status.config).toEqual(status.config_defaults);
    expect(status.config).toMatchObject({ min_symbols: 80, warmup_sessions: 252, min_liquidity_vnd: 3_000_000_000 });
    expect(status.config_invalid).toEqual([]);
  });

  it('có kho đang dùng: thông tin phiên bản, số mã, ngày dữ liệu và không có cảnh báo khi đủ mã', async () => {
    const { service, repository } = setup();
    repository.config = { min_symbols: 1 };
    const version = repository.seedActive(series(), { createdAt: day('2026-10-01') });
    const status = await service.status(NOW);
    expect(status.active).toMatchObject({
      version,
      status: 'active',
      symbols_count: 1,
      excluded_count: 0,
      source: 'DNSE:x1000:adjusted',
      first_date: '2014-01-06',
      trigger: 'cli',
    });
    expect(status.warnings).toEqual([]);
    expect(status.schedule).toMatchObject({ due: false, reason: 'up_to_date', anchor: '2026-08-10' });
  });

  it('kho đang dùng ít hơn ngưỡng min_symbols hiện hành: cảnh báo too_few_symbols', async () => {
    const { service, repository } = setup();
    repository.seedActive(series(), { createdAt: day('2026-10-01') });
    const status = await service.status(NOW);
    expect(codes(status.warnings)).toEqual(['too_few_symbols']);
    expect(status.warnings[0]).toMatchObject({ level: 'high' });
    expect(status.warnings[0]!.message).toContain('1 mã');
    expect(status.warnings[0]!.message).toContain('80 mã');
  });

  it('làm mới thất bại (phiên bản lỗi mới hơn kho đang dùng): cảnh báo kèm lý do; lần lỗi cũ hơn kho đang dùng thì không', async () => {
    const { service, repository } = setup();
    repository.config = { min_symbols: 1 };
    repository.seedActive(series(), { createdAt: day('2026-08-20') });
    const failed = repository.seedFailed(day('2026-11-04'), 'Làm mới kho thất bại: VCI timeout');
    const status = await service.status(NOW);
    expect(codes(status.warnings)).toEqual(['refresh_failed']);
    expect(status.warnings[0]!.message).toContain(`phiên bản ${failed}`);
    expect(status.warnings[0]!.message).toContain('VCI timeout');
    expect(status.latest_failed).toMatchObject({ version: failed, status: 'failed' });

    // Kích hoạt một phiên bản mới hơn: lần lỗi cũ không còn là cảnh báo.
    repository.seedActive(series(), { createdAt: day('2026-11-04') });
    expect(codes((await service.status(NOW)).warnings)).toEqual([]);
  });

  it('phiên bản lỗi vì ít hơn 80 mã hợp lệ: cảnh báo too_few_symbols nêu đang giữ kho cũ', async () => {
    const { service, repository } = setup();
    repository.config = { min_symbols: 1 };
    repository.seedActive(series(), { createdAt: day('2026-08-20') });
    repository.config = null;
    repository.seedFailed(day('2026-11-04'), 'Kho mới chỉ có 79 mã hợp lệ', 79);
    const warning = (await service.status(NOW)).warnings.find((item) => item.code === 'too_few_symbols' && item.message.includes('79'));
    expect(warning).toMatchObject({ level: 'high' });
    expect(warning!.message).toContain('giữ kho cũ');
  });

  it('có ván không bắt đầu được vì không có điểm cắt trong 7 ngày qua: cảnh báo no_cut; cũ hơn 7 ngày thì không', async () => {
    const { service, repository, clock } = setup();
    repository.config = { min_symbols: 1 };
    repository.seedActive(series(), { createdAt: day('2026-10-01') });
    clock.at = new Date(NOW.getTime() - 8 * 86_400_000);
    await repository.appendAlert('high', 'no_cut', 'Không tìm được điểm cắt hợp lệ cho phòng 60/30');
    clock.at = NOW;
    expect(codes((await service.status(NOW)).warnings)).toEqual([]);

    clock.at = new Date(NOW.getTime() - 2 * 86_400_000);
    await repository.appendAlert('high', 'no_cut', 'Không tìm được điểm cắt hợp lệ cho phòng 120/120');
    clock.at = NOW;
    const status = await service.status(NOW);
    expect(codes(status.warnings)).toEqual(['no_cut']);
    expect(status.warnings[0]).toMatchObject({ level: 'high' });
    expect(status.warnings[0]!.message).toContain('120/120');
    expect(status.alerts.map((alert) => alert.code)).toContain('no_cut');
  });

  it('tham số lưu không hợp lệ được thay bằng mặc định và báo mức Trung bình', async () => {
    const { service, repository } = setup();
    repository.config = { min_symbols: 1, warmup_sessions: 5, price_sources: ['XYZ'] };
    repository.seedActive(series(), { createdAt: day('2026-10-01') });
    const status = await service.status(NOW);
    expect(status.config_invalid.sort()).toEqual(['price_sources', 'warmup_sessions']);
    expect(status.config).toMatchObject({ min_symbols: 1, warmup_sessions: 252, price_sources: ['DNSE', 'VCI'] });
    expect(status.warnings).toEqual([expect.objectContaining({ code: 'config_invalid', level: 'medium' })]);
  });

  it('đang dựng: hiện tiến độ và đánh dấu "stale" khi mất nhịp quá 10 phút', async () => {
    const live = setup();
    live.repository.seedBuilding(30_000);
    expect((await live.service.status(NOW)).building).toMatchObject({
      stale: false,
      trigger: 'manual',
      progress: { phase: 'symbols', total: 100, done: 10 },
    });

    const stale = setup();
    stale.repository.seedBuilding(DATASET_STALE_BUILD_MS + 1_000);
    expect((await stale.service.status(NOW)).building?.stale).toBe(true);
  });
});

describe('FlashbackDatasetAdminService.symbols và versions', () => {
  it('liệt kê mã của kho đang dùng kèm mã bị loại và lý do', async () => {
    const { service, repository } = setup();
    const version = repository.seedActive(series(), { createdAt: day('2026-10-01') });
    await repository.saveExcluded(version, {
      symbol: 'ZZZ',
      barsCount: 200,
      firstDate: '2025-01-02',
      lastDate: '2025-11-03',
      reason: 'Chưa đủ lịch sử (200/312 phiên)',
    });
    const result = await service.symbols();
    expect(result).toMatchObject({ version, status: 'active' });
    expect(result.symbols.map((row) => [row.symbol, row.status])).toEqual([
      ['AAA', 'ok'],
      ['ZZZ', 'excluded'],
    ]);
    expect(result.symbols[0]).toMatchObject({ bars_count: 400, price_source: 'DNSE:x1000:adjusted', value_basis: 'matched', bad_count: 0, reason: null });
    expect(result.symbols[1]).toMatchObject({ bars_count: 200, reason: 'Chưa đủ lịch sử (200/312 phiên)', price_source: null });
  });

  it('chưa có kho thì trả danh sách rỗng; không có bản đang dùng thì lấy phiên bản mới nhất', async () => {
    const empty = setup();
    expect(await empty.service.symbols()).toEqual({ version: null, status: null, symbols: [] });

    const failedOnly = setup();
    const failed = failedOnly.repository.seedFailed(day('2026-11-04'));
    await failedOnly.repository.saveExcluded(failed, { symbol: 'AAA', barsCount: 0, firstDate: null, lastDate: null, reason: 'Lỗi tải dữ liệu: timeout' });
    expect(await failedOnly.service.symbols()).toMatchObject({ version: failed, status: 'failed' });
  });

  it('xem một phiên bản cụ thể; phiên bản không có thì 404', async () => {
    const { service, repository } = setup();
    const first = repository.seedActive(series(), { createdAt: day('2026-08-20') });
    repository.seedActive(series(), { createdAt: day('2026-11-01') });
    expect(await service.symbols(first)).toMatchObject({ version: first, status: 'retired' });
    await expect(service.symbols(99)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.symbols(99)).rejects.toMatchObject({
      response: { code: 'DATASET_VERSION_NOT_FOUND' },
    });
  });

  it('lịch sử phiên bản: mới nhất trước, kèm nhật ký, số mã bị loại và thời gian chạy', async () => {
    const { service, repository } = setup();
    const first = repository.seedActive(series(), { createdAt: day('2026-02-10') });
    const failed = repository.seedFailed(day('2026-08-10'), 'lỗi A');
    repository.versionRows.get(first)!.log = {
      duration_ms: 61_000,
      excluded: [
        { symbol: 'X', reason: 'a' },
        { symbol: 'Y', reason: 'b' },
      ],
    };
    const versions = await service.versions();
    expect(versions.map((item) => [item.version, item.status])).toEqual([
      [failed, 'failed'],
      [first, 'active'],
    ]);
    const old = versions.find((item) => item.version === first)!;
    expect(old).toMatchObject({ duration_ms: 61_000, excluded_count: 2 });
    expect(old.log).toMatchObject({ excluded: [{ symbol: 'X' }, { symbol: 'Y' }] });
    expect(versions.find((item) => item.version === failed)!.log).toMatchObject({ error: 'lỗi A' });
  });
});

describe('FlashbackDatasetAdminService.refresh ("Làm mới kho")', () => {
  it('đang có một lần làm mới còn báo nhịp: từ chối 409, không ghi nhật ký kiểm tra, không chạy', async () => {
    const { service, repository, database, run } = setup();
    const running = repository.seedBuilding(60_000);
    const failure = await service.refresh(audit, NOW).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConflictException);
    expect((failure as ConflictException).getResponse()).toMatchObject({ code: 'DATASET_REFRESH_RUNNING' });
    expect(JSON.stringify((failure as ConflictException).getResponse())).toContain(`phiên bản ${running}`);
    expect(database.transaction).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('lần dựng đã mất nhịp quá 10 phút không chặn nút làm mới', async () => {
    const { service, repository, run } = setup();
    repository.seedBuilding(DATASET_STALE_BUILD_MS + 1_000);
    await expect(service.refresh(audit, NOW)).resolves.toMatchObject({ accepted: true, mode: 'inline' });
    expect(run).toHaveBeenCalledOnce();
  });

  it('có hàng đợi: ghi nhật ký kiểm tra rồi đưa tác vụ vào hàng đợi với người bấm', async () => {
    const runNow = vi.fn(async () => ({ jobId: 'manual-flashback.dataset-refresh-admin-1-123', state: 'queued' }));
    const { service, queries, run } = setup({ jobs: { isEnabled: () => true, runNow } });
    const result = await service.refresh(audit, NOW);
    expect(result).toEqual({ accepted: true, mode: 'queued', job_id: 'manual-flashback.dataset-refresh-admin-1-123' });
    expect(runNow).toHaveBeenCalledWith('flashback.dataset-refresh', 'admin-1');
    expect(run).not.toHaveBeenCalled();
    expect(queries).toHaveLength(1);
    expect(queries[0]!.sql).toContain('admin_audit_log');
    expect(queries[0]!.params).toEqual(
      expect.arrayContaining(['admin-1', 'flashback.dataset_refresh', 'fb_dataset_versions', 'req-1']),
    );
  });

  it('không có hàng đợi (hoặc hàng đợi tắt): chạy ngay trong tiến trình API ở nền, không chờ kết quả', async () => {
    for (const jobs of [undefined, { isEnabled: () => false, runNow: vi.fn() }]) {
      const { service, run } = setup({ jobs });
      const result = await service.refresh(audit, NOW);
      expect(result).toEqual({ accepted: true, mode: 'inline', job_id: null });
      expect(run).toHaveBeenCalledWith({ manual: true, requestedBy: 'admin-1', now: NOW });
      if (jobs) expect(jobs.runNow).not.toHaveBeenCalled();
    }
  });

  it('tác vụ chạy nền lỗi không làm hỏng phản hồi của nút bấm', async () => {
    const { service, run } = setup();
    run.mockRejectedValueOnce(new Error('boom'));
    await expect(service.refresh(audit, NOW)).resolves.toMatchObject({ accepted: true });
    await new Promise((resolve) => setImmediate(resolve));
  });
});

describe('FlashbackDatasetAdminService.updateConfig', () => {
  it('chỉ đổi các khoá được gửi, giữ khoá đã lưu, ghi flashback_settings và nhật ký kiểm tra trong một transaction', async () => {
    const { service, repository, queries, database } = setup();
    repository.config = { min_symbols: 60 };
    const result = await service.updateConfig({ min_liquidity_vnd: 2_000_000_000 }, audit);
    expect(result.config).toMatchObject({ min_symbols: 60, min_liquidity_vnd: 2_000_000_000, warmup_sessions: 252 });
    expect(result.config_invalid).toEqual([]);
    expect(database.transaction).toHaveBeenCalledOnce();
    expect(queries).toHaveLength(2);
    expect(queries[0]!.sql).toContain('flashback_settings');
    expect(JSON.parse(queries[0]!.params[0] as string)).toMatchObject({
      min_symbols: 60,
      min_liquidity_vnd: 2_000_000_000,
    });
    expect(queries[1]!.sql).toContain('admin_audit_log');
    expect(queries[1]!.params).toEqual(
      expect.arrayContaining(['admin-1', 'flashback.dataset_config', 'flashback_settings', 'dataset']),
    );
    const before = JSON.parse(queries[1]!.params[5] as string) as Record<string, unknown>;
    const after = JSON.parse(queries[1]!.params[6] as string) as Record<string, unknown>;
    expect(before.min_liquidity_vnd).toBe(3_000_000_000);
    expect(after.min_liquidity_vnd).toBe(2_000_000_000);
  });

  it('khoá chưa lưu lấy mặc định; đổi thứ tự nguồn giá được lưu đúng', async () => {
    const { service, queries } = setup();
    const result = await service.updateConfig({ price_sources: ['VCI', 'DNSE'], rebalance_dates: ['2026-09-14'] }, audit);
    expect(result.config.price_sources).toEqual(['VCI', 'DNSE']);
    expect(result.config.rebalance_dates).toEqual(['2026-09-14']);
    expect(JSON.parse(queries[0]!.params[0] as string)).toMatchObject({
      price_sources: ['VCI', 'DNSE'],
      min_symbols: 80,
    });
  });
});
