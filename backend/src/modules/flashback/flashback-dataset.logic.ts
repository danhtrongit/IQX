/**
 * Logic thuần của kho dữ liệu Flashback v2.2 (IQX-Flashback-SPEC-DuLieu.md): dựng một bộ dữ liệu
 * từ nến ngày của nguồn, tính các mảng cộng dồn (§1.3), kiểm tra một điểm cắt bằng các phép trừ
 * (§3.2), liệt kê mọi điểm cắt hợp lệ và chọn ngẫu nhiên đều (§3.3).
 *
 * Không có I/O, không có Nest: mọi hàm nhận dữ liệu và trả kết quả để test từng điều kiện ở đúng
 * ngưỡng. Đơn vị: giá là đồng nguyên (đã điều chỉnh), khối lượng như nguồn công bố, `value_raw` là
 * đồng.
 */

import { FLASHBACK_BAND_TOLERANCE, flashbackHosePriceBand } from './flashback.constants.js';
import { flashbarDate } from './flashback.market-data.js';
import { subtractMonths } from './flashback.round-builder.js';
import type { FlashbackBar } from './flashback.types.js';

/** Bước giá nhỏ nhất của nguồn (DNSE: 0,01 nghìn đồng = 10đ), cộng vào sai số làm tròn. */
export const DATASET_PRICE_STEP_VND = 10;

/** Số phiên bị thiếu tối đa được dùng khi nới biên độ cho bước nhảy giá sau một khoảng nghỉ. */
export const DATASET_JUMP_GAP_CAP = 5;

/** Mốc sớm nhất chấp nhận cho một ngày giao dịch (loại ngày rác như 1970). */
export const DATASET_EARLIEST_DATE = '1995-01-01';

/** Sai số khi so độ lệch chuẩn với ngưỡng (sai số dấu phẩy động của mảng cộng dồn). */
const STD_EPSILON = 1e-12;

// ------------------------------------------------------------------ ngày

const DAY_MS = 86_400_000;

/** Số ngày kể từ 1970-01-01 của một ngày YYYY-MM-DD. */
export function epochDay(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

/** Ngày YYYY-MM-DD của một số ngày kể từ 1970-01-01. */
export function dateOfEpochDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function lowerBound(values: Int32Array, target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid]! < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function upperBound(values: Int32Array, target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid]! <= target) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Lịch phiên giao dịch của sàn (từ chỉ số VNINDEX), dùng để đếm `gap_before`. */
export class TradingCalendar {
  private readonly days: Int32Array;

  constructor(dates: readonly string[]) {
    const unique = [...new Set(dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
    this.days = Int32Array.from(unique.map(epochDay));
  }

  get size(): number {
    return this.days.length;
  }

  get first(): string | null {
    return this.days.length > 0 ? dateOfEpochDay(this.days[0]!) : null;
  }

  get last(): string | null {
    return this.days.length > 0 ? dateOfEpochDay(this.days[this.days.length - 1]!) : null;
  }

  /** Số phiên của sàn nằm giữa hai ngày (không tính hai đầu). */
  between(previousDate: string, date: string): number {
    const before = upperBound(this.days, epochDay(previousDate));
    const upTo = lowerBound(this.days, epochDay(date));
    return Math.max(0, upTo - before);
  }
}

// ------------------------------------------------------------------ nến thô -> bộ dữ liệu

/** Một nến ngày đã đổi về đồng; số không hữu hạn nghĩa là nguồn thiếu giá trị đó. */
export interface DatasetRawRow {
  readonly date: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

const numberOrNaN = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return Number.NaN;
  if (typeof value !== 'number' && typeof value !== 'string') return Number.NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

/**
 * Chuẩn hoá nến thô của nguồn (`{time, open, high, low, close, volume}`) về đồng nguyên.
 *
 * - `scale` đổi giá về đồng (DNSE và VND: 1.000 vì giá tính bằng nghìn đồng; VCI: 1).
 * - Một ngày chỉ giữ một nến (nến sau thắng), sắp xếp tăng dần.
 * - Bỏ nến từ `beforeDate` trở đi: phiên đang diễn ra hoặc hôm nay chưa chốt không vào kho.
 * - Không loại nến lỗi ở đây: nến lỗi giữ nguyên và được đánh dấu `bad` ở `computeBars`.
 */
export function normalizeVendorRows(
  rows: readonly unknown[],
  scale: number,
  beforeDate: string,
): DatasetRawRow[] {
  const byDate = new Map<string, DatasetRawRow>();
  const price = (value: unknown): number => {
    const parsed = numberOrNaN(value);
    return Number.isFinite(parsed) ? Math.round(parsed * scale) : Number.NaN;
  };
  for (const raw of rows) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const date = flashbarDate(row.time);
    if (!date || date < DATASET_EARLIEST_DATE || date >= beforeDate) continue;
    const volume = numberOrNaN(row.volume);
    byDate.set(date, {
      date,
      open: price(row.open),
      high: price(row.high),
      low: price(row.low),
      close: price(row.close),
      volume: Number.isFinite(volume) ? Math.round(volume) : Number.NaN,
    });
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

/** Một phiên của bộ dữ liệu (§1.2). */
export interface DatasetBar {
  readonly idx: number;
  readonly date: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly valueRaw: number;
  readonly gapBefore: number;
  readonly bad: 0 | 1;
  readonly ret: number;
}

export type DatasetValueBasis = 'matched' | 'mixed' | 'approx';

export interface ComputedBars {
  readonly bars: DatasetBar[];
  readonly badCount: number;
  /** Số phiên có `value_raw` lấy từ giá trị khớp thật của sở. */
  readonly matchedValueCount: number;
  readonly valueBasis: DatasetValueBasis;
}

/**
 * Tính `idx`, `gap_before`, `bad`, `ret` và `value_raw` cho từng phiên của một mã (§1.2).
 *
 * `bad` = 1 khi một trong các điều sau đúng:
 * 1. giá mở, cao, thấp hoặc đóng thiếu hoặc ≤ 0;
 * 2. giá cao < giá thấp;
 * 3. giá mở hoặc đóng nằm ngoài [thấp, cao];
 * 4. giá đóng đổi vượt biên độ sàn so với phiên trước mà không có điều chỉnh tương ứng. Nguồn đã
 *    trả giá điều chỉnh, nên mọi bước nhảy còn sót vượt biên độ đều là dữ liệu hỏng. Biên độ là
 *    HOSE theo ngày (5% trước 15/01/2013, 7% sau đó) cộng sai số làm tròn; sau một khoảng nghỉ
 *    `g` phiên thiếu, biên độ nhân lên `(1 + biên)^(g + 1)` (tối đa `DATASET_JUMP_GAP_CAP`);
 * 5. khối lượng thiếu hoặc âm.
 *
 * `ret` = đóng[i] / đóng[i−1] − 1, phiên đầu bộ và phiên có giá đóng không dùng được là 0.
 *
 * `value_raw`: ưu tiên giá trị khớp thật của sở (`matchedValues`, theo ngày). Thiếu thì xấp xỉ
 * bằng giá đóng đã điều chỉnh × khối lượng; vì giá đã điều chỉnh thấp hơn giá thật của thời đó nên
 * giá trị xấp xỉ luôn không cao hơn thật, tức chỉ có thể loại nhầm một điểm cắt chứ không bao giờ
 * nhận nhầm.
 */
export function computeBars(
  rows: readonly DatasetRawRow[],
  calendar: TradingCalendar,
  matchedValues?: ReadonlyMap<string, number> | null,
): ComputedBars {
  const bars: DatasetBar[] = [];
  let badCount = 0;
  let matchedValueCount = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const previous = index > 0 ? rows[index - 1]! : null;
    const gapBefore = previous ? calendar.between(previous.date, row.date) : 0;
    const pricesOk = [row.open, row.high, row.low, row.close].every(
      (value) => Number.isFinite(value) && value > 0,
    );
    const volumeOk = Number.isFinite(row.volume) && row.volume >= 0;
    let bad = !pricesOk || !volumeOk;
    if (pricesOk && (row.high < row.low || row.open < row.low || row.open > row.high)) bad = true;
    if (pricesOk && (row.close < row.low || row.close > row.high)) bad = true;
    let ret = 0;
    if (previous && Number.isFinite(previous.close) && previous.close > 0 && pricesOk) {
      ret = row.close / previous.close - 1;
      const compounded = (1 + flashbackHosePriceBand(row.date)) ** (Math.min(gapBefore, DATASET_JUMP_GAP_CAP) + 1) - 1;
      const limit = compounded + FLASHBACK_BAND_TOLERANCE + DATASET_PRICE_STEP_VND / previous.close;
      if (Math.abs(ret) > limit) bad = true;
    }
    const volume = volumeOk ? row.volume : 0;
    const matched = matchedValues?.get(row.date);
    let valueRaw: number;
    if (matched !== undefined && Number.isFinite(matched) && matched >= 0) {
      valueRaw = Math.round(matched);
      matchedValueCount += 1;
    } else {
      valueRaw = pricesOk ? Math.round(row.close * volume) : 0;
    }
    if (bad) badCount += 1;
    bars.push({
      idx: index,
      date: row.date,
      open: Number.isFinite(row.open) ? row.open : 0,
      high: Number.isFinite(row.high) ? row.high : 0,
      low: Number.isFinite(row.low) ? row.low : 0,
      close: Number.isFinite(row.close) ? row.close : 0,
      volume,
      valueRaw,
      gapBefore,
      bad: bad ? 1 : 0,
      ret,
    });
  }
  const valueBasis: DatasetValueBasis =
    bars.length > 0 && matchedValueCount === bars.length
      ? 'matched'
      : matchedValueCount === 0
        ? 'approx'
        : 'mixed';
  return { bars, badCount, matchedValueCount, valueBasis };
}

// ------------------------------------------------------------------ mảng cộng dồn (§1.3)

/** Các mảng cộng dồn của một mã: `X[k]` là tổng từ phiên 0 tới phiên k − 1 (n + 1 phần tử). */
export interface DatasetPrefix {
  readonly n: number;
  /** Ngày của từng phiên theo số ngày kể từ 1970-01-01 (n phần tử). */
  readonly days: Int32Array;
  readonly pGap: Int32Array;
  readonly pBad: Int32Array;
  readonly pZero: Int32Array;
  readonly pVal: Float64Array;
  readonly pR: Float64Array;
  readonly pR2: Float64Array;
}

/** Tính các mảng cộng dồn; `P_gap` đếm phiên có `gap_before` lớn hơn `maxGapSessions`. */
export function computePrefix(bars: readonly DatasetBar[], maxGapSessions: number): DatasetPrefix {
  const n = bars.length;
  const days = new Int32Array(n);
  const pGap = new Int32Array(n + 1);
  const pBad = new Int32Array(n + 1);
  const pZero = new Int32Array(n + 1);
  const pVal = new Float64Array(n + 1);
  const pR = new Float64Array(n + 1);
  const pR2 = new Float64Array(n + 1);
  for (let index = 0; index < n; index += 1) {
    const bar = bars[index]!;
    days[index] = epochDay(bar.date);
    pGap[index + 1] = pGap[index]! + (bar.gapBefore > maxGapSessions ? 1 : 0);
    pBad[index + 1] = pBad[index]! + bar.bad;
    pZero[index + 1] = pZero[index]! + (bar.volume === 0 ? 1 : 0);
    pVal[index + 1] = pVal[index]! + bar.valueRaw;
    pR[index + 1] = pR[index]! + bar.ret;
    pR2[index + 1] = pR2[index]! + bar.ret * bar.ret;
  }
  return { n, days, pGap, pBad, pZero, pVal, pR, pR2 };
}

// ------------------------------------------------------------------ điểm cắt (§3)

/** Tham số của một lần cắt: (W, H, P), ngưỡng và mốc "12 tháng trước hôm nay". */
export interface CutParams {
  /** W: số phiên khởi tạo chỉ báo. */
  readonly warmup: number;
  /** H: số phiên xem. */
  readonly viewBars: number;
  /** P: số phiên chơi. */
  readonly playBars: number;
  /** Ngày muộn nhất (số ngày kể từ 1970-01-01) của phiên chơi cuối. */
  readonly cutoffDay: number;
  readonly maxZeroVolumeRatio: number;
  readonly minLiquidityVnd: number;
  readonly minDailyVolatility: number;
}

/** L = W + H + P. */
export const cutLength = (params: Pick<CutParams, 'warmup' | 'viewBars' | 'playBars'>): number =>
  params.warmup + params.viewBars + params.playBars;

/** Ngày muộn nhất của phiên chơi cuối: hôm nay lùi `minMonthsAgo` tháng. */
export function cutoffDayFor(today: string, minMonthsAgo: number): number {
  return epochDay(subtractMonths(today, minMonthsAgo));
}

/** Số phiên khối lượng 0 tối đa trên phần hiện `D`: `max(1, ⌊D × tỷ lệ⌋)`. */
export function maxZeroVolumeSessions(displaySessions: number, ratio: number): number {
  return Math.max(1, Math.floor(displaySessions * ratio + 1e-9));
}

/** Điều kiện (§3.2) làm một điểm cắt bị loại, theo thứ tự kiểm tra. */
export type CutRejection =
  | 'range'
  | 'recent'
  | 'gap'
  | 'bad'
  | 'zero_volume'
  | 'liquidity'
  | 'volatility';

/**
 * Kiểm tra một điểm cắt `s` bằng các mảng cộng dồn: mỗi điều kiện một phép trừ. Trả về điều kiện
 * đầu tiên không đạt, hoặc `null` nếu điểm cắt hợp lệ.
 *
 * | # | Điều kiện | Đoạn |
 * |---|---|---|
 * | 1 | `s + L ≤ n` | — |
 * | 2 | ngày phiên `s + L − 1` ≤ mốc 12 tháng | phiên chơi cuối |
 * | 3 | không `gap_before > ngưỡng` | `[s + 1, s + L)` |
 * | 4 | không nến `bad` | `[s, s + L)` |
 * | 5 | số phiên khối lượng 0 ≤ `max(1, ⌊D × 2,5%⌋)` | `[s + W, s + L)` |
 * | 6 | bình quân `value_raw` ≥ ngưỡng | `[s + W, s + L)` |
 * | 7 | độ lệch chuẩn `ret` ≥ ngưỡng | `[s + W + H, s + L)` |
 */
export function rejectCut(
  prefix: DatasetPrefix,
  start: number,
  params: CutParams,
): CutRejection | null {
  const length = cutLength(params);
  const end = start + length;
  if (!Number.isInteger(start) || start < 0 || end > prefix.n) return 'range';
  if (prefix.days[end - 1]! > params.cutoffDay) return 'recent';
  if (prefix.pGap[end]! - prefix.pGap[start + 1]! !== 0) return 'gap';
  if (prefix.pBad[end]! - prefix.pBad[start]! !== 0) return 'bad';
  const displayStart = start + params.warmup;
  const displaySessions = params.viewBars + params.playBars;
  if (
    prefix.pZero[end]! - prefix.pZero[displayStart]! >
    maxZeroVolumeSessions(displaySessions, params.maxZeroVolumeRatio)
  )
    return 'zero_volume';
  if (
    prefix.pVal[end]! - prefix.pVal[displayStart]! <
    params.minLiquidityVnd * displaySessions
  )
    return 'liquidity';
  const playStart = displayStart + params.viewBars;
  const sumR = prefix.pR[end]! - prefix.pR[playStart]!;
  const sumR2 = prefix.pR2[end]! - prefix.pR2[playStart]!;
  const variance = (sumR2 - (sumR * sumR) / params.playBars) / params.playBars;
  if (Math.sqrt(Math.max(0, variance)) + STD_EPSILON < params.minDailyVolatility) return 'volatility';
  return null;
}

/** Mọi điểm cắt hợp lệ của một mã, tăng dần (§3.3 bước 1). */
export function listValidCuts(prefix: DatasetPrefix, params: CutParams): Int32Array {
  const last = prefix.n - cutLength(params);
  if (last < 0) return new Int32Array(0);
  const found: number[] = [];
  for (let start = 0; start <= last; start += 1) {
    if (rejectCut(prefix, start, params) === null) found.push(start);
  }
  return Int32Array.from(found);
}

/** Danh sách điểm cắt hợp lệ của một mã. */
export interface SymbolCuts {
  readonly symbol: string;
  readonly cuts: Int32Array;
}

/** Bộ sinh số nguyên ngẫu nhiên trong `[0, max)`; sản xuất dùng `crypto.randomInt` (CSPRNG). */
export type RandomInt = (maxExclusive: number) => number;

/**
 * Chọn ngẫu nhiên đều một mã trong các mã có ít nhất một điểm cắt hợp lệ, rồi ngẫu nhiên đều một
 * điểm cắt của mã đó (§3.3 bước 3 và 4). Mỗi mã có cơ hội như nhau, không phụ thuộc số điểm cắt
 * của mã. Không có mã nào hợp lệ thì trả `null`; không thử lại, không nới điều kiện.
 */
export function pickUniformCut(
  candidates: readonly SymbolCuts[],
  random: RandomInt,
): { symbol: string; startIdx: number } | null {
  const eligible = candidates.filter((candidate) => candidate.cuts.length > 0);
  if (eligible.length === 0) return null;
  const chosen = eligible[random(eligible.length)]!;
  return { symbol: chosen.symbol, startIdx: chosen.cuts[random(chosen.cuts.length)]! };
}

/**
 * Cắt một dãy `W + H + P` nến liên tục thành phần khởi tạo (W nến, không vẽ) và phần hiện trên
 * biểu đồ (H + P nến). Không kèm ngày ra ngoài server: ngày vẫn nằm trong `FlashbackBar.d` để
 * server chấm điểm, và `publicChart` của phòng chơi bỏ ngày trước khi gửi xuống trình duyệt.
 */
export function splitCutBars(
  rows: readonly FlashbackBar[],
  warmup: number,
): { warmupBars: FlashbackBar[]; bars: FlashbackBar[] } {
  return { warmupBars: rows.slice(0, warmup), bars: rows.slice(warmup) };
}
