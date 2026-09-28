export const VIETNAM_TIMEZONE = "Asia/Ho_Chi_Minh"

const vietnamDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: VIETNAM_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** `YYYY-MM-DD` in Vietnam local time — the key the news marks are grouped by. */
export function formatVietnamDateKey(date: Date): string {
  const parts = vietnamDateFormatter.formatToParts(date)
  const valueOf = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? ""
  return `${valueOf("year")}-${valueOf("month")}-${valueOf("day")}`
}

/** Unix seconds of 00:00 Vietnam time for a `YYYY-MM-DD` key. */
export function getVietnamDateStartTimestamp(dateKey: string): number {
  return Math.floor(new Date(`${dateKey}T00:00:00+07:00`).getTime() / 1000)
}
