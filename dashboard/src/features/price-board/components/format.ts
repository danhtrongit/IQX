import type { PriceBoardData } from "@/features/market-data"

/**
 * Bảng giá formatters + color helpers (vi-VN locale everywhere).
 * Prices live in "nghìn đồng" (x1000) convention — same as PriceBoardData.
 */

/** Price in x1000 convention → "73,40". */
export function fmtK(n: number | null | undefined): string {
  if (n == null || n <= 0) return "—"
  return n.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Share volume → integer with locale grouping (103600 → "103.600"). */
export function fmtVol(n: number | null | undefined): string {
  if (!n) return "—"
  return Math.round(n).toLocaleString("vi-VN")
}

/** Large VND value → "tỷ" units. */
export function fmtBil(n: number | null | undefined): string {
  if (!n) return "—"
  if (n >= 1e9) return (n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })
  if (n >= 1e6) return (n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 2 })
  return Math.round(n).toLocaleString("vi-VN")
}

/** Signed price change in x1000 convention → "+0,35" / "-1,20". */
export function fmtChange(n: number): string {
  const sign = n > 0 ? "+" : ""
  return sign + n.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Signed percent → "+1,25%". */
export function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : ""
  return `${sign}${n.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

/** Index points → "1.245,67". */
export function fmtIndex(n: number | null | undefined): string {
  if (n == null || n <= 0) return "—"
  return n.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Share volume → "triệu CP" units (1 decimal). */
export function fmtTrieu(n: number | null | undefined): string {
  if (!n) return "—"
  return (n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })
}

/** Color class for a price cell relative to reference/ceiling/floor. */
export function priceTone(price: number, p: PriceBoardData): string {
  if (price <= 0) return "text-[var(--color-text-3)]"
  if (p.ceilingPrice && price >= p.ceilingPrice) return "text-ceiling"
  if (p.floorPrice && price <= p.floorPrice) return "text-floor"
  if (p.referencePrice && price === p.referencePrice) return "text-reference"
  if (p.referencePrice && price > p.referencePrice) return "text-up"
  if (p.referencePrice && price < p.referencePrice) return "text-down"
  return "text-[var(--color-text-1)]"
}

/** Color class for the day-change cells (+/- and %). */
export function changeTone(p: PriceBoardData): string {
  if (!p.hasTraded) return "text-reference"
  if (p.priceChange > 0) return "text-up"
  if (p.priceChange < 0) return "text-down"
  return "text-reference"
}

/** Color class for a signed index change. */
export function signTone(n: number): string {
  if (n > 0) return "text-up"
  if (n < 0) return "text-down"
  return "text-reference"
}
