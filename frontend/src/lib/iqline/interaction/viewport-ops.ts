/**
 * Cầu nối giữa bộ giảm trạng thái và phép tính viewport của `core/viewport.ts` (cùng quy ước: số nguyên là tâm nến, nến `i` chiếm
 * `[i - 0.5, i + 0.5]`, vừa khít `n` nến là `{ from: -0.5, to: n - 0.5 }`). Hướng phụ thuộc `interaction -> scene -> core` cho phép
 * import này; `drawings/` thì không được import `core/`.
 *
 * Giới hạn của `core` phụ thuộc bề rộng khung vẽ (số nến hiện tối thiểu theo pixel), nên `ViewportSpec` trong cấu hình chỉ giữ
 * số ô và phần chừa trống, còn `ViewportOps` được dựng mỗi lần giảm từ bề rộng hiện tại.
 */
import { clampViewport, panViewport, viewportLimits, zoomViewport, type ViewportLimits } from "../core/viewport"
import type { Viewport } from "../types"

/** Số ô trên trục và số ô trống được kéo quá hai đầu. Flashback đặt cả hai phần chừa bằng 0 (§12). */
export type ViewportSpec = { slots: number; leftPad: number; rightPad: number; minSpan?: number }

export type ViewportOps = {
  /** Đưa viewport về trong giới hạn: độ rộng và hai mép. */
  clamp(viewport: Viewport): Viewport
  /** Đổi độ rộng theo `factor` (lớn hơn 1 là phóng to, tức hẹp lại), giữ nguyên chỉ số tại vị trí `ratio` (0 là mép trái, 1 là mép phải). */
  zoom(viewport: Viewport, ratio: number, factor: number): Viewport
  /** Dịch viewport `bars` nến (dương là sang phải, tức về phía tương lai), giữ độ rộng. */
  pan(viewport: Viewport, bars: number): Viewport
}

export function limitsOf(spec: ViewportSpec, plotWidth: number): ViewportLimits {
  return viewportLimits({ slots: spec.slots, leftPad: spec.leftPad, rightPad: spec.rightPad, plotWidth, minSpan: spec.minSpan })
}

const valid = (viewport: Viewport) => Number.isFinite(viewport.from) && Number.isFinite(viewport.to) && viewport.to > viewport.from

export function createViewportOps(limits: ViewportLimits): ViewportOps {
  // Viewport hỏng (NaN, đảo ngược) được coi là nhìn hết trục, để không bao giờ lan NaN vào trạng thái.
  const safe = (viewport: Viewport): Viewport => (valid(viewport) ? viewport : { from: limits.min, to: limits.max })
  return {
    clamp: (viewport) => clampViewport(safe(viewport), limits),
    zoom(viewport, ratio, factor) {
      const current = safe(viewport)
      if (!Number.isFinite(factor) || factor <= 0) return clampViewport(current, limits)
      const span = current.to - current.from
      const r = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0.5))
      return zoomViewport(current, 1 / factor, current.from + r * span, limits)
    },
    pan(viewport, bars) {
      const current = safe(viewport)
      return Number.isFinite(bars) ? panViewport(current, bars, limits) : clampViewport(current, limits)
    },
  }
}

/** `ViewportOps` cho một cấu hình và bề rộng khung vẽ hiện tại. */
export function opsFor(spec: ViewportSpec, plotWidth: number): ViewportOps {
  return createViewportOps(limitsOf(spec, plotWidth))
}
