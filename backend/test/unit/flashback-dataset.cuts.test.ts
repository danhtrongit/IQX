import { describe, expect, it, vi } from 'vitest';

import { FlashbackDatasetCuts } from '../../src/modules/flashback/flashback-dataset.cuts.js';
import { FlashbackRoomDataset } from '../../src/modules/flashback/flashback-rooms.dataset.js';
import type { DatasetCutRow } from '../../src/modules/flashback/flashback-dataset.repository.js';
import {
  healthySeries,
  seededInt,
  weekdaysEndingOn,
  weekdaysFrom,
} from './helpers/flashback-dataset-fixtures.js';
import { MemoryDatasetRepository } from './helpers/flashback-dataset-memory.js';

/** 10:00 giờ Việt Nam, 2026-11-04: mốc 12 tháng là 2025-11-04. */
const NOW = new Date('2026-11-04T03:00:00.000Z');
const L = 252 + 60 + 30;

type Series = ReturnType<typeof healthySeries>;

function setup(series: Record<string, Series>, random = seededInt(1)) {
  const repository = new MemoryDatasetRepository(() => NOW);
  const alerts = { send: vi.fn(async () => undefined) };
  const version = repository.seedActive(series);
  const cuts = new FlashbackDatasetCuts(repository, alerts, random);
  return { repository, alerts, cuts, version };
}

/** Một mã có đúng `cutCount` điểm cắt hợp lệ (toàn nến khoẻ, đủ cũ). */
const symbolWithCuts = (cutCount: number, from = '2005-01-03') =>
  healthySeries(weekdaysFrom(from, L + cutCount - 1));

describe('FlashbackDatasetCuts · cắt một đoạn W + H + P phiên', () => {
  it('trả 252 nến khởi tạo và H + P nến hiện, liên tục từ start_idx, kèm phiên bản kho và nguồn giá', async () => {
    const series = healthySeries(weekdaysFrom('2014-01-06', 800), (bar) => ({
      close: 20_000 + bar.idx,
      high: 20_000 + bar.idx,
      low: 20_000 + bar.idx,
      open: 20_000 + bar.idx,
    }));
    const { cuts, version } = setup({ AAA: series });
    const result = await cuts.pick(NOW, 60, 30);
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      symbol: 'AAA',
      datasetVersion: version,
      priceSource: `dataset:v${version}:DNSE:x1000:adjusted`,
    });
    expect(result!.warmupBars).toHaveLength(252);
    expect(result!.bars).toHaveLength(90);
    const all = [...result!.warmupBars, ...result!.bars];
    expect(all.map((bar) => bar.d)).toEqual(
      series.slice(result!.startIdx, result!.startIdx + L).map((bar) => bar.date),
    );
    expect(all[0]).toEqual({
      d: series[result!.startIdx]!.date,
      o: 20_000 + result!.startIdx,
      h: 20_000 + result!.startIdx,
      l: 20_000 + result!.startIdx,
      c: 20_000 + result!.startIdx,
      v: 1_000_000,
    });
  });

  it('phiên chơi cuối của mọi lần cắt cách hôm nay ít nhất 12 tháng', async () => {
    // Chuỗi chạy tới 2026-10-30: chỉ các điểm cắt đủ xa mới hợp lệ.
    const series = healthySeries(weekdaysEndingOn('2026-10-30', 900));
    const { cuts } = setup({ AAA: series });
    for (let pick = 0; pick < 300; pick += 1) {
      const result = (await cuts.pick(NOW, 60, 30))!;
      expect(result.bars.at(-1)!.d <= '2025-11-04').toBe(true);
    }
  });

  it('thích ứng với (H, P) của phòng: 30/30 và 120/120 cắt đúng độ dài', async () => {
    const { cuts } = setup({ AAA: healthySeries(weekdaysFrom('2012-03-20', 1_200)) });
    const small = (await cuts.pick(NOW, 30, 30))!;
    expect(small.warmupBars).toHaveLength(252);
    expect(small.bars).toHaveLength(60);
    const big = (await cuts.pick(NOW, 120, 120))!;
    expect(big.warmupBars).toHaveLength(252);
    expect(big.bars).toHaveLength(240);
  });

  it('H hoặc P ngoài khoảng 30-120 bị từ chối trước khi chạm vào kho', async () => {
    const { cuts, repository } = setup({ AAA: symbolWithCuts(10) });
    await expect(cuts.pick(NOW, 29, 30)).rejects.toThrow(RangeError);
    await expect(cuts.pick(NOW, 60, 121)).rejects.toThrow(RangeError);
    await expect(cuts.pick(NOW, 60.5, 30)).rejects.toThrow(RangeError);
    expect(repository.calls.loadBars).toBe(0);
  });

  it('adapter của phòng chơi trả FbMatchDataset kèm dataset_version và start_idx, fallbackLevel 0', async () => {
    const { cuts, version } = setup({ AAA: symbolWithCuts(50) });
    const dataset = await new FlashbackRoomDataset(cuts).pick(NOW, 60, 30);
    expect(dataset).toMatchObject({
      symbol: 'AAA',
      fallbackLevel: 0,
      datasetVersion: version,
    });
    expect(dataset!.startIdx).toBeGreaterThanOrEqual(0);
    expect(dataset!.startIdx).toBeLessThan(50);
    expect(dataset!.warmupBars).toHaveLength(252);
    expect(dataset!.bars).toHaveLength(90);
  });
});

describe('FlashbackDatasetCuts · chọn ngẫu nhiên đều (§3.3)', () => {
  /** Lấy mẫu nhanh: ghi lại (mã, start_idx) và trả nến giả để 10.000 lần chọn chạy nhanh. */
  function sampleLoadBars(repository: MemoryDatasetRepository) {
    const chosen: Array<{ symbol: string; startIdx: number }> = [];
    const row: DatasetCutRow = { idx: 0, date: '2020-01-01', open: 1, high: 1, low: 1, close: 1, volume: 1 };
    vi.spyOn(repository, 'loadBars').mockImplementation(async (_version, symbol, from, count) => {
      chosen.push({ symbol, startIdx: from });
      const rows = new Array<DatasetCutRow>(count).fill(row);
      rows[0] = { ...row, idx: from };
      return rows;
    });
    return chosen;
  }

  it('mỗi mã có cơ hội ngang nhau trong 10.000 lần chọn (±20%), dù số điểm cắt chênh nhau hàng nghìn lần', async () => {
    const counts = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1_597, 2_584, 3_500, 4_000, 4_300];
    const series: Record<string, Series> = {};
    counts.forEach((count, index) => {
      series[`S${String(index).padStart(2, '0')}`] = symbolWithCuts(count);
    });
    const { repository, cuts } = setup(series, seededInt(20261104));
    const chosen = sampleLoadBars(repository);
    for (let pick = 0; pick < 10_000; pick += 1) expect(await cuts.pick(NOW, 60, 30)).not.toBeNull();
    const hits = new Map<string, number>();
    for (const { symbol } of chosen) hits.set(symbol, (hits.get(symbol) ?? 0) + 1);
    expect(hits.size).toBe(20);
    const expected = 10_000 / 20;
    for (const [symbol, hit] of hits) {
      expect(Math.abs(hit - expected) / expected, symbol).toBeLessThanOrEqual(0.2);
    }
    // Chọn đều theo điểm cắt sẽ cho mã 4.300 điểm cắt hơn 25% số lần; chọn đều theo mã thì xấp xỉ 5%.
    expect((hits.get('S19') ?? 0) / 10_000).toBeLessThan(0.08);
    // Mọi điểm cắt chọn ra đều nằm trong danh sách hợp lệ của mã.
    for (const { symbol, startIdx } of chosen) {
      expect(startIdx).toBeGreaterThanOrEqual(0);
      expect(startIdx).toBeLessThan(counts[Number(symbol.slice(1))]!);
    }
  });

  it('mọi điểm cắt của một mã có cơ hội ngang nhau (±15%)', async () => {
    const { repository, cuts } = setup({ ONE: symbolWithCuts(10) }, seededInt(7));
    const chosen = sampleLoadBars(repository);
    for (let pick = 0; pick < 10_000; pick += 1) await cuts.pick(NOW, 60, 30);
    const hits = new Map<number, number>();
    for (const { startIdx } of chosen) hits.set(startIdx, (hits.get(startIdx) ?? 0) + 1);
    expect(hits.size).toBe(10);
    for (const [start, hit] of hits) expect(Math.abs(hit - 1_000) / 1_000, String(start)).toBeLessThanOrEqual(0.15);
  });

  it('không chống lặp mã: hai lần chọn liên tiếp có thể ra cùng một mã và cùng một điểm cắt', async () => {
    const { cuts } = setup({ ONLY: symbolWithCuts(1) }, () => 0);
    const first = await cuts.pick(NOW, 60, 30);
    const second = await cuts.pick(NOW, 60, 30);
    expect(first!.symbol).toBe('ONLY');
    expect(second).toEqual(first);
  });

  it('có điểm cắt trước năm 2012 khi dữ liệu của mã bắt đầu từ trước đó (nguồn VCI)', async () => {
    const series = healthySeries(weekdaysFrom('2007-01-01', 2_600));
    const { cuts } = setup({ OLD: series });
    let pre2012 = 0;
    let earliest = '9999';
    for (let pick = 0; pick < 1_000; pick += 1) {
      const result = (await cuts.pick(NOW, 60, 30))!;
      if (result.bars[0]!.d < '2012-01-01') pre2012 += 1;
      if (result.warmupBars[0]!.d < earliest) earliest = result.warmupBars[0]!.d;
    }
    expect(pre2012).toBeGreaterThan(100);
    expect(earliest < '2008-06-01').toBe(true);
  });

  it('nếu nguồn chỉ có dữ liệu từ 2012-03 (DNSE) thì không có điểm cắt nào hiển thị trước 2013-03', async () => {
    const { cuts } = setup({ DNSE_ONLY: healthySeries(weekdaysFrom('2012-03-20', 2_000)) });
    for (let pick = 0; pick < 200; pick += 1) {
      const result = (await cuts.pick(NOW, 60, 30))!;
      expect(result.warmupBars[0]!.d >= '2012-03-20').toBe(true);
      expect(result.bars[0]!.d >= '2013-03-01').toBe(true);
    }
  });
});

describe('FlashbackDatasetCuts · không có điểm cắt hợp lệ', () => {
  it('không mã nào có điểm cắt: trả null (ván không bắt đầu), báo quản trị một lần và không nới điều kiện', async () => {
    // Thanh khoản 2,9 tỷ: ngay dưới ngưỡng 3 tỷ ở mọi phiên.
    const poor = healthySeries(weekdaysFrom('2014-01-06', 700), () => ({ valueRaw: 2_900_000_000 }));
    const { cuts, repository, alerts } = setup({ AAA: poor, BBB: poor });
    expect(await cuts.pick(NOW, 60, 30)).toBeNull();
    expect(await cuts.pick(NOW, 60, 30)).toBeNull();
    expect(repository.calls.loadBars).toBe(0);
    expect(repository.alertRows.filter((row) => row.code === 'no_cut')).toHaveLength(1);
    expect(repository.alertRows[0]).toMatchObject({ level: 'high', code: 'no_cut' });
    expect(repository.alertRows[0]!.message).toContain('Ván không bắt đầu, chưa trừ xu');
    expect(alerts.send).toHaveBeenCalledTimes(1);
    expect(alerts.send).toHaveBeenCalledWith(expect.objectContaining({ level: 'high' }));

    // Chỉ khi quản trị hạ ngưỡng thì mới có điểm cắt: hệ thống không tự nới.
    repository.config = { min_liquidity_vnd: 2_000_000_000 };
    expect(await cuts.pick(NOW, 60, 30)).not.toBeNull();
  });

  it('mã có đủ dữ liệu cho (60, 30) nhưng không đủ cho (120, 120): chỉ phòng lớn không cắt được', async () => {
    const { cuts } = setup({ AAA: healthySeries(weekdaysFrom('2014-01-06', 400)) });
    expect(await cuts.pick(NOW, 60, 30)).not.toBeNull();
    expect(await cuts.pick(NOW, 120, 120)).toBeNull();
    expect(await cuts.pick(NOW, 60, 30)).not.toBeNull();
  });

  it('chưa có phiên bản kho đang dùng: null và cảnh báo no_active_version', async () => {
    const repository = new MemoryDatasetRepository(() => NOW);
    const alerts = { send: vi.fn(async () => undefined) };
    const cuts = new FlashbackDatasetCuts(repository, alerts, seededInt(1));
    expect(await cuts.pick(NOW, 60, 30)).toBeNull();
    expect(repository.alertRows).toHaveLength(1);
    expect(repository.alertRows[0]).toMatchObject({ code: 'no_active_version', level: 'high' });
    expect(alerts.send).toHaveBeenCalledTimes(1);
  });

  it('lỗi hạ tầng khi nạp kho: null kèm cảnh báo data_error, tự phục hồi ở lần sau', async () => {
    const { cuts, repository, alerts } = setup({ AAA: symbolWithCuts(20) });
    const failing = vi.spyOn(repository, 'loadPrefix').mockRejectedValue(new Error('db down'));
    expect(await cuts.pick(NOW, 60, 30)).toBeNull();
    expect(repository.alertRows[0]).toMatchObject({ code: 'data_error', level: 'high' });
    expect(repository.alertRows[0]!.message).toContain('db down');
    expect(alerts.send).toHaveBeenCalledTimes(1);
    failing.mockRestore();
    expect(await cuts.pick(NOW, 60, 30)).not.toBeNull();
  });

  it('kho thiếu nến của điểm cắt đã chọn: null kèm cảnh báo data_error, không trả đề thiếu', async () => {
    const { cuts, repository } = setup({ AAA: symbolWithCuts(20) });
    vi.spyOn(repository, 'loadBars').mockResolvedValue([]);
    expect(await cuts.pick(NOW, 60, 30)).toBeNull();
    expect(repository.alertRows[0]).toMatchObject({ code: 'data_error' });
    expect(repository.alertRows[0]!.message).toContain('thiếu nến');
  });
});

describe('FlashbackDatasetCuts · bộ nhớ đệm theo (phiên bản, H, P, ngày hôm nay)', () => {
  it('chọn nhiều lần cùng (H, P) trong ngày chỉ nạp mảng cộng dồn một lần', async () => {
    const { cuts, repository } = setup({ AAA: symbolWithCuts(30), BBB: symbolWithCuts(40) });
    await cuts.pick(NOW, 60, 30);
    const loadedOnce = repository.calls.loadPrefix;
    expect(loadedOnce).toBe(2);
    for (let pick = 0; pick < 5; pick += 1) await cuts.pick(NOW, 60, 30);
    await cuts.pick(NOW, 90, 60);
    expect(repository.calls.loadPrefix).toBe(loadedOnce);
  });

  it('warmUp tính sẵn kho đang dùng và cặp 60/30 nên ván đầu tiên không phải nạp lại', async () => {
    const { cuts, repository } = setup({ AAA: symbolWithCuts(30) });
    await cuts.warmUp(NOW);
    const loaded = repository.calls.loadPrefix;
    expect(loaded).toBe(1);
    await cuts.pick(NOW, 60, 30);
    expect(repository.calls.loadPrefix).toBe(loaded);
  });

  it('khởi động không ném lỗi và không chặn khi kho không đọc được', async () => {
    const { cuts, repository } = setup({ AAA: symbolWithCuts(30) });
    vi.spyOn(repository, 'activeVersionNumber').mockRejectedValue(new Error('db down'));
    expect(cuts.onApplicationBootstrap()).toBeUndefined();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('khoá theo ngày: cùng một điểm cắt hợp lệ hôm nay nhưng không còn hợp lệ ở ngày sớm hơn một ngày', async () => {
    // Chuỗi đúng L phiên, phiên cuối 2025-11-04: chỉ hợp lệ khi mốc 12 tháng ≥ 2025-11-04.
    const { cuts } = setup({ AAA: healthySeries(weekdaysEndingOn('2025-11-04', L)) });
    const dayBefore = new Date('2026-11-03T03:00:00.000Z');
    expect(await cuts.eligibleSymbols(NOW, 60, 30)).toBe(1);
    expect(await cuts.eligibleSymbols(dayBefore, 60, 30)).toBe(0);
    expect(await cuts.pick(dayBefore, 60, 30)).toBeNull();
    expect(await cuts.eligibleSymbols(NOW, 60, 30)).toBe(1);
    expect(await cuts.pick(NOW, 60, 30)).not.toBeNull();
  });

  it('khoá theo cặp (H, P): danh sách của (60, 30) không bị dùng cho (120, 120)', async () => {
    const { cuts } = setup({ AAA: healthySeries(weekdaysFrom('2014-01-06', 400)) });
    expect(await cuts.eligibleSymbols(NOW, 60, 30)).toBe(1);
    expect(await cuts.eligibleSymbols(NOW, 120, 120)).toBe(0);
    expect(await cuts.eligibleSymbols(NOW, 60, 30)).toBe(1);
  });

  it('khoá theo phiên bản: kích hoạt phiên bản mới thì ván sau cắt từ phiên bản mới', async () => {
    const { cuts, repository, version } = setup({ OLD: symbolWithCuts(30) });
    const first = (await cuts.pick(NOW, 60, 30))!;
    expect(first.symbol).toBe('OLD');
    expect(first.datasetVersion).toBe(version);
    const next = repository.seedActive({ NEW: symbolWithCuts(30) });
    const second = (await cuts.pick(NOW, 60, 30))!;
    expect(second.symbol).toBe('NEW');
    expect(second.datasetVersion).toBe(next);
    expect(next).toBeGreaterThan(version);
  });

  it('đổi tham số của kho có hiệu lực ngay ở ván kế tiếp (khoá bộ nhớ đệm gồm tham số)', async () => {
    const series = healthySeries(weekdaysEndingOn('2025-11-04', L));
    const { cuts, repository } = setup({ AAA: series });
    expect(await cuts.eligibleSymbols(NOW, 60, 30)).toBe(1);
    repository.config = { min_months_ago: 13 };
    expect(await cuts.eligibleSymbols(NOW, 60, 30)).toBe(0);
    repository.config = { min_months_ago: 11 };
    expect(await cuts.eligibleSymbols(NOW, 60, 30)).toBe(1);
    repository.config = { min_months_ago: 12, min_liquidity_vnd: 20_000_000_000 };
    expect(await cuts.eligibleSymbols(NOW, 60, 30)).toBe(0);
  });
});

describe('FlashbackDatasetCuts · dựng lại ván từ (dataset_version, symbol, start_idx)', () => {
  it('rebuild trả đúng dữ liệu của ván đã chọn và null khi kho thiếu nến', async () => {
    const { cuts } = setup({ AAA: healthySeries(weekdaysFrom('2014-01-06', 700)) });
    const picked = (await cuts.pick(NOW, 60, 30))!;
    const rebuilt = await cuts.rebuild({
      version: picked.datasetVersion,
      symbol: picked.symbol,
      startIdx: picked.startIdx,
      warmup: 252,
      viewBars: 60,
      playBars: 30,
    });
    expect(rebuilt).toEqual({ warmupBars: picked.warmupBars, bars: picked.bars });
    expect(
      await cuts.rebuild({
        version: picked.datasetVersion,
        symbol: picked.symbol,
        startIdx: 690,
        warmup: 252,
        viewBars: 60,
        playBars: 30,
      }),
    ).toBeNull();
  });
});
