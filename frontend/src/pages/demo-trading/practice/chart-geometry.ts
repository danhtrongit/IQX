/**
 * Geometry of the practice chart: one windowed slice of candles plus the indicator panel(s) of the
 * backend plot spec. Pure and framework-free. Scales are computed from the window slice only, so
 * neither autoscaling nor an axis tick can reveal a bar that is not yet shown.
 */
import type { PracticeChart, PracticeEvent, PracticePlot, Side } from "./practice-api"
import { formatDec } from "./practice-model"

export type LinePath = { key: string; label: string; d: string; color: string; dash: string | null }
export type CandleShape = { x: number; high: number; low: number; bodyTop: number; bodyHeight: number; up: boolean }
export type BarShape = { x: number; y: number; height: number; positive: boolean }
export type TickShape = { y: number; label: string }
export type LevelShape = { y: number; label: string; kind: "threshold" | "reference" | "zero" }
export type XTick = { x: number; label: string; anchor: "start" | "middle" | "end" }
export type MarkerShape = { x: number; y: number; side: Side; ordinal: number; session: number; reason: "indicator" | "max_holding" | null }

export type ChartLayout = {
  width: number
  height: number
  x0: number
  x1: number
  priceTop: number
  priceBottom: number
  indTop: number
  indBottom: number
  hasIndicatorPane: boolean
  /** Indices (into the payload arrays) of the first/last drawn bar. */
  start: number
  end: number
  bodyWidth: number
  candles: CandleShape[]
  priceTicks: TickShape[]
  priceLines: LinePath[]
  indTicks: TickShape[]
  indLines: LinePath[]
  indBars: BarShape[]
  indBarKind: "histogram" | "volume" | null
  levels: LevelShape[]
  xTicks: XTick[]
  markers: MarkerShape[]
}

export type LayoutInput = {
  chart: PracticeChart
  side: Side
  start: number
  end: number
  width: number
  events: readonly PracticeEvent[]
}

const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value)

export function niceTicks(lo: number, hi: number, count = 4): number[] {
  const raw = (hi - lo) / count
  const power = 10 ** Math.floor(Math.log10(raw || 1))
  const ratio = raw / power
  const step = (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * power
  const out: number[] = []
  for (let value = Math.ceil(lo / step) * step; value <= hi + step * 0.001 && out.length < 12; value += step) {
    out.push(Math.abs(value) < step * 0.00001 ? 0 : value)
  }
  return out
}

export function compactNumber(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e9) return `${formatDec(Math.round(value / 1e8) / 10)} tỷ`
  if (abs >= 1e6) return `${formatDec(Math.round(value / 1e5) / 10)} tr`
  if (abs >= 1e4) return `${formatDec(Math.round(value / 100) / 10)}k`
  return formatDec(abs < 1 ? Math.round(value * 100) / 100 : abs < 100 ? Math.round(value * 10) / 10 : Math.round(value))
}

type LineStyle = { color: string; dash: string | null }
const LINE_STYLE: Record<string, LineStyle> = {
  value: { color: "var(--chart-1)", dash: null },
  signal: { color: "var(--chart-2)", dash: null },
  fast: { color: "var(--chart-1)", dash: null },
  slow: { color: "var(--chart-2)", dash: null },
  upper: { color: "var(--chart-1)", dash: null },
  lower: { color: "var(--chart-2)", dash: null },
  middle: { color: "var(--muted-foreground)", dash: "4 3" },
  baseline: { color: "var(--chart-2)", dash: null },
  threshold: { color: "var(--chart-2)", dash: "4 3" },
  plus: { color: "var(--price-up)", dash: null },
  minus: { color: "var(--price-down)", dash: null },
}
export const lineStyleOf = (key: string): LineStyle => LINE_STYLE[key] ?? { color: "var(--chart-1)", dash: null }

export type LegendItem = { key: string; label: string; color: string; dash: string | null }

/** Legend entries of one side: the plotted lines first, then histogram / volume. */
export function legendItems(plot: PracticePlot): LegendItem[] {
  const items: LegendItem[] = plot.lines.map((line) => ({ key: line.key, label: line.label, ...lineStyleOf(line.key) }))
  if (plot.histogram_key) items.push({ key: plot.histogram_key, label: "Histogram", color: "var(--price-up)", dash: null })
  if (plot.volume_key) items.push({ key: plot.volume_key, label: "Khối lượng", color: "var(--muted-foreground)", dash: null })
  return items
}

export const THRESHOLD_STROKE = "var(--price-ref)"
export const REFERENCE_STROKE = "var(--muted-foreground)"

const seriesOf = (chart: PracticeChart, side: Side, key: string): ReadonlyArray<number | null> => {
  const own = chart.series[side][key]
  if (own) return own
  return key === "volume" ? chart.bars.volume : []
}

function linePath(values: ReadonlyArray<number | null>, start: number, end: number, x: (index: number) => number, y: (value: number) => number): string {
  let d = ""
  let drawing = false
  for (let i = start; i <= end; i += 1) {
    const value = values[i]
    if (!finite(value)) {
      drawing = false
      continue
    }
    d += `${drawing ? "L" : "M"}${x(i).toFixed(1)},${y(value).toFixed(1)}`
    drawing = true
  }
  return d
}

function windowValues(values: ReadonlyArray<number | null>, start: number, end: number): number[] {
  const out: number[] = []
  for (let i = start; i <= end; i += 1) {
    const value = values[i]
    if (finite(value)) out.push(value)
  }
  return out
}

const minOf = (values: number[]): number => values.reduce((a, b) => (b < a ? b : a), Number.POSITIVE_INFINITY)
const maxOf = (values: number[]): number => values.reduce((a, b) => (b > a ? b : a), Number.NEGATIVE_INFINITY)

export function computeLayout(input: LayoutInput): ChartLayout {
  const { chart, side, width, events } = input
  const plot = chart.plot[side]
  const barsCount = chart.bars.close.length
  const start = Math.max(0, Math.min(input.start, barsCount - 1))
  const end = Math.max(start, Math.min(input.end, barsCount - 1))
  const compact = width < 500
  const x0 = 10
  const x1 = Math.max(x0 + 50, width - (compact ? 46 : 58))
  const separate = !plot.overlay
  const priceTop = 22
  const priceBottom = compact ? 200 : 250
  const indTop = priceBottom + 40
  const indBottom = indTop + (compact ? 100 : 130)
  const height = separate ? indBottom + 28 : priceBottom + 28
  const span = end - start + 1
  const x = (index: number): number => x0 + ((index - start + 0.5) / span) * (x1 - x0)

  // Price pane: candles of the window (+ overlay lines), padded; never data outside [start, end].
  const highs = windowValues(chart.bars.high, start, end)
  const lows = windowValues(chart.bars.low, start, end)
  if (plot.overlay) {
    for (const line of plot.lines) {
      const values = windowValues(seriesOf(chart, side, line.key), start, end)
      highs.push(...values)
      lows.push(...values)
    }
  }
  let plo = highs.length ? minOf(lows) : 0
  let phi = highs.length ? maxOf(highs) : 1
  const pad = (phi - plo || 1) * 0.13
  plo -= pad
  phi += pad
  const py = (value: number): number => priceBottom - ((value - plo) / (phi - plo)) * (priceBottom - priceTop)

  const bodyWidth = Math.max(1, Math.min(9, ((x1 - x0) / span) * 0.64))
  const candles: CandleShape[] = []
  for (let i = start; i <= end; i += 1) {
    const open = chart.bars.open[i]
    const close = chart.bars.close[i]
    const high = chart.bars.high[i]
    const low = chart.bars.low[i]
    if (![open, close, high, low].every(finite)) continue
    candles.push({
      x: x(i),
      high: py(high),
      low: py(low),
      bodyTop: Math.min(py(open), py(close)),
      bodyHeight: Math.max(1, Math.abs(py(open) - py(close))),
      up: close >= open,
    })
  }
  const priceTicks = niceTicks(plo, phi).map((value) => ({ y: py(value), label: compactNumber(value) }))
  const priceLines: LinePath[] = plot.overlay
    ? plot.lines.map((line) => ({
        key: line.key,
        label: line.label,
        d: linePath(seriesOf(chart, side, line.key), start, end, x, py),
        ...lineStyleOf(line.key),
      }))
    : []

  // Indicator pane (separate scale), only for non-overlay indicators.
  let indTicks: TickShape[] = []
  let indLines: LinePath[] = []
  const indBars: BarShape[] = []
  let indBarKind: ChartLayout["indBarKind"] = null
  const levels: LevelShape[] = []
  if (separate) {
    const histogram = plot.histogram_key ? seriesOf(chart, side, plot.histogram_key) : null
    const volume = plot.volume_key ? seriesOf(chart, side, plot.volume_key) : null
    const values: number[] = []
    for (const line of plot.lines) values.push(...windowValues(seriesOf(chart, side, line.key), start, end))
    if (histogram) values.push(...windowValues(histogram, start, end), 0)
    if (volume) values.push(...windowValues(volume, start, end), 0)
    if (plot.zero_line) values.push(0)
    values.push(...plot.threshold_levels, ...plot.reference_levels)
    let lo = plot.bounds ? plot.bounds[0] : values.length ? minOf(values) : 0
    let hi = plot.bounds ? plot.bounds[1] : values.length ? maxOf(values) : 1
    if (!plot.bounds) {
      const padding = (hi - lo || 1) * 0.12
      lo -= padding
      hi += padding
      if (plot.nonnegative) lo = 0
    }
    if (hi === lo) hi = lo + 1
    const iy = (value: number): number => indBottom - ((value - lo) / (hi - lo)) * (indBottom - indTop)
    indTicks = (plot.bounds ? [lo, (lo + hi) / 2, hi] : niceTicks(lo, hi, 3)).map((value) => ({ y: iy(value), label: compactNumber(value) }))
    if (plot.zero_line && 0 > lo && 0 < hi) levels.push({ y: iy(0), label: "0", kind: "zero" })
    for (const level of plot.reference_levels) {
      if (level >= lo && level <= hi) levels.push({ y: iy(level), label: `Mốc ${formatDec(level)}`, kind: "reference" })
    }
    for (const level of plot.threshold_levels) {
      if (level >= lo && level <= hi) levels.push({ y: iy(level), label: `Ngưỡng ${formatDec(level)}`, kind: "threshold" })
    }
    const barValues = histogram ?? volume
    if (barValues) {
      indBarKind = histogram ? "histogram" : "volume"
      const zeroY = iy(0)
      for (let i = start; i <= end; i += 1) {
        const value = barValues[i]
        if (!finite(value)) continue
        const valueY = iy(value)
        indBars.push({
          x: x(i),
          y: Math.min(zeroY, valueY),
          height: Math.max(0.7, Math.abs(valueY - zeroY)),
          positive: histogram ? value >= 0 : chart.bars.close[i] >= chart.bars.open[i],
        })
      }
    }
    indLines = plot.lines.map((line) => ({
      key: line.key,
      label: line.label,
      d: linePath(seriesOf(chart, side, line.key), start, end, x, iy),
      ...lineStyleOf(line.key),
    }))
  }

  const tickCount = compact ? 3 : 5
  const xTicks: XTick[] = []
  for (let j = 0; j < tickCount; j += 1) {
    const index = Math.round(start + (j * (end - start)) / (tickCount - 1))
    xTicks.push({
      x: j === 0 ? x0 : j === tickCount - 1 ? x1 : x(index),
      label: `Phiên ${chart.first_session + index}`,
      anchor: j === 0 ? "start" : j === tickCount - 1 ? "end" : "middle",
    })
  }

  const markers: MarkerShape[] = []
  for (const event of events) {
    const index = event.session - chart.first_session
    if (index < start || index > end) continue
    const high = chart.bars.high[index]
    const low = chart.bars.low[index]
    if (!finite(high) || !finite(low)) continue
    const buy = event.side === "buy"
    const y = buy ? Math.min(priceBottom - 6, py(low) + 12) : Math.max(priceTop + 6, py(high) - 12)
    markers.push({ x: x(index), y, side: event.side, ordinal: event.trade_ordinal, session: event.session, reason: event.reason ?? null })
  }

  return {
    width,
    height,
    x0,
    x1,
    priceTop,
    priceBottom,
    indTop,
    indBottom,
    hasIndicatorPane: separate,
    start,
    end,
    bodyWidth,
    candles,
    priceTicks,
    priceLines,
    indTicks,
    indLines,
    indBars,
    indBarKind,
    levels,
    xTicks,
    markers,
  }
}

/** Bar index (clamped to the window) under an x coordinate of the chart. */
export function indexAtX(layout: Pick<ChartLayout, "x0" | "x1" | "start" | "end">, x: number): number {
  const span = layout.end - layout.start + 1
  const raw = Math.round(layout.start + ((x - layout.x0) / (layout.x1 - layout.x0)) * span - 0.5)
  return Math.min(layout.end, Math.max(layout.start, raw))
}

/**
 * Window of `windowBars` bars ending at the revealed session (or at `panEnd` when the viewer paged
 * back). Returned as array indices; nothing after the revealed session is ever included.
 */
export function windowIndices(input: {
  firstSession: number
  revealed: number
  windowBars: number
  panEnd: number | null
  barCount: number
}): { start: number; end: number; minEnd: number; maxEnd: number } {
  const maxEnd = Math.max(0, Math.min(input.barCount - 1, input.revealed - input.firstSession))
  const minEnd = Math.min(maxEnd, input.windowBars - 1)
  const wanted = input.panEnd === null ? maxEnd : input.panEnd - input.firstSession
  const end = Math.min(maxEnd, Math.max(minEnd, wanted))
  return { start: Math.max(0, end - input.windowBars + 1), end, minEnd, maxEnd }
}
