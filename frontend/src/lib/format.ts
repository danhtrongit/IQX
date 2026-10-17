const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 })
const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 })
const percent = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2, signDisplay: "exceptZero" })
const dateTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" })

export function formatMoney(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : money.format(value)
}

export function formatNumber(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : number.format(value)
}

export function formatPercent(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${percent.format(value)}%`
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : dateTime.format(date)
}

/** Nhãn thay cho mốc hết hạn năm 9999 của Premium trọn đời (DECISION 4). */
export const LIFETIME_LABEL = "Trọn đời"

/**
 * Grant trọn đời được lưu với `ends_at` năm 9999 (`LIFETIME_THRESHOLD` của backend là
 * `>= 9999-01-01`). Mọi nơi hiển thị hạn Premium phải hiện "Trọn đời" thay cho ngày đó.
 */
export function isLifetimeEnd(value: string | null | undefined): boolean {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.getUTCFullYear() >= 9999
}

/** Hạn Premium để hiển thị: "Trọn đời" cho mốc năm 9999, còn lại theo `format`. */
export function formatPremiumEnd(
  value: string | null | undefined,
  format: (value: string | null | undefined) => string = formatDateTime,
): string {
  return isLifetimeEnd(value) ? LIFETIME_LABEL : format(value)
}
