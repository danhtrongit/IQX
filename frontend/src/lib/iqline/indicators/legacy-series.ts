/**
 * Công thức của bảy chỉ báo bổ sung (ATR, ATR%, ADX, Keltner, BB Width, Parabolic SAR, Relative Volume).
 *
 * Khác `series.ts`: không có bản Flashback để chuyển, nên đây là bản chuyển trực tiếp từ `calcLegacy` của backend
 * (`backend/src/modules/quant/v2/indicators.ts`, phiên bản tính `iqx-ta-2.0`), giữ nguyên cách xử lý giá trị thiếu:
 * một giá trị không hữu hạn làm đứt chuỗi và EMA/Wilder khởi tạo lại từ N giá trị liên tiếp. Việc hiển thị trên biểu
 * đồ không đưa các chỉ báo này trở lại luật Bot.
 */
import type { Bar } from "../types"
import { bollinger, ema, type Num, type Series } from "./series"

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

/** Nến dùng được: OHLCV hữu hạn, low > 0, high/low bao được open/close, khối lượng >= 0 (giống `validBar` ở backend). */
export function isValidBar(bar: Bar | undefined): bar is Bar {
  return (
    bar !== undefined &&
    finite(bar.open) &&
    finite(bar.high) &&
    finite(bar.low) &&
    finite(bar.close) &&
    finite(bar.volume) &&
    bar.low > 0 &&
    bar.high >= Math.max(bar.open, bar.close, bar.low) &&
    bar.low <= Math.min(bar.open, bar.close) &&
    bar.volume >= 0
  )
}

const nulls = (length: number): Series => new Array<Num>(length).fill(null)

/** Khởi tạo bằng trung bình của N giá trị hữu hạn liên tiếp đầu tiên, sau đó đệ quy mũ; một khe hở khởi tạo lại. */
function exponential(values: readonly Num[], period: number, alpha: number): Series {
  const out = nulls(values.length)
  let seed: number[] = []
  let current: number | null = null
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!finite(value)) {
      seed = []
      current = null
      continue
    }
    if (current === null) {
      seed.push(value)
      if (seed.length === period) {
        current = seed.reduce((sum, item) => sum + item, 0) / period
        out[index] = current
      }
    } else {
      current = alpha * value + (1 - alpha) * current
      out[index] = current
    }
  }
  return out
}

/** Làm mịn Wilder: EMA với hệ số 1/N. */
export const wilder = (values: readonly Num[], period: number): Series => exponential(values, period, 1 / period)

function zip(a: readonly Num[], b: readonly Num[], fn: (x: number, y: number) => Num): Series {
  return a.map((x, index) => {
    const y = b[index]
    return finite(x) && finite(y) ? fn(x, y) : null
  })
}

/** Tỷ số theo `k`, `null` khi mẫu số bằng 0. */
const ratio = (a: readonly Num[], b: readonly Num[], k = 1): Series => zip(a, b, (x, y) => (y === 0 ? null : (x / y) * k))

export function trueRange(bars: readonly Bar[]): Series {
  return bars.map((bar, index) => {
    const previous = bars[index - 1]
    return index && isValidBar(bar) && previous !== undefined && finite(previous.close)
      ? Math.max(bar.high - bar.low, Math.abs(bar.high - previous.close), Math.abs(bar.low - previous.close))
      : null
  })
}

/** ATR theo Wilder. */
export const atr = (bars: readonly Bar[], period: number): Series => wilder(trueRange(bars), period)

/** ATR theo phần trăm giá đóng cửa. */
export function atrPercent(bars: readonly Bar[], period: number): Series {
  return ratio(
    atr(bars, period),
    bars.map((bar) => (finite(bar.close) ? bar.close : null)),
    100,
  )
}

/** ADX (đường ADX, làm mịn Wilder của DX). */
export function adx(bars: readonly Bar[], period: number): { plus: Series; minus: Series; adx: Series } {
  const plusDm = nulls(bars.length)
  const minusDm = nulls(bars.length)
  for (let index = 1; index < bars.length; index += 1) {
    const current = bars[index]
    const previous = bars[index - 1]
    if (!isValidBar(current) || !isValidBar(previous)) continue
    const up = current.high - previous.high
    const down = previous.low - current.low
    plusDm[index] = up > down && up > 0 ? up : 0
    minusDm[index] = down > up && down > 0 ? down : 0
  }
  const range = atr(bars, period)
  const plus = ratio(wilder(plusDm, period), range, 100)
  const minus = ratio(wilder(minusDm, period), range, 100)
  const dx = zip(plus, minus, (x, y) => (x + y === 0 ? 0 : (100 * Math.abs(x - y)) / (x + y)))
  return { plus, minus, adx: wilder(dx, period) }
}

/** Keltner: EMA của giá đóng cửa làm đường giữa, rộng ra `k` lần ATR. */
export function keltner(bars: readonly Bar[], emaPeriod: number, atrPeriod: number, k: number): { middle: Series; upper: Series; lower: Series } {
  const middle = ema(
    bars.map((bar) => bar.close),
    emaPeriod,
  )
  const range = atr(bars, atrPeriod)
  return {
    middle,
    upper: zip(middle, range, (x, y) => x + k * y),
    lower: zip(middle, range, (x, y) => x - k * y),
  }
}

/** Độ rộng dải Bollinger theo phần trăm đường giữa: (trên - dưới) / giữa * 100. */
export function bbWidth(closes: readonly number[], period: number, k: number): Series {
  const bands = bollinger(closes, period, k)
  return ratio(
    zip(bands.upper, bands.lower, (x, y) => x - y),
    bands.middle,
    100,
  )
}

/** Trung bình khối lượng của `lookback` phiên TRƯỚC; `null` khi trong cửa sổ có số không hữu hạn. */
function previousVolumeMean(volume: readonly number[], lookback: number): Series {
  const out = nulls(volume.length)
  let sum = 0
  let bad = 0
  for (let index = 0; index < volume.length; index += 1) {
    if (index >= lookback) {
      out[index] = bad === 0 ? sum / lookback : null
      const leaving = volume[index - lookback]
      if (finite(leaving)) sum -= leaving
      else bad -= 1
    }
    if (finite(volume[index])) sum += volume[index]
    else bad += 1
  }
  return out
}

/** Khối lượng tương đối: khối lượng chia trung bình `lookback` phiên trước. */
export function relativeVolume(volume: readonly number[], lookback: number): Series {
  return ratio(volume, previousVolumeMean(volume, lookback))
}

/** Parabolic SAR của Wilder; một nến hỏng đặt lại xu hướng và cặp nến hợp lệ kế tiếp khởi tạo lại. */
export function parabolicSar(bars: readonly Bar[], step: number, maxAf: number): Series {
  const length = bars.length
  const out = nulls(length)
  let up = true
  let state: { sar: number; ep: number } | null = null
  let af = step
  for (let index = 1; index < length; index += 1) {
    const current = bars[index]
    const previous = bars[index - 1]
    if (!isValidBar(current) || !isValidBar(previous)) {
      state = null
      continue
    }
    if (state === null) {
      up = current.close >= previous.close
      const sar = up ? Math.min(current.low, previous.low) : Math.max(current.high, previous.high)
      const ep = up ? Math.max(current.high, previous.high) : Math.min(current.low, previous.low)
      state = { sar, ep }
      af = step
      out[index] = sar
      continue
    }
    const beforePrevious = bars[index - 2]
    let ep: number = state.ep
    let next: number = state.sar + af * (ep - state.sar)
    if (up) {
      next = Math.min(next, previous.low, index > 1 && beforePrevious !== undefined && finite(beforePrevious.low) ? beforePrevious.low : previous.low)
      if (current.low < next) {
        up = false
        next = ep
        ep = current.low
        af = step
      } else if (current.high > ep) {
        ep = current.high
        af = Math.min(maxAf, af + step)
      }
    } else {
      next = Math.max(next, previous.high, index > 1 && beforePrevious !== undefined && finite(beforePrevious.high) ? beforePrevious.high : previous.high)
      if (current.high > next) {
        up = true
        next = ep
        ep = current.high
        af = step
      } else if (current.low < ep) {
        ep = current.low
        af = Math.min(maxAf, af + step)
      }
    }
    state = { sar: next, ep }
    out[index] = next
  }
  return out
}
