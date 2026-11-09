import { describe, expect, it, vi } from 'vitest';

import { CANDLE_DETECTOR_VERSION } from '../../src/modules/candle-dojo/shared/detector.js';
import { FlashbackDatasetBuilder } from '../../src/modules/flashback/flashback-dataset.builder.js';
import type { DatasetRawRow } from '../../src/modules/flashback/flashback-dataset.logic.js';
import type { DatasetRawPrice } from '../../src/modules/flashback/flashback-dataset.source.js';
import {
  FlashbackPatternsCompute,
  type FlashbackPatternStepPort,
  type PatternRunResult,
} from '../../src/modules/flashback/flashback-patterns.compute.js';
import { weekdaysEndingOn } from './helpers/flashback-dataset-fixtures.js';
import { FakeDatasetSource, MemoryDatasetRepository } from './helpers/flashback-dataset-memory.js';
import { MemoryPatternsRepository } from './helpers/flashback-patterns-memory.js';

const NOW = new Date('2026-11-04T03:00:00.000Z');
const CALENDAR = weekdaysEndingOn('2026-11-03', 1_200);
const names = (count: number) => Array.from({ length: count }, (_, i) => `S${String(i).padStart(3, '0')}`);

/** Nến nguồn xen kẽ 20.000đ/20.400đ như các test bộ dựng khác, kèm giá gốc cùng giá. */
function rowsOf(dates: readonly string[]): DatasetRawRow[] {
  return dates.map((date, index) => {
    const close = index % 2 === 0 ? 20_000 : 20_400;
    return { date, open: close, high: close, low: close, close, volume: 600_000 };
  });
}

function setup(options: { count?: number; step?: FlashbackPatternStepPort | 'none' } = {}) {
  const count = options.count ?? 100;
  const repository = new MemoryDatasetRepository(() => NOW);
  const patterns = new MemoryPatternsRepository(repository, () => NOW);
  const source = new FakeDatasetSource();
  source.calendarDates = CALENDAR;
  source.basketSymbols = names(count);
  const rawCalls: Array<{ symbol: string; beforeDate: string }> = [];
  source.basketSymbols.forEach((symbol) => source.histories.set(symbol, rowsOf(CALENDAR.slice(-900))));
  source.rawPrices = async (symbol, beforeDate) => {
    rawCalls.push({ symbol, beforeDate });
    const prices = new Map<string, DatasetRawPrice>();
    rowsOf(CALENDAR.slice(-900)).forEach((row, index, all) => {
      prices.set(row.date, {
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        ref: index === 0 ? row.close : all[index - 1]!.close,
      });
    });
    return prices;
  };
  const alerts = { send: vi.fn(async () => undefined) };
  const compute = new FlashbackPatternsCompute(patterns, source);
  const step = options.step === 'none' ? undefined : (options.step ?? compute);
  const builder = new FlashbackDatasetBuilder(repository, source, alerts, step);
  const build = (over: Parameters<FlashbackDatasetBuilder['build']>[0] = { trigger: 'manual' }) =>
    builder.build({ now: NOW, ...over });
  return { repository, patterns, source, alerts, build, rawCalls };
}

describe('FlashbackDatasetBuilder · bước 2b "Tính mẫu nến" (Candle Dojo v1.3 §4)', () => {
  it('chạy sau bước 2 và TRƯỚC khi kích hoạt: lúc activate đã có lần chạy done, giá gốc và nhật ký trong log kho', async () => {
    const { repository, patterns, build, rawCalls } = setup();
    let atActivation: { runs: string[]; rawSymbols: number } | null = null;
    const activate = repository.activate.bind(repository);
    vi.spyOn(repository, 'activate').mockImplementation(async (version, input) => {
      atActivation = {
        runs: patterns.runs.map((run) => `${run.version}:${run.status}`),
        rawSymbols: [...patterns.rawRows.keys()].filter((k) => k.startsWith(`${version}:`)).length,
      };
      await activate(version, input);
    });

    const result = await build({ trigger: 'cli', requestedBy: 'admin-1' });
    expect(result.status).toBe('active');
    if (result.status !== 'active') return;
    expect(atActivation).toEqual({ runs: ['1:done'], rawSymbols: 100 });
    expect(patterns.runs[0]).toMatchObject({
      trigger: 'build',
      requestedBy: 'admin-1',
      detectorVersion: CANDLE_DETECTOR_VERSION,
      symbolsDone: 100,
      symbolsTotal: 100,
    });
    expect(result.log.patterns).toEqual({
      run_id: 1,
      detector_version: CANDLE_DETECTOR_VERSION,
      symbols_done: 100,
      symbols_total: 100,
      patterns_count: patterns.runs[0]!.patternsCount,
      failed_symbols: 0,
      missing_raw_sessions: 0,
    });
    // Giá gốc lấy theo ngày hôm nay của lần dựng (không gồm phiên chưa chốt).
    expect(rawCalls).toHaveLength(100);
    expect(rawCalls[0]!.beforeDate).toBe('2026-11-04');
    expect(await repository.activeVersionNumber()).toBe(1);
  });

  it('mã lỗi riêng lẻ ở bước 2b không chặn kích hoạt: mã đó vẫn trong kho, chỉ ghi log', async () => {
    const { repository, patterns, build } = setup();
    patterns.failLoadFor.add('S003').add('S050');
    const result = await build({ trigger: 'manual' });
    expect(result.status).toBe('active');
    if (result.status !== 'active') return;
    expect(result.okCount).toBe(100);
    expect(result.log.patterns).toMatchObject({ symbols_done: 98, symbols_total: 100, failed_symbols: 2 });
    expect(patterns.runs[0]!.log.failed?.map((item) => item.symbol)).toEqual(['S003', 'S050']);
    expect(await repository.activeVersionNumber()).toBe(1);
  });

  it('bước 2b thất bại cả lần: kho mới KHÔNG được kích hoạt, giữ kho đang dùng, cảnh báo pattern_failed', async () => {
    const { repository, patterns, build, alerts } = setup();
    const old = repository.seedActive({ OLD: [] });
    names(100).forEach((symbol) => patterns.failLoadFor.add(symbol));
    const result = await build({ trigger: 'manual' });
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.reason).toContain('Bước 2b "Tính mẫu nến" lỗi nên kho mới không được kích hoạt');
    expect(repository.calls.activate).toBe(0);
    expect(await repository.activeVersionNumber()).toBe(old);
    const failed = (await repository.latestFailedVersion())!;
    expect(failed.status).toBe('failed');
    expect(failed.log.error).toContain('Bước 2b');
    expect(failed.log.patterns).toMatchObject({ symbols_done: 0, failed_symbols: 100 });
    expect(repository.alertRows.map((row) => row.code)).toEqual(['pattern_failed']);
    expect(alerts.send).toHaveBeenCalledTimes(1);
  });

  it('bước 2b báo đang có lần tính khác: kho mới không được kích hoạt', async () => {
    const step: FlashbackPatternStepPort = {
      run: vi.fn(async (): Promise<PatternRunResult> => ({ status: 'already_running', version: 1 })),
    };
    const { repository, build } = setup({ step });
    const result = await build({ trigger: 'manual' });
    expect(result).toMatchObject({ status: 'failed' });
    expect(repository.calls.activate).toBe(0);
    expect(repository.alertRows.map((row) => row.code)).toEqual(['pattern_failed']);
  });

  it('truyền đúng tham số cho bước 2b và không bỏ qua dù kho chỉ vừa đủ mã', async () => {
    const run = vi.fn(
      async (options: { version: number }): Promise<PatternRunResult> => ({
        status: 'done',
        runId: 7,
        version: options.version,
        detectorVersion: 3,
        symbolsDone: 80,
        symbolsTotal: 80,
        patternsCount: 12,
        failed: [],
        reason: null,
        durationMs: 5,
        log: { missing_raw_sessions: 4 },
      }),
    );
    const { build } = setup({ count: 80, step: { run } });
    const result = await build({ trigger: 'scheduled', requestedBy: 'u1', concurrency: 2 });
    expect(result.status).toBe('active');
    if (result.status !== 'active') return;
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0]).toMatchObject({
      version: 1,
      trigger: 'build',
      requestedBy: 'u1',
      concurrency: 2,
      now: NOW,
    });
    expect(result.log.patterns).toEqual({
      run_id: 7,
      detector_version: 3,
      symbols_done: 80,
      symbols_total: 80,
      patterns_count: 12,
      failed_symbols: 0,
      missing_raw_sessions: 4,
    });
  });

  it('chạy thử (dryRun) không có nến trong CSDL nên bỏ qua bước 2b', async () => {
    const run = vi.fn();
    const { build, patterns } = setup({ step: { run } as unknown as FlashbackPatternStepPort });
    const result = await build({ trigger: 'cli', dryRun: true });
    expect(result.status).toBe('active');
    expect(run).not.toHaveBeenCalled();
    expect(patterns.runs).toEqual([]);
  });

  it('không cấu hình bước 2b (đường cũ): dựng và kích hoạt như trước, không có mục patterns trong log', async () => {
    const { build, repository } = setup({ step: 'none' });
    const result = await build({ trigger: 'manual' });
    expect(result.status).toBe('active');
    if (result.status !== 'active') return;
    expect(result.log.patterns).toBeUndefined();
    expect(repository.calls.activate).toBe(1);
  });

  it('kho thiếu mã (dưới ngưỡng) thì không tốn công tính mẫu: bước 2b không chạy', async () => {
    const run = vi.fn();
    const { build, repository, source } = setup({ count: 100, step: { run } as unknown as FlashbackPatternStepPort });
    for (const symbol of names(30)) source.historyErrors.set(symbol, new Error('nguồn lỗi'));
    const result = await build({ trigger: 'manual' });
    expect(result).toMatchObject({ status: 'failed', okCount: 70 });
    expect(run).not.toHaveBeenCalled();
    expect(repository.alertRows.map((row) => row.code)).toEqual(['too_few_symbols']);
  });
});
