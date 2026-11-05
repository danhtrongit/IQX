/**
 * Ghép nến mới vào dãy đang hiển thị (docs/iqline-design.md §8). Thuần, không đổi dãy đầu vào. Thời gian là Unix giây.
 * Trả về đúng dãy cũ khi không có gì đổi, để React không dựng lại dữ liệu vô ích.
 */
import type { TimedBar } from "../types"

/** Nến cuối được cập nhật (cùng thời gian: thay), nến mới hơn thì thêm vào cuối, nến cũ hơn nến cuối thì bỏ. */
export function mergeLatestBar(bars: readonly TimedBar[], bar: TimedBar): readonly TimedBar[] {
  if (!Number.isFinite(bar.time)) return bars
  const last = bars[bars.length - 1]
  if (!last) return [bar]
  if (bar.time > last.time) return [...bars, bar]
  if (bar.time < last.time) return bars
  if (last.open === bar.open && last.high === bar.high && last.low === bar.low && last.close === bar.close && last.volume === bar.volume) return bars
  return [...bars.slice(0, -1), bar]
}

/** Thêm các nến cũ hơn nến đầu vào đầu dãy; bỏ nến trùng hoặc không cũ hơn, sắp tăng dần. */
export function prependOlderBars(bars: readonly TimedBar[], older: readonly TimedBar[]): readonly TimedBar[] {
  const first = bars[0]?.time ?? Number.POSITIVE_INFINITY
  const fresh = older.filter((bar) => bar.time < first && Number.isFinite(bar.time))
  if (fresh.length === 0) return bars
  const sorted = [...fresh].sort((a, b) => a.time - b.time)
  const unique = sorted.filter((bar, index) => index === 0 || bar.time !== sorted[index - 1].time)
  return [...unique, ...bars]
}
