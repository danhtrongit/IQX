export const VIETNAM_TIMEZONE = "Asia/Ho_Chi_Minh"

const vietnamDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: VIETNAM_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function getVietnamDateParts(date: Date) {
  const parts = vietnamDateFormatter.formatToParts(date)
  const valueOf = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? ""

  return {
    year: valueOf("year"),
    month: valueOf("month"),
    day: valueOf("day"),
  }
}

export function formatVietnamDateKey(date: Date): string {
  const { year, month, day } = getVietnamDateParts(date)
  return `${year}-${month}-${day}`
}

export function formatVietnamDateParam(date: Date): string {
  const { year, month, day } = getVietnamDateParts(date)
  return `${day}-${month}-${year}`
}

export function getVietnamDateStartTimestamp(dateKey: string): number {
  return Math.floor(new Date(`${dateKey}T00:00:00+07:00`).getTime() / 1000)
}
