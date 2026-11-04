import { describe, expect, it } from 'vitest';

import {
  computeBars,
  computePrefix,
  cutLength,
  cutoffDayFor,
  dateOfEpochDay,
  DATASET_JUMP_GAP_CAP,
  epochDay,
  listValidCuts,
  maxZeroVolumeSessions,
  normalizeVendorRows,
  pickUniformCut,
  rejectCut,
  splitCutBars,
  TradingCalendar,
  type CutRejection,
  type DatasetBar,
  type DatasetRawRow,
  type SymbolCuts,
} from '../../src/modules/flashback/flashback-dataset.logic.js';
import {
  cutParams,
  gaussian,
  healthyBar,
  healthySeries,
  seededInt,
  seededRandom,
  weekdaysEndingOn,
  weekdaysFrom,
} from './helpers/flashback-dataset-fixtures.js';

const W = 252;
const H = 60;
const P = 30;
const L = W + H + P;
const TODAY = '2026-11-04';
const params = cutParams(TODAY);
const prefixOf = (bars: readonly DatasetBar[]) => computePrefix(bars, 5);
/** 2014-01-06 là thứ Hai; chuỗi này kết thúc xa hơn 12 tháng so với hôm nay. */
const OLD_START = '2014-01-06';
const oldSeries = (count: number, patch?: (bar: DatasetBar) => Partial<DatasetBar>) =>
  healthySeries(weekdaysFrom(OLD_START, count), patch);

describe('Flashback dataset · ngày và lịch phiên', () => {
  it('đổi qua lại giữa ngày và số ngày kể từ 1970-01-01', () => {
    expect(epochDay('1970-01-02')).toBe(1);
    expect(dateOfEpochDay(epochDay('2012-03-20'))).toBe('2012-03-20');
    expect(dateOfEpochDay(epochDay('2026-11-04'))).toBe('2026-11-04');
  });

  it('mốc "12 tháng trước hôm nay" giữ ngày trong tháng và co lại cuối tháng 2', () => {
    expect(dateOfEpochDay(cutoffDayFor('2026-11-04', 12))).toBe('2025-11-04');
    expect(dateOfEpochDay(cutoffDayFor('2024-02-29', 12))).toBe('2023-02-28');
    expect(dateOfEpochDay(cutoffDayFor('2026-11-04', 0))).toBe('2026-11-04');
  });

  it('TradingCalendar bỏ trùng và ngày sai định dạng, đếm số phiên nằm giữa hai ngày (không tính hai đầu)', () => {
    const dates = weekdaysFrom('2024-01-01', 30);
    const calendar = new TradingCalendar([...dates, dates[3]!, 'rác', '2024-13-45x']);
    expect(calendar.size).toBe(30);
    expect(calendar.first).toBe('2024-01-01');
    expect(calendar.last).toBe(dates[29]);
    expect(calendar.between(dates[1]!, dates[5]!)).toBe(3);
    expect(calendar.between(dates[1]!, dates[2]!)).toBe(0);
    expect(calendar.between(dates[5]!, dates[1]!)).toBe(0);
    // Hai đầu không phải ngày của lịch (cuối tuần) vẫn đếm đúng các phiên nằm giữa.
    expect(calendar.between('2024-01-06', '2024-01-09')).toBe(1);
  });
});

describe('Flashback dataset · normalizeVendorRows', () => {
  const unix = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000;

  it('đổi nghìn đồng ra đồng, làm tròn về số nguyên, sắp xếp tăng dần', () => {
    const rows = normalizeVendorRows(
      [
        { time: unix('2024-03-05'), open: 57.4, high: 58.15, low: 57.05, close: 57.6, volume: 1000.4 },
        { time: unix('2024-03-04'), open: 56, high: 57, low: 55.5, close: 56.8, volume: 20 },
      ],
      1_000,
      '2024-04-01',
    );
    expect(rows.map((row) => row.date)).toEqual(['2024-03-04', '2024-03-05']);
    expect(rows[1]).toEqual({
      date: '2024-03-05',
      open: 57_400,
      high: 58_150,
      low: 57_050,
      close: 57_600,
      volume: 1000,
    });
  });

  it('một ngày chỉ giữ một nến (nến sau thắng), bỏ ngày từ beforeDate trở đi và ngày rác', () => {
    const rows = normalizeVendorRows(
      [
        { time: '2024-03-04', open: 1, high: 1, low: 1, close: 1, volume: 1 },
        { time: '2024-03-04', open: 2, high: 2, low: 2, close: 2, volume: 2 },
        { time: '2024-03-31', open: 3, high: 3, low: 3, close: 3, volume: 3 },
        { time: '2024-04-01', open: 4, high: 4, low: 4, close: 4, volume: 4 },
        { time: unix('1970-01-02'), open: 5, high: 5, low: 5, close: 5, volume: 5 },
        { time: null, open: 6, high: 6, low: 6, close: 6, volume: 6 },
        null,
      ],
      1,
      '2024-04-01',
    );
    expect(rows.map((row) => [row.date, row.close])).toEqual([
      ['2024-03-04', 2],
      ['2024-03-31', 3],
    ]);
  });

  it('không loại nến lỗi: giá/khối lượng thiếu thành NaN để computeBars đánh dấu bad', () => {
    const [row] = normalizeVendorRows(
      [{ time: '2024-03-04', open: 'x', high: null, low: '', close: 20, volume: undefined }],
      1_000,
      '2024-04-01',
    );
    expect(row?.date).toBe('2024-03-04');
    expect(Number.isNaN(row?.open)).toBe(true);
    expect(Number.isNaN(row?.high)).toBe(true);
    expect(Number.isNaN(row?.low)).toBe(true);
    expect(row?.close).toBe(20_000);
    expect(Number.isNaN(row?.volume)).toBe(true);
  });
});

describe('Flashback dataset · computeBars (gap_before, bad, ret, value_raw)', () => {
  const dates = weekdaysFrom('2024-01-02', 40);
  const calendar = new TradingCalendar(dates);
  const row = (date: string, over: Partial<DatasetRawRow> = {}): DatasetRawRow => ({
    date,
    open: 20_000,
    high: 20_000,
    low: 20_000,
    close: 20_000,
    volume: 1_000,
    ...over,
  });

  it('gap_before là số phiên của sàn bị thiếu giữa hai nến liên tiếp; nến đầu bằng 0', () => {
    const { bars } = computeBars(
      [dates[0], dates[1], dates[5], dates[6], dates[20]].map((date) => row(date!)),
      calendar,
    );
    expect(bars.map((bar) => bar.gapBefore)).toEqual([0, 0, 3, 0, 13]);
    expect(bars.map((bar) => bar.idx)).toEqual([0, 1, 2, 3, 4]);
  });

  it('ngày nghỉ lễ không có trong lịch của sàn thì không tính là phiên bị thiếu', () => {
    const holiday = dates[10]!;
    const withHoliday = new TradingCalendar(dates.filter((date) => date !== holiday));
    const { bars } = computeBars([row(dates[9]!), row(dates[11]!)], withHoliday);
    expect(bars[1]?.gapBefore).toBe(0);
  });

  const spanning = new TradingCalendar([...dates, '2012-06-04', '2012-06-05', '2013-06-03', '2013-06-04']);
  const second = (over: Partial<DatasetRawRow>, date = dates[1]!, previous = dates[0]!) =>
    computeBars([row(previous), row(date, over)], spanning).bars[1]!;

  it.each<[string, Partial<DatasetRawRow>, 0 | 1]>([
    ['nến khoẻ', {}, 0],
    ['khối lượng bằng 0 không phải nến lỗi', { volume: 0 }, 0],
    ['giá cao < giá thấp', { high: 19_900, low: 20_000, open: 19_950, close: 19_950 }, 1],
    ['giá mở cao hơn giá cao', { open: 20_500, high: 20_400, low: 20_000, close: 20_200 }, 1],
    ['giá mở thấp hơn giá thấp', { open: 19_500, high: 20_400, low: 20_000, close: 20_200 }, 1],
    ['giá đóng cao hơn giá cao', { open: 20_100, high: 20_200, low: 20_000, close: 20_300 }, 1],
    ['giá đóng thấp hơn giá thấp', { open: 20_100, high: 20_200, low: 20_000, close: 19_900 }, 1],
    ['giá bằng 0', { open: 0 }, 1],
    ['giá âm', { low: -5 }, 1],
    ['giá thiếu (NaN)', { close: Number.NaN }, 1],
    ['khối lượng thiếu (NaN)', { volume: Number.NaN }, 1],
    ['khối lượng âm', { volume: -1 }, 1],
    // Biên độ HOSE 7% (từ 15/01/2013) cộng 0,5% sai số và 10đ làm tròn: 7,55%.
    ['tăng 7,4% sau phiên liền trước: còn trong biên độ', { open: 21_480, high: 21_480, low: 21_480, close: 21_480 }, 0],
    ['tăng 7,6% sau phiên liền trước: vượt biên độ', { open: 21_520, high: 21_520, low: 21_520, close: 21_520 }, 1],
    ['giảm 7,6% sau phiên liền trước: vượt biên độ', { open: 18_480, high: 18_480, low: 18_480, close: 18_480 }, 1],
  ])('bad: %s', (_name, over, expected) => {
    expect(second(over).bad).toBe(expected);
  });

  it('biên độ trước 15/01/2013 là 5%: cùng bước nhảy 6% bị loại ở 2012 và hợp lệ ở 2013', () => {
    const jump = { open: 21_200, high: 21_200, low: 21_200, close: 21_200 };
    expect(second(jump, '2012-06-05', '2012-06-04').bad).toBe(1);
    expect(second(jump, '2013-06-04', '2013-06-03').bad).toBe(0);
    const under = { open: 21_080, high: 21_080, low: 21_080, close: 21_080 };
    expect(second(under, '2012-06-05', '2012-06-04').bad).toBe(0);
  });

  it('sau khoảng nghỉ g phiên biên độ nhân lên (1 + biên)^(g + 1), tối đa DATASET_JUMP_GAP_CAP phiên', () => {
    const at = (gap: number, close: number) =>
      computeBars(
        [row(dates[0]!), row(dates[gap + 1]!, { open: close, high: close, low: close, close })],
        calendar,
      ).bars[1]!;
    // Thiếu 1 phiên: 1,07² − 1 = 14,49% (+0,55%) = 15,04%.
    expect(at(1, 22_800).gapBefore).toBe(1);
    expect(at(1, 22_800).bad).toBe(0);
    expect(at(1, 23_200).bad).toBe(1);
    // Thiếu 5 hoặc 10 phiên đều chỉ được nhân tối đa 6 lần: 1,07⁶ − 1 = 50,07% (+0,55%).
    expect(DATASET_JUMP_GAP_CAP).toBe(5);
    expect(at(5, 30_000).bad).toBe(0);
    expect(at(5, 30_400).bad).toBe(1);
    expect(at(10, 30_000).bad).toBe(0);
    expect(at(10, 30_400).bad).toBe(1);
  });

  it('ret = đóng / đóng phiên trước − 1; phiên đầu và phiên liền sau nến giá hỏng là 0', () => {
    const { bars } = computeBars(
      [
        row(dates[0]!),
        row(dates[1]!, { open: 20_400, high: 20_400, low: 20_400, close: 20_400 }),
        row(dates[2]!, { open: 0, high: 0, low: 0, close: 0 }),
        row(dates[3]!),
      ],
      calendar,
    );
    expect(bars[0]?.ret).toBe(0);
    expect(bars[1]?.ret).toBeCloseTo(0.02, 12);
    expect(bars[2]?.ret).toBe(0);
    expect(bars[3]?.ret).toBe(0);
    expect(bars[2]?.bad).toBe(1);
  });

  it('nến thiếu giá được lưu bằng 0 (cột kho không nhận NaN) và vẫn đếm vào badCount', () => {
    const result = computeBars(
      [row(dates[0]!), row(dates[1]!, { open: Number.NaN, high: Number.NaN, volume: Number.NaN })],
      calendar,
    );
    expect(result.badCount).toBe(1);
    expect(result.bars[1]).toMatchObject({ open: 0, high: 0, volume: 0, bad: 1, valueRaw: 0 });
  });

  it('value_raw: ưu tiên giá trị khớp thật; thiếu thì xấp xỉ giá đóng × khối lượng', () => {
    const rows = [row(dates[0]!), row(dates[1]!), row(dates[2]!)];
    const approx = computeBars(rows, calendar);
    expect(approx.bars.map((bar) => bar.valueRaw)).toEqual([20_000_000, 20_000_000, 20_000_000]);
    expect(approx.valueBasis).toBe('approx');
    expect(approx.matchedValueCount).toBe(0);

    const all = computeBars(
      rows,
      calendar,
      new Map([
        [dates[0]!, 30_000_000],
        [dates[1]!, 40_000_000.4],
        [dates[2]!, 0],
      ]),
    );
    expect(all.bars.map((bar) => bar.valueRaw)).toEqual([30_000_000, 40_000_000, 0]);
    expect(all.valueBasis).toBe('matched');
    expect(all.matchedValueCount).toBe(3);

    const partial = computeBars(rows, calendar, new Map([[dates[1]!, 50_000_000]]));
    expect(partial.bars.map((bar) => bar.valueRaw)).toEqual([20_000_000, 50_000_000, 20_000_000]);
    expect(partial.valueBasis).toBe('mixed');
    expect(partial.matchedValueCount).toBe(1);
  });

  it('giá trị khớp thật không hợp lệ (âm, NaN) bị bỏ qua và dùng giá trị xấp xỉ', () => {
    const { bars, valueBasis } = computeBars(
      [row(dates[0]!), row(dates[1]!)],
      calendar,
      new Map([
        [dates[0]!, -5],
        [dates[1]!, Number.NaN],
      ]),
    );
    expect(bars.map((bar) => bar.valueRaw)).toEqual([20_000_000, 20_000_000]);
    expect(valueBasis).toBe('approx');
  });
});

describe('Flashback dataset · mảng cộng dồn (computePrefix)', () => {
  /** Chuỗi ngẫu nhiên có đủ loại phiên: lỗi, nghỉ dài, khối lượng 0, thanh khoản thấp. */
  function randomSeries(count: number, seed: number): DatasetBar[] {
    const random = seededRandom(seed);
    return weekdaysFrom('2013-02-04', count).map((date, idx) => {
      const gapRoll = random();
      return healthyBar(idx, date, {
        gapBefore: gapRoll < 0.01 ? 6 + Math.floor(random() * 6) : gapRoll < 0.03 ? 1 + Math.floor(random() * 5) : 0,
        bad: random() < 0.02 ? 1 : 0,
        volume: random() < 0.03 ? 0 : 1_000 + Math.floor(random() * 5_000),
        valueRaw: Math.floor(random() * 9_000_000_000),
        ret: gaussian(random) * 0.02,
      });
    });
  }

  it('mỗi mảng có n + 1 phần tử, phần tử đầu bằng 0, và khớp phép cộng trực tiếp tại mọi vị trí', () => {
    const bars = randomSeries(500, 11);
    const prefix = computePrefix(bars, 5);
    expect(prefix.n).toBe(500);
    expect(prefix.days).toHaveLength(500);
    for (const array of [prefix.pGap, prefix.pBad, prefix.pZero, prefix.pVal, prefix.pR, prefix.pR2])
      expect(array).toHaveLength(501);
    expect(prefix.pGap[0]).toBe(0);
    expect(prefix.pBad[0]).toBe(0);
    expect(prefix.pZero[0]).toBe(0);
    expect(prefix.pVal[0]).toBe(0);
    expect(prefix.pR[0]).toBe(0);
    expect(prefix.pR2[0]).toBe(0);

    let gap = 0;
    let bad = 0;
    let zero = 0;
    let value = 0;
    let sumR = 0;
    let sumR2 = 0;
    for (let k = 1; k <= bars.length; k += 1) {
      const bar = bars[k - 1]!;
      gap += bar.gapBefore > 5 ? 1 : 0;
      bad += bar.bad;
      zero += bar.volume === 0 ? 1 : 0;
      value += bar.valueRaw;
      sumR += bar.ret;
      sumR2 += bar.ret * bar.ret;
      expect(prefix.pGap[k]).toBe(gap);
      expect(prefix.pBad[k]).toBe(bad);
      expect(prefix.pZero[k]).toBe(zero);
      expect(prefix.pVal[k]).toBe(value);
      expect(prefix.pR[k]).toBeCloseTo(sumR, 12);
      expect(prefix.pR2[k]).toBeCloseTo(sumR2, 12);
      expect(prefix.days[k - 1]).toBe(epochDay(bar.date));
    }
    // Có đủ loại dữ liệu để phép so sánh có ý nghĩa.
    expect(gap).toBeGreaterThan(0);
    expect(bad).toBeGreaterThan(0);
    expect(zero).toBeGreaterThan(0);
  });

  it('hiệu hai phần tử là tổng của đoạn: P[b] − P[a] = Σ bar[a..b)', () => {
    const bars = randomSeries(300, 12);
    const prefix = computePrefix(bars, 5);
    for (const [from, to] of [
      [0, 300],
      [17, 120],
      [250, 251],
      [100, 100],
    ] as const) {
      const slice = bars.slice(from, to);
      expect(prefix.pBad[to]! - prefix.pBad[from]!).toBe(slice.reduce((sum, bar) => sum + bar.bad, 0));
      expect(prefix.pVal[to]! - prefix.pVal[from]!).toBe(slice.reduce((sum, bar) => sum + bar.valueRaw, 0));
      expect(prefix.pR[to]! - prefix.pR[from]!).toBeCloseTo(slice.reduce((sum, bar) => sum + bar.ret, 0), 12);
    }
  });

  it('P_gap ghi cứng ngưỡng của phiên bản: đếm phiên có gap_before lớn hơn ngưỡng', () => {
    const bars = healthySeries(weekdaysFrom('2024-01-01', 10), (bar) => ({
      gapBefore: bar.idx === 3 ? 3 : bar.idx === 6 ? 5 : bar.idx === 8 ? 6 : 0,
    }));
    expect(computePrefix(bars, 5).pGap[10]).toBe(1);
    expect(computePrefix(bars, 4).pGap[10]).toBe(2);
    expect(computePrefix(bars, 2).pGap[10]).toBe(3);
    expect(computePrefix(bars, 6).pGap[10]).toBe(0);
  });

  it('chuỗi rỗng cho mảng một phần tử 0', () => {
    const prefix = computePrefix([], 5);
    expect(prefix.n).toBe(0);
    expect([...prefix.pBad]).toEqual([0]);
    expect(listValidCuts(prefix, params)).toHaveLength(0);
  });
});

describe('Flashback dataset · maxZeroVolumeSessions = max(1, ⌊D × 2,5%⌋)', () => {
  it.each([
    [30, 1],
    [60, 1],
    [79, 1],
    [80, 2],
    [90, 2],
    [119, 2],
    [120, 3],
    [200, 5],
    [240, 6],
  ])('D = %i phiên cho phép %i phiên khối lượng 0', (display, expected) => {
    expect(maxZeroVolumeSessions(display, 0.025)).toBe(expected);
  });
});

describe('Flashback dataset · rejectCut: từng điều kiện đúng ngưỡng và vừa quá ngưỡng (§3.2)', () => {
  const s = 7;

  it('nến khoẻ: điểm cắt hợp lệ', () => {
    expect(cutLength(params)).toBe(L);
    expect(rejectCut(prefixOf(oldSeries(L + 20)), s, params)).toBeNull();
  });

  describe('#1 đủ L = 252 + H + P phiên', () => {
    it('đúng L phiên thì hợp lệ, thiếu một phiên thì loại', () => {
      const exact = prefixOf(oldSeries(L));
      expect(rejectCut(exact, 0, params)).toBeNull();
      expect(rejectCut(exact, 1, params)).toBe('range');
      expect(rejectCut(exact, -1, params)).toBe('range');
      expect(rejectCut(exact, 0.5, params)).toBe('range');
      const short = prefixOf(oldSeries(L - 1));
      expect(rejectCut(short, 0, params)).toBe('range');
      expect(listValidCuts(short, params)).toHaveLength(0);
      expect([...listValidCuts(exact, params)]).toEqual([0]);
    });

    it('L đổi theo (H, P) của phòng', () => {
      const bars = prefixOf(oldSeries(252 + 30 + 30));
      expect(rejectCut(bars, 0, cutParams(TODAY, { viewBars: 30, playBars: 30 }))).toBeNull();
      expect(rejectCut(bars, 0, cutParams(TODAY, { viewBars: 31, playBars: 30 }))).toBe('range');
    });
  });

  describe('#2 phiên chơi cuối cách hôm nay ít nhất 12 tháng', () => {
    const endingOn = (last: string) => prefixOf(healthySeries(weekdaysEndingOn(last, L)));

    it('đúng 12 tháng (2025-11-04) hợp lệ, một ngày sau đó bị loại', () => {
      expect(rejectCut(endingOn('2025-11-04'), 0, params)).toBeNull();
      expect(rejectCut(endingOn('2025-11-03'), 0, params)).toBeNull();
      expect(rejectCut(endingOn('2025-11-05'), 0, params)).toBe('recent');
    });

    it('phiên chơi cuối cách 11 tháng bị loại', () => {
      expect(rejectCut(endingOn('2025-12-04'), 0, params)).toBe('recent');
    });

    it('chỉ phiên chơi CUỐI quyết định mốc 12 tháng: mọi điểm cắt hợp lệ có phiên chơi cuối không muộn hơn mốc', () => {
      const long = prefixOf(healthySeries(weekdaysEndingOn('2026-10-30', L + 400)));
      const valid = listValidCuts(long, params);
      expect(valid.length).toBeGreaterThan(0);
      for (const start of valid) {
        const lastDay = long.days[start + L - 1]!;
        expect(lastDay).toBeLessThanOrEqual(params.cutoffDay);
      }
      // Điểm cắt hợp lệ cuối cùng và điểm kế tiếp nằm hai bên mốc.
      const last = valid[valid.length - 1]!;
      expect(rejectCut(long, last + 1, params)).toBe('recent');
    });

    it('mốc tính theo hôm nay: cùng một chuỗi hợp lệ hôm nay có thể bị loại ở ngày sớm hơn', () => {
      const bars = prefixOf(healthySeries(weekdaysEndingOn('2025-11-04', L)));
      expect(rejectCut(bars, 0, cutParams('2026-11-04'))).toBeNull();
      expect(rejectCut(bars, 0, cutParams('2026-11-03'))).toBe('recent');
      expect(rejectCut(bars, 0, cutParams('2026-11-03', { minMonthsAgo: 11 }))).toBeNull();
    });
  });

  describe('#3 không khoảng nghỉ vượt ngưỡng trong [s + 1, s + L)', () => {
    const withGap = (index: number, gap: number) =>
      prefixOf(oldSeries(L + 20, (bar) => (bar.idx === index ? { gapBefore: gap } : {})));

    it('đúng 5 phiên nghỉ hợp lệ, 6 phiên nghỉ bị loại', () => {
      expect(rejectCut(withGap(s + 100, 5), s, params)).toBeNull();
      expect(rejectCut(withGap(s + 100, 6), s, params)).toBe('gap');
      expect(rejectCut(withGap(s + 100, 40), s, params)).toBe('gap');
    });

    it('khoảng nghỉ ngay TRƯỚC phiên đầu của đoạn cắt và ngay SAU phiên cuối không tính', () => {
      expect(rejectCut(withGap(s, 6), s, params)).toBeNull();
      expect(rejectCut(withGap(s + 1, 6), s, params)).toBe('gap');
      expect(rejectCut(withGap(s + L - 1, 6), s, params)).toBe('gap');
      expect(rejectCut(withGap(s + L, 6), s, params)).toBeNull();
    });

    it('khoảng nghỉ nằm cả ở phần khởi tạo cũng làm loại điểm cắt', () => {
      expect(rejectCut(withGap(s + 10, 6), s, params)).toBe('gap');
    });
  });

  describe('#4 không có nến lỗi (bad) trong [s, s + L)', () => {
    const withBad = (index: number) =>
      prefixOf(oldSeries(L + 20, (bar) => (bar.idx === index ? { bad: 1 } : {})));

    it('một nến lỗi ở bất kỳ đâu trong đoạn cắt làm loại điểm cắt', () => {
      expect(rejectCut(withBad(s + 100), s, params)).toBe('bad');
      expect(rejectCut(withBad(s), s, params)).toBe('bad');
      expect(rejectCut(withBad(s + L - 1), s, params)).toBe('bad');
    });

    it('nến lỗi ngay trước hoặc ngay sau đoạn cắt không ảnh hưởng', () => {
      expect(rejectCut(withBad(s - 1), s, params)).toBeNull();
      expect(rejectCut(withBad(s + L), s, params)).toBeNull();
    });
  });

  describe('#5 phiên khối lượng 0 trên phần hiện không quá max(1, ⌊D × 2,5%⌋)', () => {
    const withZeros = (indexes: readonly number[]) =>
      prefixOf(oldSeries(L + 20, (bar) => (indexes.includes(bar.idx) ? { volume: 0 } : {})));
    const displayStart = s + W;
    const inDisplay = (count: number) => Array.from({ length: count }, (_, i) => displayStart + 5 + i * 7);

    it('H = 60, P = 30 (D = 90): đúng 2 phiên hợp lệ, 3 phiên bị loại', () => {
      expect(rejectCut(withZeros(inDisplay(2)), s, params)).toBeNull();
      expect(rejectCut(withZeros(inDisplay(3)), s, params)).toBe('zero_volume');
    });

    it('H = 30, P = 30 (D = 60): ⌊1,5⌋ = 1 nên đúng 1 phiên hợp lệ, 2 phiên bị loại', () => {
      const small = cutParams(TODAY, { viewBars: 30, playBars: 30 });
      expect(rejectCut(withZeros(inDisplay(1)), s, small)).toBeNull();
      expect(rejectCut(withZeros(inDisplay(2)), s, small)).toBe('zero_volume');
    });

    it('H = 120, P = 120 (D = 240): đúng 6 phiên hợp lệ, 7 phiên bị loại', () => {
      const big = cutParams(TODAY, { viewBars: 120, playBars: 120 });
      const first = s + W + 3;
      const zerosAt = (count: number) =>
        prefixOf(
          oldSeries(252 + 240 + 20, (bar) =>
            bar.idx >= first && (bar.idx - first) % 11 === 0 && (bar.idx - first) / 11 < count
              ? { volume: 0 }
              : {},
          ),
        );
      expect(rejectCut(zerosAt(6), s, big)).toBeNull();
      expect(rejectCut(zerosAt(7), s, big)).toBe('zero_volume');
    });

    it('phiên khối lượng 0 ở phần khởi tạo (trước s + W) không tính, ở s + W tính, ở s + L không tính', () => {
      const manyInWarmup = Array.from({ length: 50 }, (_, i) => s + i);
      expect(rejectCut(withZeros(manyInWarmup), s, params)).toBeNull();
      expect(rejectCut(withZeros([displayStart - 1, ...inDisplay(2)]), s, params)).toBeNull();
      expect(rejectCut(withZeros([displayStart, displayStart + 1, displayStart + 2]), s, params)).toBe('zero_volume');
      expect(rejectCut(withZeros([s + L - 1, s + L - 2, s + L - 3]), s, params)).toBe('zero_volume');
      expect(rejectCut(withZeros([s + L, s + L + 1, s + L + 2]), s, params)).toBeNull();
    });
  });

  describe('#6 giá trị giao dịch bình quân trên phần hiện ≥ 3 tỷ đồng/phiên', () => {
    const displayStart = s + W;
    const withDisplayValue = (value: number, over: (bar: DatasetBar) => Partial<DatasetBar> = () => ({})) =>
      prefixOf(
        oldSeries(L + 20, (bar) =>
          bar.idx >= displayStart && bar.idx < s + L ? { valueRaw: value, ...over(bar) } : {},
        ),
      );

    it('đúng 3 tỷ hợp lệ, thấp hơn 1 đồng thì bị loại', () => {
      expect(rejectCut(withDisplayValue(3_000_000_000), s, params)).toBeNull();
      expect(rejectCut(withDisplayValue(2_999_999_999), s, params)).toBe('liquidity');
      expect(rejectCut(withDisplayValue(3_000_000_001), s, params)).toBeNull();
    });

    it('là giá trị bình quân chứ không phải từng phiên: một nửa 6 tỷ + một nửa 0 vẫn đạt đúng 3 tỷ', () => {
      const bars = withDisplayValue(0, (bar) => ((bar.idx - displayStart) % 2 === 0 ? { valueRaw: 6_000_000_000 } : {}));
      // D = 90 chẵn nên có đúng 45 phiên 6 tỷ và 45 phiên 0: bình quân 3 tỷ.
      expect(rejectCut(bars, s, params)).toBeNull();
      const worse = withDisplayValue(0, (bar) => ((bar.idx - displayStart) % 2 === 0 ? { valueRaw: 5_999_999_998 } : {}));
      expect(rejectCut(worse, s, params)).toBe('liquidity');
    });

    it('chỉ tính phần hiện: phần khởi tạo thanh khoản 0 vẫn hợp lệ, phần khởi tạo giàu không bù cho phần hiện nghèo', () => {
      const poorWarmup = prefixOf(
        oldSeries(L + 20, (bar) => (bar.idx < displayStart ? { valueRaw: 0 } : {})),
      );
      expect(rejectCut(poorWarmup, s, params)).toBeNull();
      const richWarmup = prefixOf(
        oldSeries(L + 20, (bar) =>
          bar.idx < displayStart ? { valueRaw: 100_000_000_000 } : bar.idx < s + L ? { valueRaw: 2_900_000_000 } : {},
        ),
      );
      expect(rejectCut(richWarmup, s, params)).toBe('liquidity');
    });

    it('ngưỡng đổi được bằng tham số', () => {
      const bars = withDisplayValue(2_000_000_000);
      expect(rejectCut(bars, s, params)).toBe('liquidity');
      expect(rejectCut(bars, s, cutParams(TODAY, { minLiquidityVnd: 2_000_000_000 }))).toBeNull();
    });
  });

  describe('#7 độ lệch chuẩn lợi suất ngày của các phiên chơi ≥ 1%', () => {
    const playStart = s + W + H;
    /** Lợi suất xen kẽ ±r trên P phiên chơi, 0 ở phần còn lại. */
    const alternating = (r: number, outside = 0) =>
      prefixOf(
        oldSeries(L + 20, (bar) => {
          if (bar.idx >= playStart && bar.idx < s + L) return { ret: (bar.idx - playStart) % 2 === 0 ? r : -r };
          return { ret: bar.idx % 2 === 0 ? outside : -outside };
        }),
      );

    it('đúng 1% hợp lệ, 0,99% bị loại', () => {
      expect(rejectCut(alternating(0.01), s, params)).toBeNull();
      expect(rejectCut(alternating(0.0099), s, params)).toBe('volatility');
      expect(rejectCut(alternating(0.0101), s, params)).toBeNull();
    });

    it('độ lệch chuẩn tính quanh trung bình: 0,03 và 0,01 xen kẽ (trung bình 2%, độ lệch 1%) đạt đúng ngưỡng', () => {
      const bars = prefixOf(
        oldSeries(L + 20, (bar) =>
          bar.idx >= playStart && bar.idx < s + L ? { ret: (bar.idx - playStart) % 2 === 0 ? 0.03 : 0.01 } : {},
        ),
      );
      expect(rejectCut(bars, s, params)).toBeNull();
      const flatter = prefixOf(
        oldSeries(L + 20, (bar) =>
          bar.idx >= playStart && bar.idx < s + L ? { ret: (bar.idx - playStart) % 2 === 0 ? 0.0299 : 0.0101 } : {},
        ),
      );
      expect(rejectCut(flatter, s, params)).toBe('volatility');
    });

    it('lợi suất không đổi (đường thẳng) có độ lệch chuẩn 0 nên bị loại dù biến động lớn', () => {
      const line = prefixOf(
        oldSeries(L + 20, (bar) => (bar.idx >= playStart && bar.idx < s + L ? { ret: 0.02 } : {})),
      );
      expect(rejectCut(line, s, params)).toBe('volatility');
    });

    it('chỉ tính các phiên chơi: phần xem biến động mạnh không bù cho phần chơi phẳng, và ngược lại', () => {
      const flatPlay = alternating(0, 0.05);
      expect(rejectCut(flatPlay, s, params)).toBe('volatility');
      const flatView = alternating(0.02, 0);
      expect(rejectCut(flatView, s, params)).toBeNull();
    });

    it('phiên chơi đầu tiên tính vào; phiên xem cuối và phiên ngay sau phiên chơi cuối thì không', () => {
      // Mọi phiên khác có lợi suất 0; một cú nhảy 10% làm độ lệch chuẩn = 0,1·√29/30 ≈ 1,8%.
      const spikeAt = (index: number) =>
        prefixOf(oldSeries(L + 20, (bar) => ({ ret: bar.idx === index ? 0.1 : 0 })));
      expect(rejectCut(spikeAt(playStart), s, params)).toBeNull();
      expect(rejectCut(spikeAt(s + L - 1), s, params)).toBeNull();
      expect(rejectCut(spikeAt(playStart - 1), s, params)).toBe('volatility');
      expect(rejectCut(spikeAt(s + L), s, params)).toBe('volatility');
    });
  });

  it('thứ tự kiểm tra: phạm vi > gần đây > khoảng nghỉ > nến lỗi > khối lượng 0 > thanh khoản > biến động', () => {
    const all = (over: (bar: DatasetBar) => Partial<DatasetBar>) => prefixOf(oldSeries(L + 20, over));
    const everything = (bar: DatasetBar): Partial<DatasetBar> => ({
      gapBefore: bar.idx === 100 ? 9 : 0,
      bad: bar.idx === 120 ? 1 : 0,
      volume: bar.idx >= W + s && bar.idx < s + L && bar.idx % 3 === 0 ? 0 : 1_000_000,
      valueRaw: bar.idx >= W + s ? 1_000 : 10_000_000_000,
      ret: 0,
    });
    const sequence: Array<[(bar: DatasetBar) => Partial<DatasetBar>, CutRejection]> = [
      [everything, 'gap'],
      [(bar) => ({ ...everything(bar), gapBefore: 0 }), 'bad'],
      [(bar) => ({ ...everything(bar), gapBefore: 0, bad: 0 }), 'zero_volume'],
      [(bar) => ({ ...everything(bar), gapBefore: 0, bad: 0, volume: 1_000_000 }), 'liquidity'],
      [(bar) => ({ ...everything(bar), gapBefore: 0, bad: 0, volume: 1_000_000, valueRaw: 10_000_000_000 }), 'volatility'],
    ];
    for (const [patch, expected] of sequence) expect(rejectCut(all(patch), s, params)).toBe(expected);
    // Quá hạn 12 tháng được báo trước cả khoảng nghỉ.
    const recent = prefixOf(healthySeries(weekdaysEndingOn('2026-10-30', L), (bar) => ({ gapBefore: bar.idx === 100 ? 9 : 0 })));
    expect(rejectCut(recent, 0, params)).toBe('recent');
    expect(rejectCut(recent, 3, params)).toBe('range');
  });
});

describe('Flashback dataset · listValidCuts', () => {
  it('liệt kê đúng các điểm cắt không chạm nến lỗi (n = 1.000, nến lỗi ở phiên 400)', () => {
    const bars = oldSeries(1_000, (bar) => (bar.idx === 400 ? { bad: 1 } : {}));
    const cuts = listValidCuts(prefixOf(bars), params);
    const expected: number[] = [];
    for (let start = 0; start <= 1_000 - L; start += 1) {
      if (!(start <= 400 && 400 < start + L)) expected.push(start);
    }
    expect([...cuts]).toEqual(expected);
    // Các điểm cắt bị loại là s ∈ [400 − L + 1, 400] = [59, 400].
    expect(cuts).toHaveLength(59 + (1_000 - L - 401 + 1));
    expect(cuts[58]).toBe(58);
    expect(cuts[59]).toBe(401);
  });

  it('kết quả của phép trừ mảng cộng dồn khớp phép kiểm tra trực tiếp trên nến ở mọi điểm cắt (chuỗi ngẫu nhiên)', () => {
    const random = seededRandom(12);
    const n = 1_500;
    const dates = weekdaysFrom('2013-02-04', n);
    const bars = dates.map((date, idx) => {
      // Mỗi điều kiện có một đoạn dữ liệu riêng làm loại một nhóm điểm cắt: khoảng nghỉ ở phiên 120,
      // khối lượng thưa ở [200, 450), thanh khoản thấp ở [500, 650), lợi suất phẳng ở [750, 1.000),
      // nến lỗi ở phiên 1.050; thêm nhiễu ngẫu nhiên nhẹ ở khắp nơi.
      const dry = idx >= 200 && idx < 450;
      const poor = idx >= 500 && idx < 650;
      const quiet = idx >= 750 && idx < 1_000;
      const gapRoll = random();
      const randomGap =
        gapRoll < 0.0003 ? 6 + Math.floor(random() * 6) : gapRoll < 0.004 ? 1 + Math.floor(random() * 5) : 0;
      return healthyBar(idx, date, {
        gapBefore: idx === 120 ? 9 : randomGap,
        bad: idx === 1_050 || random() < 0.0003 ? 1 : 0,
        volume: random() < (dry ? 0.15 : 0.002) ? 0 : 500_000,
        valueRaw: poor ? 500_000_000 : 4_000_000_000 + Math.floor(random() * 8_000_000_000),
        ret: gaussian(random) * (quiet ? 0.003 : 0.02),
      });
    });
    const prefix = computePrefix(bars, 5);
    // Mốc 12 tháng rơi ở phiên 1.200: các điểm cắt có phiên chơi cuối sau đó bị loại vì quá gần.
    const settings = cutParams(TODAY, { cutoffDay: epochDay(dates[1_200]!) });

    const naive = (start: number): CutRejection | null => {
      const length = cutLength(settings);
      if (start < 0 || start + length > bars.length) return 'range';
      const window = bars.slice(start, start + length);
      if (epochDay(window[length - 1]!.date) > settings.cutoffDay) return 'recent';
      if (window.slice(1).some((bar) => bar.gapBefore > 5)) return 'gap';
      if (window.some((bar) => bar.bad === 1)) return 'bad';
      const display = window.slice(settings.warmup);
      const zeros = display.filter((bar) => bar.volume === 0).length;
      if (zeros > Math.max(1, Math.floor(display.length * settings.maxZeroVolumeRatio + 1e-9))) return 'zero_volume';
      const mean = display.reduce((sum, bar) => sum + bar.valueRaw, 0) / display.length;
      if (mean < settings.minLiquidityVnd) return 'liquidity';
      const play = window.slice(settings.warmup + settings.viewBars).map((bar) => bar.ret);
      const average = play.reduce((sum, value) => sum + value, 0) / play.length;
      const variance = play.reduce((sum, value) => sum + (value - average) ** 2, 0) / play.length;
      return Math.sqrt(variance) < settings.minDailyVolatility ? 'volatility' : null;
    };

    const seen = new Map<string, number>();
    for (let start = -3; start <= n - L + 3; start += 1) {
      const actual = rejectCut(prefix, start, settings);
      expect(actual, `điểm cắt ${start}`).toBe(naive(start));
      seen.set(String(actual), (seen.get(String(actual)) ?? 0) + 1);
    }
    // Mỗi điều kiện đều có điểm cắt bị loại vì nó, và có điểm cắt hợp lệ.
    for (const reason of ['range', 'recent', 'gap', 'bad', 'zero_volume', 'liquidity', 'volatility', 'null'])
      expect(seen.get(reason) ?? 0, reason).toBeGreaterThan(0);
  });
});

describe('Flashback dataset · pickUniformCut (§3.3)', () => {
  const symbolCuts = (symbol: string, cuts: number[]): SymbolCuts => ({ symbol, cuts: Int32Array.from(cuts) });

  it('không có mã nào có điểm cắt thì trả null (không thử lại, không nới điều kiện)', () => {
    let calls = 0;
    const random = (max: number) => {
      calls += 1;
      return max - 1;
    };
    expect(pickUniformCut([], random)).toBeNull();
    expect(pickUniformCut([symbolCuts('AAA', []), symbolCuts('BBB', [])], random)).toBeNull();
    expect(calls).toBe(0);
  });

  it('chọn mã trong các mã CÓ điểm cắt trước, rồi chọn điểm cắt của mã đó (đúng hai lần gọi bộ sinh)', () => {
    const calls: number[] = [];
    const script = [1, 0];
    const random = (max: number) => {
      calls.push(max);
      return script[calls.length - 1]!;
    };
    const picked = pickUniformCut(
      [symbolCuts('AAA', []), symbolCuts('BBB', [5, 6]), symbolCuts('CCC', [9, 10, 11])],
      random,
    );
    expect(picked).toEqual({ symbol: 'CCC', startIdx: 9 });
    expect(calls).toEqual([2, 3]);
  });

  it('mỗi mã có cơ hội ngang nhau trong 10.000 lần chọn, không phụ thuộc số điểm cắt của mã (±20%, 20 mã)', () => {
    // Số điểm cắt chênh nhau tới 5.000 lần: nếu chọn đều theo điểm cắt thì mã 1 điểm gần như
    // không bao giờ được chọn, còn mã 5.000 điểm chiếm hơn một nửa.
    const counts = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1_597, 2_584, 4_181, 5_000, 4_999];
    const candidates = counts.map((count, index) =>
      symbolCuts(`S${String(index).padStart(2, '0')}`, Array.from({ length: count }, (_, i) => i * 2)),
    );
    const random = seededInt(20261104);
    const hits = new Map<string, number>();
    for (let pick = 0; pick < 10_000; pick += 1) {
      const chosen = pickUniformCut(candidates, random)!;
      hits.set(chosen.symbol, (hits.get(chosen.symbol) ?? 0) + 1);
    }
    expect(hits.size).toBe(20);
    const expected = 10_000 / 20;
    for (const [symbol, hit] of hits) {
      expect(Math.abs(hit - expected) / expected, symbol).toBeLessThanOrEqual(0.2);
    }
  });

  it('mọi điểm cắt của cùng một mã có cơ hội ngang nhau (±15%)', () => {
    const only = [symbolCuts('ONE', [3, 8, 9, 40, 41, 77, 100, 101, 250, 600])];
    const random = seededInt(7);
    const hits = new Map<number, number>();
    for (let pick = 0; pick < 10_000; pick += 1) {
      const chosen = pickUniformCut(only, random)!;
      hits.set(chosen.startIdx, (hits.get(chosen.startIdx) ?? 0) + 1);
    }
    expect(hits.size).toBe(10);
    for (const [start, hit] of hits) expect(Math.abs(hit - 1_000) / 1_000, String(start)).toBeLessThanOrEqual(0.15);
  });

  it('93 mã (cỡ VN100 thật): phân bố khớp phân bố đều theo kiểm định khi bình phương', () => {
    // 10.000 lần chọn trên 93 mã (kỳ vọng 107,5 lần/mã, độ lệch chuẩn 10,3 = 9,6%): ngưỡng ±20% là
    // 2,1 độ lệch chuẩn nên gần như chắc chắn có mã vượt khi chỉ nhìn giá trị lớn nhất; thước đo
    // đúng cho tính đều là χ² với 92 bậc tự do (ngưỡng 99,9% ≈ 140).
    const candidates = Array.from({ length: 93 }, (_, index) =>
      symbolCuts(`M${index}`, Array.from({ length: 1 + ((index * 977) % 3_000) }, (_, i) => i)),
    );
    const random = seededInt(93);
    const hits = new Map<string, number>();
    for (let pick = 0; pick < 10_000; pick += 1) {
      const chosen = pickUniformCut(candidates, random)!;
      hits.set(chosen.symbol, (hits.get(chosen.symbol) ?? 0) + 1);
    }
    const expected = 10_000 / 93;
    let chi2 = 0;
    for (const candidate of candidates) chi2 += ((hits.get(candidate.symbol) ?? 0) - expected) ** 2 / expected;
    expect(hits.size).toBe(93);
    expect(chi2).toBeLessThan(140);
  });
});

describe('Flashback dataset · splitCutBars', () => {
  it('tách W nến khởi tạo và H + P nến hiện trên biểu đồ', () => {
    const rows = healthySeries(weekdaysFrom('2020-01-06', L)).map((bar) => ({
      d: bar.date,
      o: bar.open,
      h: bar.high,
      l: bar.low,
      c: bar.close,
      v: bar.volume,
    }));
    const { warmupBars, bars } = splitCutBars(rows, W);
    expect(warmupBars).toHaveLength(W);
    expect(bars).toHaveLength(H + P);
    expect(bars[0]).toBe(rows[W]);
    expect(warmupBars.at(-1)).toBe(rows[W - 1]);
  });
});
