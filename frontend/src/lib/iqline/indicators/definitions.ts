/**
 * 23 chỉ báo có công thức (docs/iqline-design.md §9): 16 chỉ báo trong danh mục (`flashback: true`) và 7 chỉ báo bổ
 * sung chỉ có ở `market` (`flashback: false`). Volume Profile nằm ở `volume-profile.ts`.
 *
 * Miền giá trị, bước nhảy và mặc định của 16 chỉ báo trong danh mục khớp bảng `flashback.indicators.ts` của backend
 * (test đối chiếu kiểm tra điều này). Hai ngưỡng của một chỉ báo (RSI 30/70...) tách thành hai tham số phẳng `lower` và
 * `upper`, vì `IndicatorParams` chỉ chứa số, chuỗi, logic; Flashback cũ lưu chúng thành `level: { lower, upper }`.
 *
 * Màu: mỗi chuỗi lấy `palette[vị trí]` (vòng lại khi hết). Người gọi quyết định bảng màu theo luật `DESIGN.md` (thứ
 * tự `chart-1, chart-6, chart-8, chart-2, chart-5`, bỏ `chart-6/7/8` khi biểu đồ có đường trần sàn), chỉ báo không tự
 * chọn màu ngoài hai chỗ có nghĩa cố định: +DI/-DI và cột histogram MACD dùng `price-up`/`price-down`.
 */
import type { Bar, ColorToken, IndicatorContext, IndicatorDefinition, IndicatorKind, IndicatorParamSpec, IndicatorParams, IndicatorPlot, IndicatorSeries } from "../types"
import { adx, atr, atrPercent, bbWidth, keltner, parabolicSar, relativeVolume } from "./legacy-series"
import { emptyPlot, registerIndicator, resolveParamSpecs, validateParamSpecs, getIndicator, type IndicatorOptions } from "./registry"
import { bollinger, cci, cmf, columnsOf, donchian, dmi, ema, macd, mfi, obv, roc, rsi, sma, stochastic, volumeThreshold, williamsR, type Columns } from "./series"

type Palette = readonly ColorToken[]
const FALLBACK: ColorToken = "chart-1"
const colorAt = (palette: Palette, slot: number): ColorToken => (palette.length ? palette[slot % palette.length] : FALLBACK)
export const num = (params: IndicatorParams, key: string): number => {
  const value = params[key]
  return typeof value === "number" ? value : Number.NaN
}

export function line(key: string, label: string, values: readonly (number | null)[], color: ColorToken, extra: Partial<IndicatorSeries> = {}): IndicatorSeries {
  return { key, label, values, color, ...extra }
}

type Builder = (input: { columns: Columns; bars: readonly Bar[]; params: IndicatorParams; color: (slot: number) => ColorToken; context: IndicatorContext | undefined }) => IndicatorPlot

export type BuiltinSpec = {
  id: string
  name: string
  kind: IndicatorKind
  flashback: boolean
  params: readonly IndicatorParamSpec[]
  options?: IndicatorOptions
  build: Builder
}

export type Builtin = { definition: IndicatorDefinition; options: IndicatorOptions }

/**
 * Bọc công thức thành một `IndicatorDefinition`. Tham số sai không ném lỗi (một layout lưu hỏng không được làm hỏng
 * biểu đồ) mà trả về biểu đồ rỗng; `validateIndicatorParams` cho biết lý do.
 */
export function builtin(spec: BuiltinSpec): Builtin {
  const options = spec.options ?? {}
  const definition: IndicatorDefinition = {
    id: spec.id,
    name: spec.name,
    kind: spec.kind,
    params: spec.params,
    flashback: spec.flashback,
    compute(bars, params, palette, context) {
      if (validateParamSpecs(spec.name, spec.params, params, options.validate)) return emptyPlot(spec.kind)
      // Chỉ báo cần thời gian không đoán thời gian từ nến: thiếu `context` (hoặc lệch độ dài) là biểu đồ rỗng.
      if (options.needsTime && (!context || context.times.length !== bars.length)) return emptyPlot(spec.kind)
      return spec.build({
        columns: columnsOf(bars),
        bars,
        params: resolveParamSpecs(spec.params, params),
        color: (slot) => colorAt(palette, slot),
        context,
      })
    },
  }
  return { definition, options }
}

// ---------------------------------------------------------------- spec tham số

export type NumberSpec = { key: string; label: string; min: number; max: number; step: number; default: number }
export const numberSpec = (value: NumberSpec): IndicatorParamSpec => value
export const period = (key: string, label: string, min: number, max: number, def: number): IndicatorParamSpec => numberSpec({ key, label, min, max, step: 1, default: def })

/** Hai ngưỡng dưới và trên của một chỉ báo (RSI 30/70, CCI -100/100...). */
export function levelSpecs(labelLower: string, labelUpper: string, min: number, max: number, step: number, lower: number, upper: number): IndicatorParamSpec[] {
  return [numberSpec({ key: "lower", label: labelLower, min, max, step, default: lower }), numberSpec({ key: "upper", label: labelUpper, min, max, step, default: upper })]
}

export const lowerBelowUpper = (params: IndicatorParams): string | null => (num(params, "lower") < num(params, "upper") ? null : "Ngưỡng dưới phải nhỏ hơn ngưỡng trên.")
export const fastBelowSlow = (fast: string, slow: string, fastLabel: string, slowLabel: string) => (params: IndicatorParams): string | null =>
  num(params, fast) < num(params, slow) ? null : `${fastLabel} phải nhỏ hơn ${slowLabel}.`

export function thresholds(params: IndicatorParams, labels: readonly [string, string]): Pick<IndicatorPlot, "levels" | "levelBand"> {
  const lower = num(params, "lower")
  const upper = num(params, "upper")
  return {
    levels: [
      { key: "lower", value: lower, label: labels[0] },
      { key: "upper", value: upper, label: labels[1] },
    ],
    levelBand: { lower, upper },
  }
}

export const NGUONG: readonly [string, string] = ["Ngưỡng dưới", "Ngưỡng trên"]
const DUOI_TREN: readonly [string, string] = ["Dưới", "Trên"]

// ---------------------------------------------------------------- 16 chỉ báo trong danh mục

const VOLUME = builtin({
  id: "volume",
  name: "Khối lượng",
  kind: "vol",
  flashback: true,
  params: [period("lookback", "Số phiên tham chiếu", 5, 100, 20), numberSpec({ key: "mult", label: "Hệ số khối lượng", min: 0.5, max: 3, step: 0.1, default: 1 })],
  options: { tailMemory: (p) => num(p, "lookback") },
  build: ({ columns, params, color }) => ({
    kind: "vol",
    series: [line("threshold", "Ngưỡng khối lượng", volumeThreshold(columns.volume, num(params, "lookback"), num(params, "mult")), color(0))],
  }),
})

const MA = builtin({
  id: "ma",
  name: "MA / SMA",
  kind: "over",
  flashback: true,
  params: [period("period", "Chu kỳ SMA", 5, 200, 20)],
  options: { tailMemory: (p) => num(p, "period") - 1 },
  build: ({ columns, params, color }) => ({
    kind: "over",
    series: [line("ma", `MA ${num(params, "period")}`, sma(columns.close, num(params, "period")), color(0))],
  }),
})

const BOLLINGER = builtin({
  id: "bollinger",
  name: "Bollinger Bands",
  kind: "over",
  flashback: true,
  params: [period("period", "Chu kỳ Bollinger", 10, 100, 20), numberSpec({ key: "k", label: "Hệ số dải", min: 1, max: 3.5, step: 0.1, default: 2 })],
  options: { tailMemory: (p) => num(p, "period") - 1 },
  build: ({ columns, params, color }) => {
    const bands = bollinger(columns.close, num(params, "period"), num(params, "k"))
    return {
      kind: "over",
      series: [line("upper", "BB trên", bands.upper, color(1)), line("lower", "BB dưới", bands.lower, color(1)), line("middle", "BB giữa", bands.middle, color(0))],
    }
  },
})

const EMA = builtin({
  id: "ema",
  name: "EMA",
  kind: "over",
  flashback: true,
  params: [period("period", "Chu kỳ EMA", 5, 200, 20)],
  build: ({ columns, params, color }) => ({
    kind: "over",
    series: [line("ema", `EMA ${num(params, "period")}`, ema(columns.close, num(params, "period")), color(0))],
  }),
})

const MA_CROSS = builtin({
  id: "ma_cross",
  name: "MA Cross",
  kind: "over",
  flashback: true,
  params: [period("fast", "Chu kỳ SMA nhanh", 5, 200, 20), period("slow", "Chu kỳ SMA chậm", 5, 200, 50)],
  options: {
    validate: fastBelowSlow("fast", "slow", "Chu kỳ SMA nhanh", "Chu kỳ SMA chậm"),
    tailMemory: (p) => Math.max(num(p, "fast"), num(p, "slow")) - 1,
  },
  build: ({ columns, params, color }) => ({
    kind: "over",
    series: [
      line("fast", `MA ${num(params, "fast")}`, sma(columns.close, num(params, "fast")), color(0)),
      line("slow", `MA ${num(params, "slow")}`, sma(columns.close, num(params, "slow")), color(1)),
    ],
    cross: ["fast", "slow"],
  }),
})

const DONCHIAN = builtin({
  id: "donchian",
  name: "Donchian Channel",
  kind: "over",
  flashback: true,
  params: [period("period", "Chu kỳ Donchian", 5, 252, 20)],
  options: { tailMemory: (p) => num(p, "period") },
  build: ({ columns, params, color }) => {
    const channel = donchian(columns, num(params, "period"))
    return { kind: "over", series: [line("upper", "Donchian trên", channel.upper, color(0)), line("lower", "Donchian dưới", channel.lower, color(0))] }
  },
})

const RSI = builtin({
  id: "rsi",
  name: "RSI",
  kind: "pane",
  flashback: true,
  params: [period("period", "Chu kỳ RSI", 5, 50, 14), ...levelSpecs("Ngưỡng quá bán", "Ngưỡng quá mua", 0, 100, 1, 30, 70)],
  options: { validate: lowerBelowUpper },
  build: ({ columns, params, color }) => ({
    kind: "pane",
    series: [line("rsi", `RSI ${num(params, "period")}`, rsi(columns.close, num(params, "period")), color(0))],
    range: [0, 100],
    ...thresholds(params, NGUONG),
  }),
})

const MACD = builtin({
  id: "macd",
  name: "MACD",
  kind: "pane",
  flashback: true,
  params: [period("fast", "Chu kỳ EMA nhanh", 2, 50, 12), period("slow", "Chu kỳ EMA chậm", 5, 100, 26), period("signal", "Chu kỳ đường tín hiệu", 2, 30, 9)],
  options: { validate: fastBelowSlow("fast", "slow", "Chu kỳ EMA nhanh", "Chu kỳ EMA chậm") },
  build: ({ columns, params, color }) => {
    const lines = macd(columns.close, num(params, "fast"), num(params, "slow"), num(params, "signal"))
    return {
      kind: "pane",
      series: [line("macd", "MACD", lines.macd, color(0)), line("signal", "Tín hiệu", lines.signal, color(1))],
      histogram: { values: lines.histogram, upToken: "price-up", downToken: "price-down" },
      zero: true,
    }
  },
})

const DMI = builtin({
  id: "dmi",
  name: "DMI",
  kind: "pane",
  flashback: true,
  params: [period("period", "Chu kỳ DMI", 5, 50, 14)],
  build: ({ columns, params }) => {
    const lines = dmi(columns, num(params, "period"))
    return { kind: "pane", series: [line("plus", "+DI", lines.plus, "price-up"), line("minus", "-DI", lines.minus, "price-down")] }
  },
})

const STOCHASTIC = builtin({
  id: "stochastic",
  name: "Stochastic",
  kind: "pane",
  flashback: true,
  params: [period("k", "Chu kỳ %K", 5, 50, 14), period("d", "Chu kỳ %D", 2, 20, 3), period("smooth", "Chu kỳ trung bình %K", 1, 10, 3), ...levelSpecs("Ngưỡng %K dưới", "Ngưỡng %K trên", 0, 100, 1, 20, 80)],
  options: { validate: lowerBelowUpper, tailMemory: (p) => num(p, "k") + num(p, "smooth") + num(p, "d") - 3 },
  build: ({ columns, params, color }) => {
    const lines = stochastic(columns, num(params, "k"), num(params, "d"), num(params, "smooth"))
    return {
      kind: "pane",
      series: [line("k", "%K", lines.k, color(0)), line("d", "%D", lines.d, color(1))],
      range: [0, 100],
      ...thresholds(params, NGUONG),
    }
  },
})

const CCI = builtin({
  id: "cci",
  name: "CCI",
  kind: "pane",
  flashback: true,
  params: [period("period", "Chu kỳ CCI", 5, 100, 20), ...levelSpecs("Ngưỡng CCI dưới", "Ngưỡng CCI trên", -300, 300, 1, -100, 100)],
  options: { validate: lowerBelowUpper, tailMemory: (p) => num(p, "period") - 1 },
  build: ({ columns, params, color }) => ({
    kind: "pane",
    series: [line("cci", `CCI ${num(params, "period")}`, cci(columns, num(params, "period")), color(0))],
    zero: true,
    ...thresholds(params, DUOI_TREN),
  }),
})

const ROC = builtin({
  id: "roc",
  name: "ROC",
  kind: "pane",
  flashback: true,
  params: [period("period", "Chu kỳ ROC", 2, 252, 20), ...levelSpecs("Ngưỡng ROC dưới", "Ngưỡng ROC trên", -100, 10000, 0.1, -5, 5)],
  options: { validate: lowerBelowUpper, tailMemory: (p) => num(p, "period") },
  build: ({ columns, params, color }) => ({
    kind: "pane",
    series: [line("roc", `ROC ${num(params, "period")}`, roc(columns.close, num(params, "period")), color(0))],
    zero: true,
    ...thresholds(params, DUOI_TREN),
  }),
})

const WILLIAMS_R = builtin({
  id: "williams_r",
  name: "Williams %R",
  kind: "pane",
  flashback: true,
  params: [period("period", "Chu kỳ Williams %R", 5, 100, 14), ...levelSpecs("Ngưỡng Williams %R dưới", "Ngưỡng Williams %R trên", -100, 0, 1, -80, -20)],
  options: { validate: lowerBelowUpper, tailMemory: (p) => num(p, "period") - 1 },
  build: ({ columns, params, color }) => ({
    kind: "pane",
    series: [line("williams_r", `%R ${num(params, "period")}`, williamsR(columns, num(params, "period")), color(0))],
    range: [-100, 0],
    ...thresholds(params, NGUONG),
  }),
})

const OBV = builtin({
  id: "obv",
  name: "OBV",
  kind: "pane",
  flashback: true,
  params: [period("baseline", "Chu kỳ SMA của OBV", 5, 100, 20)],
  build: ({ columns, params, color }) => {
    const lines = obv(columns, num(params, "baseline"))
    return { kind: "pane", series: [line("obv", "OBV", lines.obv, color(0)), line("signal", `SMA ${num(params, "baseline")}`, lines.signal, color(1))] }
  },
})

const MFI = builtin({
  id: "mfi",
  name: "MFI",
  kind: "pane",
  flashback: true,
  params: [period("period", "Chu kỳ MFI", 5, 50, 14), ...levelSpecs("Ngưỡng MFI dưới", "Ngưỡng MFI trên", 0, 100, 1, 20, 80)],
  options: { validate: lowerBelowUpper, tailMemory: (p) => num(p, "period") },
  build: ({ columns, params, color }) => ({
    kind: "pane",
    series: [line("mfi", `MFI ${num(params, "period")}`, mfi(columns, num(params, "period")), color(0))],
    range: [0, 100],
    ...thresholds(params, NGUONG),
  }),
})

const CMF = builtin({
  id: "cmf",
  name: "Chaikin Money Flow",
  kind: "pane",
  flashback: true,
  params: [period("period", "Chu kỳ CMF", 5, 100, 20), numberSpec({ key: "level", label: "Ngưỡng CMF", min: -1, max: 1, step: 0.01, default: 0 })],
  options: { tailMemory: (p) => num(p, "period") - 1 },
  build: ({ columns, params, color }) => ({
    kind: "pane",
    series: [line("cmf", `CMF ${num(params, "period")}`, cmf(columns, num(params, "period")), color(0))],
    zero: true,
    levels: [{ key: "level", value: num(params, "level"), label: "Ngưỡng" }],
  }),
})

// ---------------------------------------------------------------- 7 chỉ báo bổ sung (chỉ ở market)

const ATR = builtin({
  id: "atr",
  name: "ATR",
  kind: "pane",
  flashback: false,
  params: [period("period", "Chu kỳ ATR", 1, 200, 14)],
  build: ({ bars, params, color }) => ({ kind: "pane", series: [line("atr", `ATR ${num(params, "period")}`, atr(bars, num(params, "period")), color(0))] }),
})

const ATR_PERCENT = builtin({
  id: "atr_percent",
  name: "ATR %",
  kind: "pane",
  flashback: false,
  params: [period("period", "Chu kỳ ATR", 1, 200, 14)],
  build: ({ bars, params, color }) => ({ kind: "pane", series: [line("atr_percent", `ATR% ${num(params, "period")}`, atrPercent(bars, num(params, "period")), color(0))] }),
})

const ADX = builtin({
  id: "adx",
  name: "ADX",
  kind: "pane",
  flashback: false,
  params: [period("period", "Chu kỳ ADX", 2, 100, 14)],
  build: ({ bars, params, color }) => ({ kind: "pane", series: [line("adx", `ADX ${num(params, "period")}`, adx(bars, num(params, "period")).adx, color(0))] }),
})

const KELTNER = builtin({
  id: "keltner",
  name: "Keltner Channel",
  kind: "over",
  flashback: false,
  params: [period("ema", "Chu kỳ EMA", 1, 200, 20), period("atr", "Chu kỳ ATR", 1, 200, 10), numberSpec({ key: "k", label: "Hệ số dải", min: 0.1, max: 10, step: 0.1, default: 2 })],
  build: ({ bars, params, color }) => {
    const channel = keltner(bars, num(params, "ema"), num(params, "atr"), num(params, "k"))
    return {
      kind: "over",
      series: [line("upper", "KC trên", channel.upper, color(1)), line("lower", "KC dưới", channel.lower, color(1)), line("middle", "KC giữa", channel.middle, color(0))],
    }
  },
})

const BB_WIDTH = builtin({
  id: "bb_width",
  name: "BB Width",
  kind: "pane",
  flashback: false,
  params: [period("period", "Chu kỳ Bollinger", 2, 200, 20), numberSpec({ key: "k", label: "Hệ số dải", min: 0.1, max: 5, step: 0.1, default: 2 })],
  options: { tailMemory: (p) => num(p, "period") - 1 },
  build: ({ columns, params, color }) => ({
    kind: "pane",
    series: [line("bb_width", "BB Width %", bbWidth(columns.close, num(params, "period"), num(params, "k")), color(0))],
  }),
})

const PSAR = builtin({
  id: "psar",
  name: "Parabolic SAR",
  kind: "over",
  flashback: false,
  params: [numberSpec({ key: "step", label: "Bước gia tốc", min: 0.01, max: 0.1, step: 0.01, default: 0.02 }), numberSpec({ key: "max", label: "Gia tốc tối đa", min: 0.1, max: 1, step: 0.01, default: 0.2 })],
  options: { validate: (p) => (num(p, "step") < num(p, "max") ? null : "Bước gia tốc phải nhỏ hơn gia tốc tối đa.") },
  build: ({ bars, params, color }) => ({
    kind: "over",
    series: [line("psar", "SAR", parabolicSar(bars, num(params, "step"), num(params, "max")), color(0), { style: "dots" })],
  }),
})

const RELATIVE_VOLUME = builtin({
  id: "relative_volume",
  name: "Relative Volume",
  kind: "pane",
  flashback: false,
  params: [period("lookback", "Số phiên tham chiếu", 2, 200, 20)],
  options: { tailMemory: (p) => num(p, "lookback") },
  build: ({ columns, params, color }) => ({
    kind: "pane",
    series: [line("rvol", "RVOL", relativeVolume(columns.volume, num(params, "lookback")), color(0))],
    levels: [{ key: "one", value: 1, label: "1,0" }],
  }),
})

/** Thứ tự theo bảng ở §9: ô khối lượng, trên ô giá, ô riêng, rồi các chỉ báo bổ sung. */
export const BUILTIN_FORMULAS: readonly Builtin[] = [
  VOLUME,
  MA,
  BOLLINGER,
  EMA,
  MA_CROSS,
  DONCHIAN,
  RSI,
  MACD,
  DMI,
  STOCHASTIC,
  CCI,
  ROC,
  WILLIAMS_R,
  OBV,
  MFI,
  CMF,
  ATR,
  ATR_PERCENT,
  ADX,
  KELTNER,
  BB_WIDTH,
  PSAR,
  RELATIVE_VOLUME,
]

/** Đăng ký các chỉ báo có sẵn; gọi lại là không làm gì (an toàn khi HMR nạp lại module). */
export function registerBuiltinFormulas(): void {
  for (const { definition, options } of BUILTIN_FORMULAS) {
    if (!getIndicator(definition.id)) registerIndicator(definition, options)
  }
}
