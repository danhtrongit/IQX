/** Printed for missing data: a missing number is never shown as 0. */
export const DASH = "—"

/** Board spelling: two decimals with a dot (`73.40`). */
export function fmt(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? DASH : value.toFixed(2)
}

export function fmtSigned(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`
}

/** `HH:mm` in Vietnam time for an epoch-ms timestamp. */
export function timeOf(epochMs: number): string {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(epochMs)
}
