import type { Bar } from "../types"

/**
 * Heikin Ashi là phép đổi dữ liệu thuần (docs/iqline-design.md §2): `close = (O+H+L+C)/4`,
 * `open` là trung bình `open` và `close` của nến Heikin Ashi trước (nến đầu: `(O+C)/2`),
 * `high` và `low` lấy cực trị của giá thật và hai giá vừa tính. Khối lượng và các trường khác (như `time`) giữ nguyên.
 */
export function toHeikinAshi<T extends Bar>(bars: readonly T[]): T[] {
  const out: T[] = new Array(bars.length)
  let previousOpen = 0
  let previousClose = 0
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index]
    const close = (bar.open + bar.high + bar.low + bar.close) / 4
    const open = index === 0 ? (bar.open + bar.close) / 2 : (previousOpen + previousClose) / 2
    out[index] = { ...bar, open, high: Math.max(bar.high, open, close), low: Math.min(bar.low, open, close), close }
    previousOpen = open
    previousClose = close
  }
  return out
}
