// ─── Formatting helpers (ported from dashboard-bak/src/features/market/utils.ts) ─

export function formatVND(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${Math.round(value / 1e12).toLocaleString("vi-VN")}T`
  if (abs >= 1e9) return `${Math.round(value / 1e9).toLocaleString("vi-VN")}B`
  if (abs >= 1e6) return `${Math.round(value / 1e6).toLocaleString("vi-VN")}M`
  return Math.round(value).toLocaleString("vi-VN")
}

/** Tailwind text-color class for positive/negative/zero (semantic tokens). */
export function changeColor(value: number): string {
  if (value > 0) return "text-up"
  if (value < 0) return "text-down"
  return "text-reference"
}

export function changeArrow(value: number): string {
  if (value > 0) return "▲"
  if (value < 0) return "▼"
  return "■"
}

/** 1_245_000_000_000 → "1.245 tỷ" */
export function formatVndBillion(value: number): string {
  const billions = value / 1e9
  return `${Math.round(billions).toLocaleString("vi-VN")} tỷ`
}

/** 850_000_000 → "850 triệu cp", 1_200_000_000 → "1 tỷ cp" */
export function formatVolume(value: number): string {
  if (Math.abs(value) >= 1e9) {
    return `${Math.round(value / 1e9).toLocaleString("vi-VN")} tỷ cp`
  }
  return `${Math.round(value / 1e6).toLocaleString("vi-VN")} triệu cp`
}

/** Keep max 3 chars so the bar column starts at a consistent x-offset. */
export function displayTicker(symbol: string): string {
  return symbol.trim().toUpperCase().slice(0, 3)
}

/** Index-impact points: 1.25 → "+1đ", -0.84 → "-1đ" */
export function formatImpactPoint(value: number): string {
  const rounded = Math.round(value)
  const sign = rounded > 0 ? "+" : ""
  return `${sign}${rounded.toLocaleString("vi-VN")}đ`
}

const wholeNumber = (value: number) => Math.round(value).toLocaleString("vi-VN")
export { wholeNumber }

export const MASCOT_HEIGHT = 190
export const CHART_HEIGHT = 300
