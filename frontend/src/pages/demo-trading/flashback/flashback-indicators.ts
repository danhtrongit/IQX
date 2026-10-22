/**
 * Chỉ báo Flashback, tính phía client (spec v1.1 §2.7).
 *
 * Công thức bám đúng registry chỉ báo của Bot (spec Bot §9.1) và đúng bản mẫu: RSI theo
 * Wilder 14, MACD 12/26/9, Bollinger 20 ± 2σ, DMI, Stochastic, CCI, ROC, Williams %R, OBV, MFI,
 * Chaikin Money Flow, Donchian, MA, EMA, MA Cross và ngưỡng khối lượng.
 *
 * Chỉ báo vẽ trên các nến đã hiện; phần khởi tạo (warmup) chỉ dùng để tính, không vẽ.
 */
import type { FlashbackBar, FlashbackIndicatorParams } from "./flashback-api"

export type IndicatorKind = "over" | "vol" | "pane"

export type IndicatorSeries = {
  key: string
  values: (number | null)[]
  color?: string
  width?: number
  /** Tô vùng giữa hai đường (dải Bollinger, kênh Donchian). */
  band?: { upper: string; lower: string }
  /** Vẽ cột histogram (MACD). */
  histogram?: boolean
}

export type IndicatorPlot = {
  kind: IndicatorKind
  series: IndicatorSeries[]
  histogram?: (number | null)[]
  markers?: { index: number; [key: string]: unknown }[]
  /** Ngưỡng ngang của ô riêng. */
  levels?: { key: string; value: number; label: string }[]
  /** Vẽ vạch 0 (MACD, CCI, ROC, CMF). */
  zero?: boolean
  /** Miền giá trị cố định của ô riêng (RSI 0-100, Williams %R -100..0). */
  range?: [number, number]
  /** Tô vùng giữa hai ngưỡng của ô riêng. */
  levelBand?: [string, string] | { lower: number; upper: number }
  /** Hai đường cần khoanh điểm giao cắt (MA Cross). */
  cross?: [string, string]
}

type Bars = {
  open: number[]
  high: number[]
  low: number[]
  close: number[]
  volume: number[]
}

function seriesOf(bars: readonly FlashbackBar[]): Bars {
  return {
    open: bars.map((bar) => bar.open),
    high: bars.map((bar) => bar.high),
    low: bars.map((bar) => bar.low),
    close: bars.map((bar) => bar.close),
    volume: bars.map((bar) => bar.volume),
  }
}

/** Trung bình đơn giản; `null` cho các phiên chưa đủ cửa sổ. */
export function sma(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = []
  let sum = 0
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index]
    if (index >= period) sum -= values[index - period]
    out.push(index >= period - 1 ? sum / period : null)
  }
  return out
}

/** Trung bình động hàm mũ, khởi tạo bằng SMA của đủ N quan sát đầu. */
export function ema(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = []
  const factor = 2 / (period + 1)
  let current: number | null = null
  let sum = 0
  let seen = 0
  values.forEach((value) => {
    if (current === null) {
      sum += value
      seen += 1
      if (seen === period) {
        current = sum / period
        out.push(current)
      } else {
        out.push(null)
      }
      return
    }
    current = value * factor + current * (1 - factor)
    out.push(current)
  })
  return out
}

function highest(values: readonly number[], from: number, to: number): number {
  let max = Number.NEGATIVE_INFINITY
  for (let index = from; index <= to; index += 1) max = Math.max(max, values[index])
  return max
}

function lowest(values: readonly number[], from: number, to: number): number {
  let min = Number.POSITIVE_INFINITY
  for (let index = from; index <= to; index += 1) min = Math.min(min, values[index])
  return min
}

function typicalPrice(bars: Bars): number[] {
  return bars.close.map((close, index) => (bars.high[index] + bars.low[index] + close) / 3)
}

/** RSI 14 theo Wilder. */
export function rsi(closes: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null)
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

/** MACD: đường MACD, đường tín hiệu và cột histogram. */
export function macd(
  closes: readonly number[],
  fast: number,
  slow: number,
  signal: number,
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const fastLine = ema(closes, fast)
  const slowLine = ema(closes, slow)
  const line = closes.map((_, index) =>
    fastLine[index] == null || slowLine[index] == null ? null : fastLine[index]! - slowLine[index]!,
  )
  const signalLine = ema(line.map((value) => value ?? 0), signal)
  const cleanSignal = line.map((value, index) => (value == null ? null : signalLine[index]))
  const histogram = line.map((value, index) =>
    value == null || cleanSignal[index] == null ? null : value - cleanSignal[index]!,
  )
  return { macd: line, signal: cleanSignal, histogram }
}

/** Bollinger Bands: dải trên, dải dưới và đường giữa. */
export function bollinger(
  closes: readonly number[],
  period: number,
  factor: number,
): { middle: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
  const middle = sma(closes, period)
  const upper: (number | null)[] = []
  const lower: (number | null)[] = []
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
export function donchian(
  bars: Bars,
  period: number,
): { upper: (number | null)[]; lower: (number | null)[] } {
  const upper = bars.high.map((_, index) =>
    index < period ? null : highest(bars.high, index - period, index - 1),
  )
  const lower = bars.low.map((_, index) => (index < period ? null : lowest(bars.low, index - period, index - 1)))
  return { upper, lower }
}

/** DMI: +DI và −DI (không có ADX). */
export function dmi(bars: Bars, period: number): { plus: (number | null)[]; minus: (number | null)[] } {
  const plus: (number | null)[] = new Array(bars.close.length).fill(null)
  const minus: (number | null)[] = new Array(bars.close.length).fill(null)
  let smoothedPlus = 0
  let smoothedMinus = 0
  let smoothedRange = 0
  for (let index = 1; index < bars.close.length; index += 1) {
    const upMove = bars.high[index] - bars.high[index - 1]
    const downMove = bars.low[index - 1] - bars.low[index]
    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0
    const range = Math.max(
      bars.high[index] - bars.low[index],
      Math.abs(bars.high[index] - bars.close[index - 1]),
      Math.abs(bars.low[index] - bars.close[index - 1]),
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

/** Stochastic: %K thô, %K trung bình và %D. */
export function stochastic(
  bars: Bars,
  kPeriod: number,
  dPeriod: number,
  smooth: number,
): { k: (number | null)[]; d: (number | null)[] } {
  const raw = bars.close.map((close, index) => {
    if (index < kPeriod - 1) return null
    const high = highest(bars.high, index - kPeriod + 1, index)
    const low = lowest(bars.low, index - kPeriod + 1, index)
    return high === low ? null : (100 * (close - low)) / (high - low)
  })
  const k = sma(raw.map((value) => value ?? 0), smooth).map((value, index) => (raw[index] == null ? null : value))
  const d = sma(k.map((value) => value ?? 0), dPeriod).map((value, index) => (k[index] == null ? null : value))
  return { k, d }
}

/** CCI: chỉ số kênh hàng hóa. */
export function cci(bars: Bars, period: number): (number | null)[] {
  const typical = typicalPrice(bars)
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
export function roc(closes: readonly number[], period: number): (number | null)[] {
  return closes.map((close, index) => (index < period ? null : (close / closes[index - period] - 1) * 100))
}

/** Williams %R: thang -100..0. */
export function williamsR(bars: Bars, period: number): (number | null)[] {
  return bars.close.map((close, index) => {
    if (index < period - 1) return null
    const high = highest(bars.high, index - period + 1, index)
    const low = lowest(bars.low, index - period + 1, index)
    return high === low ? null : (-100 * (high - close)) / (high - low)
  })
}

/** OBV và đường SMA của OBV. */
export function obv(bars: Bars, baseline: number): { obv: number[]; signal: (number | null)[] } {
  const values = [0]
  for (let index = 1; index < bars.close.length; index += 1) {
    const change =
      bars.close[index] > bars.close[index - 1]
        ? bars.volume[index]
        : bars.close[index] < bars.close[index - 1]
          ? -bars.volume[index]
          : 0
    values.push(values[index - 1] + change)
  }
  return { obv: values, signal: sma(values, baseline) }
}

/** MFI: chỉ số dòng tiền, thang 0-100. */
export function mfi(bars: Bars, period: number): (number | null)[] {
  const typical = typicalPrice(bars)
  const positive = typical.map((value, index) => (index > 0 && value > typical[index - 1] ? value * bars.volume[index] : 0))
  const negative = typical.map((value, index) => (index > 0 && value < typical[index - 1] ? value * bars.volume[index] : 0))
  return bars.close.map((_, index) => {
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

/** Chaikin Money Flow. */
export function cmf(bars: Bars, period: number): (number | null)[] {
  const flow = bars.close.map((close, index) =>
    bars.high[index] === bars.low[index]
      ? null
      : ((2 * close - bars.high[index] - bars.low[index]) / (bars.high[index] - bars.low[index])) * bars.volume[index],
  )
  return bars.close.map((_, index) => {
    if (index < period - 1) return null
    let sum = 0
    let volume = 0
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      if (flow[cursor] == null) return null
      sum += flow[cursor]!
      volume += bars.volume[cursor]
    }
    return volume ? sum / volume : null
  })
}

/** Giá trị số của một tham số; cặp ngưỡng lấy phía dưới. */
function numberParam(params: FlashbackIndicatorParams, key: string, fallback: number): number {
  const value = params[key]
  if (value == null) return fallback
  return typeof value === "number" ? value : value.lower
}

/** Cặp ngưỡng của một tham số (dưới/trên) nếu chỉ báo có hai ngưỡng. */
function levelParam(params: FlashbackIndicatorParams, key: string): { lower: number; upper: number } | null {
  const value = params[key]
  if (value == null) return null
  return typeof value === "number" ? null : value
}

/**
 * Tính một chỉ báo trên các nến đã hiện. `bars` phải gồm cả phần khởi tạo (warmup) để các cửa
 * sổ dài (SMA 200, Donchian 252…) có đủ dữ liệu.
 */
export function computeIndicator(
  id: string,
  params: FlashbackIndicatorParams,
  bars: readonly FlashbackBar[],
): IndicatorPlot {
  const series = seriesOf(bars)
  const closes = series.close
  switch (id) {
    case "volume": {
      const lookback = numberParam(params, "lookback", 20)
      const factor = numberParam(params, "mult", 1)
      const values = series.volume.map((_, index) =>
        index < lookback ? null : factor * (series.volume.slice(index - lookback, index).reduce((sum, value) => sum + value, 0) / lookback),
      )
      return { kind: "vol", series: [{ key: "a", values }] }
    }
    case "ma":
      return { kind: "over", series: [{ key: "a", values: sma(closes, numberParam(params, "period", 20)) }] }
    case "ema":
      return { kind: "over", series: [{ key: "a", values: ema(closes, numberParam(params, "period", 20)) }] }
    case "ma_cross": {
      const fast = numberParam(params, "fast", 20)
      const slow = numberParam(params, "slow", 50)
      return {
        kind: "over",
        series: [
          { key: "f", values: sma(closes, fast) },
          { key: "s", values: sma(closes, slow), color: "#f59e0b" },
        ],
        cross: ["f", "s"],
      }
    }
    case "bollinger": {
      const period = numberParam(params, "period", 20)
      const factor = numberParam(params, "k", 2)
      const bands = bollinger(closes, period, factor)
      return {
        kind: "over",
        series: [
          { key: "u", values: bands.upper, color: "#38bdf8", band: { upper: "u", lower: "l" } },
          { key: "l", values: bands.lower, color: "#38bdf8" },
          { key: "m", values: bands.middle, color: "#60a5fa" },
        ],
      }
    }
    case "donchian": {
      const period = numberParam(params, "period", 20)
      const channel = donchian(series, period)
      return {
        kind: "over",
        series: [
          { key: "u", values: channel.upper, band: { upper: "u", lower: "l" } },
          { key: "l", values: channel.lower },
        ],
      }
    }
    case "rsi": {
      const level = levelParam(params, "level")
      return {
        kind: "pane",
        series: [{ key: "a", values: rsi(closes, numberParam(params, "period", 14)) }],
        range: [0, 100],
        levels: level
          ? [
              { key: "lower", value: level.lower, label: "Ngưỡng dưới" },
              { key: "upper", value: level.upper, label: "Ngưỡng trên" },
            ]
          : [],
        levelBand: level ? ["lower", "upper"] : undefined,
      }
    }
    case "macd": {
      const fast = numberParam(params, "fast", 12)
      const slow = numberParam(params, "slow", 26)
      const signal = numberParam(params, "signal", 9)
      const lines = macd(closes, fast, slow, signal)
      return {
        kind: "pane",
        series: [
          { key: "a", values: lines.macd },
          { key: "s", values: lines.signal, color: "#f59e0b" },
          { key: "h", values: lines.histogram, histogram: true },
        ],
        zero: true,
      }
    }
    case "dmi": {
      const lines = dmi(series, numberParam(params, "period", 14))
      return {
        kind: "pane",
        series: [
          { key: "p", values: lines.plus, color: "#19b37a" },
          { key: "m", values: lines.minus, color: "#e24a4a" },
        ],
      }
    }
    case "stochastic": {
      const level = levelParam(params, "level")
      const lines = stochastic(series, numberParam(params, "k", 14), numberParam(params, "d", 3), numberParam(params, "smooth", 3))
      return {
        kind: "pane",
        series: [
          { key: "k", values: lines.k },
          { key: "d", values: lines.d, color: "#f59e0b" },
        ],
        range: [0, 100],
        levels: level
          ? [
              { key: "lower", value: level.lower, label: "Ngưỡng dưới" },
              { key: "upper", value: level.upper, label: "Ngưỡng trên" },
            ]
          : [],
        levelBand: level ? ["lower", "upper"] : undefined,
      }
    }
    case "cci": {
      const level = levelParam(params, "level")
      return {
        kind: "pane",
        series: [{ key: "a", values: cci(series, numberParam(params, "period", 20)) }],
        zero: true,
        levels: level
          ? [
              { key: "lower", value: level.lower, label: "Dưới" },
              { key: "upper", value: level.upper, label: "Trên" },
            ]
          : [],
        levelBand: level ? { lower: level.lower, upper: level.upper } : undefined,
      }
    }
    case "roc": {
      const level = levelParam(params, "level")
      return {
        kind: "pane",
        series: [{ key: "a", values: roc(closes, numberParam(params, "period", 20)) }],
        zero: true,
        levels: level
          ? [
              { key: "lower", value: level.lower, label: "Dưới" },
              { key: "upper", value: level.upper, label: "Trên" },
            ]
          : [],
        levelBand: level ? { lower: level.lower, upper: level.upper } : undefined,
      }
    }
    case "williams_r": {
      const level = levelParam(params, "level")
      return {
        kind: "pane",
        series: [{ key: "a", values: williamsR(series, numberParam(params, "period", 14)) }],
        range: [-100, 0],
        levels: level
          ? [
              { key: "lower", value: level.lower, label: "Ngưỡng dưới" },
              { key: "upper", value: level.upper, label: "Ngưỡng trên" },
            ]
          : [],
        levelBand: level ? ["lower", "upper"] : undefined,
      }
    }
    case "obv": {
      const lines = obv(series, numberParam(params, "baseline", 20))
      return {
        kind: "pane",
        series: [
          { key: "a", values: lines.obv },
          { key: "b", values: lines.signal, color: "#f59e0b" },
        ],
      }
    }
    case "mfi": {
      const level = levelParam(params, "level")
      return {
        kind: "pane",
        series: [{ key: "a", values: mfi(series, numberParam(params, "period", 14)) }],
        range: [0, 100],
        levels: level
          ? [
              { key: "lower", value: level.lower, label: "Ngưỡng dưới" },
              { key: "upper", value: level.upper, label: "Ngưỡng trên" },
            ]
          : [],
        levelBand: level ? ["lower", "upper"] : undefined,
      }
    }
    case "cmf": {
      const rawLevel = params.level
      const threshold =
        typeof rawLevel === "number"
          ? rawLevel
          : typeof rawLevel === "object" && rawLevel !== null
            ? rawLevel.lower
            : 0
      return {
        kind: "pane",
        series: [{ key: "a", values: cmf(series, numberParam(params, "period", 20)) }],
        zero: true,
        levels: [{ key: "level", value: threshold, label: "Ngưỡng" }],
      }
    }
    default:
      return { kind: "over", series: [] }
  }
}

/** Metadata tham số tối thiểu mà các hàm kiểm tra cần. */
export type ParamMetaLike = {
  key: string
  label: string
  min: number
  max: number
  step: number
  default: number
  lower: { min: number; max: number; default: number } | null
  upper: { min: number; max: number; default: number } | null
}

export type IndicatorMetaLike = {
  params: ParamMetaLike[]
  cross_fields: { left: string; op: ">" | "<"; right: string }[]
}

/** Giá trị mặc định của một bộ tham số, lấy từ metadata của server. */
export function defaultParams(meta: IndicatorMetaLike): FlashbackIndicatorParams {
  const params: FlashbackIndicatorParams = {}
  for (const param of meta.params) {
    if (param.lower && param.upper) {
      params[param.key] = {
        lower: Math.min(param.lower.default, param.upper.default),
        upper: Math.max(param.lower.default, param.upper.default),
      }
      continue
    }
    params[param.key] = param.default
  }
  return params
}

/**
 * Kiểm tra một bộ tham số theo metadata: giá trị nằm đúng miền và đúng bước nhảy, và các
 * ràng buộc chéo (MACD nhanh < chậm). Trả về thông báo tiếng Việt hoặc `null` khi hợp lệ.
 */
export function validateParams(meta: IndicatorMetaLike, params: FlashbackIndicatorParams): string | null {
  for (const param of meta.params) {
    const value = params[param.key]
    if (value == null) return `${param.label} chưa có giá trị`
    if (typeof value === "number") {
      const problem = checkRange(param.label, value, param.min, param.max, param.step)
      if (problem) return problem
      continue
    }
    const lower = checkRange(param.label, value.lower, param.lower?.min ?? param.min, param.lower?.max ?? param.max, param.step)
    if (lower) return lower
    const upper = checkRange(param.label, value.upper, param.upper?.min ?? param.min, param.upper?.max ?? param.max, param.step)
    if (upper) return upper
    if (param.lower && param.upper && value.lower >= value.upper) {
      return "Ngưỡng dưới phải nhỏ hơn ngưỡng trên."
    }
  }
  for (const rule of meta.cross_fields) {
    const left = params[rule.left]
    const right = params[rule.right]
    const leftValue = typeof left === "number" ? left : left?.lower
    const rightValue = typeof right === "number" ? right : right?.lower
    if (leftValue == null || rightValue == null) continue
    const leftLabel = meta.params.find((param) => param.key === rule.left)?.label ?? rule.left
    const rightLabel = meta.params.find((param) => param.key === rule.right)?.label ?? rule.right
    if (rule.op === "<" && leftValue >= rightValue) return `${leftLabel} phải nhỏ hơn ${rightLabel}`
    if (rule.op === ">" && leftValue <= rightValue) return `${leftLabel} phải lớn hơn ${rightLabel}`
  }
  return null
}

function checkRange(label: string, value: number, min: number, max: number, step: number): string | null {
  if (!Number.isFinite(value)) return `${label} phải là một số`
  if (value < min || value > max) return `${label} phải từ ${min} đến ${max}`
  if (step >= 1 && !Number.isInteger(value)) return `${label} phải là số nguyên`
  if (step > 0 && step < 1) {
    const steps = Math.round((value - min) / step)
    if (Math.abs(min + steps * step - value) > 1e-6) return `${label} phải là bội số của ${step}`
  }
  return null
}
