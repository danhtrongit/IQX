const MINUS = "−" // U+2212

function comma(n: number, digits: number): string {
  return n.toFixed(digits).replace(".", ",")
}

export function pct(n: number, digits = 1): string {
  return `${comma(n * 100, digits)}%`
}

export function signedPct(n: number, digits = 1): string {
  const v = n * 100
  const sign = v >= 0 ? "+" : MINUS
  return `${sign}${comma(Math.abs(v), digits)}%`
}

export function points(n: number, digits = 1): string {
  const v = n * 100
  const sign = v >= 0 ? "+" : MINUS
  return `${sign}${comma(Math.abs(v), digits)} điểm %`
}

export function vnd(n: number): string {
  const abs = Math.round(Math.abs(n)).toLocaleString("en-US")
  return `${n < 0 ? MINUS : ""}${abs} ₫`
}

export function vndShort(n: number): string {
  const sign = n >= 0 ? "+" : MINUS
  const millions = Math.round(Math.abs(n) / 1_000_000)
  return `${sign}${millions}tr`
}

export function num(n: number, digits = 2): string {
  return comma(n, digits)
}

export function score(n: number): string {
  return comma(n, 1)
}
