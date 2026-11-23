import type { PriceTone, SignedTone } from "./types"

export const UNICODE_MINUS = "\u2212"
export const MISSING_VALUE = "—"
export const MAX_PAGE_NAME_LENGTH = 30
const DUPLICATE_PAGE_SUFFIX = " (bản sao)"
const PRICE_EPSILON = 1e-6

function formatMagnitudeVi(absValue: number, decimals: number): string {
  const safeDecimals = Math.max(0, Math.min(8, Math.trunc(decimals)))
  const fixed = absValue.toFixed(safeDecimals)
  const [intRaw, fracRaw] = fixed.split(".")
  const intFormatted = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return fracRaw !== undefined ? `${intFormatted},${fracRaw}` : intFormatted
}

function isZeroAtPrecision(value: number, decimals: number): boolean {
  const safeDecimals = Math.max(0, Math.min(8, Math.trunc(decimals)))
  return Number(Math.abs(value).toFixed(safeDecimals)) === 0
}

export function formatNum(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return MISSING_VALUE
  const isZero = isZeroAtPrecision(n, decimals)
  const sign = !isZero && n < 0 ? UNICODE_MINUS : ""
  return `${sign}${formatMagnitudeVi(isZero ? 0 : Math.abs(n), decimals)}`
}

export function formatSigned(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return MISSING_VALUE
  const isZero = isZeroAtPrecision(n, decimals)
  const sign = isZero ? "" : n > 0 ? "+" : UNICODE_MINUS
  return `${sign}${formatMagnitudeVi(isZero ? 0 : Math.abs(n), decimals)}`
}

export function formatPct(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return MISSING_VALUE
  return `${formatSigned(n, decimals)}%`
}

export function formatBillion(
  n: number | null | undefined,
  decimals = 1,
  options?: { signed?: boolean; includeUnit?: boolean },
): string {
  if (n == null || !Number.isFinite(n)) return MISSING_VALUE
  const signed = options?.signed ?? false
  const includeUnit = options?.includeUnit ?? true
  const numStr = signed ? formatSigned(n, decimals) : formatNum(n, decimals)
  return includeUnit ? `${numStr} tỷ` : numStr
}

export function formatIndexPrice(n: number | null | undefined): string {
  return formatNum(n, 2)
}

/** Formats stock price expressed in thousand VND with 2 decimals (e.g. `20,35`). */
export function formatStockPrice(n: number | null | undefined): string {
  return formatNum(n, 2)
}

/** Formats derivative futures price with 1 decimal (e.g. `1.800,7`). */
export function formatFuturesPrice(n: number | null | undefined): string {
  return formatNum(n, 1)
}

export function formatInt(n: number | null | undefined): string {
  return formatNum(n, 0)
}

export function formatDayMonth(isoDate: string): string {
  const trimmed = isoDate.trim()
  if (!trimmed) return MISSING_VALUE

  const isoPrefix = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)
  if (isoPrefix) {
    return `${isoPrefix[3]}/${isoPrefix[2]}`
  }

  const slashPrefix = /^(\d{2})\/(\d{2})(?:\/\d{4})?$/.exec(trimmed)
  if (slashPrefix) {
    return `${slashPrefix[1]}/${slashPrefix[2]}`
  }

  const parsed = Date.parse(trimmed)
  if (!Number.isFinite(parsed)) return MISSING_VALUE
  const vnDate = new Date(parsed + 7 * 3_600_000)
  const dd = String(vnDate.getUTCDate()).padStart(2, "0")
  const mm = String(vnDate.getUTCMonth() + 1).padStart(2, "0")
  return `${dd}/${mm}`
}

export function formatSessionLabel(isoDate: string): string {
  const dm = formatDayMonth(isoDate)
  return dm === MISSING_VALUE ? MISSING_VALUE : `Phiên ${dm}`
}

export function formatRelativeTimeVi(
  isoTimestamp: string,
  now: Date | number = Date.now(),
): string {
  const targetMs = Date.parse(isoTimestamp)
  if (!Number.isFinite(targetMs)) return MISSING_VALUE

  const nowMs = now instanceof Date ? now.getTime() : now
  const diffSec = Math.floor((nowMs - targetMs) / 1000)
  if (diffSec < 60) return "Vừa xong"

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} phút`

  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} giờ`

  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay} ngày`

  return formatDayMonth(isoTimestamp)
}

export function formatExpiryRemaining(sessions: number): string {
  if (!Number.isFinite(sessions)) return MISSING_VALUE
  if (sessions <= 0) return "hôm nay"
  return String(Math.round(sessions))
}

export function priceTone(
  price: number,
  refPrice: number,
  ceilingPrice?: number | null,
  floorPrice?: number | null,
): PriceTone {
  if (ceilingPrice != null && ceilingPrice > 0 && price >= ceilingPrice - PRICE_EPSILON) {
    return "ce"
  }
  if (floorPrice != null && floorPrice > 0 && price <= floorPrice + PRICE_EPSILON) {
    return "fl"
  }
  if (price > refPrice + PRICE_EPSILON) return "up"
  if (price < refPrice - PRICE_EPSILON) return "dn"
  return "ref"
}

export function signedTone(val: number): SignedTone {
  if (val > 1e-9) return "up"
  if (val < -1e-9) return "dn"
  return "ref"
}

export function buildDuplicatePageName(name: string): string {
  const maxBaseLen = MAX_PAGE_NAME_LENGTH - DUPLICATE_PAGE_SUFFIX.length
  const trimmed = name.trim() || "Trang"
  const chars = Array.from(trimmed)
  const truncated =
    chars.length > maxBaseLen ? chars.slice(0, maxBaseLen).join("").trimEnd() : trimmed
  const safeBase = truncated || "Trang"
  return `${safeBase}${DUPLICATE_PAGE_SUFFIX}`
}

export function nextDefaultPageName(existingNames: Iterable<string>): string {
  const used = new Set<string>()
  for (const raw of existingNames) {
    used.add(raw.trim())
  }
  let n = 1
  while (used.has(`Trang ${n}`)) {
    n += 1
  }
  return `Trang ${n}`
}
