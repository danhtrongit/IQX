/**
 * Display helpers of the Chiến lược page. Unknown stays "—", never 0. Percent values from the
 * strategy API are already in percentage points (12.3 = 12,3%), never ratios.
 */
const DASH = "—"
const HCM = "Asia/Ho_Chi_Minh"

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

export function fmtNumber(value: number | null | undefined, digits = 2): string {
  return isNumber(value) ? value.toLocaleString("vi-VN", { maximumFractionDigits: digits }) : DASH
}

export function fmtInt(value: number | null | undefined): string {
  return isNumber(value) ? Math.round(value).toLocaleString("vi-VN") : DASH
}

/** Signed percent from a value already in percentage points (`+12,30%`, `−4,10%`). */
export function fmtSignedPercent(value: number | null | undefined, digits = 2): string {
  if (!isNumber(value)) return DASH
  const text = Math.abs(value).toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits })
  if (value > 0) return `+${text}%`
  if (value < 0) return `−${text}%`
  return `${text}%`
}

/** Unsigned percent (win rate) from percentage points. */
export function fmtPercent(value: number | null | undefined, digits = 1): string {
  return isNumber(value) ? `${value.toLocaleString("vi-VN", { maximumFractionDigits: digits })}%` : DASH
}

/** `100.000.000 đ` */
export function fmtVnd(value: number | null | undefined): string {
  return isNumber(value) ? `${Math.round(value).toLocaleString("vi-VN")} đ` : DASH
}

export function fmtSignedVnd(value: number | null | undefined): string {
  if (!isNumber(value)) return DASH
  const rounded = Math.round(value)
  const text = Math.abs(rounded).toLocaleString("vi-VN")
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${text} đ`
}

/** `YYYY-MM-DD` or an ISO timestamp to `dd/mm/yyyy` (timestamps in Asia/Ho_Chi_Minh). */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return DASH
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return DASH
  return new Intl.DateTimeFormat("vi-VN", { timeZone: HCM, day: "2-digit", month: "2-digit", year: "numeric" }).format(date)
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return DASH
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return DASH
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: HCM,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function tone(value: number | null | undefined): "up" | "down" | null {
  if (!isNumber(value) || value === 0) return null
  return value > 0 ? "up" : "down"
}

export const TONE_CLASS: Record<"up" | "down", string> = { up: "text-price-up", down: "text-price-down" }

export function toneClass(value: number | null | undefined): string {
  const current = tone(value)
  return current ? TONE_CLASS[current] : ""
}

/** First characters of a hash, for evidence lines. */
export function shortHash(hash: string | null | undefined, length = 8): string {
  return hash ? hash.slice(0, length) : DASH
}

/** Today in Asia/Ho_Chi_Minh as `YYYY-MM-DD` (used only as the default "to" date of a backtest). */
export function todayInVietnam(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: HCM, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
  return parts
}
