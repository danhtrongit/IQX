import type { PaneCoords, Viewport } from "../types"
import type { PriceScale } from "./price-scale"
import type { TimeScale } from "./time-scale"

/**
 * Cài đặt `PaneCoords` (types.ts) cho một ô. Toạ độ theo CSS pixel. Chỉ số nguyên là tâm nến: `xOfIndex(i)` là
 * giữa nến `i`, nên `Math.round(indexOfX(x))` là nến nằm dưới con trỏ.
 */
export function createPaneCoords(input: {
  viewport: Viewport
  plot: { left: number; top: number; right: number; bottom: number }
  timeScale: TimeScale
  priceScale: PriceScale
}): PaneCoords {
  const { viewport, plot, timeScale, priceScale } = input
  const width = plot.right - plot.left
  const span = viewport.to - viewport.from
  return {
    xOfIndex: (index) => plot.left + ((index - viewport.from) / span) * width,
    indexOfX: (x) => viewport.from + ((x - plot.left) / width) * span,
    yOfPrice: (price) => priceScale.yOf(price),
    priceOfY: (y) => priceScale.priceOf(y),
    indexOfAnchor: (anchor) => timeScale.indexOfAnchor(anchor),
    anchorAt: (index, price) => timeScale.anchorAt(index, price),
    plot,
  }
}
