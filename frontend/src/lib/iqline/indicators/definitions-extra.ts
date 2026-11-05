/**
 * 16 chỉ báo đợt 2 (docs/iqline-design.md §9), tất cả `flashback: false`: chỉ có ở `market`. Công thức ở `series-extra.ts`, viết từ định
 * nghĩa công khai và chưa đối chiếu với nguồn ngoài. Cách bọc, kiểm tra tham số và luật màu giống `definitions.ts`: mỗi chuỗi lấy
 * `palette[vị trí]`, trừ những chỗ có nghĩa cố định (tăng/giảm dùng `price-up`/`price-down`: mây Ichimoku, SuperTrend, Aroon,
 * Awesome Oscillator).
 */
import type { ColorToken, IndicatorParamSpec, IndicatorParams, IndicatorSeries } from "../types"
import { builtin, fastBelowSlow, levelSpecs, line as plainLine, lowerBelowUpper, num, numberSpec, period, thresholds, NGUONG, type Builtin } from "./definitions"
import {
  accumulationDistribution,
  aroon,
  awesomeOscillator,
  envelope,
  hma,
  hmaRoot,
  ichimoku,
  momentum,
  pivotPoints,
  SOURCE_LABELS,
  SOURCES,
  sourceValues,
  standardDeviation,
  superTrend,
  trix,
  ultimateOscillator,
  volatilityOhlc,
  vwap,
  vwma,
  wma,
} from "./series-extra"
import { autoPivotUnit, autoVwapUnit, PERIOD_UNITS, resolveUnit } from "./periods"
import { getIndicator, registerIndicator } from "./registry"

const sourceSpec = (): IndicatorParamSpec => ({ key: "source", label: "Nguồn giá", default: "close", options: SOURCES, optionLabels: SOURCE_LABELS })

const UNIT_LABELS = { day: "Theo ngày", week: "Theo tuần", month: "Theo tháng", year: "Theo năm" } as const
const unitSpec = (key: string, label: string): IndicatorParamSpec => ({
  key,
  label,
  default: "auto",
  options: ["auto", ...PERIOD_UNITS],
  optionLabels: { auto: "Tự động theo khung", ...UNIT_LABELS },
})

/** Chuỗi chỉ gồm số hữu hạn hoặc `null`: dữ liệu nến bẩn (Infinity, NaN) không bao giờ lọt ra đường vẽ. */
const clean = (values: readonly (number | null)[]): (number | null)[] => values.map((value) => (value !== null && Number.isFinite(value) ? value : null))

function line(key: string, label: string, values: readonly (number | null)[], color: ColorToken, extra: Partial<IndicatorSeries> = {}): IndicatorSeries {
  return plainLine(key, label, clean(values), color, extra)
}

const UNIT_NOUN = { day: "phiên", week: "tuần", month: "tháng", year: "năm" } as const

const text = (params: IndicatorParams, key: string): string => {
  const value = params[key]
  return typeof value === "string" ? value : ""
}

// ---------------------------------------------------------------- trên ô giá

const ICHIMOKU = builtin({
  id: "ichimoku",
  name: "Ichimoku Cloud",
  kind: "over",
  flashback: false,
  params: [period("conversion", "Chu kỳ Tenkan-sen", 1, 200, 9), period("base", "Chu kỳ Kijun-sen", 1, 200, 26), period("spanB", "Chu kỳ Senkou Span B", 1, 400, 52), period("displacement", "Số nến dời Senkou và Chikou", 1, 100, 26)],
  options: { tailMemory: (p) => Math.max(num(p, "conversion"), num(p, "base"), num(p, "spanB")) - 1 },
  build: ({ columns, params, color }) => {
    const lines = ichimoku(columns, num(params, "conversion"), num(params, "base"), num(params, "spanB"))
    const shift = num(params, "displacement")
    return {
      kind: "over",
      series: [
        line("tenkan", "Tenkan-sen", lines.tenkan, color(0)),
        line("kijun", "Kijun-sen", lines.kijun, color(1)),
        // Đường Senkou dùng màu của bảng (mảnh, đứt nét); màu tăng giảm chỉ dành cho phần mây, tô theo Senkou A so với B.
        line("senkou_a", "Senkou Span A", lines.senkouA, color(3), { offset: shift, style: "dash", width: 1 }),
        line("senkou_b", "Senkou Span B", lines.senkouB, color(4), { offset: shift, style: "dash", width: 1 }),
        line("chikou", "Chikou Span", lines.chikou, color(2), { offset: -shift }),
      ],
      cloud: { a: "senkou_a", b: "senkou_b", upToken: "price-up", downToken: "price-down" },
    }
  },
})

const VWAP = builtin({
  id: "vwap",
  name: "VWAP",
  kind: "over",
  flashback: false,
  params: [unitSpec("anchor", "Đặt lại theo")],
  options: { needsTime: true },
  build: ({ columns, params, color, context }) => {
    const unit = resolveUnit(text(params, "anchor"), autoVwapUnit(context!.interval))
    // Nhãn nói rõ kỳ đặt lại: ở khung ngày trở lên "theo phiên" không có nghĩa, kỳ dài hơn (xem `autoVwapUnit`).
    return { kind: "over", series: [line("vwap", `VWAP theo ${UNIT_NOUN[unit]}`, vwap(columns, context!.times, unit), color(0))] }
  },
})

const SUPERTREND = builtin({
  id: "supertrend",
  name: "SuperTrend",
  kind: "over",
  flashback: false,
  params: [period("period", "Chu kỳ ATR", 1, 200, 10), numberSpec({ key: "multiplier", label: "Hệ số ATR", min: 0.5, max: 10, step: 0.1, default: 3 })],
  build: ({ bars, params }) => {
    const lines = superTrend(bars, num(params, "period"), num(params, "multiplier"))
    return { kind: "over", series: [line("up", "SuperTrend tăng", lines.up, "price-up"), line("down", "SuperTrend giảm", lines.down, "price-down")] }
  },
})

const WMA = builtin({
  id: "wma",
  name: "WMA",
  kind: "over",
  flashback: false,
  params: [period("period", "Chu kỳ WMA", 2, 200, 9), sourceSpec()],
  options: { tailMemory: (p) => num(p, "period") - 1 },
  build: ({ columns, params, color }) => ({
    kind: "over",
    series: [line("wma", `WMA ${num(params, "period")}`, wma(sourceValues(columns, text(params, "source")), num(params, "period")), color(0))],
  }),
})

const HMA = builtin({
  id: "hma",
  name: "HMA",
  kind: "over",
  flashback: false,
  params: [period("period", "Chu kỳ HMA", 2, 200, 9), sourceSpec()],
  options: { tailMemory: (p) => num(p, "period") + hmaRoot(num(p, "period")) - 2 },
  build: ({ columns, params, color }) => ({
    kind: "over",
    series: [line("hma", `HMA ${num(params, "period")}`, hma(sourceValues(columns, text(params, "source")), num(params, "period")), color(0))],
  }),
})

const VWMA = builtin({
  id: "vwma",
  name: "VWMA",
  kind: "over",
  flashback: false,
  params: [period("period", "Chu kỳ VWMA", 2, 200, 20), sourceSpec()],
  options: { tailMemory: (p) => num(p, "period") - 1 },
  build: ({ columns, params, color }) => ({
    kind: "over",
    series: [line("vwma", `VWMA ${num(params, "period")}`, vwma(sourceValues(columns, text(params, "source")), columns.volume, num(params, "period")), color(0))],
  }),
})

const ENVELOPE = builtin({
  id: "envelope",
  name: "Envelope",
  kind: "over",
  flashback: false,
  params: [
    period("period", "Chu kỳ đường giữa", 2, 200, 20),
    numberSpec({ key: "percent", label: "Độ lệch (%)", min: 0.1, max: 50, step: 0.1, default: 10 }),
    { key: "basis", label: "Loại đường giữa", default: "sma", options: ["sma", "ema"], optionLabels: { sma: "SMA", ema: "EMA" } },
    sourceSpec(),
  ],
  // SMA là cửa sổ hữu hạn; EMA đệ quy nên tính lại cả chuỗi.
  options: { tailMemory: (p) => (p.basis === "ema" ? null : num(p, "period") - 1) },
  build: ({ columns, params, color }) => {
    const bands = envelope(sourceValues(columns, text(params, "source")), num(params, "period"), num(params, "percent"), text(params, "basis"))
    return {
      kind: "over",
      series: [line("upper", "Envelope trên", bands.upper, color(1)), line("lower", "Envelope dưới", bands.lower, color(1)), line("middle", "Envelope giữa", bands.middle, color(0))],
    }
  },
})

const PIVOT_POINTS = builtin({
  id: "pivot_points",
  name: "Pivot Points",
  kind: "over",
  flashback: false,
  params: [unitSpec("timeframe", "Kỳ tính")],
  options: { needsTime: true },
  build: ({ columns, params, color, context }) => {
    const unit = resolveUnit(text(params, "timeframe"), autoPivotUnit(context!.interval))
    const levels = pivotPoints(columns, context!.times, unit)
    const step = { style: "step" } as const
    return {
      kind: "over",
      series: [
        line("r3", "R3", levels.r3, color(1), step),
        line("r2", "R2", levels.r2, color(1), step),
        line("r1", "R1", levels.r1, color(1), step),
        line("pp", "Pivot", levels.pp, color(0), step),
        line("s1", "S1", levels.s1, color(2), step),
        line("s2", "S2", levels.s2, color(2), step),
        line("s3", "S3", levels.s3, color(2), step),
      ],
    }
  },
})

// ---------------------------------------------------------------- ô riêng

const AROON = builtin({
  id: "aroon",
  name: "Aroon",
  kind: "pane",
  flashback: false,
  params: [period("period", "Chu kỳ Aroon", 2, 200, 25)],
  options: { tailMemory: (p) => num(p, "period") },
  build: ({ columns, params }) => {
    const lines = aroon(columns, num(params, "period"))
    return { kind: "pane", series: [line("up", "Aroon Up", lines.up, "price-up"), line("down", "Aroon Down", lines.down, "price-down")], range: [0, 100] }
  },
})

const TRIX = builtin({
  id: "trix",
  name: "TRIX",
  kind: "pane",
  flashback: false,
  params: [period("period", "Chu kỳ EMA", 1, 200, 18), sourceSpec()],
  build: ({ columns, params, color }) => ({
    kind: "pane",
    series: [line("trix", `TRIX ${num(params, "period")}`, trix(sourceValues(columns, text(params, "source")), num(params, "period")), color(0))],
    zero: true,
  }),
})

const ULTIMATE_OSCILLATOR = builtin({
  id: "ultimate_oscillator",
  name: "Ultimate Oscillator",
  kind: "pane",
  flashback: false,
  params: [period("short", "Chu kỳ ngắn", 1, 100, 7), period("mid", "Chu kỳ vừa", 2, 200, 14), period("long", "Chu kỳ dài", 3, 400, 28), ...levelSpecs("Ngưỡng dưới", "Ngưỡng trên", 0, 100, 1, 30, 70)],
  options: {
    validate: (p) => {
      if (!(num(p, "short") < num(p, "mid") && num(p, "mid") < num(p, "long"))) return "Chu kỳ ngắn phải nhỏ hơn chu kỳ vừa, và chu kỳ vừa phải nhỏ hơn chu kỳ dài."
      return lowerBelowUpper(p)
    },
    tailMemory: (p) => num(p, "long"),
  },
  build: ({ columns, params, color }) => ({
    kind: "pane",
    series: [line("uo", "UO", ultimateOscillator(columns, num(params, "short"), num(params, "mid"), num(params, "long")), color(0))],
    range: [0, 100],
    ...thresholds(params, NGUONG),
  }),
})

const AWESOME_OSCILLATOR = builtin({
  id: "awesome_oscillator",
  name: "Awesome Oscillator",
  kind: "pane",
  flashback: false,
  params: [period("fast", "Chu kỳ nhanh", 1, 100, 5), period("slow", "Chu kỳ chậm", 2, 200, 34)],
  options: { validate: fastBelowSlow("fast", "slow", "Chu kỳ nhanh", "Chu kỳ chậm"), tailMemory: (p) => num(p, "slow") - 1 },
  // Chỉ có histogram (cột trên 0 là price-up, dưới 0 là price-down); không có đường nào để đọc riêng.
  build: ({ columns, params }) => ({
    kind: "pane",
    series: [],
    histogram: { values: clean(awesomeOscillator(columns, num(params, "fast"), num(params, "slow"))), upToken: "price-up", downToken: "price-down" },
    zero: true,
  }),
})

const MOMENTUM = builtin({
  id: "momentum",
  name: "Momentum",
  kind: "pane",
  flashback: false,
  params: [period("period", "Chu kỳ Momentum", 1, 252, 10), sourceSpec()],
  options: { tailMemory: (p) => num(p, "period") },
  build: ({ columns, params, color }) => ({
    kind: "pane",
    series: [line("momentum", `Mom ${num(params, "period")}`, momentum(sourceValues(columns, text(params, "source")), num(params, "period")), color(0))],
    zero: true,
  }),
})

const STD_DEV = builtin({
  id: "std_dev",
  name: "Standard Deviation",
  kind: "pane",
  flashback: false,
  params: [period("period", "Chu kỳ", 2, 200, 20), sourceSpec()],
  options: { tailMemory: (p) => num(p, "period") - 1 },
  build: ({ columns, params, color }) => ({
    kind: "pane",
    series: [line("std_dev", `StdDev ${num(params, "period")}`, standardDeviation(sourceValues(columns, text(params, "source")), num(params, "period")), color(0))],
  }),
})

const ACCUM_DIST = builtin({
  id: "accum_dist",
  name: "Accumulation/Distribution",
  kind: "pane",
  flashback: false,
  params: [],
  build: ({ columns, color }) => ({ kind: "pane", series: [line("ad", "A/D", accumulationDistribution(columns), color(0))] }),
})

const VOLATILITY_OHLC = builtin({
  id: "volatility_ohlc",
  name: "Volatility O-H-L-C",
  kind: "pane",
  flashback: false,
  params: [period("period", "Chu kỳ", 1, 252, 10), period("periodsPerYear", "Số nến mỗi năm (1 là không quy năm)", 1, 366, 252)],
  options: { tailMemory: (p) => num(p, "period") - 1 },
  build: ({ bars, params, color }) => ({
    kind: "pane",
    series: [line("volatility", "Biến động %", volatilityOhlc(bars, num(params, "period"), num(params, "periodsPerYear")), color(0))],
  }),
})

/** Thứ tự theo bảng ở §9: trên ô giá, rồi ô riêng. */
export const EXTRA_FORMULAS: readonly Builtin[] = [
  ICHIMOKU,
  VWAP,
  SUPERTREND,
  WMA,
  HMA,
  VWMA,
  ENVELOPE,
  PIVOT_POINTS,
  AROON,
  TRIX,
  ULTIMATE_OSCILLATOR,
  AWESOME_OSCILLATOR,
  MOMENTUM,
  STD_DEV,
  ACCUM_DIST,
  VOLATILITY_OHLC,
]

/** Đăng ký 16 chỉ báo đợt 2; gọi lại là không làm gì. Gọi sau `registerBuiltinFormulas` và trước Volume Profile (thứ tự §9). */
export function registerExtraFormulas(): void {
  for (const { definition, options } of EXTRA_FORMULAS) {
    if (!getIndicator(definition.id)) registerIndicator(definition, options)
  }
}
