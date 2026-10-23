/**
 * Định dạng số kiểu Việt Nam và thống kê nhỏ của bộ khuôn (spec §5.3, §10).
 * Hàm thuần, không có React.
 */

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
  decimals: number = decimalsForUnit(unit),
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

/** Các giá trị số hữu hạn của một chuỗi (bỏ kỳ trống). */
export function finiteValues(values: readonly (number | null | undefined)[]): number[] {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
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
