/**
 * Display helpers for the market workspace. Numbers stay tabular; direction is
 * expressed with the shared `--price-*` tokens (green up / red down / gold
 * reference), never with ad-hoc colours.
 */

/** Price/percentage tone class for a signed value. */
export function toneClass(value: number): string {
  if (value > 0) return "text-price-up"
  if (value < 0) return "text-price-down"
  return "text-price-ref"
}

/** ▲ / ▼ / ■ for a signed value. */
export function changeArrow(value: number): string {
  if (value > 0) return "▲"
  if (value < 0) return "▼"
  return "■"
}

/** 1_245_000_000_000 → "1,245 tỷ". */
export function formatVndBillion(value: number): string {
  return `${Math.round(value / 1e9).toLocaleString("en-US")} tỷ`
}

/** 850_000_000 → "850 triệu cp"; 1_200_000_000 → "1 tỷ cp". */
export function formatVolume(value: number): string {
  if (Math.abs(value) >= 1e9) return `${Math.round(value / 1e9).toLocaleString("en-US")} tỷ cp`
  return `${Math.round(value / 1e6).toLocaleString("en-US")} triệu cp`
}

/** 2_450_000 → "2.45M" — compact axis/label form. */
export function formatVnd(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${Math.round(value / 1e12).toLocaleString("en-US")}T`
  if (abs >= 1e9) return `${Math.round(value / 1e9).toLocaleString("en-US")}B`
  if (abs >= 1e6) return `${Math.round(value / 1e6).toLocaleString("en-US")}M`
  return Math.round(value).toLocaleString("en-US")
}

/** Keep tickers to 3 characters so bar columns start at a fixed offset. */
export function displayTicker(symbol: string): string {
  return symbol.trim().toUpperCase().slice(0, 3)
}

/** Index-impact points: 1.25 → "+1đ", -0.84 → "-1đ". */
export function formatImpactPoint(value: number): string {
  const rounded = Math.round(value)
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("en-US")}đ`
}

/** Signed number with a ▲/▼ marker and 2 decimals, e.g. "▲ 1.25". */
export function formatSigned(value: number, digits = 2): string {
  return `${changeArrow(value)} ${value.toFixed(digits)}`
}

/** Signed percentage, e.g. "+-1.25%" (the viewer's locale handles the sign). */
export function formatSignedPercent(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(digits)}%`
}
