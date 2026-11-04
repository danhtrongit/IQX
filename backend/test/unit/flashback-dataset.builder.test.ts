import { describe, expect, it, vi } from 'vitest';

import {
  DATASET_MAX_BAD_RATIO,
  DATASET_STALE_BUILD_MS,
  FlashbackDatasetBuilder,
} from '../../src/modules/flashback/flashback-dataset.builder.js';
import {
  DATASET_PURGED_NOTE,
  type DatasetProgress,
} from '../../src/modules/flashback/flashback-dataset.repository.js';
import { healthyRows, weekdaysEndingOn } from './helpers/flashback-dataset-fixtures.js';
import { FakeDatasetSource, MemoryDatasetRepository } from './helpers/flashback-dataset-memory.js';

/** 10:00 giờ Việt Nam, 2026-11-04. Lịch phiên: 1.200 ngày thứ Hai-thứ Sáu tới hôm qua. */
const NOW = new Date('2026-11-04T03:00:00.000Z');
const CALENDAR = weekdaysEndingOn('2026-11-03', 1_200);
const names = (count: number) => Array.from({ length: count }, (_, i) => `S${String(i).padStart(3, '0')}`);

function setup(
  options: { count?: number; bars?: (index: number) => number; config?: unknown } = {},
) {
  const count = options.count ?? 100;
  const repository = new MemoryDatasetRepository(() => NOW);
  repository.config = options.config ?? null;
  const source = new FakeDatasetSource();
  source.calendarDates = CALENDAR;
  source.basketSymbols = names(count);
  source.basketSymbols.forEach((symbol, index) => {
    source.histories.set(symbol, healthyRows(CALENDAR.slice(-(options.bars?.(index) ?? 900))));
  });
  const alerts = { send: vi.fn(async () => undefined) };
  const builder = new FlashbackDatasetBuilder(repository, source, alerts);
  const build = (over: Parameters<FlashbackDatasetBuilder['build']>[0] = { trigger: 'manual' }) =>
    builder.build({ now: NOW, ...over });
  return { repository, source, alerts, builder, build };
}

describe('FlashbackDatasetBuilder · dựng một phiên bản kho (§2.2)', () => {
  it('rổ 100 mã, đủ lịch sử: ghi nến + mảng cộng dồn từng mã, kích hoạt phiên bản, ghi nhật ký', async () => {
    const { repository, build, alerts } = setup();
    const result = await build({ trigger: 'cli', requestedBy: 'admin-1' });

    expect(result.status).toBe('active');
    if (result.status !== 'active') return;
    expect(result).toMatchObject({ version: 1, okCount: 100, excludedCount: 0 });
    expect(repository.calls.activate).toBe(1);
    expect(await repository.activeVersionNumber()).toBe(1);

    const version = (await repository.getVersion(1))!;
    expect(version).toMatchObject({
      status: 'active',
      symbolsCount: 100,
      source: 'DNSE:x1000:adjusted',
      trigger: 'cli',
      requestedBy: 'admin-1',
      maxGapSessions: 5,
    });
    expect(version.progress).toMatchObject({ phase: 'done', total: 100, done: 100, ok: 100, excluded: 0 });
    expect(version.firstDate).toBe(CALENDAR[300]);
    expect(version.lastDate).toBe(CALENDAR.at(-1));

    const symbols = await repository.listSymbols(1);
    expect(symbols).toHaveLength(100);
    expect(symbols.every((row) => row.status === 'ok' && row.barsCount === 900)).toBe(true);
    expect(symbols[0]).toMatchObject({
      symbol: 'S000',
      priceSource: 'DNSE:x1000:adjusted',
      valueBasis: 'approx',
      badCount: 0,
      reason: null,
    });

    // Mỗi mã có một chuỗi nến và một bộ mảng cộng dồn n + 1 phần tử.
    const prefix = (await repository.loadPrefix(1, 'S042'))!;
    expect(prefix.n).toBe(900);
    expect(prefix.pBad).toHaveLength(901);
    expect(prefix.pBad[900]).toBe(0);
    const [first, second] = await repository.loadBars(1, 'S042', 0, 2);
    expect(first).toMatchObject({ idx: 0, date: CALENDAR[300], close: 20_000, volume: 600_000 });
    expect(second).toMatchObject({ idx: 1, close: 20_400 });

    // Nhật ký (§2.2 bước 5).
    expect(version.log).toMatchObject({
      outcome: 'active',
      basket: { index: 'VN100', count: 100, source: 'VCI:VN100' },
      calendar: { sessions: 1_200, first: CALENDAR[0], last: CALENDAR.at(-1), source: 'DNSE:VNINDEX' },
      symbols: { ok: 100, excluded: 0 },
      excluded: [],
      value_basis: { matched: 0, mixed: 0, approx: 100 },
      sources: { 'DNSE:x1000:adjusted': 100 },
      parameters: { min_symbols: 80, min_bars: 312, warmup_sessions: 252, max_gap_sessions: 5 },
    });
    expect(version.log.duration_ms).toBeTypeOf('number');
    expect(version.log.cuts?.symbols_with_cut).toBeGreaterThan(0);
    expect(version.log.cuts?.total_cuts).toBeGreaterThan(0);
    expect(repository.alertRows).toHaveLength(0);
    expect(alerts.send).not.toHaveBeenCalled();
  });

  it('báo tiến độ theo giai đoạn: rổ, lịch, từng mã, hoàn tất, rồi xong', async () => {
    const { build } = setup({ count: 90 });
    const seen: DatasetProgress[] = [];
    await build({ trigger: 'manual', onProgress: (progress) => seen.push(progress) });
    const phases = seen.map((progress) => progress.phase);
    expect(phases[0]).toBe('basket');
    expect(phases).toContain('calendar');
    expect(phases).toContain('finalize');
    expect(phases.at(-1)).toBe('done');
    expect(phases.indexOf('calendar')).toBeLessThan(phases.indexOf('symbols'));
    expect(phases.indexOf('symbols')).toBeLessThan(phases.indexOf('finalize'));
    expect(seen.at(-1)).toMatchObject({ total: 90, done: 90, ok: 90, excluded: 0 });
    expect(seen.filter((progress) => progress.phase === 'symbols').at(-1)!.done).toBe(90);
  });

  it('truyền ngày hôm nay (không gồm phiên chưa chốt) và thứ tự nguồn giá của tham số cho nguồn dữ liệu', async () => {
    const { build, source, repository } = setup({ count: 85 });
    await build();
    expect(source.historyCalls).toHaveLength(85);
    expect(source.historyCalls[0]).toMatchObject({ beforeDate: '2026-11-04', order: ['DNSE', 'VCI'] });

    repository.config = { price_sources: ['VCI', 'DNSE'] };
    source.historyCalls.length = 0;
    await build();
    expect(source.historyCalls[0]!.order).toEqual(['VCI', 'DNSE']);
  });
});

describe('FlashbackDatasetBuilder · ngưỡng kích hoạt phiên bản (≥ 80 mã hợp lệ)', () => {
  /** `short` mã đầu chỉ có 311 phiên (< 312) nên bị loại. */
  const withShort = (short: number) => (index: number) => (index < short ? 311 : 900);

  it('đúng 80 mã hợp lệ thì kích hoạt', async () => {
    const { build, repository } = setup({ count: 100, bars: withShort(20) });
    const result = await build();
    expect(result).toMatchObject({ status: 'active', okCount: 80, excludedCount: 20 });
    expect(await repository.activeVersionNumber()).toBe(1);
    expect(repository.alertRows).toHaveLength(0);
  });

  it('79 mã hợp lệ thì không kích hoạt, đánh dấu failed, báo quản trị mức Cao', async () => {
    const { build, repository, alerts } = setup({ count: 100, bars: withShort(21) });
    const result = await build();
    expect(result).toMatchObject({ status: 'failed', version: 1, okCount: 79, excludedCount: 21 });
    if (result.status !== 'failed') return;
    expect(result.reason).toContain('79 mã hợp lệ');
    expect(result.reason).toContain('80 mã tối thiểu');
    expect(repository.calls.activate).toBe(0);
    expect(await repository.activeVersionNumber()).toBeNull();
    expect((await repository.getVersion(1))!.status).toBe('failed');
    expect(repository.alertRows).toHaveLength(1);
    expect(repository.alertRows[0]).toMatchObject({ level: 'high', code: 'too_few_symbols' });
    expect(alerts.send).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'high', message: expect.stringContaining('79 mã') }),
    );
    // Dù không kích hoạt, nhật ký vẫn ghi đủ mã bị loại và lý do để quản trị xem.
    const log = (await repository.getVersion(1))!.log;
    expect(log.excluded).toHaveLength(21);
    expect(log.outcome).toBe('failed');
  });

  it('phiên bản không được kích hoạt bị dọn nến và mảng cộng dồn, nhưng giữ dòng mã và lý do cho quản trị', async () => {
    const { build, repository } = setup({ count: 100, bars: withShort(21) });
    await build();
    expect([...repository.barRows.keys()].filter((key) => key.startsWith('1:'))).toEqual([]);
    expect([...repository.prefixRows.keys()].filter((key) => key.startsWith('1:'))).toEqual([]);
    const rows = await repository.listSymbols(1);
    expect(rows).toHaveLength(100);
    expect(rows.filter((row) => row.status === 'ok').every((row) => row.reason === DATASET_PURGED_NOTE)).toBe(true);
    expect(rows.find((row) => row.symbol === 'S000')!.reason).toMatch(/^Chưa đủ lịch sử/);
  });

  it('phiên bản đang dùng không bao giờ bị dọn khi một lần làm mới sau đó thất bại', async () => {
    const { build, repository, source } = setup({ count: 100 });
    await build();
    for (const symbol of source.basketSymbols.slice(0, 21)) source.histories.set(symbol, healthyRows(CALENDAR.slice(-311)));
    await build();
    expect([...repository.barRows.keys()].filter((key) => key.startsWith('1:'))).toHaveLength(100);
    expect(await repository.loadBars(1, 'S050', 0, 5)).toHaveLength(5);
  });

  it('phiên bản lỗi giữ nguyên kho đang dùng', async () => {
    const { build, repository, source } = setup({ count: 100 });
    expect((await build()).status).toBe('active');
    // Lần làm mới sau: 21 mã mất dữ liệu.
    for (const symbol of source.basketSymbols.slice(0, 21)) source.histories.set(symbol, healthyRows(CALENDAR.slice(-311)));
    const second = await build();
    expect(second).toMatchObject({ status: 'failed', version: 2, okCount: 79 });
    expect(await repository.activeVersionNumber()).toBe(1);
    expect((await repository.getVersion(1))!.status).toBe('active');
    expect((await repository.getVersion(2))!.status).toBe('failed');
    expect((await repository.latestFailedVersion())!.version).toBe(2);
  });

  it('ngưỡng min_symbols đổi được bằng tham số', async () => {
    const { build, repository } = setup({
      count: 60,
      bars: withShort(5),
      config: { min_symbols: 50 },
    });
    expect(await build()).toMatchObject({ status: 'active', okCount: 55 });
    expect(await repository.activeVersionNumber()).toBe(1);
    const strict = setup({ count: 60, bars: withShort(5), config: { min_symbols: 56 } });
    expect(await strict.build()).toMatchObject({ status: 'failed', okCount: 55 });
  });

  it('rổ có ít hơn 80 mã (nguồn trả thiếu): thất bại ngay, không tải dữ liệu từng mã', async () => {
    const { build, repository, source } = setup({ count: 79 });
    const result = await build();
    expect(result).toMatchObject({ status: 'failed', version: 1, okCount: 0 });
    if (result.status !== 'failed') return;
    expect(result.reason).toContain('Rổ VN100 chỉ có 79 mã');
    expect(source.historyCalls).toHaveLength(0);
    expect(repository.alertRows[0]).toMatchObject({ code: 'refresh_failed', level: 'high' });
    expect(await repository.activeVersionNumber()).toBeNull();
  });
});

describe('FlashbackDatasetBuilder · loại mã và cô lập lỗi từng mã (§2.2 bước 3)', () => {
  it('mã dưới 312 phiên (W + 60) bị loại với lý do "Chưa đủ lịch sử"; đúng 312 phiên thì được giữ', async () => {
    const { build, repository } = setup({
      bars: (index) => (index === 0 ? 312 : index === 1 ? 311 : 900),
    });
    expect(await build()).toMatchObject({ status: 'active', okCount: 99, excludedCount: 1 });
    const rows = await repository.listSymbols(1);
    expect(rows.find((row) => row.symbol === 'S000')).toMatchObject({ status: 'ok', barsCount: 312 });
    expect(rows.find((row) => row.symbol === 'S001')).toMatchObject({
      status: 'excluded',
      reason: 'Chưa đủ lịch sử (311/312 phiên)',
      barsCount: 311,
      firstDate: CALENDAR[1_200 - 311],
      lastDate: CALENDAR.at(-1),
    });
    // Mã bị loại không để lại nến hay mảng cộng dồn.
    expect(await repository.loadPrefix(1, 'S001')).toBeNull();
    expect(await repository.loadBars(1, 'S001', 0, 10)).toHaveLength(0);
    expect(await repository.listOkSymbols(1)).not.toContain('S001');
  });

  it('ngưỡng số phiên theo W của tham số: W = 100 thì cần 160 phiên', async () => {
    const { build, repository } = setup({
      bars: (index) => (index === 0 ? 160 : index === 1 ? 159 : 900),
      config: { warmup_sessions: 100 },
    });
    expect(await build()).toMatchObject({ status: 'active', excludedCount: 1 });
    const rows = await repository.listSymbols(1);
    expect(rows.find((row) => row.symbol === 'S000')?.status).toBe('ok');
    expect(rows.find((row) => row.symbol === 'S001')?.reason).toBe('Chưa đủ lịch sử (159/160 phiên)');
  });

  it('một mã lỗi (tải lỗi, không có dữ liệu, ghi lỗi) bị loại kèm lý do, các mã khác vẫn chạy tiếp', async () => {
    const { build, repository, source } = setup();
    source.historyErrors.set('S003', new Error('HTTP 500 từ nguồn'));
    source.histories.delete('S004');
    repository.failSaveFor.add('S005');
    const result = await build();
    expect(result).toMatchObject({ status: 'active', okCount: 97, excludedCount: 3 });
    const rows = new Map((await repository.listSymbols(1)).map((row) => [row.symbol, row]));
    expect(rows.get('S003')).toMatchObject({ status: 'excluded' });
    expect(rows.get('S003')!.reason).toMatch(/^Lỗi tải dữ liệu: .*HTTP 500 từ nguồn/);
    expect(rows.get('S004')!.reason).toMatch(/^Lỗi tải dữ liệu: /);
    expect(rows.get('S005')!.reason).toMatch(/^Lỗi xử lý dữ liệu: .*lỗi ghi CSDL/);
    expect(rows.get('S002')!.status).toBe('ok');
    expect(rows.get('S006')!.status).toBe('ok');
    expect(await repository.loadPrefix(1, 'S005')).toBeNull();
    const log = (await repository.getVersion(1))!.log;
    expect((log.excluded as Array<{ symbol: string }>).map((item) => item.symbol)).toEqual(['S003', 'S004', 'S005']);
  });

  it('dữ liệu hỏng (quá 20% nến lỗi) bị loại; vài nến lỗi lẻ thì giữ và đếm vào bad_count', async () => {
    expect(DATASET_MAX_BAD_RATIO).toBe(0.2);
    const { build, repository, source } = setup();
    // S010: cứ 3 nến có 1 nến giá cao < giá thấp (33% lỗi). S011: đúng 5 nến lỗi trong 900.
    source.histories.set(
      'S010',
      healthyRows(CALENDAR.slice(-900)).map((row, index) => (index % 3 === 0 ? { ...row, high: row.low - 1 } : row)),
    );
    source.histories.set(
      'S011',
      healthyRows(CALENDAR.slice(-900)).map((row, index) =>
        index >= 400 && index < 405 ? { ...row, high: row.low - 1 } : row,
      ),
    );
    const result = await build();
    expect(result).toMatchObject({ status: 'active', okCount: 99, excludedCount: 1 });
    const rows = new Map((await repository.listSymbols(1)).map((row) => [row.symbol, row]));
    expect(rows.get('S010')!.status).toBe('excluded');
    expect(rows.get('S010')!.reason).toMatch(/^Lỗi dữ liệu: 300\/900 nến lỗi/);
    expect(rows.get('S011')).toMatchObject({ status: 'ok', badCount: 5 });
    const prefix = (await repository.loadPrefix(1, 'S011'))!;
    expect(prefix.pBad[900]).toBe(5);
  });

  it('phiên bản lưu ngưỡng khoảng nghỉ của chính nó và ghi cứng vào P_gap', async () => {
    const { build, repository, source } = setup({ config: { max_gap_sessions: 2 } });
    // S020 thiếu 3 phiên liên tiếp (một khoảng nghỉ 3 > 2).
    const rows = healthyRows(CALENDAR.slice(-900));
    source.histories.set('S020', [...rows.slice(0, 500), ...rows.slice(503)]);
    expect(await build()).toMatchObject({ status: 'active' });
    expect((await repository.getVersion(1))!.maxGapSessions).toBe(2);
    expect((await repository.loadPrefix(1, 'S020'))!.pGap[897]).toBe(1);
    expect((await repository.loadPrefix(1, 'S021'))!.pGap[900]).toBe(0);
    const bars = await repository.loadBars(1, 'S020', 499, 3);
    expect(bars.map((bar) => bar.idx)).toEqual([499, 500, 501]);
  });
});

describe('FlashbackDatasetBuilder · giá trị giao dịch khớp thật (value_raw)', () => {
  const matchedFor = (value: number, take = 900) =>
    new Map(CALENDAR.slice(-take).map((date) => [date, value] as const));

  it('có giá trị khớp thật cho mọi phiên: value_basis = matched và value_raw lấy từ sở', async () => {
    const { build, repository, source } = setup({ count: 85 });
    source.matchedValues = async () => matchedFor(25_000_000_000);
    const result = await build();
    expect(result).toMatchObject({ status: 'active' });
    const version = (await repository.getVersion(1))!;
    expect(version.log.value_basis).toEqual({ matched: 85, mixed: 0, approx: 0 });
    expect((await repository.listSymbols(1))[0]!.valueBasis).toBe('matched');
    const prefix = (await repository.loadPrefix(1, 'S000'))!;
    expect(prefix.pVal[900]).toBe(25_000_000_000 * 900);
  });

  it('thiếu một phần thì mixed; nguồn không có dữ liệu của mã thì approx', async () => {
    const { build, repository, source } = setup({ count: 85 });
    source.matchedValues = async (symbol) =>
      symbol === 'S000' ? matchedFor(25_000_000_000, 450) : symbol === 'S001' ? null : matchedFor(25_000_000_000);
    await build();
    const rows = new Map((await repository.listSymbols(1)).map((row) => [row.symbol, row]));
    expect(rows.get('S000')!.valueBasis).toBe('mixed');
    expect(rows.get('S001')!.valueBasis).toBe('approx');
    expect(rows.get('S002')!.valueBasis).toBe('matched');
    expect((await repository.getVersion(1))!.log.value_basis).toEqual({ matched: 83, mixed: 1, approx: 1 });
  });

  it('lấy giá trị khớp thật lỗi chỉ làm mã đó dùng giá trị xấp xỉ, không loại mã', async () => {
    const { build, repository, source } = setup({ count: 85 });
    source.matchedValues = async (symbol) => {
      if (symbol === 'S007') throw new Error('VCI price-history 429');
      return matchedFor(25_000_000_000);
    };
    expect(await build({ trigger: 'manual', concurrency: 1 })).toMatchObject({ status: 'active', okCount: 85 });
    const rows = new Map((await repository.listSymbols(1)).map((row) => [row.symbol, row]));
    expect(rows.get('S007')).toMatchObject({ status: 'ok', valueBasis: 'approx' });
    expect(rows.get('S008')!.valueBasis).toBe('matched');
  });

  it('lỗi liên tiếp 3 lần thì bỏ bước này cho cả lần dựng (ngắt mạch) nhưng vẫn dựng xong', async () => {
    const { build, repository, source } = setup({ count: 85 });
    const calls: string[] = [];
    source.matchedValues = async (symbol) => {
      calls.push(symbol);
      throw new Error('VCI bị chặn');
    };
    const result = await build({ trigger: 'manual', concurrency: 1 });
    expect(result).toMatchObject({ status: 'active', okCount: 85 });
    expect(calls).toEqual(['S000', 'S001', 'S002']);
    expect((await repository.getVersion(1))!.log.value_basis).toEqual({ matched: 0, mixed: 0, approx: 85 });
  });
});

describe('FlashbackDatasetBuilder · chỉ một lần dựng một lúc, không tạo phiên bản trùng', () => {
  it('đang có một lần dựng còn báo nhịp: trả already_running, không tạo phiên bản, không cảnh báo', async () => {
    const { build, repository, alerts, source } = setup({ count: 85 });
    const running = repository.seedBuilding(60_000);
    const result = await build();
    expect(result).toEqual({ status: 'already_running', version: running });
    expect(repository.versionRows.size).toBe(1);
    expect(source.historyCalls).toHaveLength(0);
    expect(repository.alertRows).toHaveLength(0);
    expect(alerts.send).not.toHaveBeenCalled();
  });

  it('lần dựng không báo nhịp quá 10 phút bị đánh dấu lỗi (kèm cảnh báo) rồi lần dựng mới chạy bình thường', async () => {
    const { build, repository, alerts } = setup({ count: 85 });
    const stale = repository.seedBuilding(DATASET_STALE_BUILD_MS + 1_000);
    const result = await build();
    expect(result).toMatchObject({ status: 'active', version: stale + 1 });
    expect((await repository.getVersion(stale))!.status).toBe('failed');
    expect(repository.alertRows.some((row) => row.code === 'refresh_failed')).toBe(true);
    expect(alerts.send).toHaveBeenCalledTimes(1);
    expect(await repository.activeVersionNumber()).toBe(stale + 1);
  });

  it('hai lần chạy đồng thời: một lần dựng, lần kia nhận already_running', async () => {
    const { build, repository } = setup({ count: 85 });
    const [first, second] = await Promise.all([build(), build()]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(['active', 'already_running']);
    expect(repository.versionRows.size).toBe(1);
  });

  it('làm mới lần sau tạo phiên bản mới: bản cũ thành retired, đúng một bản active', async () => {
    const { build, repository } = setup({ count: 85 });
    await build();
    await build({ trigger: 'scheduled' });
    const versions = await repository.listVersions(10);
    expect(versions.map((row) => [row.version, row.status])).toEqual([
      [2, 'active'],
      [1, 'retired'],
    ]);
    expect(versions[0]!.trigger).toBe('scheduled');
    expect(await repository.activeVersionNumber()).toBe(2);
  });

  it('kích hoạt lỗi giữa chừng (phiên bản không còn building): đánh dấu lỗi và giữ kho đang dùng', async () => {
    const { build, repository } = setup({ count: 85 });
    await build();
    vi.spyOn(repository, 'activate').mockRejectedValueOnce(new Error('phiên bản không còn building'));
    const result = await build();
    expect(result).toMatchObject({ status: 'failed', version: 2 });
    if (result.status === 'failed') expect(result.reason).toContain('phiên bản không còn building');
    expect(await repository.activeVersionNumber()).toBe(1);
    expect(repository.alertRows.at(-1)).toMatchObject({ code: 'refresh_failed', level: 'high' });
  });
});

describe('FlashbackDatasetBuilder · lỗi nguồn dữ liệu', () => {
  it('không lấy được rổ: failed + cảnh báo refresh_failed + kênh kỹ thuật, giữ kho đang dùng', async () => {
    const { build, repository, source, alerts } = setup({ count: 85 });
    await build();
    source.basketError = new Error('VCI nhóm VN100 timeout');
    const result = await build();
    expect(result).toMatchObject({ status: 'failed', version: 2 });
    if (result.status !== 'failed') return;
    expect(result.reason).toContain('VCI nhóm VN100 timeout');
    expect(await repository.activeVersionNumber()).toBe(1);
    expect(repository.alertRows).toHaveLength(1);
    expect(repository.alertRows[0]).toMatchObject({ code: 'refresh_failed', level: 'high' });
    expect(alerts.send).toHaveBeenCalledWith(expect.objectContaining({ level: 'high' }));
    expect((await repository.getVersion(2))!.log.error).toContain('VCI nhóm VN100 timeout');
  });

  it('không lấy được lịch phiên của sàn: failed + cảnh báo', async () => {
    const { build, repository, source } = setup({ count: 85 });
    source.calendarError = new Error('Không tải được lịch phiên của sàn');
    expect(await build()).toMatchObject({ status: 'failed', okCount: 0 });
    expect(repository.alertRows[0]).toMatchObject({ code: 'refresh_failed' });
    expect(await repository.activeVersionNumber()).toBeNull();
  });
});

describe('FlashbackDatasetBuilder · chạy thử (dryRun)', () => {
  it('chạy đủ các bước nhưng không ghi gì vào kho và không cảnh báo', async () => {
    const { build, repository, alerts } = setup({ count: 85 });
    const result = await build({ trigger: 'cli', dryRun: true });
    expect(result).toMatchObject({ status: 'active', okCount: 85, version: 0 });
    expect(repository.versionRows.size).toBe(0);
    expect(repository.symbolRows.size).toBe(0);
    expect(repository.barRows.size).toBe(0);
    expect(repository.calls.activate).toBe(0);
    expect(alerts.send).not.toHaveBeenCalled();
  });

  it('chạy thử không đủ mã trả failed (không có phiên bản) và không ghi cảnh báo', async () => {
    const { build, repository, alerts } = setup({ count: 100, bars: (index) => (index < 30 ? 311 : 900) });
    const result = await build({ trigger: 'cli', dryRun: true });
    expect(result).toMatchObject({ status: 'failed', version: null, okCount: 70 });
    expect(repository.versionRows.size).toBe(0);
    expect(repository.alertRows).toHaveLength(0);
    expect(alerts.send).not.toHaveBeenCalled();
  });
});
