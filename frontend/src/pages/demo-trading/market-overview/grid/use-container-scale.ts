import { useEffect, type RefObject } from "react"
import { GRID_COLS, GRID_GAP, computeScaleK } from "./engine"

export interface UseContainerScaleOptions {
  widgetRef: RefObject<HTMLElement | null>
  gridRef?: RefObject<HTMLElement | null>
  defaultCols: number
  defaultRows: number
  isNarrow: boolean
}

/**
 * Observes widget container dimensions with rAF coalescing and updates CSS custom
 * property `--k` directly on the DOM node (zero React re-renders during resize).
 */
export function useContainerScale({
  widgetRef,
  gridRef,
  defaultCols,
  defaultRows,
  isNarrow,
}: UseContainerScaleOptions): void {
  useEffect(() => {
    const widgetEl = widgetRef.current
    if (!widgetEl) return

    if (isNarrow) {
      widgetEl.style.setProperty("--k", "1")
      return
    }

    let rafId = 0

    const updateScale = () => {
      const el = widgetRef.current
      if (!el) return

      const gridEl = gridRef?.current ?? el.closest<HTMLElement>(".mo-grid")
      const gridW = gridEl?.clientWidth ?? 0
      const cellW = gridW > 0 ? (gridW - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS : 0

      const k = computeScaleK(
        el.clientWidth,
        el.clientHeight,
        defaultCols,
        defaultRows,
        cellW,
        false,
      )
      el.style.setProperty("--k", k.toFixed(3))
    }

    const scheduleUpdate = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(updateScale)
    }

    scheduleUpdate()

    if (typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(rafId)
    }

    const observer = new ResizeObserver(scheduleUpdate)
    observer.observe(widgetEl)

    const gridEl = gridRef?.current ?? widgetEl.closest<HTMLElement>(".mo-grid")
    if (gridEl && gridEl !== widgetEl) {
      observer.observe(gridEl)
    }

    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [widgetRef, gridRef, defaultCols, defaultRows, isNarrow])
}
