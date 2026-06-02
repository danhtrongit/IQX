/** Format seconds → "Xh Ym" or "Ym" */
export function fmtDuration(sec: number | null | undefined): string {
  if (!sec) return ""
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h) return `${h}h ${m}m`
  return `${m}m`
}

/** Format a number with locale separators */
export function fmtNumber(n: number): string {
  return n.toLocaleString("vi-VN")
}
