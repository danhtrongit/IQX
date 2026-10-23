/**
 * Số liệu tĩnh của một biểu đồ theo khuôn (spec §9): màu chuỗi, chú giải,
 * hộp số liệu và bảng số. Hàm thuần, không có React.
 */
import {
  decimalsForUnit,
  finiteValues,
  formatDayLabel,
  formatWithUnit,
  meanOf,
  medianOf,
} from "./format"
import type { FundamentalChartData } from "./types"

/** Chuỗi chính, chuỗi thứ hai, chuỗi thứ ba, âm (spec §9, token trong index.css). */
export const MAIN_COLOR = "var(--s1)"
export const SECOND_COLOR = "var(--s2)"
export const THIRD_COLOR = "var(--s3)"
export const NEGATIVE_COLOR = "var(--neg)"
/** Đường tham chiếu: nét đứt sáng, trung tính. */
export const REFERENCE_COLOR = "var(--ref-line)"
/** Dải bình quân/trung vị ± độ lệch chuẩn. */
export const BAND_COLOR = "var(--band)"

export const SERIES_COLORS = [MAIN_COLOR, SECOND_COLOR, THIRD_COLOR]

export type LegendItem = { label: string; color: string; shape: "line" | "bar" | "band" }

export type TooltipContent = { title: string; rows: [string, string][] }

/** Kỳ đang rê chuột: vị trí trong chuỗi và toạ độ ngang trong tấm vẽ. */
export type HoverState = { index: number; x: number }

export type FigureTable = {
  /** Dòng ghi chú ở đầu bảng (khuôn F: "Giá trị cuối tháng"). */
  caption?: string
  columns: string[]
  rows: string[][]
}

function mainUnitOf(chart: FundamentalChartData): string {
  return chart.mainUnit ?? chart.unit
}

function mainDecimalsOf(chart: FundamentalChartData): number {
  if (chart.mainUnit) return decimalsForUnit(chart.mainUnit)
  return chart.decimals ?? decimalsForUnit(chart.unit)
}

/** Đường tăng đều theo CAGR của khuôn D, tính từ năm đầu. */
export function cagrPath(values: (number | null)[], hero?: number | null): (number | null)[] {
  const first = values[0]
  if (typeof first !== "number" || !Number.isFinite(first)) {
    return values.map(() => null)
  }
  let growth: number | null = null
  if (typeof hero === "number" && Number.isFinite(hero)) {
    growth = 1 + hero / 100
  } else if (hero === undefined && values.length >= 2) {
    const last = values[values.length - 1]
    if (typeof last === "number" && Number.isFinite(last) && first > 0 && last > 0) {
      growth = (last / first) ** (1 / (values.length - 1))
    }
  }
  if (growth === null) return values.map(() => null)
  return values.map((_, index) => first * growth ** index)
}

/** Vị trí bắt đầu của chuỗi dương liên tục gần nhất (khuôn E2). */
export function streakStart(values: (number | null)[], hero: number | null | undefined): number {
  const streak = typeof hero === "number" ? hero : 0
  return Math.max(0, values.length - streak)
}

/** Chú giải của một biểu đồ theo khuôn của nó. */
export function figureLegend(chart: FundamentalChartData): LegendItem[] {
  const main = chart.main[0]
  const mainUnit = mainUnitOf(chart)
  if (chart.kind === "A" || chart.kind === "B" || chart.kind === "C") {
    const items: LegendItem[] = main ? [{ label: main.name, color: MAIN_COLOR, shape: "line" }] : []
    for (const [index, series] of (chart.sub?.series ?? []).entries()) {
      items.push({ label: series.name, color: SERIES_COLORS[index % SERIES_COLORS.length], shape: "bar" })
    }
    return items
  }
  if (chart.kind === "D") {
    return [
      ...(main ? [{ label: `${main.name} (${mainUnit})`, color: MAIN_COLOR, shape: "bar" as const }] : []),
      { label: "Đường tăng đều theo CAGR", color: REFERENCE_COLOR, shape: "line" },
    ]
  }
  if (chart.kind === "E1") {
    return [
      ...(main ? [{ label: `${main.name} (${mainUnit})`, color: MAIN_COLOR, shape: "line" as const }] : []),
      { label: "Bình quân", color: REFERENCE_COLOR, shape: "line" },
      { label: "Bình quân ± độ lệch chuẩn", color: BAND_COLOR, shape: "band" },
    ]
  }
  if (chart.kind === "E2") {
    return [
      { label: "Dương", color: MAIN_COLOR, shape: "bar" },
      { label: "Âm", color: NEGATIVE_COLOR, shape: "bar" },
    ]
  }
  if (chart.kind === "F2") {
    return [
      ...(main ? [{ label: main.name, color: MAIN_COLOR, shape: "line" as const }] : []),
      { label: `PEG = ${chart.ref ?? 1}`, color: REFERENCE_COLOR, shape: "line" },
    ]
  }
  return [
    ...(main ? [{ label: main.name, color: MAIN_COLOR, shape: "line" as const }] : []),
    { label: "Trung vị giai đoạn", color: REFERENCE_COLOR, shape: "line" },
    { label: "Trung vị ± độ lệch chuẩn", color: BAND_COLOR, shape: "band" },
  ]
}

/** Nội dung hộp số liệu của một kỳ. */
export function figureTooltip(chart: FundamentalChartData, index: number): TooltipContent {
  const main = chart.main[0]
  const mainUnit = mainUnitOf(chart)
  const mainDecimals = mainDecimalsOf(chart)
  const title = chart.kind === "F" ? formatDayLabel(chart.labels[index] ?? "") : (chart.labels[index] ?? "")
  const rows: [string, string][] = []
  for (const series of chart.main) {
    rows.push([series.name, formatWithUnit(series.v[index] ?? null, mainUnit, mainDecimals)])
  }
  if (chart.kind === "D") {
    const cagr = cagrPath(main?.v ?? [], chart.hero)
    rows.push(["Theo CAGR", formatWithUnit(cagr[index] ?? null, mainUnit, mainDecimals)])
  }
  if (chart.kind === "E1") {
    const finite = finiteValues(main?.v ?? [])
    rows.push(["Bình quân", formatWithUnit(finite.length > 0 ? meanOf(finite) : null, mainUnit, mainDecimals)])
  }
  if (chart.kind === "A" || chart.kind === "B" || chart.kind === "C") {
    const subUnit = chart.sub?.unit ?? ""
    for (const series of chart.sub?.series ?? []) {
      rows.push([series.name, formatWithUnit(series.v[index] ?? null, subUnit)])
    }
  }
  if (chart.kind === "F" && main) {
    const finite = finiteValues(main.v)
    rows.push(["Trung vị", formatWithUnit(finite.length > 0 ? medianOf(finite) : null, mainUnit, mainDecimals)])
  }
  return { title, rows }
}

/** Bảng số liệu của các kỳ đang hiện. */
export function figureTable(chart: FundamentalChartData): FigureTable {
  const main = chart.main[0]
  const mainUnit = mainUnitOf(chart)
  const mainDecimals = mainDecimalsOf(chart)
  const mainCells = (index: number) =>
    chart.main.map((series) => formatWithUnit(series.v[index] ?? null, mainUnit, mainDecimals))
  if (chart.kind === "A" || chart.kind === "B" || chart.kind === "C") {
    const subUnit = chart.sub?.unit ?? ""
    const columns = [
      "Kỳ",
      ...chart.main.map((series) => series.name),
      ...(chart.sub?.series ?? []).map((series) => series.name),
    ]
    const rows = chart.labels.map((label, index) => [
      label,
      ...mainCells(index),
      ...(chart.sub?.series ?? []).map((series) => formatWithUnit(series.v[index] ?? null, subUnit)),
    ])
    return { columns, rows }
  }
  if (chart.kind === "D") {
    const cagr = cagrPath(main?.v ?? [], chart.hero)
    const columns = ["Năm", ...chart.main.map((series) => series.name), "Theo CAGR"]
    const rows = chart.labels.map((label, index) => [
      label,
      ...mainCells(index),
      formatWithUnit(cagr[index] ?? null, mainUnit, mainDecimals),
    ])
    return { columns, rows }
  }
  if (chart.kind === "E1" || chart.kind === "E2") {
    const columns = ["Năm", ...chart.main.map((series) => series.name)]
    const rows = chart.labels.map((label, index) => [label, ...mainCells(index)])
    return { columns, rows }
  }
  if (chart.kind === "F") {
    // Chuỗi ngày dài: bảng số ghi một dòng cho mỗi tháng, lấy giá trị cuối tháng (DB-05g).
    const columns = ["Ngày", ...chart.main.map((series) => series.name)]
    const rows = chart.labels.flatMap((label, index) => {
      const next = chart.labels[index + 1]
      if (next && next.slice(0, 7) === label.slice(0, 7)) return []
      return [[formatDayLabel(label), ...mainCells(index)]]
    })
    return { caption: "Giá trị cuối tháng", columns, rows }
  }
  const columns = ["Kỳ", ...chart.main.map((series) => series.name)]
  const rows = chart.labels.map((label, index) => [label, ...mainCells(index)])
  return { columns, rows }
}

/** Biểu đồ có ít nhất một giá trị để vẽ. */
export function hasChartData(chart: FundamentalChartData): boolean {
  return chart.labels.length > 0 && (chart.main[0]?.v ?? []).some((value) => value !== null)
}
