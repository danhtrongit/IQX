import type { Factor } from "./types"

export const fmtPct = (v: number | null | undefined, digits = 1): string =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`

export const fmtSignedPct = (v: number | null | undefined, digits = 1): string =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`

export const fmtNum = (v: number | null | undefined, digits = 2): string =>
  v == null ? "—" : v.toFixed(digits)

export const fmtPrice = (v: number | null | undefined): string =>
  v == null ? "—" : Math.round(v).toLocaleString("vi-VN")

export const fmtMoney = (v: number): string => v.toLocaleString("vi-VN")

export const parseMoney = (s: string): number => Number(s.replace(/[^\d]/g, "")) || 0

/** The display string for a factor's threshold value (percent-aware). */
export function displayFactorValue(f: Factor, value: number | string | null): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (f.is_percent) return `${(value * 100).toFixed(1)}${f.unit || "%"}`
  return `${value}${f.unit || ""}`
}

/** Convert a user-typed display value back to the stored ratio (percent-aware). */
export function toStoredValue(f: Factor, display: number): number {
  return f.is_percent ? display / 100 : display
}

/** The numeric value shown in an input for a NUM factor (percent-aware). */
export function toDisplayValue(f: Factor, stored: number): number {
  return f.is_percent ? Number((stored * 100).toFixed(2)) : stored
}
