/** Format seconds → "Xh Ym" or "Ym". */
export function fmtDuration(sec: number | null | undefined): string {
  if (!sec) return ""
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h) return `${h}h ${m}m`
  return `${m}m`
}

/** Format an integer/float with Vietnamese locale separators. */
export function fmtNumber(n: number, maximumFractionDigits = 0): string {
  return n.toLocaleString("vi-VN", { maximumFractionDigits })
}

/** Format a VND amount, e.g. 299000 → "299.000 ₫". */
export function fmtVnd(n: number): string {
  return `${fmtNumber(n)} ₫`
}

/** Format a price (thousands of VND) with up to 2 decimals, e.g. 25.65. */
export function fmtPrice(n: number): string {
  return n.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Format a percent value already in percent units, e.g. 1.23 → "+1.23%". */
export function fmtPercent(n: number, withSign = true): string {
  const sign = withSign && n > 0 ? "+" : ""
  return `${sign}${n.toFixed(2)}%`
}

/** Compact large numbers: 1_200_000 → "1,2 Tr", 3_400_000_000 → "3,4 Tỷ". */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} Tỷ`
  if (abs >= 1e6) return `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} Tr`
  if (abs >= 1e3) return `${(n / 1e3).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} N`
  return fmtNumber(n)
}
