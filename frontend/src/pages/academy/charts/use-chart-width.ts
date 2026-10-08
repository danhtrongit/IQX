import { useCallback, useState, type RefCallback } from "react"

/** Width used before the first measurement, and whenever the box has no layout (hidden `<details>`, jsdom). */
export const FALLBACK_CHART_WIDTH = 580
export const MIN_CHART_WIDTH = 230
/** Below this width charts switch to their narrow variant (fewer ticks, shorter panels). */
export const NARROW_CHART_WIDTH = 400

/**
 * Tracks the width of the element the chart is drawn into and redraws on resize. A box that is
 * not laid out (width 0: a closed `<details>`, a hidden tab) keeps the fallback width instead of
 * collapsing the drawing, and re-measures as soon as it is opened.
 */
export function useChartWidth(): [RefCallback<HTMLElement>, number] {
  const [width, setWidth] = useState(FALLBACK_CHART_WIDTH)
  const ref = useCallback<RefCallback<HTMLElement>>((element) => {
    if (!element) return
    const measure = () => {
      const measured = Math.round(element.clientWidth)
      if (measured > 0) setWidth(Math.max(MIN_CHART_WIDTH, measured))
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}
