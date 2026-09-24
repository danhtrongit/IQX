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
