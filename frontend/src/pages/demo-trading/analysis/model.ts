/**
 * Dashboard phân tích · phép tính thuần (spec §5, §6, §8, §10).
 *
 * Ở đây không có React và không có I/O: bộ mặc định, cách cắt số kỳ và
 * khoảng thời gian của biểu đồ định giá. Định dạng số và hình vẽ nằm ở bộ
 * khuôn dùng chung `@/components/fundamental-charts`. Mọi thứ
 * ở đây là hàm thuần để kiểm thử được và để lớp giao diện chỉ lo vẽ.
 */
import { FIXED_YEAR_KINDS, type FundamentalChartData } from "@/components/fundamental-charts"

import type { ChartDataEntry, ChartName, ChartSeries, PeriodCounts, PeriodMode } from "./api"

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
  const normalized = normalizedPeriodCounts(nks)
  return Object.keys(normalized)
    .sort()
    .map((name) => {
      const counts = normalized[name]
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

/** Chuỗi một biểu đồ đã cắt, sẵn sàng để vẽ: đúng mô hình của bộ khuôn dùng chung. */
export type ChartView = FundamentalChartData

/**
 * Ghi chú định nghĩa dưới chú giải (`legend_note` của API, DB-06). Đọc mềm để không phụ thuộc
 * phiên bản hợp đồng: thiếu trường hay không phải chuỗi thì không có ghi chú.
 */
export function legendNoteOf(entry: ChartDataEntry): { legendNote: string } | Record<string, never> {
  const value = "legend_note" in entry ? entry.legend_note : undefined
  return typeof value === "string" && value.trim() ? { legendNote: value } : {}
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
      ...(entry.mainUnit === undefined ? {} : { mainUnit: entry.mainUnit }),
      hero: entry.hero ?? null,
      ...(entry.ref === undefined ? {} : { ref: entry.ref }),
      ...legendNoteOf(entry),
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
      ...(entry.ref === undefined ? {} : { ref: entry.ref }),
      ...legendNoteOf(entry),
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
    ...(entry.ref === undefined ? {} : { ref: entry.ref }),
    ...legendNoteOf(entry),
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
