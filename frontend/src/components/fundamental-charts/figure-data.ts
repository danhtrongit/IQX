import {
  decimalsForUnit,
  formatDayLabel,
  formatWithUnit,
  meanOf,
  medianOf,
  type ChartView,
} from "../model"

export { decimalsForUnit }

/** Chuỗi chính, chuỗi thứ hai, chuỗi thứ ba (spec §9 & MAU.html:9). */
export const MAIN_COLOR = "var(--chart-1)"
export const SECOND_COLOR = "#d95926"
export const THIRD_COLOR = "#199e70"
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
      { label: `PEG = ${view.reference ?? 1}`, color: REFERENCE_COLOR, shape: "line" },
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
  const mainUnit = view.mainUnit ?? view.unit
  const mainDecimals = view.mainUnit ? decimalsForUnit(view.mainUnit) : view.decimals
  const title = view.kind === "F" ? formatDayLabel(view.labels[index] ?? "") : (view.labels[index] ?? "")
  const rows: [string, string][] = []
  for (const series of view.main) {
    rows.push([series.name, formatWithUnit(series.v[index] ?? null, mainUnit, mainDecimals)])
  }
  if (view.kind === "D") {
    const cagr = cagrPath(main?.v ?? [], view.hero)
    rows.push(["Theo CAGR", formatWithUnit(cagr[index] ?? null, mainUnit, mainDecimals)])
  }
  if (view.kind === "E1") {
    const finite = numbers(main?.v ?? [])
    const m0 = finite.length > 0 ? meanOf(finite) : null
    rows.push(["Bình quân", formatWithUnit(m0, mainUnit, mainDecimals)])
  }
  if (view.kind === "A" || view.kind === "B" || view.kind === "C") {
    const subUnit = view.sub?.unit ?? ""
    const subDecimals = decimalsForUnit(subUnit)
    for (const series of view.sub?.series ?? []) {
      rows.push([series.name, formatWithUnit(series.v[index] ?? null, subUnit, subDecimals)])
    }
  }
  if (view.kind === "F" && main) {
    const finite = numbers(main.v)
    rows.push([
      "Trung vị",
      formatWithUnit(finite.length > 0 ? medianOf(finite) : null, mainUnit, mainDecimals),
    ])
  }
  return { title, rows }
}

/** Bảng số liệu của các kỳ đang hiện. */
export function figureTable(view: ChartView): { columns: string[]; rows: string[][] } {
  const main = view.main[0]
  const mainUnit = view.mainUnit ?? view.unit
  const mainDecimals = view.mainUnit ? decimalsForUnit(view.mainUnit) : view.decimals
  if (view.kind === "A" || view.kind === "B" || view.kind === "C") {
    const subUnit = view.sub?.unit ?? ""
    const subDecimals = decimalsForUnit(subUnit)
    const columns = [
      "Kỳ",
      ...view.main.map((series) => series.name),
      ...(view.sub?.series ?? []).map((series) => series.name),
    ]
    const rows = view.labels.map((label, index) => [
      label,
      ...view.main.map((series) => formatWithUnit(series.v[index] ?? null, mainUnit, mainDecimals)),
      ...(view.sub?.series ?? []).map((series) =>
        formatWithUnit(series.v[index] ?? null, subUnit, subDecimals),
      ),
    ])
    return { columns, rows }
  }
  if (view.kind === "D") {
    const cagr = cagrPath(main?.v ?? [], view.hero)
    const columns = ["Năm", ...view.main.map((series) => series.name), "Theo CAGR"]
    const rows = view.labels.map((label, index) => [
      label,
      ...view.main.map((series) => formatWithUnit(series.v[index] ?? null, mainUnit, mainDecimals)),
      formatWithUnit(cagr[index] ?? null, mainUnit, mainDecimals),
    ])
    return { columns, rows }
  }
  if (view.kind === "E1" || view.kind === "E2") {
    const columns = ["Năm", ...view.main.map((series) => series.name)]
    const rows = view.labels.map((label, index) => [
      label,
      ...view.main.map((series) => formatWithUnit(series.v[index] ?? null, mainUnit, mainDecimals)),
    ])
    return { columns, rows }
  }
  const columns = [view.kind === "F" ? "Ngày" : "Kỳ", ...view.main.map((series) => series.name)]
  if (view.kind === "F") {
    // Chuỗi ngày dài: bảng số ghi một dòng cho mỗi tháng, lấy giá trị cuối.
    const rows = view.labels.flatMap((label, index) => {
      const next = view.labels[index + 1]
      if (next && next.slice(0, 7) === label.slice(0, 7)) return []
      return [
        [
          formatDayLabel(label),
          ...view.main.map((series) => formatWithUnit(series.v[index] ?? null, mainUnit, mainDecimals)),
        ],
      ]
    })
    return { columns, rows }
  }
  const rows = view.labels.map((label, index) => [
    label,
    ...view.main.map((series) => formatWithUnit(series.v[index] ?? null, mainUnit, mainDecimals)),
  ])
  return { columns, rows }
}
