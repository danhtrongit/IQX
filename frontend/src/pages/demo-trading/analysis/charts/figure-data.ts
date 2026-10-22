import { formatDayLabel, formatWithUnit, medianOf, type ChartView } from "../model"

/** Chuỗi chính, chuỗi thứ hai, chuỗi thứ ba (DESIGN.md §2.5). */
export const MAIN_COLOR = "var(--chart-1)"
export const SECOND_COLOR = "var(--chart-6)"
export const THIRD_COLOR = "var(--chart-8)"
/** Đường tham chiếu: nét đứt sáng, trung tính. */
export const REFERENCE_COLOR = "var(--chart-5)"

export const SERIES_COLORS = [MAIN_COLOR, SECOND_COLOR, THIRD_COLOR]

export type LegendItem = { label: string; color: string; shape: "line" | "bar" | "band" }

export type TooltipContent = { title: string; rows: [string, string][] }

/** Kỳ đang rê chuột: vị trí trong chuỗi và toạ độ ngang trong tấm vẽ. */
export type HoverState = { index: number; x: number }

function numbers(values: (number | null)[]): number[] {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
}

/** Đường tăng đều theo CAGR của khuôn D, tính từ năm đầu. */
export function cagrPath(values: (number | null)[], hero: number | null | undefined): (number | null)[] {
  const first = values[0]
  if (typeof first !== "number" || !Number.isFinite(first) || hero === null || hero === undefined) {
    return values.map(() => null)
  }
  const growth = 1 + hero / 100
  return values.map((_, index) => first * growth ** index)
}

/** Vị trí bắt đầu của chuỗi dương liên tục gần nhất (khuôn E2). */
export function streakStart(values: (number | null)[], hero: number | null | undefined): number {
  const streak = typeof hero === "number" ? hero : 0
  return Math.max(0, values.length - streak)
}

/** Chú giải của một biểu đồ theo khuôn của nó. */
export function figureLegend(view: ChartView): LegendItem[] {
  const main = view.main[0]
  if (view.kind === "A" || view.kind === "B" || view.kind === "C") {
    const items: LegendItem[] = main ? [{ label: main.name, color: MAIN_COLOR, shape: "line" }] : []
    for (const [index, series] of (view.sub?.series ?? []).entries()) {
      items.push({ label: series.name, color: SERIES_COLORS[index % SERIES_COLORS.length], shape: "bar" })
    }
    return items
  }
  if (view.kind === "D") {
    return [
      ...(main
        ? [{ label: `${main.name} (${view.mainUnit ?? view.unit})`, color: MAIN_COLOR, shape: "bar" as const }]
        : []),
      { label: "Đường tăng đều theo CAGR", color: REFERENCE_COLOR, shape: "line" },
    ]
  }
  if (view.kind === "E1") {
    return [
      ...(main
        ? [{ label: `${main.name} (${view.mainUnit ?? view.unit})`, color: MAIN_COLOR, shape: "line" as const }]
        : []),
      { label: "Bình quân", color: REFERENCE_COLOR, shape: "line" },
      { label: "Bình quân ± độ lệch chuẩn", color: MAIN_COLOR, shape: "band" },
    ]
  }
  if (view.kind === "E2") {
    return [
      { label: "Dương", color: MAIN_COLOR, shape: "bar" },
      { label: "Âm", color: "var(--price-down)", shape: "bar" },
    ]
  }
  if (view.kind === "F2") {
    return [
      ...(main ? [{ label: main.name, color: MAIN_COLOR, shape: "line" as const }] : []),
      { label: `Tham chiếu = ${view.reference ?? 1}`, color: REFERENCE_COLOR, shape: "line" },
    ]
  }
  return [
    ...(main ? [{ label: main.name, color: MAIN_COLOR, shape: "line" as const }] : []),
    { label: "Trung vị giai đoạn", color: REFERENCE_COLOR, shape: "line" },
    { label: "Trung vị ± độ lệch chuẩn", color: MAIN_COLOR, shape: "band" },
  ]
}

/** Nội dung hộp số liệu của một kỳ. */
export function figureTooltip(view: ChartView, index: number): TooltipContent {
  const main = view.main[0]
  const title = view.kind === "F" ? formatDayLabel(view.labels[index] ?? "") : (view.labels[index] ?? "")
  const rows: [string, string][] = []
  if (main) rows.push([main.name, formatWithUnit(main.v[index] ?? null, view.unit, view.decimals)])
  if (view.kind === "A" || view.kind === "B" || view.kind === "C") {
    for (const series of view.sub?.series ?? []) {
      rows.push([series.name, formatWithUnit(series.v[index] ?? null, view.sub?.unit ?? "", view.decimals)])
    }
  }
  if (view.kind === "F" && main) {
    rows.push(["Trung vị", formatWithUnit(medianOf(numbers(main.v)), view.unit, view.decimals)])
  }
  return { title, rows }
}

/** Bảng số liệu của các kỳ đang hiện. */
export function figureTable(view: ChartView): { columns: string[]; rows: string[][] } {
  const main = view.main[0]
  if (view.kind === "A" || view.kind === "B" || view.kind === "C") {
    const columns = ["Kỳ", ...(main ? [main.name] : []), ...(view.sub?.series ?? []).map((series) => series.name)]
    const rows = view.labels.map((label, index) => [
      label,
      ...(main ? [formatWithUnit(main.v[index] ?? null, view.unit, view.decimals)] : []),
      ...(view.sub?.series ?? []).map((series) =>
        formatWithUnit(series.v[index] ?? null, view.sub?.unit ?? "", view.decimals),
      ),
    ])
    return { columns, rows }
  }
  const columns = [view.kind === "F" ? "Ngày" : "Kỳ", ...(main ? [main.name] : [])]
  if (view.kind === "F") {
    // Chuỗi ngày dài: bảng số ghi một dòng cho mỗi tháng, lấy giá trị cuối.
    const rows = view.labels.flatMap((label, index) => {
      const next = view.labels[index + 1]
      if (next && next.slice(0, 7) === label.slice(0, 7)) return []
      return [[formatDayLabel(label), ...(main ? [formatWithUnit(main.v[index] ?? null, view.unit, view.decimals)] : [])]]
    })
    return { columns, rows }
  }
  const rows = view.labels.map((label, index) => [
    label,
    ...(main ? [formatWithUnit(main.v[index] ?? null, view.unit, view.decimals)] : []),
  ])
  return { columns, rows }
}
