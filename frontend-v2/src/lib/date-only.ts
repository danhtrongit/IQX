/** Date-only API values are calendar dates, so never convert them through UTC. */
export function parseISODate(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : undefined
}

export function formatISODate(value: Date | undefined): string {
  if (!value) return ""
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
}

export function formatDateLabel(value: string | undefined): string {
  const date = parseISODate(value)
  return date ? new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date) : "Chọn ngày"
}
