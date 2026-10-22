/**
 * Dashboard phân tích · phép tính thuần (spec §5, §6, §8, §10).
 *
 * Ở đây không có React và không có I/O: bộ mặc định, cách cắt số kỳ, cách
 * định dạng số kiểu Việt Nam và các số liệu tĩnh của một biểu đồ. Mọi thứ
 * ở đây là hàm thuần để kiểm thử được và để lớp giao diện chỉ lo vẽ.
 */
import type {
  ChartDataEntry,
  ChartKind,
  ChartName,
  ChartSeries,
  PeriodCounts,
  PeriodMode,
  SeriesPoint,
  SubSeries,
} from "./api"

/** Bộ mặc định (spec §6.3): Quý, mỗi biểu đồ 5 kỳ, 6 biểu đồ. */
export const DEFAULT_CHARTS: readonly ChartName[] = [
  "Tăng trưởng doanh thu",
  "Tăng trưởng LNST",
  "Biên lợi nhuận ròng",
  "ROE",
  "D/E",
  "P/E",
]

/** Số kỳ chọn được theo chế độ (spec §5.2). */
export const PERIOD_OPTIONS: Record<PeriodMode, readonly number[]> = {
  q: [4, 5, 8, 12, 20],
  y: [3, 5, 10],
}

export const DEFAULT_PERIOD_COUNT = 5

/** Khuôn cố định theo năm: không có ô số kỳ (spec §5.1). */
export const FIXED_YEAR_KINDS: Partial<Record<ChartKind, boolean>> = { D: true, E1: true, E2: true }

/** Nhãn chế độ kỳ. */
export const PERIOD_LABEL: Record<PeriodMode, string> = { q: "Quý", y: "Năm" }

/** Số kỳ của một biểu đồ trong một chế độ; 5 kỳ khi chưa chọn. */
export function periodCount(nks: PeriodCounts, name: string, per: PeriodMode): number {
  const value = nks[name]?.[per]
  if (value === undefined) return DEFAULT_PERIOD_COUNT
  return PERIOD_OPTIONS[per].includes(value) ? value : DEFAULT_PERIOD_COUNT
}

/** Chỉ giữ phần khác mặc định, đúng như những gì máy chủ cần lưu (spec §6.1). */
export function normalizedPeriodCounts(nks: PeriodCounts): PeriodCounts {
  const out: PeriodCounts = {}
  for (const [name, counts] of Object.entries(nks)) {
    const q = counts.q !== undefined && counts.q !== DEFAULT_PERIOD_COUNT ? counts.q : undefined
    const y = counts.y !== undefined && counts.y !== DEFAULT_PERIOD_COUNT ? counts.y : undefined
    if (q === undefined && y === undefined) continue
    out[name] = { ...(q === undefined ? {} : { q }), ...(y === undefined ? {} : { y }) }
  }
  return out
}

export type DashboardDraft = { charts: ChartName[]; per: PeriodMode; nks: PeriodCounts }

/** Chữ ký của phần số kỳ, không phụ thuộc thứ tự khoá. */
export function nksSignature(nks: PeriodCounts): string {
  return Object.keys(nks)
    .sort()
    .map((name) => {
      const counts = nks[name]
      return `${name}:${counts.q ?? DEFAULT_PERIOD_COUNT}:${counts.y ?? DEFAULT_PERIOD_COUNT}`
    })
    .join("|")
}

/** Hai thiết lập có cùng nội dung không (dùng để biết đã lưu hay chưa). */
export function isSameSettings(a: DashboardDraft, b: DashboardDraft): boolean {
  if (a.per !== b.per) return false
  if (a.charts.length !== b.charts.length) return false
  if (!a.charts.every((name, index) => name === b.charts[index])) return false
  return nksSignature(a.nks) === nksSignature(b.nks)
}

/** Bộ mặc định của spec: 6 biểu đồ, Quý, 5 kỳ. */
export const DEFAULT_DRAFT: DashboardDraft = { charts: [...DEFAULT_CHARTS], per: "q", nks: {} }

/** Cắt chuỗi còn lại số kỳ gần nhất (spec §5.2). */
export function cutSeries(series: ChartSeries, count: number): ChartSeries {
  const keep = Math.max(0, Math.min(count, series.labels.length))
  const cut = <T,>(values: T[]): T[] => values.slice(values.length - keep)
  const sub = series.sub
    ? {
        unit: series.sub.unit,
        type: series.sub.type,
        series: series.sub.series.map((point) => ({ name: point.name, v: cut(point.v) })),
      }
    : undefined
  return {
    labels: cut(series.labels),
    main: series.main.map((point) => ({ name: point.name, v: cut(point.v) })),
    ...(sub ? { sub } : {}),
  }
}

/** Số chữ số thập phân theo đơn vị (spec §10). */
export function decimalsForUnit(unit: string): number {
  if (unit === "%" || unit === "điểm %") return 1
  if (unit === "lần") return 2
  return 0
}

const formatters = new Map<number, Intl.NumberFormat>()

/** Số kiểu Việt Nam: dấu phẩy thập phân, dấu chấm hàng nghìn. */
export function formatNumber(value: number | null | undefined, decimals: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  let formatter = formatters.get(decimals)
  if (!formatter) {
    formatter = new Intl.NumberFormat("vi-VN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    formatters.set(decimals, formatter)
  }
  return formatter.format(value)
}

/** Số kèm đơn vị; kỳ không tính được ghi "—" chứ không phải 0. */
export function formatWithUnit(
  value: number | null | undefined,
  unit: string,
  decimals: number,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  const text = formatNumber(value, decimals)
  if (unit === "%") return `${text}%`
  if (unit === "lần") return `${text} lần`
  return unit ? `${text} ${unit}` : text
}

export function meanOf(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Độ lệch chuẩn tổng thể của giai đoạn đang hiện. */
export function stdDevOf(values: readonly number[]): number {
  if (values.length === 0) return 0
  const mean = meanOf(values)
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/** Chuỗi một biểu đồ đã cắt, sẵn sàng để vẽ. */
export type ChartView = {
  name: string
  kind: ChartKind
  unit: string
  decimals: number
  labels: string[]
  main: SeriesPoint[]
  sub?: SubSeries
  /** Đường tham chiếu cố định (khuôn F2: PEG = 1). */
  reference?: number
  /** Giá trị tóm tắt mà máy chủ tính sẵn (khuôn D, E1, E2). */
  hero?: number | null
  mainUnit?: string
}

/** Số liệu của một biểu đồ theo khuôn, đã cắt theo số kỳ của chế độ đang dùng. */
export function chartView(
  entry: ChartDataEntry,
  per: PeriodMode,
  count: number,
): ChartView {
  if (FIXED_YEAR_KINDS[entry.kind] === true) {
    return {
      name: entry.name,
      kind: entry.kind,
      unit: entry.unit,
      decimals: entry.decimals,
      labels: entry.labels ?? [],
      main: entry.main ?? [],
      mainUnit: entry.mainUnit,
      hero: entry.hero ?? null,
      ...(entry.ref === undefined ? {} : { reference: entry.ref }),
    }
  }
  const series = entry[per]
  if (!series) {
    return {
      name: entry.name,
      kind: entry.kind,
      unit: entry.unit,
      decimals: entry.decimals,
      labels: [],
      main: [],
      ...(entry.ref === undefined ? {} : { reference: entry.ref }),
    }
  }
  const cut = cutSeries(series, count)
  return {
    name: entry.name,
    kind: entry.kind,
    unit: entry.unit,
    decimals: entry.decimals,
    labels: cut.labels,
    main: cut.main,
    ...(cut.sub ? { sub: cut.sub } : {}),
    ...(entry.ref === undefined ? {} : { reference: entry.ref }),
  }
}

/** Lùi `months` tháng kể từ một ngày, giữ nguyên định dạng YYYY-MM-DD. */
export function subtractMonths(date: string, months: number): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  const day = parsed.getUTCDate()
  parsed.setUTCDate(1)
  parsed.setUTCMonth(parsed.getUTCMonth() - months)
  const lastDay = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)).getUTCDate()
  parsed.setUTCDate(Math.min(day, lastDay))
  return parsed.toISOString().slice(0, 10)
}

/** Số tháng của một khoảng thời gian tính lùi (quý: n × 3 tháng, năm: n năm). */
export function windowMonths(count: number, per: PeriodMode): number {
  return per === "q" ? count * 3 : count * 12
}

/** Vị trí đầu tiên của khoảng thời gian tính lùi trong dãy ngày. */
export function dailyWindowStart(dates: readonly string[], months: number): number {
  if (dates.length === 0) return 0
  const start = subtractMonths(dates[dates.length - 1], months)
  const index = dates.findIndex((date) => date >= start)
  return index < 0 ? 0 : index
}

/** Ngày bắt đầu để xin chuỗi định giá (chừa vài ngày cho phiên gần nhất). */
export function valuationFrom(months: number, today: Date): string {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  start.setUTCMonth(start.getUTCMonth() - months)
  return start.toISOString().slice(0, 10)
}

export type DailyAxis = {
  /** Vị trí trong dãy ngày được ghi nhãn. */
  indexes: number[]
  /** Cách viết nhãn của một ngày. */
  format: (date: string) => string
}

/**
 * Mốc trục ngang của chuỗi ngày (spec §5.3): độ dài khoảng thời gian quyết
 * định mốc nào được ghi và mốc được viết ra sao.
 */
export function dailyAxis(dates: readonly string[]): DailyAxis {
  if (dates.length === 0) return { indexes: [], format: (date) => `${date.slice(5, 7)}/${date.slice(2, 4)}` }
  const first = Date.parse(`${dates[0]}T00:00:00Z`)
  const last = Date.parse(`${dates[dates.length - 1]}T00:00:00Z`)
  const years = Number.isFinite(first) && Number.isFinite(last) ? (last - first) / (365.25 * 86_400_000) : 0
  const quarterMonths = ["01", "04", "07", "10"]
  const halfMonths = ["01", "07"]
  const months = years <= 1.3 ? quarterMonths : years <= 3.5 ? halfMonths : ["01"]
  const evenYearsOnly = years > 6.5
  const indexes: number[] = []
  dates.forEach((date, index) => {
    if (index === 0) return
    const month = date.slice(5, 7)
    if (!months.includes(month)) return
    if (dates[index - 1].slice(5, 7) === month) return
    if (evenYearsOnly && Number(date.slice(0, 4)) % 2 !== 0) return
    indexes.push(index)
  })
  return {
    indexes,
    format: months.length === 1 ? (date) => date.slice(0, 4) : (date) => `${date.slice(5, 7)}/${date.slice(2, 4)}`,
  }
}

/** Nhãn ngày đầy đủ cho hộp số liệu: dd/mm/yy. */
export function formatDayLabel(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(2, 4)}`
}
