/**
 * Formatters for the stock detail page.
 *
 * Money arrives in three different units and mixing them is the classic bug:
 *  - price board (`/market-data/trading/price-board`) → **nghìn đồng**
 *  - fundamentals / BCTC / reports → **đồng** (raw VND)
 *  - KBS report cells → đồng, displayed in **tỷ đồng**
 * Each helper states its unit in its name or doc so call sites stay honest.
 */
import type { BctcAi, BctcStatus } from "./types"

/** Rounded đồng with locale separators. */
export function fmtVnd(value: number): string {
  return Math.round(value).toLocaleString("en-US")
}

/** Large VND amount → "X nghìn tỷ / X tỷ / X triệu". */
export function fmtBillion(value: number | null | undefined): string {
  if (!value) return "—"
  if (Math.abs(value) >= 1e12) return (value / 1e12).toFixed(0) + " nghìn tỷ"
  if (Math.abs(value) >= 1e9) return (value / 1e9).toFixed(1) + " tỷ"
  if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(1) + " triệu"
  return fmtVnd(value)
}

/** Ratio value already in fraction units → "X.XX%". */
export function fmtPctFraction(value: number | null | undefined, multiplied = true): string {
  if (value == null) return "—"
  const pct = multiplied ? value * 100 : value
  return pct.toFixed(2) + "%"
}

/** Compact (M/K) for axis ticks. */
export function fmtCompactShort(value: number): string {
  if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(0) + "M"
  if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(0) + "K"
  return String(value)
}

/** Raw VND revenue/profit → "X tỷ / X tr / X K". */
export function fmtRatioVal(value: number | null | undefined): string {
  if (value == null) return "—"
  const abs = Math.abs(value)
  if (abs >= 1e12) return (value / 1e9).toLocaleString("en-US", { maximumFractionDigits: 0 }) + " tỷ"
  if (abs >= 1e9) return (value / 1e9).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " tỷ"
  if (abs >= 1e6) return (value / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 }) + " tr"
  if (abs >= 1e3) return (value / 1e3).toLocaleString("en-US", { maximumFractionDigits: 0 }) + "K"
  return fmtVnd(value)
}

/** KBS report cell (đồng) → tỷ đồng with 2 decimals. */
export function fmtReport(value: number | null | undefined): string {
  if (value == null) return "—"
  if (value === 0) return "0"
  const abs = Math.abs(value)
  const scaled = abs >= 1e9 ? value / 1e9 : abs >= 1e6 ? value / 1e6 : value
  return scaled.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function fmtPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—"
  return `${(value * 100).toFixed(digits)}%`
}

export function fmtMultiple(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—"
  const sign = value < 0 ? "−" : ""
  return `${sign}${Math.abs(value).toFixed(digits)}×`
}

export function fmtNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—"
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Signed percentage-point from a fraction delta, e.g. 0.018 → "+1.8pp". */
export function fmtSignedPp(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—"
  const pp = value * 100
  const sign = pp > 0 ? "+" : pp < 0 ? "−" : ""
  return `${sign}${Math.abs(pp).toFixed(digits)}pp`
}

/** Signed plain number, e.g. 0.09 → "+0.09", -0.01 → "−0.01". */
export function fmtSignedNum(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—"
  const sign = value > 0 ? "+" : value < 0 ? "−" : ""
  return `${sign}${Math.abs(value).toFixed(digits)}`
}

/** Tone for a forensic status badge — colours come from the OHLC tokens. */
export const STATUS_TONE_CLASS: Record<BctcStatus, string> = {
  green: "border-price-up/30 bg-price-up/10 text-price-up",
  red: "border-price-down/30 bg-price-down/10 text-price-down",
  amber: "border-price-ref/30 bg-price-ref/10 text-price-ref",
  na: "border-border bg-muted text-muted-foreground",
}

export function statusLabel(status: BctcStatus): string {
  return { green: "Xanh", amber: "Vàng", red: "Đỏ", na: "N/A" }[status]
}

/** Module note overlay from the premium BCTC AI payload. */
export function moduleNote(
  ai: BctcAi | null | undefined,
  id: string,
): string {
  return ai?.modules?.[id] ?? ""
}

export function hasAnyAi(ai: BctcAi | null | undefined): boolean {
  if (!ai) return false
  return Boolean(ai.memo?.trim()) || Object.values(ai.modules ?? {}).some((note) => note?.trim())
}
