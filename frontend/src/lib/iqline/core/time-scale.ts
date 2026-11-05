/**
 * Thang thời gian (docs/iqline-design.md §7). Trục cách đều theo nến, nên chỉ số nến là toạ độ ngang và
 * thang này chỉ đổi giữa chỉ số và khoá neo ổn định.
 *
 * Quy ước chỉ số: số nguyên là TÂM nến, nến `i` chiếm `[i - 0.5, i + 0.5]`.
 *
 * `market`: neo theo `time` (Unix giây). Trong dải dữ liệu thì tìm nhị phân; ngoài hai đầu thì ngoại suy
 * theo khung và phiên giao dịch (`calendar.ts`).
 * `session`: neo theo `session`, chỉ số nến chính là số phiên (đã bỏ phần warmup), không có thời gian thật.
 */
import type { Anchor, Interval } from "../types"
import { INTERVAL_SECONDS, createSlotGrid, ictDay, isIntraday, type SlotGrid } from "./calendar"

export type TimeScale = {
  kind: "market" | "session"
  /** Số nến thật. */
  count: number
  /** Chỉ số (có thể lẻ, có thể vượt hai đầu) của điểm neo; null nếu loại neo không khớp thang hoặc chưa có nến. */
  indexOfAnchor(anchor: Anchor): number | null
  /** Điểm neo đúng loại của thang tại chỉ số và giá. */
  anchorAt(index: number, price: number): Anchor
}

export type MarketTimeScale = TimeScale & {
  kind: "market"
  times: readonly number[]
  interval: Interval
  indexOfTime(time: number): number
  timeOfIndex(index: number): number
}

export type SessionTimeScale = TimeScale & {
  kind: "session"
  /** Tổng số ô trên trục, gồm cả ô tương lai. */
  slots: number
}

/** Chỉ số nhỏ nhất `i` sao cho `times[i] > time`, hoặc `times.length`. */
export function upperBound(times: readonly number[], time: number): number {
  let low = 0
  let high = times.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (times[mid] <= time) low = mid + 1
    else high = mid
  }
  return low
}

export function createMarketTimeScale(times: readonly number[], interval: Interval): MarketTimeScale {
  const count = times.length
  const step = INTERVAL_SECONDS[interval]
  let firstGrid: { grid: SlotGrid; first: number; last: number } | null = null
  const grids = () => {
    if (!firstGrid && count > 0) {
      const grid = createSlotGrid(interval, times[count - 1])
      firstGrid = { grid, first: grid.ordinalOf(times[0]), last: grid.ordinalOf(times[count - 1]) }
    }
    return firstGrid
  }

  function indexOfTime(time: number): number {
    if (count === 0) return Number.NaN
    if (time >= times[count - 1]) {
      const extra = grids()!
      return count - 1 + (extra.grid.ordinalOf(time) - extra.last)
    }
    if (time < times[0]) {
      const extra = grids()!
      return extra.grid.ordinalOf(time) - extra.first
    }
    const next = upperBound(times, time)
    const index = next - 1
    const gap = times[next] - times[index]
    // Trong khoảng nghỉ (trưa, cuối tuần, ngày nghỉ) không kéo dài quá một bước của khung.
    return index + Math.min(1, (time - times[index]) / Math.min(gap, step))
  }

  function timeOfIndex(index: number): number {
    if (count === 0) return Number.NaN
    if (index >= count - 1) {
      const extra = grids()!
      return Math.round(extra.grid.timeOf(extra.last + (index - (count - 1))))
    }
    if (index < 0) {
      const extra = grids()!
      return Math.round(extra.grid.timeOf(extra.first + index))
    }
    const base = Math.floor(index)
    const gap = times[base + 1] - times[base]
    return Math.round(times[base] + (index - base) * Math.min(gap, step))
  }

  return {
    kind: "market",
    count,
    times,
    interval,
    indexOfTime,
    timeOfIndex,
    indexOfAnchor(anchor) {
      if (!("time" in anchor)) return null
      const index = indexOfTime(anchor.time)
      return Number.isFinite(index) ? index : null
    },
    anchorAt(index, price) {
      return { time: timeOfIndex(index), price }
    },
  }
}

export function createSessionTimeScale(count: number, slots: number): SessionTimeScale {
  return {
    kind: "session",
    count,
    slots: Math.max(slots, count),
    indexOfAnchor: (anchor) => ("session" in anchor ? anchor.session : null),
    anchorAt: (index, price) => ({ session: index, price }),
  }
}

/**
 * Chỉ số các nến đầu một ngày giao dịch mới (khung trong ngày), để vẽ vạch ngăn khi nhảy ngày.
 * `gapDays` là số ngày lịch bị bỏ qua, lớn hơn 1 khi dữ liệu nhảy cóc (dữ liệu 1 phút có các ngày rời rạc).
 */
export function dayBreaks(
  times: readonly number[],
  interval: Interval,
  first: number,
  last: number,
): { index: number; gapDays: number }[] {
  if (!isIntraday(interval)) return []
  const out: { index: number; gapDays: number }[] = []
  const from = Math.max(1, first)
  const to = Math.min(times.length - 1, last)
  let previous = ictDay(times[from - 1])
  for (let index = from; index <= to; index += 1) {
    const day = ictDay(times[index])
    if (day !== previous) out.push({ index, gapDays: day - previous })
    previous = day
  }
  return out
}
