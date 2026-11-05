/**
 * Phép tính viewport mà bộ giảm trạng thái cần: kẹp, zoom quanh một vị trí, kéo. Đây là bản tối thiểu nằm trong `interaction/`
 * để thư mục này tự chạy và test được; `InteractionConfig.ops` nhận hàm của `core/` khi nó có (cùng kiểu `ViewportOps`).
 *
 * Viewport là `{ from, to }` theo chỉ số nến, có thể lẻ. Giới hạn là luật công bằng của Flashback (§12): không kéo qua warmup
 * (`minFrom`) và không kéo qua ô cuối của trục (`maxTo`).
 */
import type { Viewport } from "../types"

export type ViewBounds = {
  /** Mép trái nhỏ nhất của viewport. */
  minFrom: number
  /** Mép phải lớn nhất của viewport. */
  maxTo: number
  minSpan: number
  maxSpan: number
}

export type ViewportOps = {
  /** Đưa viewport về trong giới hạn: độ rộng trong [minSpan, maxSpan], hai mép trong [minFrom, maxTo]. */
  clamp(viewport: Viewport): Viewport
  /** Đổi độ rộng theo `factor` (lớn hơn 1 là phóng to, tức hẹp lại), giữ nguyên chỉ số tại vị trí `ratio` (0 là mép trái, 1 là mép phải). */
  zoom(viewport: Viewport, ratio: number, factor: number): Viewport
  /** Dịch viewport `bars` nến (dương là sang phải, tức về phía tương lai), giữ độ rộng. */
  pan(viewport: Viewport, bars: number): Viewport
}

const bound = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

export function createViewportOps(bounds: ViewBounds): ViewportOps {
  const room = bounds.maxTo - bounds.minFrom
  const maxSpan = Math.max(Math.min(bounds.maxSpan, room), 1e-6)
  const minSpan = Math.min(bounds.minSpan, maxSpan)

  const clamp = (viewport: Viewport): Viewport => {
    if (room <= 0) return { from: bounds.minFrom, to: bounds.minFrom + Math.max(minSpan, 1) }
    const rawSpan = viewport.to - viewport.from
    const span = bound(Number.isFinite(rawSpan) ? rawSpan : maxSpan, minSpan, maxSpan)
    const from = bound(Number.isFinite(viewport.from) ? viewport.from : bounds.minFrom, bounds.minFrom, bounds.maxTo - span)
    return { from, to: from + span }
  }

  return {
    clamp,
    zoom(viewport, ratio, factor) {
      if (!Number.isFinite(factor) || factor <= 0) return clamp(viewport)
      const span = viewport.to - viewport.from
      const nextSpan = bound(span / factor, minSpan, maxSpan)
      const r = bound(ratio, 0, 1)
      const pivot = viewport.from + r * span
      const from = pivot - r * nextSpan
      return clamp({ from, to: from + nextSpan })
    },
    pan(viewport, bars) {
      if (!Number.isFinite(bars)) return clamp(viewport)
      return clamp({ from: viewport.from + bars, to: viewport.to + bars })
    },
  }
}

/** Giới hạn của `market`: chừa một ít chỗ trống hai đầu (nến cuối không dính mép, kéo tới đầu dữ liệu vẫn thấy ranh giới). */
export function marketBounds(input: { barCount: number; paddingLeft?: number; paddingRight?: number; minSpan?: number }): ViewBounds {
  const { barCount, paddingLeft = 10, paddingRight = 20, minSpan = 5 } = input
  return { minFrom: -paddingLeft, maxTo: barCount + paddingRight, minSpan, maxSpan: barCount + paddingLeft + paddingRight }
}

/**
 * Giới hạn của `flashback`: từ phiên đầu tiên được hiện (sau warmup) tới ô cuối của trục. Nến warmup không bao giờ vào được
 * viewport, nên không hiện, không crosshair và không kéo tới được (§12).
 */
export function flashbackBounds(input: { warmup: number; totalSlots: number; minSpan?: number }): ViewBounds {
  const { warmup, totalSlots, minSpan = 10 } = input
  return { minFrom: warmup, maxTo: totalSlots, minSpan, maxSpan: totalSlots - warmup }
}
