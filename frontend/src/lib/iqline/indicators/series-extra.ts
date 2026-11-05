/**
 * Công thức của 16 chỉ báo đợt 2 (docs/iqline-design.md §9): Ichimoku, VWAP, SuperTrend, WMA, HMA, VWMA, Envelope, Pivot Points, Aroon,
 * TRIX, Ultimate Oscillator, Awesome Oscillator, Momentum, Standard Deviation, Accumulation/Distribution, Volatility O-H-L-C.
 *
 * Viết từ định nghĩa công khai của từng chỉ báo, KHÔNG chuyển từ code nào có sẵn và KHÔNG có công thức backend để đối chiếu, nên số
 * liệu chưa được kiểm với nguồn ngoài (chỉ có test tính tay trên chuỗi ngắn). Chỗ nào định nghĩa công khai có nhiều biến thể thì
 * ghi rõ biến thể đã chọn ở hàm tương ứng.
 *
 * Mọi hàm trả chuỗi dài đúng bằng số nến; thiếu dữ liệu hoặc mẫu số 0 là `null`, không bao giờ NaN. Cửa sổ hữu hạn tính trực tiếp
 * trên từng cửa sổ (không cộng dồn tổng chạy) để giá trị tại một nến chỉ phụ thuộc cửa sổ của nó, đúng với `tailMemory`.
 */
import type { Bar } from "../types"
import { atr, emaOfSeries, isValidBar } from "./legacy-series"
import type { PeriodUnit } from "./periods"
import { periodKey } from "./periods"
import { slidingExtreme, sma, ema, type Columns, type Num, type Series } from "./series"

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const nulls = (length: number): Series => new Array<Num>(length).fill(null)

// ---------------------------------------------------------------- nguồn giá

export const SOURCES = ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"] as const
export type SourceName = (typeof SOURCES)[number]
export const SOURCE_LABELS: Readonly<Record<SourceName, string>> = {
  close: "Đóng cửa",
  open: "Mở cửa",
  high: "Cao nhất",
  low: "Thấp nhất",
  hl2: "(Cao + Thấp) / 2",
  hlc3: "(Cao + Thấp + Đóng) / 3",
  ohlc4: "(Mở + Cao + Thấp + Đóng) / 4",
}

/** Giá nguồn của từng nến. Tên lạ rơi về giá đóng cửa. */
export function sourceValues(columns: Columns, source: string): number[] {
  const { open, high, low, close } = columns
  switch (source) {
    case "open":
      return open
    case "high":
      return high
    case "low":
      return low
    case "hl2":
      return close.map((_, index) => (high[index] + low[index]) / 2)
    case "hlc3":
      return close.map((value, index) => (high[index] + low[index] + value) / 3)
    case "ohlc4":
      return close.map((value, index) => (open[index] + high[index] + low[index] + value) / 4)
    default:
      return close
  }
}

// ---------------------------------------------------------------- trung bình động

/**
 * WMA: trung bình có trọng số tuyến tính, nến mới nhất nặng nhất. Cửa sổ N: trọng số N cho nến hiện tại, N-1 cho nến trước đó,
 * ... 1 cho nến xa nhất; chia N(N+1)/2. Nhận chuỗi có `null` (dùng trong HMA): cửa sổ có `null` cho `null`.
 */
export function wma(values: readonly Num[], period: number): Series {
  const out = nulls(values.length)
  const denominator = (period * (period + 1)) / 2
  for (let index = period - 1; index < values.length; index += 1) {
    let sum = 0
    let complete = true
    for (let back = 0; back < period; back += 1) {
      const value = values[index - back]
      if (!finite(value)) {
        complete = false
        break
      }
      sum += (period - back) * value
    }
    out[index] = complete ? sum / denominator : null
  }
  return out
}

/** Số nến phụ của hai bước làm mượt trong HMA: nửa chu kỳ (làm tròn xuống) và căn bậc hai chu kỳ (làm tròn). */
export const hmaHalf = (period: number): number => Math.max(1, Math.floor(period / 2))
export const hmaRoot = (period: number): number => Math.max(1, Math.round(Math.sqrt(period)))

/**
 * HMA của Alan Hull: WMA(2 * WMA(x, N/2) - WMA(x, N), căn(N)), N/2 làm tròn xuống, căn(N) làm tròn. Với chuỗi tuyến tính HMA bám
 * sát giá (gần như không trễ).
 */
export function hma(values: readonly number[], period: number): Series {
  const half = wma(values, hmaHalf(period))
  const full = wma(values, period)
  const raw: Series = values.map((_, index) => (half[index] === null || full[index] === null ? null : 2 * half[index]! - full[index]!))
  return wma(raw, hmaRoot(period))
}

/** VWMA: trung bình giá có trọng số theo khối lượng, tổng(giá x khối lượng) / tổng(khối lượng) trong N nến; `null` khi tổng khối lượng bằng 0. */
export function vwma(values: readonly number[], volume: readonly number[], period: number): Series {
  const out = nulls(values.length)
  for (let index = period - 1; index < values.length; index += 1) {
    let weighted = 0
    let total = 0
    for (let back = 0; back < period; back += 1) {
      weighted += values[index - back] * volume[index - back]
      total += volume[index - back]
    }
    out[index] = total > 0 ? weighted / total : null
  }
  return out
}

/** Envelope: đường giữa là SMA hoặc EMA của giá nguồn, hai dải lệch +/- một tỷ lệ phần trăm cố định của đường giữa. */
export function envelope(values: readonly number[], period: number, percent: number, basis: string): { middle: Series; upper: Series; lower: Series } {
  const middle = basis === "ema" ? ema(values, period) : sma(values, period)
  const factor = percent / 100
  return {
    middle,
    upper: middle.map((value) => (value === null ? null : value * (1 + factor))),
    lower: middle.map((value) => (value === null ? null : value * (1 - factor))),
  }
}

// ---------------------------------------------------------------- động lượng và biến động

/** Momentum: giá nguồn hiện tại trừ giá nguồn cách đây N nến. */
export function momentum(values: readonly number[], period: number): Series {
  return values.map((value, index) => (index < period ? null : value - values[index - period]))
}

/**
 * Độ lệch chuẩn của giá nguồn trong N nến, theo tổng thể (chia N, không phải N-1), cùng quy ước với Bollinger Bands của IQLine. Mỗi
 * cửa sổ tính hai lượt (trung bình rồi tổng bình phương chênh lệch) nên không mất chính xác khi giá lớn.
 */
export function standardDeviation(values: readonly number[], period: number): Series {
  const out = nulls(values.length)
  for (let index = period - 1; index < values.length; index += 1) {
    let sum = 0
    for (let back = 0; back < period; back += 1) sum += values[index - back]
    const mean = sum / period
    let squares = 0
    for (let back = 0; back < period; back += 1) squares += (values[index - back] - mean) ** 2
    out[index] = Math.sqrt(squares / period)
  }
  return out
}

/**
 * Aroon (Tushar Chande): Aroon Up = 100 x (N - số nến từ đỉnh cao nhất) / N, Aroon Down = 100 x (N - số nến từ đáy thấp nhất) / N,
 * trong cửa sổ N + 1 nến (nến hiện tại và N nến trước). Đỉnh hoặc đáy bằng nhau thì lấy nến gần nhất. Thang 0-100.
 */
export function aroon(columns: Columns, period: number): { up: Series; down: Series } {
  const up = nulls(columns.high.length)
  const down = nulls(columns.high.length)
  for (let index = period; index < columns.high.length; index += 1) {
    let highAt = index - period
    let lowAt = index - period
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      if (columns.high[cursor] >= columns.high[highAt]) highAt = cursor
      if (columns.low[cursor] <= columns.low[lowAt]) lowAt = cursor
    }
    up[index] = (100 * (period - (index - highAt))) / period
    down[index] = (100 * (period - (index - lowAt))) / period
  }
  return { up, down }
}

/**
 * TRIX: tốc độ thay đổi 1 nến, theo phần trăm, của EMA ba lần (EMA của EMA của EMA, cùng chu kỳ N). Mỗi EMA khởi tạo bằng SMA của
 * N giá trị đầu của chuỗi trước nó, nên giá trị đầu tiên xuất hiện sau khoảng 3N nến.
 */
export function trix(values: readonly number[], period: number): Series {
  const triple = emaOfSeries(emaOfSeries(emaOfSeries(values, period), period), period)
  return triple.map((value, index) => {
    const previous = index > 0 ? triple[index - 1] : null
    return value === null || previous === null || previous === 0 ? null : (100 * (value - previous)) / previous
  })
}

/**
 * Ultimate Oscillator (Larry Williams): áp lực mua BP = đóng - min(thấp, đóng trước), biên độ thật TR = max(cao, đóng trước) - min(thấp,
 * đóng trước). Với ba chu kỳ ngắn, vừa, dài: A = tổng BP / tổng TR; UO = 100 x (4 x A ngắn + 2 x A vừa + A dài) / 7. `null` khi một tổng TR bằng 0.
 */
export function ultimateOscillator(columns: Columns, short: number, mid: number, long: number): Series {
  const length = columns.close.length
  const buying = nulls(length)
  const range = nulls(length)
  for (let index = 1; index < length; index += 1) {
    const floor = Math.min(columns.low[index], columns.close[index - 1])
    const ceiling = Math.max(columns.high[index], columns.close[index - 1])
    buying[index] = columns.close[index] - floor
    range[index] = ceiling - floor
  }
  const average = (index: number, window: number): number | null => {
    let top = 0
    let bottom = 0
    for (let cursor = index - window + 1; cursor <= index; cursor += 1) {
      top += buying[cursor]!
      bottom += range[cursor]!
    }
    return bottom > 0 ? top / bottom : null
  }
  const out = nulls(length)
  for (let index = long; index < length; index += 1) {
    const a = average(index, short)
    const b = average(index, mid)
    const c = average(index, long)
    out[index] = a === null || b === null || c === null ? null : (100 * (4 * a + 2 * b + c)) / 7
  }
  return out
}

/** Awesome Oscillator (Bill Williams): SMA của trung điểm (cao + thấp) / 2 trong `fast` nến trừ SMA trong `slow` nến. */
export function awesomeOscillator(columns: Columns, fast: number, slow: number): Series {
  const mid = columns.high.map((high, index) => (high + columns.low[index]) / 2)
  const quick = sma(mid, fast)
  const steady = sma(mid, slow)
  return mid.map((_, index) => (quick[index] === null || steady[index] === null ? null : quick[index]! - steady[index]!))
}

/**
 * Accumulation/Distribution (Marc Chaikin): cộng dồn hệ số dòng tiền x khối lượng, hệ số = ((đóng - thấp) - (cao - đóng)) / (cao - thấp).
 * Nến cao = thấp (kịch trần, kịch sàn) hoặc có số không hữu hạn đóng góp 0 để đường không bị đứt. Khác Chaikin Money Flow ở IQLine, nơi
 * nến cao = thấp cho `null`: ở đây đường là tổng cộng dồn nên một chỗ thiếu sẽ phá mọi giá trị sau nó.
 */
export function accumulationDistribution(columns: Columns): number[] {
  let total = 0
  return columns.close.map((close, index) => {
    const high = columns.high[index]
    const low = columns.low[index]
    const volume = columns.volume[index]
    if (finite(high) && finite(low) && finite(close) && finite(volume) && high > low) total += (((close - low) - (high - close)) / (high - low)) * volume
    return total
  })
}

/**
 * Volatility O-H-L-C theo ước lượng Garman-Klass (Garman và Klass, 1980), dùng đủ bốn giá của nến: mỗi nến cho phương sai
 * g = 0,5 x ln(cao/thấp)^2 - (2 x ln 2 - 1) x ln(đóng/mở)^2. Kết quả là 100 x căn(trung bình g của N nến x số nến mỗi năm), nên
 * `periodsPerYear` = 1 cho biến động theo từng nến, 252 cho biến động quy năm (mặc định). Đây là định nghĩa công khai của ước lượng, KHÔNG
 * phải mã nguồn của chỉ báo cùng tên trên TradingView (không đọc được mã đó), nên con số có thể lệch một hệ số quy năm hay cách lấy trung bình
 * so với chỉ báo trên layout cũ của người dùng. Với nến hợp lệ thân luôn nằm trong biên độ nên g không âm; phép kẹp về 0 chỉ là lớp bảo vệ.
 * Nến không hợp lệ (giá không dương, cao thấp không bao nến) làm `null` cả cửa sổ chứa nó.
 */
export function volatilityOhlc(bars: readonly Bar[], period: number, periodsPerYear: number): Series {
  const out = nulls(bars.length)
  const variance = bars.map((bar) => (isValidBar(bar) ? 0.5 * Math.log(bar.high / bar.low) ** 2 - (2 * Math.LN2 - 1) * Math.log(bar.close / bar.open) ** 2 : null))
  for (let index = period - 1; index < bars.length; index += 1) {
    let sum = 0
    let complete = true
    for (let back = 0; back < period; back += 1) {
      const value = variance[index - back]
      if (value === null || !finite(value)) {
        complete = false
        break
      }
      sum += value
    }
    out[index] = complete ? 100 * Math.sqrt(Math.max(0, (sum / period) * periodsPerYear)) : null
  }
  return out
}

// ---------------------------------------------------------------- Ichimoku, SuperTrend

/** Trung điểm của đỉnh cao nhất và đáy thấp nhất trong cửa sổ `window` nến (gồm nến hiện tại). */
function midpoint(columns: Columns, window: number): Series {
  const highest = slidingExtreme(columns.high, window, true)
  const lowest = slidingExtreme(columns.low, window, false)
  return highest.map((high, index) => (high === null || lowest[index] === null ? null : (high + lowest[index]!) / 2))
}

/**
 * Ichimoku Kinko Hyo (Goichi Hosoda). Tenkan-sen là trung điểm đỉnh/đáy `conversion` nến, Kijun-sen là trung điểm `base` nến, Senkou
 * Span A là (Tenkan + Kijun) / 2, Senkou Span B là trung điểm `spanB` nến, Chikou Span là giá đóng cửa. Mỗi giá trị nằm ở chỉ số của
 * nến đã tính ra nó: việc dời Senkou về tương lai `displacement` nến và Chikou về quá khứ `displacement` nến là việc của lúc vẽ
 * (`IndicatorSeries.offset`), nên mọi chuỗi vẫn dài đúng bằng số nến.
 */
export function ichimoku(columns: Columns, conversion: number, base: number, spanB: number): { tenkan: Series; kijun: Series; senkouA: Series; senkouB: Series; chikou: number[] } {
  const tenkan = midpoint(columns, conversion)
  const kijun = midpoint(columns, base)
  return {
    tenkan,
    kijun,
    senkouA: tenkan.map((value, index) => (value === null || kijun[index] === null ? null : (value + kijun[index]!) / 2)),
    senkouB: midpoint(columns, spanB),
    chikou: columns.close,
  }
}

/**
 * SuperTrend: ATR Wilder `period`, dải thô = (cao + thấp) / 2 +/- hệ số x ATR. Dải trên chỉ được hạ xuống (hoặc giữ) khi đóng cửa trước
 * chưa vượt nó, dải dưới chỉ được nâng lên (hoặc giữ) khi đóng cửa trước chưa thủng nó. Đang tăng thì đường là dải dưới và chuyển
 * sang giảm khi đóng cửa thấp hơn dải dưới; đang giảm thì đường là dải trên và chuyển sang tăng khi đóng cửa cao hơn dải trên. Nến đầu
 * tiên có ATR: tăng nếu đóng cửa không thấp hơn (cao + thấp) / 2. Hai chuỗi: `up` (xu hướng tăng, nằm dưới giá) và `down`; mỗi nến chỉ
 * có một trong hai, nên đường đứt đúng lúc đảo chiều. Nến hỏng hoặc ATR thiếu đặt lại trạng thái.
 */
export function superTrend(bars: readonly Bar[], period: number, multiplier: number): { up: Series; down: Series } {
  const range = atr(bars, period)
  const up = nulls(bars.length)
  const down = nulls(bars.length)
  let state: { upper: number; lower: number; rising: boolean } | null = null
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index]
    const spread = range[index]
    if (spread === null || !isValidBar(bar)) {
      state = null
      continue
    }
    const middle = (bar.high + bar.low) / 2
    const basicUpper = middle + multiplier * spread
    const basicLower = middle - multiplier * spread
    if (state === null) {
      state = { upper: basicUpper, lower: basicLower, rising: bar.close >= middle }
    } else {
      const previousClose = bars[index - 1].close
      const upper: number = basicUpper < state.upper || previousClose > state.upper ? basicUpper : state.upper
      const lower: number = basicLower > state.lower || previousClose < state.lower ? basicLower : state.lower
      const rising: boolean = state.rising ? !(bar.close < lower) : bar.close > upper
      state = { upper, lower, rising }
    }
    if (state.rising) up[index] = state.lower
    else down[index] = state.upper
  }
  return { up, down }
}

// ---------------------------------------------------------------- theo thời gian (cần IndicatorContext)

/**
 * VWAP: tổng(giá điển hình x khối lượng) / tổng(khối lượng) cộng dồn từ đầu kỳ, giá điển hình là (cao + thấp + đóng) / 3 của nến (VWAP
 * tính trên dữ liệu nến, không có từng lệnh khớp). `unit` là kỳ đặt lại; đổi kỳ thì cộng dồn bắt đầu lại. `null` cho tới khi có khối lượng.
 */
export function vwap(columns: Columns, times: readonly number[], unit: PeriodUnit): Series {
  const out = nulls(columns.close.length)
  let key = Number.NaN
  let weighted = 0
  let total = 0
  for (let index = 0; index < columns.close.length; index += 1) {
    const next = periodKey(times[index], unit)
    if (next !== key) {
      key = next
      weighted = 0
      total = 0
    }
    const volume = columns.volume[index]
    const price = (columns.high[index] + columns.low[index] + columns.close[index]) / 3
    if (finite(volume) && volume > 0 && finite(price)) {
      weighted += price * volume
      total += volume
    }
    out[index] = total > 0 ? weighted / total : null
  }
  return out
}

export type PivotLevels = { pp: Series; r1: Series; r2: Series; r3: Series; s1: Series; s2: Series; s3: Series }

/**
 * Pivot Points Standard (cổ điển). Với cao H, thấp L, đóng C của KỲ TRƯỚC: P = (H + L + C) / 3; R1 = 2P - L; S1 = 2P - H; R2 = P + (H - L);
 * S2 = P - (H - L); R3 = H + 2(P - L); S3 = L - 2(H - P). Mọi nến của một kỳ có cùng mức. Kỳ đầu tiên của dữ liệu không có kỳ trước nên
 * là `null`; dữ liệu nạp có thể bắt đầu giữa một kỳ, khi đó mức của kỳ kế tiếp dựa trên phần nến đã nạp của kỳ đầu.
 */
export function pivotPoints(columns: Columns, times: readonly number[], unit: PeriodUnit): PivotLevels {
  const length = columns.close.length
  const out: PivotLevels = { pp: nulls(length), r1: nulls(length), r2: nulls(length), r3: nulls(length), s1: nulls(length), s2: nulls(length), s3: nulls(length) }
  let key = Number.NaN
  let current: { high: number; low: number; close: number } | null = null
  let previous: { high: number; low: number; close: number } | null = null
  let levels: Record<keyof PivotLevels, number> | null = null
  for (let index = 0; index < length; index += 1) {
    const next = periodKey(times[index], unit)
    if (next !== key) {
      key = next
      if (current) previous = current
      current = null
      levels = null
      if (previous) {
        const { high, low, close } = previous
        const pp = (high + low + close) / 3
        levels = { pp, r1: 2 * pp - low, r2: pp + (high - low), r3: high + 2 * (pp - low), s1: 2 * pp - high, s2: pp - (high - low), s3: low - 2 * (high - pp) }
      }
    }
    const { high, low, close } = { high: columns.high[index], low: columns.low[index], close: columns.close[index] }
    if (finite(high) && finite(low) && finite(close)) {
      current = current ? { high: Math.max(current.high, high), low: Math.min(current.low, low), close } : { high, low, close }
    }
    if (levels) for (const name of Object.keys(out) as (keyof PivotLevels)[]) out[name][index] = levels[name]
  }
  return out
}
