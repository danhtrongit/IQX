/**
 * Chọn mã và giai đoạn (spec 22-10 QA-02, FB-11f/g/h; BoSung §10.2-10.4).
 */

import { describe, expect, it } from 'vitest';

import {
  FlashbackCalendarUnavailableError,
  FlashbackRoundBuilder,
  flashbackFetchFrom,
  readFlashbackConfig,
} from '../../src/modules/flashback/flashback.round-builder.js';
import type { FlashbackBar } from '../../src/modules/flashback/flashback.types.js';
import {
  emptyMemoryState,
  MemoryFlashbackRepository,
  memoryDatabase,
  seededRandom,
} from './helpers/flashback-memory.js';

const DAY = 86_400_000;
const NOW = new Date('2026-10-23T05:00:00.000Z');

/** Ngày thường từ `from` tới `to`. */
function weekdays(from: string, to: string): string[] {
  const dates: string[] = [];
  for (
    let time = Date.parse(`${from}T00:00:00Z`);
    time <= Date.parse(`${to}T00:00:00Z`);
    time += DAY
  ) {
    const day = new Date(time).getUTCDay();
    if (day !== 0 && day !== 6) dates.push(new Date(time).toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Chuỗi nến sạch: bước giá trong ±4,5% (dưới biên độ ±5% trước 2013), kéo về quanh 30.000đ để
 * thanh khoản luôn khoảng 30 tỷ và độ biến động ngày khoảng 2% suốt 40 năm.
 */
function series(dates: readonly string[], seed: number): FlashbackBar[] {
  const random = seededRandom(seed);
  let close = 30_000;
  return dates.map((d) => {
    const step = (random() - 0.5) * 0.08 - 0.02 * Math.log(close / 30_000);
    close = Math.round(close * (1 + Math.max(-0.045, Math.min(0.045, step))));
    return { d, o: close, h: close, l: close, c: close, v: 1_000_000 };
  });
}

function rangeOf(bars: readonly FlashbackBar[], from: string, to: string): FlashbackBar[] {
  return bars.filter((bar) => bar.d >= from && bar.d <= to);
}

/** Phân phối χ² (giá trị tới hạn p = 0,01). */
const CHI2_CRITICAL_001: Record<number, number> = { 7: 18.475, 29: 49.588 };

function chiSquare(observed: readonly number[], expected: readonly number[]): number {
  return observed.reduce((sum, value, index) => {
    const e = expected[index]!;
    return sum + (value - e) ** 2 / e;
  }, 0);
}

describe('QA-02 tạo 1.000 đề', () => {
  it('phân bố mã gần đều, năm bắt đầu trải đều, không lặp mã trong 10 đề, không chồng giai đoạn', async () => {
    const config = readFlashbackConfig({ earliest_start_date: '1985-01-01' });
    const calendar = weekdays('1983-01-03', '2025-12-31');
    const symbols = Array.from({ length: 30 }, (_, index) => `Q${String(index).padStart(2, '0')}`);
    const data = new Map(symbols.map((symbol, index) => [symbol, series(calendar, 100 + index)]));
    const vnindex = series(calendar, 1);
    const market = {
      vn30Symbols: async () => symbols,
      dailyBars: async (symbol: string, from: string, to: string) =>
        rangeOf(symbol === 'VNINDEX' ? vnindex : data.get(symbol)!, from, to),
    };
    const repository = new MemoryFlashbackRepository(emptyMemoryState(), () => NOW);
    const builder = new FlashbackRoundBuilder(memoryDatabase(repository), repository, market);
    const tx = { query: async () => [] };

    const picked: { symbol: string; dates: string[] }[] = [];
    for (let index = 0; index < 1_000; index += 1) {
      const built = await builder.build(NOW, 0, config);
      expect(built, `đề thứ ${index + 1}`).not.toBeNull();
      const round = await repository.insertRound(tx, {
        roundNo: index + 1,
        symbol: built!.symbol,
        startDate: built!.startDate,
        warmupBars: [],
        bars: built!.bars,
        scheduledOpenAt: NOW,
        fallbackLevel: built!.fallbackLevel,
      });
      round!.status = 'paid';
      picked.push({ symbol: built!.symbol, dates: built!.bars.map((bar) => bar.d) });
      expect(built!.bars).toHaveLength(120);
      expect(built!.warmupBars).toHaveLength(252);
    }

    // Không mã nào lặp trong 10 đề liên tiếp.
    for (let index = 0; index + 10 <= picked.length; index += 1) {
      const window = picked.slice(index, index + 10).map((item) => item.symbol);
      expect(new Set(window).size).toBe(10);
    }

    // Không chồng giai đoạn với đề cũ cùng mã.
    const used = new Map<string, Set<string>>();
    for (const item of picked) {
      const set = used.get(item.symbol) ?? new Set<string>();
      for (const date of item.dates) {
        expect(set.has(date)).toBe(false);
        set.add(date);
      }
      used.set(item.symbol, set);
    }

    // Phân bố mã: χ² với 29 bậc tự do, p > 0,01.
    const counts = symbols.map((symbol) => picked.filter((item) => item.symbol === symbol).length);
    const expectedSymbol = symbols.map(() => picked.length / symbols.length);
    expect(chiSquare(counts, expectedSymbol)).toBeLessThan(CHI2_CRITICAL_001[29]!);

    // Năm bắt đầu: 8 nhóm 5 năm, kỳ vọng tỉ lệ với số ngày bắt đầu hợp lệ trong nhóm.
    const latestPlay = '2025-10-23';
    const lastIndex = calendar.findLastIndex((date) => date <= latestPlay) - 119;
    const feasible = calendar.filter((date, index) => date >= '1985-01-01' && index <= lastIndex);
    const bin = (date: string) => Math.min(7, Math.floor((Number(date.slice(0, 4)) - 1985) / 5));
    const feasibleBins = Array.from({ length: 8 }, () => 0);
    for (const date of feasible) feasibleBins[bin(date)]! += 1;
    const observedBins = Array.from({ length: 8 }, () => 0);
    for (const item of picked) observedBins[bin(item.dates[0]!)]! += 1;
    const expectedBins = feasibleBins.map((value) => (value / feasible.length) * picked.length);
    expect(chiSquare(observedBins, expectedBins)).toBeLessThan(CHI2_CRITICAL_001[7]!);
  }, 60_000);
});

describe('FB-11 kiểm tra dữ liệu', () => {
  const repository = new MemoryFlashbackRepository(emptyMemoryState(), () => NOW);
  const database = memoryDatabase(repository);

  type CleanCheck = {
    isCleanWindow(
      window: readonly FlashbackBar[],
      calendar: { dates: readonly string[]; position: ReadonlyMap<string, number> },
    ): boolean;
  };
  const builder = new FlashbackRoundBuilder(database, repository, {
    dailyBars: async () => [],
  }) as unknown as CleanCheck;
  const calendarOf = (dates: readonly string[]) => ({
    dates,
    position: new Map(dates.map((date, index) => [date, index])),
  });
  const bar = (d: string, c: number): FlashbackBar => ({ d, o: c, h: c, l: c, c, v: 1 });

  it('f: bước nhảy giá theo biên độ HOSE từng thời kỳ (±5% tới 14/01/2013, ±7% sau đó) cộng 0,5%', () => {
    const cal2012 = calendarOf(['2012-06-04', '2012-06-05']);
    expect(
      builder.isCleanWindow([bar('2012-06-04', 10_000), bar('2012-06-05', 10_540)], cal2012),
    ).toBe(true);
    expect(
      builder.isCleanWindow([bar('2012-06-04', 10_000), bar('2012-06-05', 10_600)], cal2012),
    ).toBe(false);
    const cal2014 = calendarOf(['2014-06-04', '2014-06-05']);
    expect(
      builder.isCleanWindow([bar('2014-06-04', 10_000), bar('2014-06-05', 10_600)], cal2014),
    ).toBe(true);
    expect(
      builder.isCleanWindow([bar('2014-06-04', 10_000), bar('2014-06-05', 10_760)], cal2014),
    ).toBe(false);
  });

  it('f: phiên đầu tiên sau quãng tạm ngừng giao dịch được miễn', () => {
    const calendar = calendarOf(['2014-06-02', '2014-06-03', '2014-06-04', '2014-06-05']);
    // Mã không giao dịch 03-04/06 (thiếu trên lịch), mở lại với bước nhảy 20%.
    expect(
      builder.isCleanWindow([bar('2014-06-02', 10_000), bar('2014-06-05', 12_000)], calendar),
    ).toBe(true);
  });

  it('g: mốc tải dữ liệu tính từ earliest_start_date trừ 252 phiên khởi tạo và 60 ngày dự phòng', () => {
    // 252 × 7/5 = 352,8 → 353 ngày, cộng 60 = 413 ngày trước 01/01/2012.
    expect(flashbackFetchFrom({ earliestStartDate: '2012-01-01', warmupSessions: 252 })).toBe(
      '2010-11-14',
    );
    // 100 × 7/5 = 140 ngày, cộng 60 = 200 ngày.
    expect(flashbackFetchFrom({ earliestStartDate: '2015-06-01', warmupSessions: 100 })).toBe(
      '2014-11-13',
    );
  });

  it('h: không có lịch VNINDEX thì bỏ lần tạo đề; lịch không phủ giai đoạn thì không chọn', async () => {
    const dates = weekdays('2010-01-04', '2025-12-31');
    const bars = series(dates, 3);
    const state = emptyMemoryState();
    state.vn30 = ['AAA'].map((symbol) => ({ symbol, from: new Date(0), to: null }));
    const repo = new MemoryFlashbackRepository(state, () => NOW);
    const config = readFlashbackConfig({});

    const broken = new FlashbackRoundBuilder(memoryDatabase(repo), repo, {
      dailyBars: async (symbol: string) => {
        if (symbol === 'VNINDEX') throw new Error('VNINDEX lỗi');
        return bars;
      },
    });
    await expect(broken.build(NOW, 0, config)).rejects.toBeInstanceOf(
      FlashbackCalendarUnavailableError,
    );

    const empty = new FlashbackRoundBuilder(memoryDatabase(repo), repo, {
      dailyBars: async (symbol: string) => (symbol === 'VNINDEX' ? [] : bars),
    });
    await expect(empty.build(NOW, 0, config)).rejects.toBeInstanceOf(
      FlashbackCalendarUnavailableError,
    );

    // Lịch chỉ có từ 2030: không cửa sổ nào được lịch phủ.
    const late = new FlashbackRoundBuilder(memoryDatabase(repo), repo, {
      dailyBars: async (symbol: string) =>
        symbol === 'VNINDEX' ? [{ d: '2030-01-02', o: 1, h: 1, l: 1, c: 1, v: 1 }] : bars,
    });
    expect(await late.build(NOW, 0, { ...config, maxStartAttempts: 20 })).toBeNull();

    const ok = new FlashbackRoundBuilder(memoryDatabase(repo), repo, {
      dailyBars: async (symbol: string, from: string, to: string) =>
        rangeOf(symbol === 'VNINDEX' ? series(dates, 4) : bars, from, to),
    });
    const built = await ok.build(NOW, 0, config);
    expect(built?.symbol).toBe('AAA');
    expect(built!.startDate >= '2012-01-01').toBe(true);
  });
});
