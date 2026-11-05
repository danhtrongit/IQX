/**
 * Phép đổi toạ độ giả cho test, đủ để thử hình vẽ mà không cần `core/`.
 * `market` neo theo `time` qua danh sách mốc thời gian của nến (nội suy giữa hai nến, ngoại suy ngoài hai đầu);
 * `session` neo theo `session` và chỉ số trùng số phiên. Cùng quy ước với `core/coords.ts`: số nguyên là tâm nến, nến `i` chiếm
 * `[i - 0.5, i + 0.5]`, nên vừa khít `n` nến là viewport `{ from: -0.5, to: n - 0.5 }`.
 */
import type { Anchor, PaneCoords, Viewport } from "../../types"

export type FixtureOptions = {
  mode?: "market" | "session"
  /** Mốc thời gian (Unix giây, tăng dần) của từng nến; bắt buộc ở chế độ `market`. */
  times?: readonly number[]
  viewport: Viewport
  plot?: PaneCoords["plot"]
  price?: { low: number; high: number }
}

export function timeToIndex(times: readonly number[], time: number): number {
  const n = times.length
  if (n === 0) return 0
  const firstStep = n > 1 ? times[1] - times[0] : 1
  const lastStep = n > 1 ? times[n - 1] - times[n - 2] : 1
  if (time <= times[0]) return (time - times[0]) / firstStep
  if (time >= times[n - 1]) return n - 1 + (time - times[n - 1]) / lastStep
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (times[mid] <= time) lo = mid
    else hi = mid
  }
  return lo + (time - times[lo]) / (times[lo + 1] - times[lo])
}

export function indexToTime(times: readonly number[], index: number): number {
  const n = times.length
  const firstStep = n > 1 ? times[1] - times[0] : 1
  const lastStep = n > 1 ? times[n - 1] - times[n - 2] : 1
  if (index <= 0) return times[0] + index * firstStep
  if (index >= n - 1) return times[n - 1] + (index - (n - 1)) * lastStep
  const lo = Math.floor(index)
  return times[lo] + (index - lo) * (times[lo + 1] - times[lo])
}

export function makeCoords(options: FixtureOptions): PaneCoords {
  const { viewport, times = [] } = options
  const mode = options.mode ?? "market"
  const plot = options.plot ?? { left: 0, top: 0, right: 500, bottom: 300 }
  const price = options.price ?? { low: 0, high: 100 }
  const pxPerBar = (plot.right - plot.left) / (viewport.to - viewport.from)
  const height = plot.bottom - plot.top
  return {
    plot,
    xOfIndex: (index) => plot.left + (index - viewport.from) * pxPerBar,
    indexOfX: (x) => (x - plot.left) / pxPerBar + viewport.from,
    yOfPrice: (p) => plot.top + ((price.high - p) / (price.high - price.low)) * height,
    priceOfY: (y) => price.high - ((y - plot.top) / height) * (price.high - price.low),
    indexOfAnchor: (anchor: Anchor) => {
      if (mode === "market") return "time" in anchor ? timeToIndex(times, anchor.time) : null
      return "session" in anchor ? anchor.session : null
    },
    anchorAt: (index, p): Anchor => (mode === "market" ? { time: indexToTime(times, index), price: p } : { session: index, price: p }),
  }
}

/** Dãy mốc thời gian đều nhau: `count` nến, nến đầu tại `start`, cách nhau `step` giây. */
export function evenTimes(count: number, start = 1_700_000_000, step = 86_400): number[] {
  return Array.from({ length: count }, (_, index) => start + index * step)
}
