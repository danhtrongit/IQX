/** Pure helpers shared by the lesson chart renderers: number formatting, axes, data tables. */
import type { ChartModel } from "../api"

export type SeriesPanelsModel = Extract<ChartModel, { kind: "series_panels" }>
export type CategoryModel = Extract<ChartModel, { kind: "grouped" | "line" | "stacked" }>
export type TimelineModel = Extract<ChartModel, { kind: "timeline" }>
export type WaterfallModel = Extract<ChartModel, { kind: "waterfall" }>
export type PanelsModel = Extract<ChartModel, { kind: "panels" }>
export type SeriesPanel = SeriesPanelsModel["panels"][number]
export type SeriesRole = SeriesPanel["series"][number]["role"]

export type DataTable = { caption?: string; head: string[]; rows: string[][] }

const formatters = new Map<number, Intl.NumberFormat>()

/** vi-VN number with a fixed number of decimals; `—` for a missing value (never 0). */
export function formatValue(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  let formatter = formatters.get(digits)
  if (!formatter) {
    formatter = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    formatters.set(digits, formatter)
  }
  return formatter.format(value)
}

const compact = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 })

/** vi-VN number with at most two decimals and no padding (19,999… prints as 20); `—` when missing. */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return compact.format(Math.abs(value) < 5e-3 ? 0 : value)
}

export const isNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value)

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

/** Split a long label into at most `maxLines` lines of about `maxChars` characters. */
export function wrapLabel(text: string, maxChars: number, maxLines = 3): string[] {
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
  const head = lines.slice(0, maxLines - 1)
  return [...head, lines.slice(maxLines - 1).join(" ")]
}

/** Label of the i-th point of a `series_panels` window: tick text, else "Phiên n" counted from the window start. */
export function phienLabel(model: SeriesPanelsModel, index: number): string {
  return model.x.ticks?.[index] ?? `Phiên ${index + 1}`
}

export function seriesPanelsPoints(model: SeriesPanelsModel): number {
  return model.x.end - model.x.start + 1
}

/** One readout row per series/bar of every panel, for tooltips and the marks' value lines. */
export function seriesPanelsReadout(model: SeriesPanelsModel, index: number): { name: string; value: number | null }[] {
  return model.panels.flatMap((panel) => [
    ...panel.series.map((series) => ({ name: series.name, value: series.values[index] ?? null })),
    ...(panel.bars ? [{ name: panel.bars.name, value: panel.bars.values[index] ?? null }] : []),
  ])
}

/** Table behind the "Xem bảng số liệu của biểu đồ" toggle: `Phiên`, then every panel's series then its bars. */
export function seriesPanelsTable(model: SeriesPanelsModel): DataTable {
  const columns = model.panels.flatMap((panel) => [
    ...panel.series.map((series) => ({ name: series.name, values: series.values })),
    ...(panel.bars ? [{ name: panel.bars.name, values: panel.bars.values }] : []),
  ])
  const rows: string[][] = []
  for (let index = 0; index < seriesPanelsPoints(model); index += 1) {
    rows.push([phienLabel(model, index), ...columns.map((column) => formatValue(column.values[index], 4))])
  }
  return { head: ["Phiên", ...columns.map((column) => column.name)], rows }
}

export function categoryTable(model: CategoryModel): DataTable {
  const unit = model.unit ? ` (${model.unit})` : ""
  const stacked = model.kind === "stacked"
  const head = ["Kỳ", ...model.series.map((series) => `${series.name}${unit}`), ...(stacked ? [`Tổng${unit}`] : [])]
  const rows = model.labels.map((label, index) => [
    label,
    ...model.series.map((series) => formatCompact(series.values[index])),
    ...(stacked ? [formatCompact(model.series.reduce((sum, series) => sum + (series.values[index] ?? 0), 0))] : []),
  ])
  return { caption: model.title, head, rows }
}

export function timelineTable(model: TimelineModel): DataTable {
  return {
    caption: model.title,
    head: ["Khoảng", "Từ", "Đến", "Chi tiết"],
    rows: model.rows.map((row) => [row.name, model.labels[row.start] ?? "—", model.labels[row.end] ?? "—", row.detail]),
  }
}

export type WaterfallBar = { name: string; from: number; to: number; value: number; total: boolean }

/** A total step is a level measured from 0; any other step moves the running level by its value. */
export function waterfallBars(model: WaterfallModel): WaterfallBar[] {
  let level = 0
  return model.steps.map((step) => {
    if (step.total) {
      level = step.value
      return { name: step.name, from: 0, to: step.value, value: step.value, total: true }
    }
    const from = level
    level += step.value
    return { name: step.name, from, to: level, value: step.value, total: false }
  })
}

export function waterfallTable(model: WaterfallModel): DataTable {
  const unit = model.unit ? ` (${model.unit})` : ""
  return {
    caption: model.title,
    head: ["Bước", `Giá trị${unit}`, `Mức sau bước${unit}`],
    rows: waterfallBars(model).map((bar) => [bar.name, formatCompact(bar.value), formatCompact(bar.to)]),
  }
}

/** Every table that represents the model, one per sub-chart for `panels`. */
export function chartTables(model: ChartModel): DataTable[] {
  switch (model.kind) {
    case "series_panels":
      return [seriesPanelsTable(model)]
    case "grouped":
    case "line":
    case "stacked":
      return [categoryTable(model)]
    case "timeline":
      return [timelineTable(model)]
    case "waterfall":
      return [waterfallTable(model)]
    case "panels":
      return model.panels.map(categoryTable)
  }
}
