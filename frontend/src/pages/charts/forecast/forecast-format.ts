import { formatMoney, formatNumber } from "@/lib/format"

/** Backend sheet values use ratios: 0.05 means 5%. */
export function forecastPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${formatNumber(value * 100)}%`
}

export function forecastPrice(value: number | null): string {
  return formatMoney(value)
}
