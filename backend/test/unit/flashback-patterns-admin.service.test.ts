import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { CD_CARDS } from '../../src/modules/candle-dojo/shared/cards.js';
import { CANDLE_DETECTOR_VERSION } from '../../src/modules/candle-dojo/shared/detector.js';
import {
  FlashbackPatternsAdminService,
} from '../../src/modules/flashback/flashback-patterns-admin.service.js';
import {
  PATTERN_STALE_RUN_MS,
  type FlashbackPatternsCompute,
} from '../../src/modules/flashback/flashback-patterns.compute.js';
import type { PatternRow } from '../../src/modules/flashback/flashback-patterns.repository.js';
import type { FlashbackRoomCards } from '../../src/modules/flashback/flashback-rooms.cards.js';
import type { DatabaseService } from '../../src/platform/database/database.service.js';
import type { AuditContext } from '../../src/modules/users/audit.js';
import { healthySeries, weekdaysFrom } from './helpers/flashback-dataset-fixtures.js';
import { MemoryDatasetRepository } from './helpers/flashback-dataset-memory.js';
import { MemoryPatternsRepository } from './helpers/flashback-patterns-memory.js';

const NOW = new Date('2026-11-04T03:00:00.000Z');
const audit: AuditContext = {
  adminId: 'admin-1',
  actorRole: 'admin',
  ip: '10.0.0.1',
  userAgent: 'vitest',
  requestId: 'req-1',
};

function setup() {
  const datasets = new MemoryDatasetRepository(() => NOW);
  const patterns = new MemoryPatternsRepository(datasets, () => NOW);
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const tx = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return [];
    }),
  };
  const database = { transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) };
  let finish: (value: unknown) => void = () => undefined;
  const run = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const invalidate = vi.fn();
  const service = new FlashbackPatternsAdminService(
    database as unknown as DatabaseService,
    datasets,
    patterns,
    { run } as unknown as FlashbackPatternsCompute,
    { invalidate } as unknown as FlashbackRoomCards,
  );
  const activate = () =>
    datasets.seedActive({ AAA: healthySeries(weekdaysFrom('2014-01-06', 400)) }, { createdAt: NOW });
  return { datasets, patterns, service, run, invalidate, queries, database, activate, finish: (v: unknown) => finish(v) };
}

const row = (idx: number, date: string, cardId: string, tier: number, cardN = 1): PatternRow => ({
  idx,
  date,
  cardId,
  cardN,
  tier,
});

const codes = (warnings: Array<{ code: string }>) => warnings.map((warning) => warning.code);

describe('FlashbackPatternsAdminService.status', () => {
  it('chưa có kho: không có lần chạy, không cảnh báo (cảnh báo kho do mục kho báo)', async () => {
    const { service } = setup();
    expect(await service.status(NOW)).toEqual({
      version: null,
      detector_version: CANDLE_DETECTOR_VERSION,
      running: null,
      latest: null,
      used: null,
      outdated: false,
      raw: { symbols: 0, sessions: 0 },
      warnings: [],
    });
  });

  it('kho đang dùng nhưng chưa tính mẫu lần nào: cảnh báo vừa, nút tính lại, ván vẫn chơi bình thường', async () => {
    const { service, activate } = setup();
    const version = activate();
    const status = await service.status(NOW);
    expect(status).toMatchObject({ version, running: null, latest: null, used: null, outdated: true });
    expect(codes(status.warnings)).toEqual(['pattern_missing']);
    expect(status.warnings[0]).toMatchObject({ level: 'medium' });
  });

  it('có lần done mới nhất: số mã, số mẫu, mã lỗi, thời gian; không cảnh báo khi sạch', async () => {
    const { service, activate, patterns } = setup();
    const version = activate();
    patterns.rawRows.set(`${version}:AAA`, {
      exchange: 'HOSE',
      rows: [{ idx: 1, open: 1, high: 1, low: 1, close: 1, ref: 1 }],
    });
    patterns.seedRun({
      version,
      detectorVersion: CANDLE_DETECTOR_VERSION,
      trigger: 'backfill',
      requestedBy: 'cli',
      symbolsDone: 1,
      symbolsTotal: 1,
      patternsCount: 25,
      startedAt: new Date(NOW.getTime() - 40_000),
      finishedAt: NOW,
      log: { failed: [], raw: { source: 'x', symbols_with_raw: 1, symbols_without_raw: 0, errors: [], reused: [] }, missing_raw_sessions: 0 },
    });
    const status = await service.status(NOW);
    expect(status.warnings).toEqual([]);
    expect(status.outdated).toBe(false);
    expect(status.raw).toEqual({ symbols: 1, sessions: 1 });
    expect(status.used).toMatchObject({
      status: 'done',
      detector_version: CANDLE_DETECTOR_VERSION,
      trigger: 'backfill',
      requested_by: 'cli',
      symbols_done: 1,
      symbols_total: 1,
      patterns_count: 25,
      failed_count: 0,
      duration_ms: 40_000,
    });
    expect(status.latest).toEqual(status.used);
  });

  it('mã lỗi và thiếu giá gốc: hai cảnh báo vừa kèm số mã, số phiên', async () => {
    const { service, activate, patterns } = setup();
    const version = activate();
    patterns.rawRows.set(`${version}:AAA`, {
      exchange: 'HOSE',
      rows: [{ idx: 1, open: 1, high: 1, low: 1, close: 1, ref: 1 }],
    });
    patterns.seedRun({
      version,
      detectorVersion: CANDLE_DETECTOR_VERSION,
      log: {
        failed: [{ symbol: 'BBB', reason: 'x' }],
        raw: { source: 'x', symbols_with_raw: 1, symbols_without_raw: 2, errors: [], reused: [] },
        missing_raw_sessions: 1_500,
      },
    });
    const status = await service.status(NOW);
    expect(codes(status.warnings)).toEqual(['pattern_symbols_failed', 'pattern_raw_missing']);
    expect(status.warnings[0]!.message).toContain('1 mã tính mẫu lỗi');
    expect(status.warnings[0]!.message).toContain('BBB');
    expect(status.warnings[1]).toMatchObject({ level: 'medium' });
    expect(status.warnings[1]!.message).toContain('2 mã và 1500 phiên');
  });

  it('không có giá gốc của mã nào: cảnh báo Cao, 4 thẻ Việt Nam không hiện trong Flashback', async () => {
    const { service, activate, patterns } = setup();
    const version = activate();
    patterns.seedRun({
      version,
      detectorVersion: CANDLE_DETECTOR_VERSION,
      log: { raw: { source: 'x', symbols_with_raw: 0, symbols_without_raw: 100, errors: [], reused: [] } },
    });
    const status = await service.status(NOW);
    expect(status.warnings).toEqual([
      expect.objectContaining({ code: 'pattern_raw_missing', level: 'high' }),
    ]);
    expect(status.warnings[0]!.message).toContain('4 thẻ Việt Nam');
  });

  it('lần chạy mới nhất thất bại sau lần done: cảnh báo Cao với lý do, lần done vẫn là lần đang dùng', async () => {
    const { service, activate, patterns } = setup();
    const version = activate();
    const done = patterns.seedRun({ version, detectorVersion: CANDLE_DETECTOR_VERSION });
    patterns.seedRun({
      version,
      status: 'failed',
      detectorVersion: CANDLE_DETECTOR_VERSION,
      log: { error: 'Không tính được mẫu nến cho mã nào (100 mã lỗi)' },
    });
    const status = await service.status(NOW);
    expect(status.used!.id).toBe(done.id);
    expect(status.latest!.status).toBe('failed');
    expect(status.warnings).toEqual([
      expect.objectContaining({ code: 'pattern_failed', level: 'high' }),
    ]);
    expect(status.warnings[0]!.message).toContain('100 mã lỗi');
  });

  it('bộ nhận diện của lần đang dùng khác mã nguồn: cảnh báo cần tính lại', async () => {
    const { service, activate, patterns } = setup();
    const version = activate();
    patterns.seedRun({ version, detectorVersion: CANDLE_DETECTOR_VERSION - 1 });
    const status = await service.status(NOW);
    expect(status.outdated).toBe(true);
    expect(codes(status.warnings)).toEqual(['pattern_detector_outdated']);
  });

  it('đang chạy (nhịp còn mới) khoá nút; nhịp quá hạn thì không còn tính là đang chạy', async () => {
    const { service, activate, patterns } = setup();
    const version = activate();
    patterns.seedRun({ version, status: 'running', finishedAt: null, heartbeatAt: NOW, symbolsDone: 10, symbolsTotal: 100 });
    expect((await service.status(NOW)).running).toMatchObject({ status: 'running', symbols_done: 10, symbols_total: 100 });
    const later = new Date(NOW.getTime() + PATTERN_STALE_RUN_MS + 1_000);
    expect((await service.status(later)).running).toBeNull();
  });
});

describe('FlashbackPatternsAdminService.lookup (v1.3 §6)', () => {
  function seeded() {
    const t = setup();
    const version = t.activate();
    t.patterns.seedRun({ version, detectorVersion: 1 });
    const add = (symbol: string, detector: number, ...rows: PatternRow[]) =>
      rows.forEach((item) => t.patterns.seedPattern(version, symbol, detector, item));
    add(
      'HPG',
      1,
      row(300, '2025-02-28', 'doji', 1),
      row(301, '2025-03-03', 'doji', 1),
      row(310, '2025-03-17', 'doji', 1),
      row(320, '2025-04-02', 'bua', 1),
      row(330, '2025-05-02', 'nhan_chim_tang', 2, 2),
      row(340, '2025-06-30', 'nhan_chim_tang', 2, 2),
      row(350, '2025-07-01', 'doji', 1),
    );
    add('FPT', 1, row(300, '2025-03-05', 'doji', 1), row(301, '2025-03-06', 'ba_pp_tang', 5, 5));
    add('HPG', 2, row(300, '2025-03-05', 'bua', 1)); // bộ nhận diện khác: không được tính
    return { ...t, version };
  }

  it('một mã trong khoảng ngày (gồm hai đầu): số lần từng thẻ, nhóm theo bậc, có tổng', async () => {
    const { service, version } = seeded();
    const result = await service.lookup({ symbol: 'HPG', from: '2025-03-01', to: '2025-06-30' });
    expect(result).toEqual({
      version,
      detector_version: 1,
      symbol: 'HPG',
      from: '2025-03-01',
      to: '2025-06-30',
      rows: [
        { card_id: 'doji', name: expect.any(String), tier: 1, count: 2 },
        { card_id: 'bua', name: expect.any(String), tier: 1, count: 1 },
        { card_id: 'nhan_chim_tang', name: expect.any(String), tier: 2, count: 2 },
      ],
      tiers: [
        { tier: 1, total: 3 },
        { tier: 2, total: 2 },
      ],
      total: 5,
    });
    expect(result.rows[0]!.name).not.toBe('doji');
  });

  it('"Tất cả mã" (bỏ trống hoặc all), chữ thường được chuẩn hoá', async () => {
    const { service } = seeded();
    const all = await service.lookup({ from: '2025-03-01', to: '2025-06-30' });
    expect(all.symbol).toBeNull();
    expect(all.rows.find((item) => item.card_id === 'doji')!.count).toBe(3);
    expect(all.total).toBe(7);
    expect((await service.lookup({ symbol: 'ALL', from: '2025-03-01', to: '2025-06-30' })).total).toBe(7);
    expect((await service.lookup({ symbol: 'hpg', from: '2025-03-01', to: '2025-06-30' })).total).toBe(5);
  });

  it('chưa có lần tính done: bảng trống, không có bộ nhận diện', async () => {
    const t = setup();
    t.activate();
    const result = await t.service.lookup({ symbol: 'HPG', from: '2025-03-01', to: '2025-06-30' });
    expect(result).toMatchObject({ detector_version: null, rows: [], tiers: [], total: 0 });
  });

  it('mã không có hoặc khoảng ngày không có mẫu: tổng 0', async () => {
    const { service } = seeded();
    expect((await service.lookup({ symbol: 'XXX', from: '2025-03-01', to: '2025-06-30' })).total).toBe(0);
    expect((await service.lookup({ symbol: 'HPG', from: '2030-01-01', to: '2030-12-31' })).total).toBe(0);
  });

  it('ngày sai, đảo ngược hoặc phiên bản kho không có bị từ chối', async () => {
    const { service } = seeded();
    await expect(service.lookup({ from: '2025-02-30', to: '2025-06-30' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.lookup({ from: '2025/03/01', to: '2025-06-30' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.lookup({ from: '2025-07-01', to: '2025-06-30' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.lookup({ from: '2025-01-01', to: '2025-06-30', version: 99 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('FlashbackPatternsAdminService.overview (v1.3 §7)', () => {
  it('liệt kê đủ 47 thẻ theo danh mục kèm số lần; thẻ 0 lần được đánh dấu, thẻ Việt Nam có cờ vn', async () => {
    const t = setup();
    const version = t.activate();
    t.patterns.seedRun({ version, detectorVersion: 1 });
    for (const item of [row(300, '2025-03-05', 'doji', 1), row(301, '2025-03-06', 'doji', 1), row(302, '2025-03-07', 'bua', 1)])
      t.patterns.seedPattern(version, 'HPG', 1, item);
    const overview = await t.service.overview();
    expect(overview.cards).toHaveLength(47);
    expect(overview.cards.map((card) => card.card_id)).toEqual(CD_CARDS.map((card) => card.id));
    expect(overview).toMatchObject({ version, detector_version: 1, total: 3, zero_count: 45 });
    expect(overview.cards.find((card) => card.card_id === 'doji')).toMatchObject({ count: 2, zero: false });
    expect(overview.cards.find((card) => card.card_id === 'tran_trang')).toMatchObject({ count: 0, zero: true, vn: true });
    expect(overview.cards.filter((card) => card.vn)).toHaveLength(4);
  });

  it('chưa tính mẫu: cả 47 thẻ đều 0 lần', async () => {
    const t = setup();
    t.activate();
    const overview = await t.service.overview();
    expect(overview).toMatchObject({ detector_version: null, total: 0, zero_count: 47 });
  });

  it('chưa có kho: danh sách rỗng số liệu, vẫn trả danh mục', async () => {
    const overview = await setup().service.overview();
    expect(overview).toMatchObject({ version: null, detector_version: null, total: 0, zero_count: 47 });
  });
});

describe('FlashbackPatternsAdminService.recompute (v1.3 §4, §7)', () => {
  it('chưa có kho đang dùng: 409', async () => {
    const { service } = setup();
    await expect(service.recompute(audit, NOW)).rejects.toBeInstanceOf(ConflictException);
  });

  it('đang có lần chạy (nhịp còn mới): 409, không chạy thêm, không ghi kiểm toán', async () => {
    const { service, activate, patterns, run, queries } = setup();
    const version = activate();
    patterns.seedRun({ version, status: 'running', finishedAt: null, heartbeatAt: NOW });
    const error = await service.recompute(audit, NOW).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'PATTERN_RUN_RUNNING' });
    expect(run).not.toHaveBeenCalled();
    expect(queries).toEqual([]);
  });

  it('lần chạy treo (mất nhịp quá hạn) không chặn nút', async () => {
    const { service, activate, patterns, run } = setup();
    const version = activate();
    patterns.seedRun({
      version,
      status: 'running',
      finishedAt: null,
      heartbeatAt: new Date(NOW.getTime() - PATTERN_STALE_RUN_MS - 1),
    });
    await expect(service.recompute(audit, NOW)).resolves.toMatchObject({ accepted: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('chạy bù lần đầu: ghi kiểm toán, chạy nền trên kho đang dùng, trả ngay; xong thì làm mới bộ nhớ của ván', async () => {
    const { service, activate, run, queries, invalidate, finish } = setup();
    const version = activate();
    const result = await service.recompute(audit, NOW);
    expect(result).toEqual({
      accepted: true,
      mode: 'inline',
      version,
      detector_version: CANDLE_DETECTOR_VERSION,
    });
    expect(run).toHaveBeenCalledWith({ version, trigger: 'admin', requestedBy: 'admin-1', now: NOW });
    expect(queries).toHaveLength(1);
    expect(queries[0]!.sql).toContain('admin_audit_log');
    expect(queries[0]!.params).toContain('flashback.pattern_recompute');
    expect(queries[0]!.params).toContain(String(version));
    // Trả lời xong trước khi việc nền kết thúc.
    expect(invalidate).not.toHaveBeenCalled();
    finish({ status: 'done' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('bộ nhận diện của lần đang dùng khác mã nguồn: ghi nhận là chạy lại do đổi bộ nhận diện', async () => {
    const { service, activate, patterns, run } = setup();
    const version = activate();
    patterns.seedRun({ version, detectorVersion: CANDLE_DETECTOR_VERSION - 1 });
    await service.recompute(audit, NOW);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ version, trigger: 'detector' }));
  });

  it('việc nền lỗi không làm hỏng phản hồi đã trả (chỉ ghi log)', async () => {
    const { service, activate, run, invalidate } = setup();
    activate();
    run.mockReturnValueOnce(Promise.reject(new Error('boom')) as never);
    await expect(service.recompute(audit, NOW)).resolves.toMatchObject({ accepted: true });
    await new Promise((resolve) => setImmediate(resolve));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
