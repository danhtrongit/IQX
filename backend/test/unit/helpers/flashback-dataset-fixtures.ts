/**
 * Dữ liệu giả dùng chung cho test kho dữ liệu Flashback v2.2: chuỗi ngày giao dịch, bộ sinh số
 * ngẫu nhiên có hạt giống (kết quả thống kê lặp lại được) và các nến "khoẻ" để mỗi test chỉ cần
 * sửa đúng một điều kiện.
 */

import {
  cutoffDayFor,
  dateOfEpochDay,
  epochDay,
  type CutParams,
  type DatasetBar,
  type DatasetRawRow,
} from '../../../src/modules/flashback/flashback-dataset.logic.js';

const isWeekday = (day: number): boolean => {
  const weekday = new Date(day * 86_400_000).getUTCDay();
  return weekday !== 0 && weekday !== 6;
};

/** `count` ngày thứ Hai-thứ Sáu liên tiếp, bắt đầu từ `from` (hoặc ngày làm việc kế tiếp). */
export function weekdaysFrom(from: string, count: number): string[] {
  const dates: string[] = [];
  let day = epochDay(from);
  while (dates.length < count) {
    if (isWeekday(day)) dates.push(dateOfEpochDay(day));
    day += 1;
  }
  return dates;
}

/** `count` ngày thứ Hai-thứ Sáu liên tiếp, kết thúc ở `last` (hoặc ngày làm việc liền trước). */
export function weekdaysEndingOn(last: string, count: number): string[] {
  const dates: string[] = [];
  let day = epochDay(last);
  while (dates.length < count) {
    if (isWeekday(day)) dates.push(dateOfEpochDay(day));
    day -= 1;
  }
  return dates.reverse();
}

/** mulberry32: bộ sinh số giả ngẫu nhiên trong [0, 1) có hạt giống. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Bộ sinh số nguyên trong `[0, max)` có hạt giống, cùng kiểu với `RandomInt` của bộ chọn. */
export function seededInt(seed: number): (maxExclusive: number) => number {
  const random = seededRandom(seed);
  return (maxExclusive) => Math.floor(random() * maxExclusive);
}

/** Số ngẫu nhiên chuẩn N(0, 1) (Box-Muller) từ một bộ sinh đều. */
export function gaussian(random: () => number): number {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/** Một phiên khoẻ: giá 20.000đ, khối lượng 1 triệu, giá trị 10 tỷ, lợi suất xen kẽ ±2%. */
export function healthyBar(idx: number, date: string, over: Partial<DatasetBar> = {}): DatasetBar {
  const close = 20_000;
  return {
    idx,
    date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000_000,
    valueRaw: 10_000_000_000,
    gapBefore: 0,
    bad: 0,
    ret: idx % 2 === 0 ? 0.02 : -0.02,
    ...over,
  };
}

/** Chuỗi phiên khoẻ theo các ngày cho trước; `patch` sửa từng phiên. */
export function healthySeries(
  dates: readonly string[],
  patch?: (bar: DatasetBar) => Partial<DatasetBar>,
): DatasetBar[] {
  return dates.map((date, idx) => {
    const base = healthyBar(idx, date);
    return patch ? { ...base, ...patch(base) } : base;
  });
}

/** Tham số cắt mặc định của spec: W = 252, mốc 12 tháng, 2,5%, 3 tỷ, 1%. */
export function cutParams(
  today: string,
  over: Partial<CutParams> & { minMonthsAgo?: number } = {},
): CutParams {
  const { minMonthsAgo = 12, ...rest } = over;
  return {
    warmup: 252,
    viewBars: 60,
    playBars: 30,
    cutoffDay: cutoffDayFor(today, minMonthsAgo),
    maxZeroVolumeRatio: 0.025,
    minLiquidityVnd: 3_000_000_000,
    minDailyVolatility: 0.01,
    ...rest,
  };
}

/**
 * Nến thô của nguồn (đã đổi về đồng) cho test bộ dựng: giá xen kẽ 20.000đ/20.400đ (lợi suất
 * ±2%), khối lượng 600.000 (giá trị xấp xỉ 12 tỷ/phiên).
 */
export function healthyRows(dates: readonly string[]): DatasetRawRow[] {
  return dates.map((date, index) => {
    const close = index % 2 === 0 ? 20_000 : 20_400;
    return { date, open: close, high: close, low: close, close, volume: 600_000 };
  });
}
