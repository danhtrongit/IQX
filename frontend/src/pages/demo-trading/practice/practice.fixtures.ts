/**
 * Deterministic mock payloads of the practice API for tests. Contains no symbol, company or
 * calendar date (the real payloads do not either).
 *
 * The forms are built from the REAL registry of the server (`technical-registry.json`): the 15
 * row-based indicators embed their SPEC V3 rows (sentence, fields, ranges, defaults) exactly as
 * `practiceForm()` serves them, and Volume keeps its params form. Charts follow the server's
 * per-row line keys (`<row id>.<line>`, one line drawn once even when two rows need it); the
 * numbers behind the lines are plausible but not the server's (the backend tests pin those).
 * Configs, evidence and charts of a run locked before SPEC V3 (`params` + `ops`, rule ids `r1`,
 * `r2`, plain line keys) are kept as they were, because such runs stay viewable.
 */
import { rowSentence } from "@/pages/demo-trading/bot/config/labels"
import type {
  PracticeChart,
  PracticeConfig,
  PracticeEvent,
  PracticeEvidence,
  PracticeForm,
  PracticeHistory,
  PracticeOperand,
  PracticeParamsConfig,
  PracticeParamsForm,
  PracticePlot,
  PracticeRowConfig,
  PracticeRowsConfig,
  PracticeRowsForm,
  PracticeRuleEvidence,
  PracticeRun,
  PracticeState,
  PracticeTrade,
  Side,
} from "./practice-api"

export const CASE_ID = "00000000-0000-4000-8000-0000000000c1"
export const RUN_ID = "00000000-0000-4000-8000-0000000000a1"
/** A run locked before SPEC V3 that never finished. */
export const OUTDATED_RUN_ID = "00000000-0000-4000-8000-0000000000b1"
export const OUTDATED_RUN_ERROR = {
  code: "PRACTICE_CONFIG_OUTDATED",
  message: "Lượt này đã khóa theo định dạng điều kiện cũ nên không thể tính tiếp. Bắt đầu lại tình huống này với mẫu điều kiện mới.",
}

function rng(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Bars = { open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }

export function makeBars(count: number, seed = 7): Bars {
  const random = rng(seed)
  const bars: Bars = { open: [], high: [], low: [], close: [], volume: [] }
  let previous = 32000
  for (let i = 0; i < count; i += 1) {
    const target = 32000 + Math.sin(i / 17) * 5200 + Math.sin(i / 61) * 3800
    const open = Math.round((previous + (random() - 0.5) * 300) / 100) * 100
    const close = Math.round((open + (target - open) * 0.12 + (random() - 0.5) * 900) / 100) * 100
    const high = Math.round((Math.max(open, close) + random() * 400) / 100) * 100
    const low = Math.round((Math.min(open, close) - random() * 400) / 100) * 100
    bars.open.push(open)
    bars.high.push(high)
    bars.low.push(low)
    bars.close.push(close)
    bars.volume.push(Math.round(900000 + random() * 1600000 + (i % 40 === 0 ? 2400000 : 0)))
    previous = close
  }
  return bars
}

// ---------------------------------------------------------------- the real registry and the forms

type RegistryRow = PracticeRowsForm["rows"][number]
type RegistryRule = { id: string; kind: "compare"; op: ">" | "<"; allowed_ops: Array<">" | "<">; lhs: PracticeOperand; rhs: PracticeOperand }
type RegistrySide = { params: Record<string, number>; rules: RegistryRule[] }
type RegistryEntry =
  | { id: string; name: string; model: "rows"; rows: RegistryRow[] }
  | {
      id: string
      name: string
      model: "legacy_params"
      fields: Array<{ key: string; label: string; type: "integer" | "number"; min: number; max: number; step: number; unit: string }>
      buy: RegistrySide
      sell: RegistrySide
    }

const REGISTRY = Object.values(
  import.meta.glob("../../../../../backend/src/modules/quant/v2/registry/technical-registry.json", { eager: true, import: "default" }),
)[0] as RegistryEntry[]

function registryEntry(indicatorId: string): RegistryEntry {
  const entry = REGISTRY.find((item) => item.id === indicatorId)
  if (!entry) throw new Error(`no registry entry ${indicatorId}`)
  return entry
}

export const indicatorName = (indicatorId: string): string => registryEntry(indicatorId).name

/** Ids of the 15 row-based indicators in registry order. */
export const ROWS_INDICATORS: readonly string[] = REGISTRY.filter((entry) => entry.model === "rows").map((entry) => entry.id)

/** The registry rows of a row-based indicator (what `GET .../state` embeds as `form.rows`). */
export function registryRows(indicatorId: string): RegistryRow[] {
  const entry = registryEntry(indicatorId)
  if (entry.model !== "rows") throw new Error(`${indicatorId} has no condition rows`)
  return entry.rows
}

export const HOLD_DEFAULT_SESSIONS = 60

/** Form descriptor of a row-based indicator, with the V3 defaults (both tabs ON, hold 60). */
export function rowsForm(indicatorId: string): PracticeRowsForm {
  const rows = registryRows(indicatorId)
  const side = (name: Side): PracticeRowsConfig["buy"] => ({
    enabled: true,
    rules: rows.map((row) => ({ id: row.id, enabled: row.default_enabled, ...row[name] })),
  })
  return {
    model: "rows",
    indicator_id: indicatorId,
    rows: structuredClone(rows),
    defaults: { buy: side("buy"), sell: side("sell"), hold_max_sessions: HOLD_DEFAULT_SESSIONS },
  }
}

const volumeOperand = (operand: PracticeOperand, params: Record<string, number>): string => {
  if (operand.kind !== "series") return "—"
  const names: Record<string, string> = {
    close: "Giá đóng cửa",
    volume: "Khối lượng",
    threshold: `${params.mult} × TB ${params.lookback} phiên`,
  }
  return `${names[operand.key] ?? operand.key}${operand.offset === -1 ? " phiên trước" : ""}`
}

/** Form descriptor of Volume (SPEC V3 owner decision 4): side-level params and rule operators. */
export function volumeForm(): PracticeParamsForm {
  const entry = registryEntry("volume")
  if (entry.model !== "legacy_params") throw new Error("volume has no params form")
  const side = (name: Side): PracticeParamsForm["buy"] => ({
    fields: entry.fields.map((field) => ({ key: field.key, label: field.label, type: field.type, min: field.min, max: field.max, step: field.step, unit: field.unit })),
    rules: entry[name].rules.map((rule) => ({
      rule_id: rule.id,
      kind: rule.kind,
      default_op: rule.op,
      allowed_ops: [...rule.allowed_ops],
      left_label: volumeOperand(rule.lhs, entry[name].params),
      right_label: volumeOperand(rule.rhs, entry[name].params),
      lhs: rule.lhs,
      rhs: rule.rhs,
    })),
  })
  const defaults = (name: Side): PracticeParamsConfig["buy"] => ({
    enabled: true,
    params: { ...entry[name].params },
    ops: Object.fromEntries(entry[name].rules.map((rule) => [rule.id, rule.op])),
  })
  return {
    model: "legacy_params",
    indicator_id: "volume",
    buy: side("buy"),
    sell: side("sell"),
    cross_fields: [],
    defaults: { buy: defaults("buy"), sell: defaults("sell"), hold_max_sessions: HOLD_DEFAULT_SESSIONS },
  }
}

export const formFor = (indicatorId: string): PracticeForm => (registryEntry(indicatorId).model === "rows" ? rowsForm(indicatorId) : volumeForm())

/** The registry defaults as the draft of a new case. */
export const defaultConfig = (indicatorId: string): PracticeConfig => structuredClone(formFor(indicatorId).defaults)

/** The V3 defaults of a row-based indicator, optionally changed in place before they are returned. */
export function rowsConfig(indicatorId: string, edit?: (config: PracticeRowsConfig) => void): PracticeRowsConfig {
  const config = rowsForm(indicatorId).defaults
  edit?.(config)
  return config
}

/** Volume's defaults, optionally changed in place. */
export function volumeConfig(edit?: (config: PracticeParamsConfig) => void): PracticeParamsConfig {
  const config = volumeForm().defaults
  edit?.(config)
  return config
}

/** The RSI config of a run locked before SPEC V3: one set of params per side and rule operators `r1`, `r2`. */
export function legacyRsiConfig(): PracticeParamsConfig {
  return {
    buy: { enabled: true, params: { period: 14, level: 30 }, ops: { r1: "<", r2: ">" } },
    sell: { enabled: true, params: { period: 14, level: 70 }, ops: { r1: ">", r2: "<" } },
    hold_max_sessions: HOLD_DEFAULT_SESSIONS,
  }
}

// ---------------------------------------------------------------- series

type Column = Array<number | null>

const sma = (values: number[], period: number): Column =>
  values.map((_, i) => (i + 1 < period ? null : values.slice(i + 1 - period, i + 1).reduce((a, b) => a + b, 0) / period))

function ema(values: Column, period: number): Column {
  const out: Column = values.map(() => null)
  const k = 2 / (period + 1)
  let previous: number | null = null
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]
    if (value === null || value === undefined) continue
    previous = previous === null ? value : value * k + previous * (1 - k)
    out[i] = i + 1 >= period ? previous : null
  }
  return out
}

function rsi(close: number[], period: number): Column {
  const out: Column = close.map(() => null)
  let gain = 0
  let loss = 0
  for (let i = 1; i < close.length; i += 1) {
    const change = close[i] - close[i - 1]
    const up = Math.max(0, change)
    const down = Math.max(0, -change)
    if (i <= period) {
      gain += up / period
      loss += down / period
    } else {
      gain = (gain * (period - 1) + up) / period
      loss = (loss * (period - 1) + down) / period
    }
    if (i >= period) out[i] = gain + loss === 0 ? null : (100 * gain) / (gain + loss)
  }
  return out
}

function macd(close: number[], fast: number, slow: number, signal: number): Record<string, Column> {
  const fastLine = ema(close, fast)
  const slowLine = ema(close, slow)
  const value: Column = fastLine.map((item, i) => (item === null || slowLine[i] === null ? null : item - (slowLine[i] as number)))
  const signalLine = ema(value, signal)
  return { value, signal: signalLine, histogram: value.map((item, i) => (item === null || signalLine[i] === null ? null : item - (signalLine[i] as number))) }
}

function stochastic(bars: Bars, k: number, smooth: number, d: number): Record<string, Column> {
  const raw: Column = bars.close.map((close, i) => {
    if (i + 1 < k) return null
    const hi = Math.max(...bars.high.slice(i + 1 - k, i + 1))
    const lo = Math.min(...bars.low.slice(i + 1 - k, i + 1))
    return hi === lo ? null : (100 * (close - lo)) / (hi - lo)
  })
  const average = (column: Column, period: number): Column =>
    column.map((_, i) => {
      const slice = column.slice(i + 1 - period, i + 1)
      return i + 1 < period || slice.some((item) => item === null) ? null : (slice as number[]).reduce((a, b) => a + b, 0) / period
    })
  const percentK = average(raw, smooth)
  return { value: percentK, signal: average(percentK, d) }
}

function bollinger(close: number[], period: number, k: number): Record<string, Column> {
  const middle = sma(close, period)
  const spread = close.map((_, i) => {
    const mean = middle[i]
    if (mean === null) return null
    const window = close.slice(i + 1 - period, i + 1)
    return k * Math.sqrt(window.reduce((a, b) => a + (b - mean) ** 2, 0) / period)
  })
  return {
    upper: middle.map((m, i) => (m === null || spread[i] === null ? null : m + (spread[i] as number))),
    middle,
    lower: middle.map((m, i) => (m === null || spread[i] === null ? null : m - (spread[i] as number))),
  }
}

function donchian(bars: Bars, period: number): Record<string, Column> {
  const band = (values: number[], pick: (...numbers: number[]) => number): Column =>
    values.map((_, i) => (i < period ? null : pick(...values.slice(i - period, i))))
  return { upper: band(bars.high, Math.max), lower: band(bars.low, Math.min) }
}

/** Indicators whose real maths is not needed here: a smooth wave in a plausible range, stable per series name. */
const SYNTHETIC: Record<string, [center: number, amplitude: number]> = {
  cci: [0, 120],
  mfi: [50, 35],
  roc: [0, 8],
  williams_r: [-50, 40],
  cmf: [0, 0.25],
  dmi: [25, 12],
  obv: [5_000_000, 3_000_000],
}

function synthetic(count: number, calc: string, series: string): Column {
  const [center, amplitude] = SYNTHETIC[calc] ?? [0, 1]
  const phase = [...series].reduce((sum, char) => sum + char.charCodeAt(0), 0) / 7
  return Array.from({ length: count }, (_, i) => (i < 20 ? null : center + Math.sin(i / 9 + phase) * amplitude))
}

const round6 = (column: Column): Column => column.map((value) => (value === null ? null : Math.round(value * 1e6) / 1e6))

type PlotColumn = { key: string; calc: string; params: Record<string, number>; series: string }

function columnOf(bars: Bars, item: PlotColumn): Column {
  const { calc, params, series } = item
  switch (calc) {
    case "ma":
      return sma(bars.close, params.period)
    case "ema":
      return ema(bars.close, params.period)
    case "ma_cross":
      return sma(bars.close, params[series])
    case "rsi":
      return rsi(bars.close, params.period)
    case "macd":
      return macd(bars.close, params.fast, params.slow, params.signal)[series] ?? []
    case "stochastic":
      return stochastic(bars, params.k, params.smooth, params.d)[series] ?? []
    case "bollinger":
      return bollinger(bars.close, params.period, params.k)[series] ?? []
    case "donchian":
      return donchian(bars, params.period)[series] ?? []
    default:
      return synthetic(bars.close.length, calc, series)
  }
}

// ---------------------------------------------------------------- plots (a port of the server's practice.chart.ts)

type RowLine = { id: string; name: string; label: string; calc: string; params: Record<string, number>; series: string }
type RowDraw = { lines: RowLine[]; histogram?: RowLine; thresholds?: number[] }

const fmt = (value: number | undefined): string => (value === undefined || !Number.isFinite(value) ? "?" : String(Math.round(value * 100) / 100))
const rowLine = (id: string, name: string, label: string, calc: string, params: Record<string, number>, series: string): RowLine => ({ id, name, label, calc, params, series })

/** Lines (and level) a condition row needs on the chart, from the row's own values. */
function rowDraw(row: PracticeRowConfig): RowDraw {
  const n = (key: string): number => {
    const value = row[key]
    return typeof value === "number" ? value : Number.NaN
  }
  const period = n("period")
  const level = [n("threshold")]
  switch (row.id) {
    case "ma.price_cross":
    case "ma.trend":
      return { lines: [rowLine(`ma.${period}`, "value", `SMA ${fmt(period)}`, "ma", { period }, "value")] }
    case "ma.ma_cross":
      return {
        lines: [
          rowLine(`ma.${n("fast")}`, "fast", `SMA ${fmt(n("fast"))}`, "ma", { period: n("fast") }, "value"),
          rowLine(`ma.${n("slow")}`, "slow", `SMA ${fmt(n("slow"))}`, "ma", { period: n("slow") }, "value"),
        ],
      }
    case "ema.price_cross":
    case "ema.trend":
      return { lines: [rowLine(`ema.${period}`, "value", `EMA ${fmt(period)}`, "ema", { period }, "value")] }
    case "ema.ma_cross":
      return {
        lines: [
          rowLine(`ema.${n("fast")}`, "fast", `EMA ${fmt(n("fast"))}`, "ema", { period: n("fast") }, "value"),
          rowLine(`ema.${n("slow")}`, "slow", `EMA ${fmt(n("slow"))}`, "ema", { period: n("slow") }, "value"),
        ],
      }
    case "ma_cross.cross": {
      const params = { fast: n("fast"), slow: n("slow") }
      return {
        lines: [
          rowLine(`ma.${n("fast")}`, "fast", `SMA ${fmt(n("fast"))}`, "ma_cross", params, "fast"),
          rowLine(`ma.${n("slow")}`, "slow", `SMA ${fmt(n("slow"))}`, "ma_cross", params, "slow"),
        ],
      }
    }
    case "rsi.level":
      return { lines: [rowLine(`rsi.${period}`, "value", `RSI ${fmt(period)}`, "rsi", { period }, "value")], thresholds: level }
    case "rsi.trend":
      return { lines: [rowLine(`rsi.${period}`, "value", `RSI ${fmt(period)}`, "rsi", { period }, "value")] }
    case "macd.signal": {
      const params = { fast: n("fast"), slow: n("slow"), signal: n("signal") }
      return {
        lines: [
          rowLine(`macd.${params.fast}.${params.slow}`, "value", `MACD ${fmt(params.fast)}/${fmt(params.slow)}`, "macd", params, "value"),
          rowLine(`macd.signal.${params.fast}.${params.slow}.${params.signal}`, "signal", `Signal ${fmt(params.signal)}`, "macd", params, "signal"),
        ],
      }
    }
    case "macd.zero": {
      const params = { fast: n("fast"), slow: n("slow"), signal: 9 }
      return { lines: [rowLine(`macd.${params.fast}.${params.slow}`, "value", `MACD ${fmt(params.fast)}/${fmt(params.slow)}`, "macd", params, "value")] }
    }
    case "macd.hist": {
      const params = { fast: n("fast"), slow: n("slow"), signal: n("signal") }
      return {
        lines: [],
        histogram: rowLine(
          `macd.hist.${params.fast}.${params.slow}.${params.signal}`,
          "histogram",
          `Histogram ${fmt(params.fast)}/${fmt(params.slow)}/${fmt(params.signal)}`,
          "macd",
          params,
          "histogram",
        ),
      }
    }
    case "stochastic.level": {
      const params = { k: n("k"), smooth: n("smooth"), d: 3 }
      return {
        lines: [rowLine(`stochastic.k.${params.k}.${params.smooth}`, "value", `%K ${fmt(params.k)}/${fmt(params.smooth)}`, "stochastic", params, "value")],
        thresholds: level,
      }
    }
    case "stochastic.kd_cross": {
      const params = { k: n("k"), smooth: n("smooth"), d: n("d") }
      return {
        lines: [
          rowLine(`stochastic.k.${params.k}.${params.smooth}`, "value", `%K ${fmt(params.k)}/${fmt(params.smooth)}`, "stochastic", params, "value"),
          rowLine(`stochastic.d.${params.k}.${params.smooth}.${params.d}`, "signal", `%D ${fmt(params.d)}`, "stochastic", params, "signal"),
        ],
      }
    }
    case "cci.cross":
      return { lines: [rowLine(`cci.${period}`, "value", `CCI ${fmt(period)}`, "cci", { period }, "value")], thresholds: level }
    case "mfi.cross":
      return { lines: [rowLine(`mfi.${period}`, "value", `MFI ${fmt(period)}`, "mfi", { period }, "value")], thresholds: level }
    case "roc.cross":
      return { lines: [rowLine(`roc.${period}`, "value", `ROC ${fmt(period)} (%)`, "roc", { period }, "value")], thresholds: level }
    case "williams_r.cross":
      return { lines: [rowLine(`williams_r.${period}`, "value", `Williams %R ${fmt(period)}`, "williams_r", { period }, "value")], thresholds: level }
    case "cmf.cross":
      return { lines: [rowLine(`cmf.${period}`, "value", `CMF ${fmt(period)}`, "cmf", { period }, "value")], thresholds: level }
    case "bollinger.price_action": {
      const params = { period, k: n("mult") }
      const id = `bollinger.${period}.${params.k}`
      return {
        lines: [
          rowLine(`${id}.upper`, "upper", "Dải trên", "bollinger", params, "upper"),
          rowLine(`${id}.middle`, "middle", `SMA ${fmt(period)}`, "bollinger", params, "middle"),
          rowLine(`${id}.lower`, "lower", "Dải dưới", "bollinger", params, "lower"),
        ],
      }
    }
    case "donchian.break": {
      const band = row.band === "lower" ? "lower" : "upper"
      return {
        lines: [rowLine(`donchian.${band}.${period}`, band, `${band === "lower" ? "Dải dưới" : "Dải trên"} ${fmt(period)}`, "donchian", { period }, band)],
      }
    }
    case "dmi.di":
      return {
        lines: [
          rowLine(`dmi.plus.${period}`, "plus", `+DI ${fmt(period)}`, "dmi", { period }, "plus"),
          rowLine(`dmi.minus.${period}`, "minus", `−DI ${fmt(period)}`, "dmi", { period }, "minus"),
        ],
      }
    case "dmi.adx":
      return { lines: [rowLine(`dmi.adx.${period}`, "adx", `ADX ${fmt(period)}`, "dmi", { period }, "adx")], thresholds: level }
    case "obv.sma":
      return {
        lines: [
          rowLine("obv.value", "value", "OBV", "obv", { baseline: period }, "value"),
          rowLine(`obv.sma.${period}`, "baseline", `SMA ${fmt(period)} của OBV`, "obv", { baseline: period }, "baseline"),
        ],
      }
    case "obv.breakout": {
      const low = row.action === "break_low"
      return {
        lines: [
          rowLine("obv.value", "value", "OBV", "obv", { baseline: period }, "value"),
          rowLine(`obv.${low ? "lower" : "upper"}.${period}`, low ? "lower" : "upper", `${low ? "Đáy" : "Đỉnh"} ${fmt(period)} phiên`, "obv", { baseline: period, breakout_period: period }, low ? "lower" : "upper"),
        ],
      }
    }
    // bollinger.price_dir (price only) and bollinger.width (a % ratio, not a price) have no line.
    default:
      return { lines: [] }
  }
}

/** Static look of the pane per indicator (not a threshold, not part of the user's rows). */
const LOOK: Record<string, Partial<PracticePlot>> = {
  ma: { overlay: true },
  ema: { overlay: true },
  ma_cross: { overlay: true },
  bollinger: { overlay: true },
  donchian: { overlay: true },
  macd: { zero_line: true },
  dmi: { nonnegative: true },
  stochastic: { bounds: [0, 100], reference_levels: [20, 80] },
  rsi: { bounds: [0, 100], reference_levels: [50] },
  mfi: { bounds: [0, 100], reference_levels: [50] },
  williams_r: { bounds: [-100, 0] },
  cmf: { zero_line: true },
  cci: { zero_line: true },
  roc: { zero_line: true },
  volume: { nonnegative: true },
}

const emptyPlot = (indicatorId: string): PracticePlot => ({
  overlay: false,
  lines: [],
  histogram_key: null,
  volume_key: null,
  zero_line: false,
  nonnegative: false,
  bounds: null,
  threshold_levels: [],
  reference_levels: [],
  ...LOOK[indicatorId],
})

type SideChart = { plot: PracticePlot; series: Record<string, Column> }

/** Lines of the ENABLED rows of one side, keyed `<row id>.<line>`; a line two rows would draw identically is drawn once. */
function rowsSideChart(indicatorId: string, side: PracticeRowsConfig["buy"], bars: Bars): SideChart {
  const plot = emptyPlot(indicatorId)
  const columns: PlotColumn[] = []
  const drawn = new Set<string>()
  const thresholds: number[] = []
  const add = (row: PracticeRowConfig, item: RowLine): string | null => {
    const key = `${row.id}.${item.name}`
    if (drawn.has(item.id)) return null
    drawn.add(item.id)
    columns.push({ key, calc: item.calc, params: item.params, series: item.series })
    return key
  }
  for (const row of side.rules) {
    if (!row.enabled) continue
    const drawing = rowDraw(row)
    const needed = drawing.histogram ? [...drawing.lines, drawing.histogram] : drawing.lines
    if (!needed.every((item) => Object.values(item.params).every((value) => Number.isFinite(value)))) continue
    for (const item of drawing.lines) {
      const key = add(row, item)
      if (key !== null) plot.lines.push({ key, label: item.label })
    }
    if (drawing.histogram && plot.histogram_key === null) plot.histogram_key = add(row, drawing.histogram)
    for (const value of drawing.thresholds ?? []) if (Number.isFinite(value) && !thresholds.includes(value)) thresholds.push(value)
  }
  plot.threshold_levels = thresholds
  return { plot, series: Object.fromEntries(columns.map((column) => [column.key, round6(columnOf(bars, column))])) }
}

/** Volume, and the RSI of a run locked before SPEC V3: plain line keys (`threshold`, `volume`, `value`). */
function paramsSideChart(indicatorId: string, side: PracticeParamsConfig["buy"], bars: Bars): SideChart {
  const plot = emptyPlot(indicatorId)
  if (indicatorId === "volume") {
    const { lookback, mult } = side.params
    plot.lines = [{ key: "threshold", label: `${mult} × TB ${lookback}` }]
    plot.volume_key = "volume"
    const threshold: Column = bars.volume.map((_, i) => (i < lookback ? null : (mult * bars.volume.slice(i - lookback, i).reduce((a, b) => a + b, 0)) / lookback))
    return { plot, series: { threshold: round6(threshold), volume: bars.volume.slice() } }
  }
  plot.lines = [{ key: "value", label: `RSI ${side.params.period}` }]
  plot.threshold_levels = side.params.level === undefined ? [] : [side.params.level]
  return { plot, series: { value: round6(rsi(bars.close, side.params.period)) } }
}

const sideChart = (indicatorId: string, side: PracticeConfig["buy"], bars: Bars): SideChart =>
  "rules" in side ? rowsSideChart(indicatorId, side, bars) : paramsSideChart(indicatorId, side, bars)

/**
 * Chart payload: `observation` bars (sessions -(observation-1)..0) followed by `test` bars
 * (sessions 1..test). With `test = 0` it is the pre-start preview.
 */
export function makeChart(input: { indicatorId?: string; observation?: number; test?: number; config?: PracticeConfig; seed?: number } = {}): PracticeChart {
  const indicatorId = input.indicatorId ?? "rsi"
  const observation = input.observation ?? 125
  const test = input.test ?? 0
  const config = input.config ?? defaultConfig(indicatorId)
  const bars = makeBars(observation + test, input.seed ?? 7)
  const buy = sideChart(indicatorId, config.buy, bars)
  const sell = sideChart(indicatorId, config.sell, bars)
  return {
    first_session: -(observation - 1),
    last_session: test,
    last_observed_session: 0,
    bars,
    series: { buy: buy.series, sell: sell.series },
    plot: { buy: buy.plot, sell: sell.plot },
  }
}

// ---------------------------------------------------------------- state

export function makeState(overrides: Partial<PracticeState> = {}, indicatorId = "rsi"): PracticeState {
  const form = formFor(indicatorId)
  return {
    set_version: "practice-set-test",
    indicator: { id: indicatorId, name: indicatorName(indicatorId) },
    status: "ready",
    ordinal: 1,
    total: 30,
    case: { case_id: CASE_ID, ordinal: 1, window_bars: 130 },
    draft: structuredClone(form.defaults),
    draft_revision: 1,
    validation: { valid: true, errors: [] },
    current_run: null,
    can_start: true,
    can_retry: false,
    can_next: false,
    completed_count: 0,
    runs: [],
    profile: { profile_version: "mini-profile-v1", capital: 100000000, lot: 100, buy_fee_rate: 0.0015, sell_cost_rate: 0.0025, verified: false },
    form,
    ...overrides,
  }
}

// ---------------------------------------------------------------- evidence

export type TradePlan = { buy: number; sell?: number; reason?: "indicator" | "max_holding" }

type Op = PracticeRuleEvidence["op"]
const CROSS_OPS = new Set<string>(["cross_up", "cross_down", "reenter_lower", "reenter_upper", "break_upper", "break_lower", "cross_up_middle", "cross_down_middle", "break_high", "break_low"])

type RowValues = Record<string, number | string>

/** What the two numbers of a row's evidence are, with the row's own values (a subset of the server's table). */
const OPERANDS: Record<string, (values: RowValues) => { left: string; right: string }> = {
  "rsi.level": (v) => ({ left: `RSI ${v.period}`, right: String(v.threshold) }),
  "rsi.trend": (v) => ({ left: `RSI ${v.period}`, right: `RSI ${v.period} cách ${v.period} phiên` }),
  "macd.signal": (v) => ({ left: `MACD ${v.fast}/${v.slow}`, right: `Signal ${v.signal}` }),
  "ma.price_cross": (v) => ({ left: "Giá đóng cửa", right: `SMA ${v.period}` }),
  "ma.ma_cross": (v) => ({ left: `SMA ${v.fast}`, right: `SMA ${v.slow}` }),
  "ma.trend": (v) => ({ left: `SMA ${v.period}`, right: `SMA ${v.period} cách ${v.period} phiên` }),
}

function rowValues(row: PracticeRowConfig): RowValues {
  return Object.fromEntries(Object.entries(row).filter((entry): entry is [string, number | string] => entry[0] !== "id" && typeof entry[1] !== "boolean"))
}

function rowOp(values: RowValues): Op {
  if (typeof values.op === "string") return values.op as Op
  if (typeof values.action === "string") return values.action as Op
  return values.dir === "down" ? "<" : ">"
}

/** Numbers of one row at the decision session: a threshold row compares, a cross row also has the session before. */
function rowNumbers(row: PracticeRowConfig, side: Side, op: Op): { lhs: number; rhs: number; previous?: [number, number] } {
  if (row.id === "rsi.level") return { lhs: side === "buy" ? 28.15 : 71.14, rhs: Number(row.threshold) }
  if (row.id === "rsi.trend") return side === "buy" ? { lhs: 28.4, rhs: 27.9 } : { lhs: 69.17, rhs: 71.14 }
  const up = side === "buy"
  return CROSS_OPS.has(op)
    ? { lhs: up ? 25.4 : 24.1, rhs: up ? 24.8 : 24.9, previous: up ? [24.5, 24.7] : [25.2, 24.9] }
    : { lhs: up ? 25.4 : 24.1, rhs: up ? 24.8 : 24.9 }
}

function rowRule(row: PracticeRowConfig, side: Side, met: boolean): PracticeRuleEvidence {
  const definition = registryRowById(row.id)
  const values = rowValues(row)
  const op = rowOp(values)
  const numbers = rowNumbers(row, side, op)
  const operands = OPERANDS[row.id]?.(values) ?? { left: row.id, right: "—" }
  return {
    rule_id: row.id,
    kind: numbers.previous ? "cross" : "compare",
    op,
    left_label: operands.left,
    right_label: operands.right,
    ...(definition ? { label: rowSentence(definition, values) } : {}),
    values,
    lhs: numbers.lhs,
    rhs: numbers.rhs,
    ...(numbers.previous ? { previous_lhs: numbers.previous[0], previous_rhs: numbers.previous[1] } : {}),
    result: met,
    missing: false,
  }
}

function registryRowById(rowId: string): RegistryRow | undefined {
  for (const entry of REGISTRY) if (entry.model === "rows") for (const row of entry.rows) if (row.id === rowId) return row
  return undefined
}

/** Decision evidence of a row-based side: the rows that are ON, or `no_signal` when the tab is off or no row is on. */
function rowsEvidence(side: Side, signal: number, config: PracticeRowsConfig, met: boolean): PracticeEvidence {
  const tab = config[side]
  const on = tab.rules.filter((row) => row.enabled)
  const base = { side, signal_session: signal, enabled: tab.enabled, params: {} }
  if (!tab.enabled) return { ...base, result: null, status: "no_signal", reason: "side_off", rules: [] }
  if (on.length === 0) return { ...base, result: null, status: "no_signal", reason: "no_rows", rules: [] }
  return { ...base, result: met, status: "ok", rules: on.map((row) => rowRule(row, side, met)) }
}

/** Evidence of Volume and of a run locked before SPEC V3: the side's params and the rule ids `r1`, `r2`. */
function paramsEvidence(indicatorId: string, side: Side, signal: number, config: PracticeParamsConfig, met: boolean): PracticeEvidence {
  const tab = config[side]
  const rules: PracticeRuleEvidence[] =
    indicatorId === "volume"
      ? [
          { rule_id: "r1", kind: "compare", op: tab.ops.r1 ?? ">", left_label: "Giá đóng cửa", right_label: "Giá đóng cửa phiên trước", lhs: 32600, rhs: 32100, result: met, missing: false },
          { rule_id: "r2", kind: "compare", op: tab.ops.r2 ?? ">", left_label: "Khối lượng", right_label: `${tab.params.mult} × TB ${tab.params.lookback} phiên`, lhs: 2400000, rhs: 1500000, result: met, missing: false },
        ]
      : [
          { rule_id: "r1", kind: "compare", op: tab.ops.r1 ?? "<", left_label: "RSI phiên trước", right_label: String(tab.params.level), lhs: side === "buy" ? 28.15 : 71.14, rhs: tab.params.level, result: met, missing: false },
          { rule_id: "r2", kind: "compare", op: tab.ops.r2 ?? ">", left_label: "RSI", right_label: "RSI phiên trước", lhs: side === "buy" ? 28.4 : 69.17, rhs: side === "buy" ? 28.15 : 71.14, result: met, missing: false, previous_lhs: 28.15, previous_rhs: 27.9 },
        ]
  return { side, signal_session: signal, enabled: tab.enabled, result: tab.enabled ? met : null, params: { ...tab.params }, rules }
}

function evidenceOf(indicatorId: string, side: Side, signal: number, config: PracticeConfig, met: boolean): PracticeEvidence {
  return "rules" in config[side] ? rowsEvidence(side, signal, config as PracticeRowsConfig, met) : paramsEvidence(indicatorId, side, signal, config as PracticeParamsConfig, met)
}

// ---------------------------------------------------------------- runs

/** A locked, succeeded run with scripted trades (fills at the open of the planned session). */
export function makeRun(options: {
  runId?: string
  ordinal?: number
  caseId?: string
  config?: PracticeConfig
  plan?: TradePlan[]
  observation?: number
  test?: number
  valuation?: "ok" | "missing"
  indicatorId?: string
  holdMax?: number
} = {}): PracticeRun {
  const indicatorId = options.indicatorId ?? "rsi"
  const name = indicatorName(indicatorId)
  const config = options.config ?? defaultConfig(indicatorId)
  const test = options.test ?? 504
  const chart = makeChart({ indicatorId, config, observation: options.observation ?? 125, test })
  const offset = chart.first_session
  const at = (series: number[], session: number) => series[session - offset]
  const plan = options.plan ?? [{ buy: 20, sell: 45, reason: "indicator" }, { buy: 100, sell: 160, reason: "max_holding" }, { buy: 400 }]
  const hold = options.holdMax ?? config.hold_max_sessions
  let cash = 100_000_000
  const trades: PracticeTrade[] = []
  const events: PracticeEvent[] = []
  plan.forEach((item, index) => {
    const price = at(chart.bars.open, item.buy)
    const qty = Math.floor(cash / (price * 1.0015) / 100) * 100
    const buyFee = Math.round(qty * price * 0.0015)
    const total = qty * price + buyFee
    cash -= total
    events.push({ side: "buy", session: item.buy, price, trade_ordinal: index + 1 })
    const buy = { signal_session: item.buy - 1, session: item.buy, price, fee: buyFee, total_cost: total, evidence: evidenceOf(indicatorId, "buy", item.buy - 1, config, true) }
    if (item.sell === undefined) {
      const markSession = test
      const mark = at(chart.bars.close, markSession)
      const pnl = qty * mark - total
      trades.push({ ordinal: index + 1, status: "open", qty, buy, sell: null, holding_sessions: markSession - item.buy, pnl_kind: "unrealized", pnl_vnd: pnl, pnl_ratio: pnl / total, mark: { session: markSession, price: mark, market_value: qty * mark } })
      return
    }
    const sellPrice = at(chart.bars.open, item.sell)
    const sellFee = Math.round(qty * sellPrice * 0.0025)
    const net = qty * sellPrice - sellFee
    cash += net
    const reason = item.reason ?? "indicator"
    events.push({ side: "sell", session: item.sell, price: sellPrice, trade_ordinal: index + 1, reason })
    trades.push({
      ordinal: index + 1,
      status: "closed",
      qty,
      buy,
      sell: {
        signal_session: item.sell - 1,
        session: item.sell,
        price: sellPrice,
        fee: sellFee,
        net_proceeds: net,
        reason,
        indicator_met: reason === "indicator",
        time_due: reason === "max_holding",
        evidence: evidenceOf(indicatorId, "sell", item.sell - 1, config, reason === "indicator"),
        time_exit: { hold_max_sessions: hold, held_sessions_at_signal: item.sell - item.buy, due: reason === "max_holding" },
      },
      holding_sessions: item.sell - item.buy,
      pnl_kind: "realized",
      pnl_vnd: net - total,
      pnl_ratio: (net - total) / total,
      mark: null,
    })
  })
  // NAV per session close.
  const nav: number[] = []
  let running = 100_000_000
  let position: { qty: number; session: number; total: number; sellAt: number } | null = null
  for (let session = 1; session <= test; session += 1) {
    for (const trade of trades) {
      if (trade.buy.session === session) {
        running -= trade.buy.total_cost
        position = { qty: trade.qty, session, total: trade.buy.total_cost, sellAt: trade.sell?.session ?? Number.POSITIVE_INFINITY }
      }
      if (trade.sell && trade.sell.session === session) {
        running += trade.sell.net_proceeds
        position = null
      }
    }
    nav.push(running + (position ? position.qty * at(chart.bars.close, session) : 0))
  }
  const openTrade = trades.find((trade) => trade.status === "open")
  const openValue = openTrade?.mark ? openTrade.mark.market_value : openTrade ? null : 0
  const navEnd = options.valuation === "missing" ? null : openValue === null ? null : cash + openValue
  const closed = trades.filter((trade) => trade.status === "closed")
  const timeExits = closed.filter((trade) => trade.sell?.reason === "max_holding").length
  const text = openTrade && closed.length === 0
    ? "Đã có Mua nhưng chưa có Bán. Tổng lợi nhuận bao gồm lãi/lỗ tạm tính của vị thế đang giữ."
    : `${navEnd !== null && navEnd > 100_000_000 ? "Danh mục kết thúc cao hơn vốn ban đầu." : "Danh mục kết thúc thấp hơn vốn ban đầu."} ${trades.length} lần Mua, ${closed.length} giao dịch đã bán.${timeExits ? ` ${timeExits} giao dịch được đóng do hết thời gian giữ, không phải do điều kiện ${name}.` : ""}${openTrade ? " Kết quả còn bao gồm một vị thế chưa bán." : ""}`
  return {
    run_id: options.runId ?? RUN_ID,
    indicator_id: indicatorId,
    ordinal: options.ordinal ?? 1,
    total: 30,
    case_id: options.caseId ?? CASE_ID,
    status: "succeeded",
    config,
    versions: { set_version: "s", data_version: "d", profile_version: "mini-profile-v1", calculation_version: "c", rule_version: "r", engine_version: "e", execution_version: "x", comment_version: "k" },
    locked_at: "2000-01-01T00:00:00.000Z",
    completed_at: "2000-01-01T00:00:01.000Z",
    attempts: 1,
    error: null,
    result: {
      first_session: 1,
      last_session: test,
      kpis: {
        capital_initial: 100_000_000,
        cash_end: cash,
        open_position_value: options.valuation === "missing" ? null : openValue,
        nav_end: navEnd,
        total_return: navEnd === null ? null : navEnd / 100_000_000 - 1,
        valuation: navEnd === null ? "missing" : "ok",
        buy_count: trades.length,
        closed_trade_count: closed.length,
        open_position: openTrade !== undefined,
        insufficient_cash_buys: 0,
      },
      trades,
      events,
      pending_orders: [],
      missed_buys: [],
      nav,
      comment: navEnd === null
        ? { status: "unavailable", rule_id: "unavailable_missing_valuation", version: "k", text: null, values: {} }
        : { status: "ok", rule_id: openTrade && closed.length === 0 ? "buy_open_without_sell" : "portfolio_result", version: "k", text, values: {} },
      data_notes: [],
    },
    chart,
  }
}

/** A succeeded RSI run locked before SPEC V3: params + ops config, plain line keys, evidence `r1` / `r2`. */
export function makeLegacyRun(options: Parameters<typeof makeRun>[0] = {}): PracticeRun {
  return makeRun({ indicatorId: "rsi", config: legacyRsiConfig(), ...options })
}

/**
 * A run locked before SPEC V3 that never finished. The server serves it as failed with this error
 * (whatever it was stored as); it cannot be retried and a new start for the same case replaces it.
 */
export function makeOutdatedRun(options: { runId?: string; ordinal?: number; caseId?: string; indicatorId?: string; config?: PracticeConfig } = {}): PracticeRun {
  const indicatorId = options.indicatorId ?? "rsi"
  const base = makeRun({ runId: options.runId ?? OUTDATED_RUN_ID, ordinal: options.ordinal, caseId: options.caseId, indicatorId, config: options.config ?? legacyRsiConfig(), test: 5 })
  return { ...base, status: "failed", result: null, chart: null, completed_at: null, error: { ...OUTDATED_RUN_ERROR } }
}

export function briefOf(run: PracticeRun): PracticeState["runs"][number] {
  return {
    run_id: run.run_id,
    ordinal: run.ordinal,
    case_id: run.case_id,
    status: run.status,
    summary: run.result
      ? { total_return: run.result.kpis.total_return, buy_count: run.result.kpis.buy_count, closed_trade_count: run.result.kpis.closed_trade_count, open_position: run.result.kpis.open_position, comment_rule_id: run.result.comment.rule_id }
      : null,
    error: run.error,
  }
}

/** State of a case whose run was locked before SPEC V3 and never finished: failed, startable, not retryable. */
export function makeOutdatedState(run: PracticeRun = makeOutdatedRun(), overrides: Partial<PracticeState> = {}, indicatorId = "rsi"): PracticeState {
  const brief = briefOf(run)
  return makeState({ status: "failed", current_run: brief, runs: [brief], can_start: true, can_retry: false, ...overrides }, indicatorId)
}

export function makeHistory(runs: PracticeRun[]): PracticeHistory {
  return {
    page: 1,
    page_size: 30,
    total: runs.length,
    items: runs
      .slice()
      .reverse()
      .map((run) => ({
        run_id: run.run_id,
        ordinal: run.ordinal,
        case_id: run.case_id,
        completed_at: run.completed_at,
        config: run.config,
        kpis: run.result
          ? { total_return: run.result.kpis.total_return, buy_count: run.result.kpis.buy_count, closed_trade_count: run.result.kpis.closed_trade_count, open_position: run.result.kpis.open_position, comment_rule_id: run.result.comment.rule_id }
          : null,
        versions: run.versions,
      })),
  }
}
