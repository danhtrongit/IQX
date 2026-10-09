/**
 * Display helpers of the Bot tool. Unknown stays "—", never 0. Money arrives as
 * integer strings (VND, no decimals) and is shown in whole đồng.
 */
const DASH = "—"
const NUMBER = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 })
const INTEGER = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })
const RATIO_PERCENT = new Intl.NumberFormat("vi-VN", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" })
const DATE = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" })

/** Finite number from a wire value (`"1500000"`, `1500000`); `null` for missing or non-numeric. */
export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function formatNum(value: number | null | undefined, digits?: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  return digits === undefined ? NUMBER.format(value) : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(value)
}

export function formatInt(value: string | number | null | undefined): string {
  const parsed = toNumber(value)
  return parsed === null ? DASH : INTEGER.format(Math.round(parsed))
}

/** `100.000.000 đ` */
export function formatDong(value: string | number | null | undefined): string {
  const parsed = toNumber(value)
  return parsed === null ? DASH : `${INTEGER.format(Math.round(parsed))} đ`
}

/** Signed đồng amount: `+1.250.000 đ` / `−50.000 đ` / `0 đ`. */
export function formatDongSigned(value: string | number | null | undefined): string {
  const parsed = toNumber(value)
  if (parsed === null) return DASH
  const rounded = Math.round(parsed)
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${INTEGER.format(Math.abs(rounded))} đ`
}

/** Ratio (`0.0123`) to a signed percent (`+1,23%`); zero is `0%`. */
export function formatRatio(value: string | number | null | undefined): string {
  const parsed = toNumber(value)
  return parsed === null ? DASH : RATIO_PERCENT.format(parsed).replace("-", "−")
}

/** Signed percent already scaled (`"2.5"` = `+2,5%`, `"-1.2"` = `−1,2%`, zero is `0%`). */
export function formatPercentSigned(value: string | number | null | undefined): string {
  const parsed = toNumber(value)
  if (parsed === null) return DASH
  const text = NUMBER.format(Math.abs(parsed))
  return parsed > 0 && text !== "0" ? `+${text}%` : parsed < 0 && text !== "0" ? `−${text}%` : "0%"
}

/** Percent already scaled (`12.5` = 12,5%). */
export function formatPercentValue(value: string | number | null | undefined): string {
  const parsed = toNumber(value)
  return parsed === null ? DASH : `${NUMBER.format(parsed)}%`
}

/** Tone of a signed amount, for the market semantic colours (never the only signal). */
export function toneOf(value: string | number | null | undefined): "up" | "down" | "flat" | "unknown" {
  const parsed = toNumber(value)
  if (parsed === null) return "unknown"
  return parsed > 0 ? "up" : parsed < 0 ? "down" : "flat"
}

export const TONE_CLASS: Record<"up" | "down" | "flat" | "unknown", string> = {
  up: "text-price-up",
  down: "text-price-down",
  flat: "text-foreground",
  unknown: "text-muted-foreground",
}

/** `YYYY-MM-DD` (a session date) or an ISO timestamp to `dd/mm/yyyy` in Asia/Ho_Chi_Minh. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return DASH
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? DASH : DATE.format(date)
}
