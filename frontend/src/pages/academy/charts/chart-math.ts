/** Pure helpers shared by the lesson chart renderers: model types, number formatting, paths, data tables. */
import type { ChartModel, LeafChartModel } from "../content-types"

export type SeriesPanelsModel = Extract<LeafChartModel, { kind: "series_panels" }>
export type SeriesPanel = SeriesPanelsModel["panels"][number]
export type CategoryModel = Extract<LeafChartModel, { kind: "category" }>
export type SegmentBarModel = Extract<LeafChartModel, { kind: "segment_bar" }>
export type ScaleModel = Extract<LeafChartModel, { kind: "scale" }>
export type SchematicModel = Extract<LeafChartModel, { kind: "schematic" }>
export type SchematicLayer = SchematicModel["layers"][number]
export type GanttModel = Extract<LeafChartModel, { kind: "gantt" }>
export type MilestonesModel = Extract<LeafChartModel, { kind: "milestones" }>
export type CandleGlyphsModel = Extract<LeafChartModel, { kind: "candle_glyphs" }>
export type FlowModel = Extract<LeafChartModel, { kind: "flow" }>
export type DiagramModel = Extract<LeafChartModel, { kind: "diagram" }>
export type CompareModel = Extract<ChartModel, { kind: "compare" }>

/**
 * A drawing that still reads at about 150px: candle glyphs and axis-less series sparklines (`.pat`, C4L4-s1..s4).
 * Anything with axes, ticks or value labels lays out at MIN_CHART_WIDTH or more, so it never shares a phone row.
 */
export function isThumbnailChart(model: ChartModel | undefined): boolean {
  return model?.kind === "candle_glyphs" || (model?.kind === "series_panels" && model.axes === false)
}

export type DataTable = { caption?: string; head: string[]; rows: string[][] }

export const isNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value)

const formatters = new Map<number, Intl.NumberFormat>()

/** vi-VN number with a fixed number of decimals; "Không có" for a missing value (never 0). */
export function formatValue(value: number | null | undefined, digits = 2): string {
  if (!isNumber(value)) return "Không có"
  let formatter = formatters.get(digits)
  if (!formatter) {
    formatter = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    formatters.set(digits, formatter)
  }
  return formatter.format(value)
}

const compact = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 })

/** vi-VN number with at most two decimals and no padding; "Không có" when missing. */
export function formatCompact(value: number | null | undefined): string {
  if (!isNumber(value)) return "Không có"
  return compact.format(Math.abs(value) < 5e-3 ? 0 : value)
}

/**
 * A category chart's value label or tick: formatCompact plus the model's `value_format` (an explicit "+" or "−"
 * and a suffix such as "%"), so "−10%" and "+11%" read apart without relying on colour.
 */
export function formatCategoryValue(
  value: number,
  format: (CategoryModel["value_format"] & { decimals?: number }) | undefined,
): string {
  if (!format) return formatCompact(value)
  const rounded = Math.abs(value) < 5e-3 ? 0 : value
  const sign = format.sign && rounded !== 0 ? (rounded > 0 ? "+" : "−") : rounded < 0 ? "-" : ""
  const digits =
    format.decimals !== undefined
      ? formatValue(Math.abs(rounded), format.decimals)
      : formatCompact(Math.abs(rounded))
  return `${sign}${digits}${format.suffix ?? ""}`
}

/**
 * Stack totals of one category: positives grow up from 0, negatives grow down from 0 (C1L5-g2: the purchase
 * outflow sits below the axis while interest and principal stack above it).
 */
export function stackTotals(model: CategoryModel, index: number): { pos: number; neg: number; net: number } {
  let pos = 0
  let neg = 0
  for (const series of model.series) {
    if (series.dash) continue
    const value = series.values[index]
    if (!isNumber(value)) continue
    if (value >= 0) pos += value
    else neg += value
  }
  return { pos, neg, net: pos + neg }
}

/** The series index whose segment carries a stacked category's value label: the last one with a value. */
export function stackLabelSeries(model: CategoryModel, index: number): number {
  for (let s = model.series.length - 1; s >= 0; s--)
    if (!model.series[s].dash && isNumber(model.series[s].values[index])) return s
  return -1
}

export type AxisLabel = { index: number; text: string; anchor: "start" | "middle" | "end"; at: number }

/**
 * Drops axis labels that would print on top of each other (spec §5: no overlapping text at 390px). Greedy
 * left to right with a 6px gap; the last label always stays, so a collision there drops the one before it.
 * Grid lines are the caller's business: only the labels thin out.
 */
export function thinAxisLabels(labels: AxisLabel[], size = 10.5, gap = 6): AxisLabel[] {
  const span = (label: AxisLabel): [number, number] => {
    const w = textWidth(label.text, size)
    const l = label.anchor === "start" ? label.at : label.anchor === "end" ? label.at - w : label.at - w / 2
    return [l, l + w]
  }
  const kept: AxisLabel[] = []
  for (const label of labels) {
    const previous = kept[kept.length - 1]
    if (previous && span(label)[0] < span(previous)[1] + gap) continue
    kept.push(label)
  }
  const last = labels[labels.length - 1]
  if (last && kept[kept.length - 1] !== last) {
    while (kept.length > 0 && span(last)[0] < span(kept[kept.length - 1])[1] + gap) kept.pop()
    kept.push(last)
  }
  return kept
}

/** Evenly spaced "nice" ticks covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return [lo]
  const raw = (hi - lo) / count
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  const step = (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power
  const first = Math.ceil(lo / step - 1e-9) * step
  const ticks: number[] = []
  for (let value = first; value <= hi + step * 1e-9; value += step) ticks.push(Math.abs(value) < step * 1e-9 ? 0 : value)
  return ticks
}

/** Rough rendered width of a label at `size` px (Be Vietnam Pro averages about 0.56em per glyph). */
export function textWidth(text: string, size = 11): number {
  return text.length * size * 0.56
}

/** Split a label into lines that fit `maxWidth` px at `size` px. Never truncates: the last line takes the rest. */
export function wrapText(text: string, maxWidth: number, size = 11, maxLines = 3): string[] {
  const maxChars = Math.max(4, Math.floor(maxWidth / (size * 0.56)))
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    if (current && `${current} ${word}`.length > maxChars) {
      lines.push(current)
      current = word
    } else current = current ? `${current} ${word}` : word
  }
  if (current) lines.push(current)
  if (lines.length <= maxLines) return lines
  return [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(" ")]
}

/** Path of a series with gaps: a missing value never joins its neighbours. */
export function linePath(values: readonly (number | null)[], x: (k: number) => number, y: (v: number) => number): string {
  let path = ""
  let begun = false
  values.forEach((value, k) => {
    if (!isNumber(value)) {
      begun = false
      return
    }
    path += `${begun ? "L" : "M"}${x(k).toFixed(2)},${y(value).toFixed(2)}`
    begun = true
  })
  return path
}

/** Closed area between two series (band or fill), split at gaps. */
export function areaPath(
  upper: readonly (number | null)[],
  lower: readonly (number | null)[],
  x: (k: number) => number,
  y: (v: number) => number,
  include: (k: number) => boolean = () => true,
): string {
  let path = ""
  let start = -1
  const flush = (end: number) => {
    if (start < 0) return
    if (end > start) {
      let top = ""
      let bottom = ""
      for (let k = start; k <= end; k += 1) top += `${k === start ? "M" : "L"}${x(k).toFixed(2)},${y(upper[k] as number).toFixed(2)}`
      for (let k = end; k >= start; k -= 1) bottom += `L${x(k).toFixed(2)},${y(lower[k] as number).toFixed(2)}`
      path += `${top}${bottom}Z`
    }
    start = -1
  }
  upper.forEach((value, k) => {
    if (isNumber(value) && isNumber(lower[k]) && include(k)) {
      if (start < 0) start = k
    } else flush(k - 1)
  })
  flush(upper.length - 1)
  return path
}

/* ------------------------------------------------------------------ series_panels */

export function windowSize(model: SeriesPanelsModel): number {
  return model.x.end - model.x.start + 1
}

/** Label of the k-th observation of the window: tick text when present, else "Phiên n". */
export function observationLabel(model: SeriesPanelsModel, k: number): string {
  const tick = model.x.ticks?.[k]
  return tick ? tick : `Phiên ${model.x.start + k + 1}`
}

export type ReadoutRow = { name: string; value: number | null; digits: number }

/** One readout row per series, candle close and bar of every panel at window position k. */
export function seriesPanelsReadout(model: SeriesPanelsModel, k: number): ReadoutRow[] {
  return model.panels.flatMap((panel) => {
    const digits = panel.digits ?? 2
    return [
      ...(panel.candles
        ? [
            { name: "Mở cửa", value: panel.candles.open[k] ?? null, digits },
            { name: "Cao nhất", value: panel.candles.high[k] ?? null, digits },
            { name: "Thấp nhất", value: panel.candles.low[k] ?? null, digits },
            { name: "Đóng cửa", value: panel.candles.close[k] ?? null, digits },
          ]
        : []),
      ...panel.series.map((series) => ({ name: series.name, value: series.values[k] ?? null, digits })),
      ...(panel.bars ? [{ name: panel.bars.name, value: panel.bars.values[k] ?? null, digits }] : []),
    ]
  })
}

export function seriesPanelsTable(model: SeriesPanelsModel): DataTable {
  const n = windowSize(model)
  const head = ["Phiên", ...seriesPanelsReadout(model, 0).map((row) => row.name)]
  const rows: string[][] = []
  for (let k = 0; k < n; k += 1) {
    rows.push([observationLabel(model, k), ...seriesPanelsReadout(model, k).map((row) => formatValue(row.value, row.digits))])
  }
  return { caption: model.alt, head, rows }
}

/** y range of a panel: explicit bounds, else the data range with 12% padding. */
export function panelRange(panel: SeriesPanel): [number, number] {
  if (panel.bounds) return panel.bounds
  const values = [
    ...panel.series.flatMap((series) => series.values.filter(isNumber)),
    ...(panel.candles ? [...panel.candles.high, ...panel.candles.low].filter(isNumber) : []),
    ...(panel.bars ? [...panel.bars.values.filter(isNumber), 0] : []),
    ...(panel.band ? [...panel.band.upper, ...panel.band.lower].filter(isNumber) : []),
    ...(panel.zero ? [0] : []),
    ...(panel.levels ?? []).map((level) => level.value),
  ]
  if (values.length === 0) return [0, 1]
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  const span = Math.max(hi - lo, Math.abs(hi) * 0.02, 1e-6)
  lo -= span * 0.12
  hi += span * 0.12
  if (panel.nonnegative && lo < 0) lo = 0
  return [lo, hi]
}

/* ------------------------------------------------------------------ category */

export function categoryTable(model: CategoryModel): DataTable {
  const unit = model.unit ? ` (${model.unit})` : ""
  const stacked = model.mode === "stacked"
  const head = [
    "Mục",
    ...(model.sublabels ? ["Ghi chú"] : []),
    ...model.series.map((series) => `${series.name}${unit}`),
    ...(stacked ? [`Tổng${unit}`] : []),
  ]
  const rows = model.labels.map((label, index) => [
    label,
    ...(model.sublabels ? [model.sublabels[index] ?? ""] : []),
    ...model.series.map((series) => formatCompact(series.values[index])),
    ...(stacked ? [formatCompact(model.series.reduce((sum, series) => sum + (series.values[index] ?? 0), 0))] : []),
  ])
  return { caption: model.title, head, rows }
}

/** Value domain of a category chart: bounds, else 0..max (stacked: positive and negative stack sums), with negatives kept. */
export function categoryRange(model: CategoryModel): [number, number] {
  if (model.bounds) return model.bounds
  const values =
    model.mode === "stacked"
      ? model.labels.flatMap((_, index) => {
          const { pos, neg } = stackTotals(model, index)
          return [pos, neg]
        })
      : model.series.flatMap((series) => series.values.filter(isNumber))
  const thresholds = model.threshold ? [model.threshold.value] : []
  if (values.length === 0) return [0, 1]
  if (model.mode === "line") {
    const dataLo = Math.min(...values, ...thresholds)
    const dataHi = Math.max(...values, ...thresholds)
    const pad = (dataHi - dataLo) * 0.08 || Math.abs(dataHi) * 0.1 || 1
    return [dataLo >= 0 && dataLo - pad < 0 ? 0 : dataLo - pad, dataHi + pad]
  }
  const lo = Math.min(0, ...values, ...thresholds)
  const hi = Math.max(0, ...values, ...thresholds)
  if (lo === hi) return [0, 1]
  // A label under a negative bar needs room above the category labels.
  const labelled = model.value_labels !== undefined && model.value_labels !== "none"
  return [lo < 0 && labelled ? lo - (hi - lo) * 0.1 : lo, hi + (hi - lo) * 0.06]
}

/* ------------------------------------------------------------------ segment_bar */

export function segmentBarTable(model: SegmentBarModel): DataTable {
  const unit = model.unit ? ` (${model.unit})` : ""
  return {
    caption: model.alt,
    head: ["Dòng", "Phần", `Giá trị${unit}`],
    rows: model.rows.flatMap((row) =>
      row.segments
        .filter((segment) => !segment.ghost)
        .map((segment, index) => [
          index === 0 ? row.label : "",
          [segment.label, segment.sub].filter(Boolean).join(", ") || row.total?.text || row.label,
          formatCompact(segment.value),
        ]),
    ),
  }
}

/** Tables behind "Xem bảng số liệu" (data kinds only; compare yields one table per data item). */
export function chartTables(model: ChartModel): DataTable[] {
  switch (model.kind) {
    case "series_panels":
      return [seriesPanelsTable(model)]
    case "category":
      return [categoryTable(model)]
    case "segment_bar":
      return [segmentBarTable(model)]
    case "compare":
      return model.items.flatMap((item) =>
        chartTables(item.model).map((table) => ({ ...table, caption: item.title ?? table.caption })),
      )
    default:
      return []
  }
}

/** Kinds whose numbers can be read back as a table ("Xem bảng số liệu"). */
export function hasDataTable(model: ChartModel): boolean {
  return chartTables(model).length > 0
}

/** Accessible name of a model: its own alt text, else the given fallback (block title or chart id). */
export function chartLabel(model: ChartModel | LeafChartModel, fallback: string): string {
  return ("alt" in model && model.alt) || fallback
}
