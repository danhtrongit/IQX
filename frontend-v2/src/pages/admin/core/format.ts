/**
 * Display helpers for the admin core surfaces.
 *
 * Money and timestamps use the app-wide formatters in `@/lib/format`; these are
 * only the shapes that file does not cover: compact axis ticks, day-only labels
 * for the revenue series and relative times for scheduler/IPN rows.
 */

const compactValue = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 })
const dayShort = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" })
const dayFull = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
const relativeTime = new Intl.RelativeTimeFormat("vi", { numeric: "auto", style: "short" })

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
]

/** `1500000000` → `1,5 T` — for chart axes and KPI hints. */
export function formatCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${compactValue.format(value / 1_000_000_000)} T`
  if (abs >= 1_000_000) return `${compactValue.format(value / 1_000_000)} Tr`
  if (abs >= 1_000) return `${compactValue.format(value / 1_000)} N`
  return String(value)
}

/**
 * `YYYY-MM-DD` (the revenue series' day key) → `22/09`. Parsed as a local day so
 * the label never shifts by a timezone offset.
 */
export function formatDay(value: string | null | undefined, withYear = false): string {
  if (!value) return "—"
  const [year, month, date] = value.split("-").map(Number)
  if (!year || !month || !date) return value
  const parsed = new Date(year, month - 1, date)
  return (withYear ? dayFull : dayShort).format(parsed)
}

/** `3 giờ trước` / `trong 12 phút` — for "lần chạy tiếp theo" and last-IPN rows. */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return "—"
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return "—"
  const delta = timestamp - Date.now()
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(delta) >= ms) return relativeTime.format(Math.round(delta / ms), unit)
  }
  return relativeTime.format(Math.round(delta / 1000), "second")
}
