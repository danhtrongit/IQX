/**
 * Number spelling of the IQX board (iqx.vn/bang-gia): prices keep two decimals with a dot ("53.60"),
 * volumes and index points group with commas ("5,202,300", "1,725.36"). Prices arrive in VND and are
 * shown in thousands, the way Vietnamese boards print them. Changing the two separators below
 * switches every number to the vi-VN spelling ("1.725,36").
 */
const GROUP_SEPARATOR = ","
const DECIMAL_SEPARATOR = "."

/** Printed for "no data". A missing number is never shown as 0. */
export const DASH = "—"

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function grouped(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR)
}

/** `value` with fixed decimals, grouped thousands and no negative zero. */
function spell(value: number, decimals: number, signed: boolean): string {
  const fixed = Math.abs(value).toFixed(decimals)
  const [integer, fraction] = fixed.split(".")
  const body =
    fraction === undefined
      ? grouped(integer)
      : `${grouped(integer)}${DECIMAL_SEPARATOR}${fraction}`
  if (Number(fixed) === 0) return body
  if (value < 0) return `-${body}`
  return signed ? `+${body}` : body
}

/** VND to thousands: 53600 gives "53.60". */
export function formatPrice(vnd: number | null | undefined): string {
  return isNumber(vnd) && vnd > 0 ? spell(vnd / 1000, 2, false) : DASH
}

/** Signed percent: -1.107 gives "-1.11%". */
export function formatPercent(pct: number | null | undefined): string {
  return isNumber(pct) ? `${spell(pct, 2, true)}%` : DASH
}

/** Index points: 1725.36 gives "1,725.36". */
export function formatIndex(points: number | null | undefined): string {
  return isNumber(points) && points > 0 ? spell(points, 2, false) : DASH
}

/** Signed index change in points: -15.37 gives "-15.37". */
export function formatIndexChange(points: number | null | undefined): string {
  return isNumber(points) ? spell(points, 2, true) : DASH
}
