/**
 * Công thức chỉ báo trên mảng cột (open, high, low, close, volume).
 *
 * Phần lớn các hàm ở đây chuyển nguyên từ `pages/demo-trading/flashback/flashback-indicators.ts` (bản đang chạy ở
 * Flashback): cùng công thức, cùng cách xử lý giá trị thiếu, kể cả những chỗ lệch với backend đã được liệt kê ở
 * `backend-parity.test.ts`. KHÔNG sửa một công thức ở đây cho khớp backend mà không báo: Bot chạy theo
 * backend, và quyết định sửa bên nào thuộc về chủ sản phẩm. Các chỉ báo bổ sung (ATR, ADX, Keltner, Parabolic SAR...)
 * nằm ở `legacy-series.ts` và theo đúng công thức `calcLegacy` của backend.
 *
 * Khác bản gốc: Volume dùng cửa sổ trượt thay cho `slice` trong vòng lặp, Highest/Lowest dùng hàng đợi đơn điệu.
 * Kết quả giống hệt về ý nghĩa, chỉ khác sai số làm tròn cỡ 1e-13.
 */
import type { Bar } from "../types"

export type Num = number | null
export type Series = Num[]

export type Columns = {
  open: number[]
  high: number[]
  low: number[]
  close: number[]
  volume: number[]
}

export function columnsOf(bars: readonly Bar[]): Columns {
  const length = bars.length
  const open = new Array<number>(length)
  const high = new Array<number>(length)
  const low = new Array<number>(length)
  const close = new Array<number>(length)
  const volume = new Array<number>(length)
  for (let index = 0; index < length; index += 1) {
    const bar = bars[index]
    open[index] = bar.open
    high[index] = bar.high
    low[index] = bar.low
    close[index] = bar.close
    volume[index] = bar.volume
  }
  return { open, high, low, close, volume }
}

/** Trung bình đơn giản; `null` cho các phiên chưa đủ cửa sổ. */
export function sma(values: readonly number[], period: number): Series {
  const out: Series = []
  let sum = 0
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index]
    if (index >= period) sum -= values[index - period]
    out.push(index >= period - 1 ? sum / period : null)
  }
  return out
}

/** Trung bình động hàm mũ, khởi tạo bằng SMA của đủ N quan sát đầu. */
export function ema(values: readonly number[], period: number): Series {
  const out: Series = []
  const factor = 2 / (period + 1)
  let current: number | null = null
  let sum = 0
  let seen = 0
  for (const value of values) {
    if (current === null) {
      sum += value
      seen += 1
      if (seen === period) {
        current = sum / period
        out.push(current)
      } else {
        out.push(null)
      }
      continue
    }
    current = value * factor + current * (1 - factor)
    out.push(current)
  }
  return out
}

/**
 * Cực đại hoặc cực tiểu trượt: phần tử `i` là cực trị của `values[i - window + 1 .. i]`, `null` khi chưa đủ cửa sổ.
 * Hàng đợi đơn điệu nên mỗi phần tử vào ra đúng một lần.
 */
export function slidingExtreme(values: readonly number[], window: number, takeMax: boolean): Series {
  const out: Series = new Array(values.length).fill(null)
  const queue = new Int32Array(values.length)
  let head = 0
  let tail = 0
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    while (tail > head && (takeMax ? values[queue[tail - 1]] <= value : values[queue[tail - 1]] >= value)) tail -= 1
    queue[tail] = index
    tail += 1
    if (queue[head] <= index - window) head += 1
    if (index >= window - 1) out[index] = values[queue[head]]
  }
  return out
}

function typicalPrice(columns: Columns): number[] {
  return columns.close.map((close, index) => (columns.high[index] + columns.low[index] + close) / 3)
}

/** RSI theo Wilder. */
export function rsi(closes: readonly number[], period: number): Series {
  const out: Series = new Array(closes.length).fill(null)
  let gain = 0
  let loss = 0
  for (let index = 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1]
    const up = Math.max(change, 0)
    const down = Math.max(-change, 0)
    if (index <= period) {
      gain += up
      loss += down
      if (index === period) {
        gain /= period
        loss /= period
        out[index] = gain + loss ? (100 * gain) / (gain + loss) : null
      }
      continue
    }
    gain = (gain * (period - 1) + up) / period
    loss = (loss * (period - 1) + down) / period
    out[index] = gain + loss ? (100 * gain) / (gain + loss) : null
  }
  return out
}

/**
 * MACD: đường MACD, đường tín hiệu và cột histogram.
 *
 * Giữ nguyên cách tính của Flashback: đường tín hiệu là EMA của đường MACD đã đổi `null` thành 0, nên phần khởi tạo
 * của EMA lẫn các số 0 ở đầu chuỗi. Backend khởi tạo lại EMA từ N giá trị MACD thật đầu tiên. Hai bên lệch ở đoạn
 * đầu của đường tín hiệu và histogram (xem bảng lệch trong test đối chiếu).
 */
export function macd(closes: readonly number[], fast: number, slow: number, signal: number): { macd: Series; signal: Series; histogram: Series } {
  const fastLine = ema(closes, fast)
  const slowLine = ema(closes, slow)
  const line = closes.map((_, index) => (fastLine[index] == null || slowLine[index] == null ? null : fastLine[index]! - slowLine[index]!))
  const signalLine = ema(line.map((value) => value ?? 0), signal)
  const cleanSignal = line.map((value, index) => (value == null ? null : signalLine[index]))
  const histogram = line.map((value, index) => (value == null || cleanSignal[index] == null ? null : value - cleanSignal[index]!))
  return { macd: line, signal: cleanSignal, histogram }
}

/** Bollinger Bands: dải trên, dải dưới và đường giữa (độ lệch chuẩn tổng thể, chia cho N). */
export function bollinger(closes: readonly number[], period: number, factor: number): { middle: Series; upper: Series; lower: Series } {
  const middle = sma(closes, period)
  const upper: Series = []
  const lower: Series = []
  closes.forEach((_, index) => {
    if (middle[index] == null) {
      upper.push(null)
      lower.push(null)
      return
    }
    let sum = 0
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) sum += (closes[cursor] - middle[index]!) ** 2
    const deviation = Math.sqrt(sum / period)
    upper.push(middle[index]! + factor * deviation)
    lower.push(middle[index]! - factor * deviation)
  })
  return { middle, upper, lower }
}

/** Donchian: biên trên và biên dưới tính từ N phiên trước, không gồm phiên đang xét. */
export function donchian(columns: Columns, period: number): { upper: Series; lower: Series } {
  const highest = slidingExtreme(columns.high, period, true)
  const lowest = slidingExtreme(columns.low, period, false)
  const upper: Series = columns.high.map((_, index) => (index < period ? null : highest[index - 1]))
  const lower: Series = columns.low.map((_, index) => (index < period ? null : lowest[index - 1]))
  return { upper, lower }
}

/** DMI: +DI và -DI (không có ADX). Làm mịn Wilder theo dạng tổng. */
export function dmi(columns: Columns, period: number): { plus: Series; minus: Series } {
  const length = columns.close.length
  const plus: Series = new Array(length).fill(null)
  const minus: Series = new Array(length).fill(null)
  let smoothedPlus = 0
  let smoothedMinus = 0
  let smoothedRange = 0
  for (let index = 1; index < length; index += 1) {
    const upMove = columns.high[index] - columns.high[index - 1]
    const downMove = columns.low[index - 1] - columns.low[index]
    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0
    const range = Math.max(
      columns.high[index] - columns.low[index],
      Math.abs(columns.high[index] - columns.close[index - 1]),
      Math.abs(columns.low[index] - columns.close[index - 1]),
    )
    if (index <= period) {
      smoothedPlus += plusDm
      smoothedMinus += minusDm
      smoothedRange += range
      if (index === period && smoothedRange > 0) {
        plus[index] = (100 * smoothedPlus) / smoothedRange
        minus[index] = (100 * smoothedMinus) / smoothedRange
      }
      continue
    }
    smoothedPlus = smoothedPlus - smoothedPlus / period + plusDm
    smoothedMinus = smoothedMinus - smoothedMinus / period + minusDm
    smoothedRange = smoothedRange - smoothedRange / period + range
    if (smoothedRange > 0) {
      plus[index] = (100 * smoothedPlus) / smoothedRange
      minus[index] = (100 * smoothedMinus) / smoothedRange
    }
  }
  return { plus, minus }
}

/**
 * Stochastic: %K đã làm mượt và %D.
 *
 * Giữ nguyên cách tính của Flashback: %K thô thiếu (`null`) được đổi thành 0 trước khi lấy trung bình, rồi khung
 * `null` được đắp lại ở đúng vị trí cũ. Backend yêu cầu cả cửa sổ đều có số. Hai bên lệch ở đoạn đầu chuỗi và quanh
 * các phiên high = low (kịch trần, kịch sàn).
 */
export function stochastic(columns: Columns, kPeriod: number, dPeriod: number, smooth: number): { k: Series; d: Series } {
  const highest = slidingExtreme(columns.high, kPeriod, true)
  const lowest = slidingExtreme(columns.low, kPeriod, false)
  const raw: Series = columns.close.map((close, index) => {
    const high = highest[index]
    const low = lowest[index]
    if (high == null || low == null) return null
    return high === low ? null : (100 * (close - low)) / (high - low)
  })
  const k = sma(raw.map((value) => value ?? 0), smooth).map((value, index) => (raw[index] == null ? null : value))
  const d = sma(k.map((value) => value ?? 0), dPeriod).map((value, index) => (k[index] == null ? null : value))
  return { k, d }
}

/** CCI: chỉ số kênh hàng hóa. */
export function cci(columns: Columns, period: number): Series {
  const typical = typicalPrice(columns)
  const mean = sma(typical, period)
  return typical.map((value, index) => {
    if (mean[index] == null) return null
    let deviation = 0
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) deviation += Math.abs(typical[cursor] - mean[index]!)
    const meanDeviation = deviation / period
    return meanDeviation ? (value - mean[index]!) / (0.015 * meanDeviation) : null
  })
}

/** ROC: tốc độ thay đổi giá, đơn vị %. */
export function roc(closes: readonly number[], period: number): Series {
  return closes.map((close, index) => (index < period ? null : (close / closes[index - period] - 1) * 100))
}

/** Williams %R: thang -100..0. */
export function williamsR(columns: Columns, period: number): Series {
  const highest = slidingExtreme(columns.high, period, true)
  const lowest = slidingExtreme(columns.low, period, false)
  return columns.close.map((close, index) => {
    const high = highest[index]
    const low = lowest[index]
    if (high == null || low == null) return null
    return high === low ? null : (-100 * (high - close)) / (high - low)
  })
}

/** OBV và đường SMA của OBV. */
export function obv(columns: Columns, baseline: number): { obv: number[]; signal: Series } {
  const values: number[] = columns.close.length ? [0] : []
  for (let index = 1; index < columns.close.length; index += 1) {
    const change = columns.close[index] > columns.close[index - 1] ? columns.volume[index] : columns.close[index] < columns.close[index - 1] ? -columns.volume[index] : 0
    values.push(values[index - 1] + change)
  }
  return { obv: values, signal: sma(values, baseline) }
}

/** MFI: chỉ số dòng tiền, thang 0-100. */
export function mfi(columns: Columns, period: number): Series {
  const typical = typicalPrice(columns)
  const positive = typical.map((value, index) => (index > 0 && value > typical[index - 1] ? value * columns.volume[index] : 0))
  const negative = typical.map((value, index) => (index > 0 && value < typical[index - 1] ? value * columns.volume[index] : 0))
  return columns.close.map((_, index) => {
    if (index < period) return null
    let inflow = 0
    let outflow = 0
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      inflow += positive[cursor]
      outflow += negative[cursor]
    }
    return inflow + outflow ? (100 * inflow) / (inflow + outflow) : null
  })
}

/**
 * Chaikin Money Flow.
 *
 * Giữ nguyên cách tính của Flashback: phiên high = low cho dòng tiền `null`, và một phiên `null` trong cửa sổ làm cả
 * cửa sổ `null`. Backend coi phiên đó có dòng tiền 0 nhưng vẫn cộng khối lượng vào mẫu số.
 */
export function cmf(columns: Columns, period: number): Series {
  const flow: Series = columns.close.map((close, index) =>
    columns.high[index] === columns.low[index]
      ? null
      : ((2 * close - columns.high[index] - columns.low[index]) / (columns.high[index] - columns.low[index])) * columns.volume[index],
  )
  return columns.close.map((_, index) => {
    if (index < period - 1) return null
    let sum = 0
    let volume = 0
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      if (flow[cursor] == null) return null
      sum += flow[cursor]!
      volume += columns.volume[cursor]
    }
    return volume ? sum / volume : null
  })
}

/**
 * Ngưỡng khối lượng: `mult` lần trung bình khối lượng của `lookback` phiên TRƯỚC (không gồm phiên đang xét).
 * Cửa sổ trượt, mỗi phiên cập nhật tổng một lần; bản gốc cắt `slice` rồi cộng lại mỗi phiên.
 */
export function volumeThreshold(volume: readonly number[], lookback: number, factor: number): Series {
  const out: Series = new Array(volume.length).fill(null)
  let sum = 0
  for (let index = 0; index < volume.length; index += 1) {
    if (index >= lookback) {
      out[index] = factor * (sum / lookback)
      sum -= volume[index - lookback]
    }
    sum += volume[index]
  }
  return out
}
