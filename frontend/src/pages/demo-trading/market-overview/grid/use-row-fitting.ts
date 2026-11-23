import { useEffect, type RefObject } from "react"
import type { WidgetSlug } from "../types"
import { getRowPruneOrder, type RowPruneMeta } from "./engine"

export interface UseRowFittingOptions {
  bodyRef: RefObject<HTMLElement | null>
  widget: WidgetSlug
  isNarrow: boolean
  pruneMeta?: RowPruneMeta
  contentVersion?: unknown
}

const MIN_VISIBLE_ROWS = 2
const MAX_EXTRA_ROW_PADDING_PX = 9

/**
 * Fits `[data-fit]` rows inside `.mo-wb` without scrollbars:
 * 1. Hides overflowing rows in `getRowPruneOrder` order while keeping >= 2 rows visible.
 * 2. On desktop (`!isNarrow`), distributes leftover vertical space (> 4px) evenly as `--rp`
 *    (up to 9px top and bottom padding per visible row).
 */
export function useRowFitting({
  bodyRef,
  widget,
  isNarrow,
  pruneMeta,
  contentVersion,
}: UseRowFittingOptions): void {
  useEffect(() => {
    const bodyEl = bodyRef.current
    if (!bodyEl) return

    let rafId = 0

    const fit = () => {
      const wb = bodyRef.current
      if (!wb) return

      wb.style.setProperty("--rp", "0px")
      const rows = Array.from(wb.querySelectorAll<HTMLElement>("[data-fit]"))
      if (rows.length === 0) return

      for (const row of rows) {
        row.classList.remove("mo-fh")
      }

      // Skip measurement when unmounted, hidden, or in jsdom where layout metrics are 0.
      if (wb.clientHeight <= 0) return

      const pruneOrder = getRowPruneOrder(widget, rows.length, pruneMeta)
      let visibleCount = rows.length

      for (const idx of pruneOrder) {
        if (wb.scrollHeight <= wb.clientHeight + 1 || visibleCount <= MIN_VISIBLE_ROWS) {
          break
        }
        const row = rows[idx]
        if (row && !row.classList.contains("mo-fh")) {
          row.classList.add("mo-fh")
          visibleCount -= 1
        }
      }

      if (isNarrow || visibleCount <= 0) return

      let usedHeight = 0
      for (const child of Array.from(wb.children)) {
        if (child instanceof HTMLElement) {
          usedHeight += child.offsetHeight
        }
      }

      const extra = wb.clientHeight - usedHeight
      if (extra > 4) {
        const rp = Math.min(MAX_EXTRA_ROW_PADDING_PX, extra / visibleCount / 2)
        wb.style.setProperty("--rp", `${rp.toFixed(1)}px`)
      }
    }

    const scheduleFit = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(fit)
    }

    scheduleFit()

    if (typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(rafId)
    }

    const observer = new ResizeObserver(scheduleFit)
    observer.observe(bodyEl)

    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [bodyRef, widget, isNarrow, pruneMeta, contentVersion])
}
