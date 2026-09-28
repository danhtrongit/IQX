/**
 * Board formatters + colour helpers for /co-phieu and /bang-gia.
 *
 * Number spelling follows the Vietnamese board convention (not `vi-VN`'s
 * default): prices keep two decimals with a dot (`73.40`), volumes group with
 * commas (`103,600`, `1,250,000`). That is the spelling traders read on
 * iBoard/SSI, and it matches the legacy board formatters one-for-one.
 *
 * Prices arrive in the x1000 convention (xem `market/types.ts`), so `fmtPrice`
 * prints the number as-is; `fmtValueBil` formats absolute VND in tỷ.
 */
import type { PriceBoardRow } from "./types"

/** Printed for "no data" — never coerce a missing number to 0. */
export const DASH = "—"

const price = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const signedPrice = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
})
const volume = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const clock = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

/** Price (x1000 convention) → "73.40"; 0 or null → "—". */
export function fmtPrice(value: number | null | undefined): string {
  return value == null || value <= 0 ? DASH : price.format(value)
}

/** Share volume → "103,600"; 0 or null → "—". */
export function fmtVolume(value: number | null | undefined): string {
  return value == null || value <= 0 ? DASH : volume.format(Math.round(value))
}

/** Absolute VND → "1.2" (tỷ) / "850" (triệu) so a column never overflows. */
export function fmtValueBil(value: number | null | undefined): string {
  if (value == null || value <= 0) return DASH
  if (value >= 1e9) return (value / 1e9).toLocaleString("en-US", { maximumFractionDigits: 1 })
  if (value >= 1e6) return (value / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })
  return volume.format(Math.round(value))
}

/** Share volume → "12.5" in triệu CP (index/board turnover columns). */
export function fmtMillion(value: number | null | undefined): string {
  if (value == null || value <= 0) return DASH
  return (value / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })
}

/** Signed price change (x1000 convention) → "+0.35" / "-1.20". */
export function fmtChange(value: number | null | undefined): string {
  return value == null ? DASH : signedPrice.format(value)
}

/** Signed percent → "+1.25%". */
export function fmtPercent(value: number | null | undefined): string {
  return value == null ? DASH : `${signedPrice.format(value)}%`
}

/** Index points → "1,245.67". */
export function fmtIndex(value: number | null | undefined): string {
  return value == null || value <= 0 ? DASH : price.format(value)
}

/**
 * Source timestamp → "14:32:05" in local time.
 * Accepts an ISO instant (the backend's `meta.as_of`), a bare clock string and
 * the upstream's `YYYY-MM-DD HH:mm:ss` spelling; anything unparsable prints as-is.
 */
export function fmtClock(value: string | null | undefined): string {
  if (!value) return DASH
  const bare = /^\d{2}:\d{2}(:\d{2})?$/.test(value)
  if (bare) return value.length === 5 ? `${value}:00` : value
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? value.replace(" ", "T") : value
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? value : clock.format(date)
}

/** Epoch ms → "14:32:05" (local time). */
export function fmtTimeOfDay(value: number | null | undefined): string {
  return value ? clock.format(new Date(value)) : DASH
}

/** Colour of a price cell relative to the ticker's reference/ceiling/floor. */
export function priceTone(value: number, row: PriceBoardRow): string {
  if (value <= 0) return "text-muted-foreground"
  if (row.ceilingPrice > 0 && value >= row.ceilingPrice) return "text-price-ceiling"
  if (row.floorPrice > 0 && value <= row.floorPrice) return "text-price-floor"
  if (row.referencePrice > 0 && value === row.referencePrice) return "text-price-ref"
  if (row.referencePrice > 0 && value > row.referencePrice) return "text-price-up"
  if (row.referencePrice > 0 && value < row.referencePrice) return "text-price-down"
  return "text-foreground"
}

/** Colour of the day-change cells (+/- and %) — tham chiếu khi chưa khớp. */
export function changeTone(row: PriceBoardRow): string {
  if (!row.hasTraded) return "text-price-ref"
  if (row.priceChange > 0) return "text-price-up"
  if (row.priceChange < 0) return "text-price-down"
  return "text-price-ref"
}

/** Colour of a signed index change. */
export function signTone(value: number): string {
  if (value > 0) return "text-price-up"
  if (value < 0) return "text-price-down"
  return "text-price-ref"
}
