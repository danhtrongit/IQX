import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react"
import { getWidgetMeta } from "../catalog"
import type { GridItem } from "../types"
import { GRID_COLS, GRID_GAP, MAX_WIDGET_HEIGHT, ROW_HEIGHT, compactLayout } from "./engine"

export type ResizeDirection = "x" | "y" | "xy"

export interface ActiveResizeState {
  uid: string
  w: number
  h: number
}

export interface UseGridPointerOptions {
  gridRef: RefObject<HTMLElement | null>
  scrollContainerRef?: RefObject<HTMLElement | null>
  items: readonly GridItem[]
  disabled: boolean
  onLiveChange?: (nextItems: GridItem[]) => void
  onCommit: (nextItems: GridItem[]) => void
}

export interface UseGridPointerResult {
  draggingUid: string | null
  resizing: ActiveResizeState | null
  wasRecentlyMoved: (uid: string) => boolean
  startDrag: (uid: string, event: ReactPointerEvent<HTMLElement>) => void
  startResize: (
    uid: string,
    direction: ResizeDirection,
    event: ReactPointerEvent<HTMLElement>,
  ) => void
}

const DRAG_THRESHOLD_PX = 5
const AUTOSCROLL_TOP_PX = 130
const AUTOSCROLL_BOTTOM_MARGIN_PX = 70
const AUTOSCROLL_STEP_PX = 14
const INTERACTIVE_CONTROL_SELECTOR = "button, select, input, a, [data-no-drag], .mo-seg, .mo-dd"

function cloneItems(items: readonly GridItem[]): GridItem[] {
  return items.map((item) => ({
    ...item,
    state: { ...item.state },
  })) as GridItem[]
}

function measureCellWidth(gridEl: HTMLElement): number {
  const width = gridEl.clientWidth
  if (width <= 0) return 0
  return (width - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS
}

/**
 * Manages 12-column grid pointer drag-to-move (>= 5px threshold, auto-scroll,
 * live snap & push-down) and 3-edge drag-to-resize (right/bottom/corner with
 * live `w×h` size badge and min/max clamping). Completely inert when `disabled`.
 */
export function useGridPointer({
  gridRef,
  scrollContainerRef,
  items,
  disabled,
  onLiveChange,
  onCommit,
}: UseGridPointerOptions): UseGridPointerResult {
  const [draggingUid, setDraggingUid] = useState<string | null>(null)
  const [resizing, setResizing] = useState<ActiveResizeState | null>(null)

  const itemsRef = useRef<readonly GridItem[]>(items)
  const onLiveChangeRef = useRef(onLiveChange)
  const onCommitRef = useRef(onCommit)
  const activeCleanupRef = useRef<(() => void) | null>(null)
  const recentlyMovedUidRef = useRef<string | null>(null)
  const resetMovedTimerRef = useRef<number | null>(null)

  useEffect(() => {
    itemsRef.current = items
    onLiveChangeRef.current = onLiveChange
    onCommitRef.current = onCommit
  })

  const abortActiveSession = useCallback(() => {
    if (activeCleanupRef.current) {
      const cleanup = activeCleanupRef.current
      activeCleanupRef.current = null
      cleanup()
    }
  }, [])

  useEffect(() => {
    if (disabled) {
      abortActiveSession()
    }
  }, [disabled, abortActiveSession])

  useEffect(() => {
    return () => {
      abortActiveSession()
      if (resetMovedTimerRef.current !== null) {
        window.clearTimeout(resetMovedTimerRef.current)
      }
    }
  }, [abortActiveSession])

  const wasRecentlyMoved = useCallback((uid: string): boolean => {
    return recentlyMovedUidRef.current === uid
  }, [])

  const startDrag = useCallback(
    (uid: string, event: ReactPointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0) return
      const target = event.target
      if (target instanceof Element && target.closest(INTERACTIVE_CONTROL_SELECTOR)) {
        return
      }

      const gridEl = gridRef.current
      if (!gridEl) return

      const widgetEl =
        event.currentTarget.closest<HTMLElement>(".mo-wg") ??
        gridEl.querySelector<HTMLElement>(`.mo-wg[data-uid="${uid}"]`)
      if (!widgetEl) return

      const initialItems = cloneItems(itemsRef.current)
      const startItem = initialItems.find((entry) => entry.uid === uid)
      if (!startItem) return

      abortActiveSession()

      const rect0 = widgetEl.getBoundingClientRect()
      const offsetX = event.clientX - rect0.left
      const offsetY = event.clientY - rect0.top
      const startClientX = event.clientX
      const startClientY = event.clientY

      let working = initialItems
      let activated = false
      let changed = false

      const handlePointerMove = (ev: PointerEvent) => {
        if (!activated) {
          if (Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) < DRAG_THRESHOLD_PX) {
            return
          }
          activated = true
          recentlyMovedUidRef.current = uid
          setDraggingUid(uid)
        }

        const currentGrid = gridRef.current
        if (!currentGrid) return

        const cellW = measureCellWidth(currentGrid)
        if (cellW <= 0) return

        const currentItem = working.find((entry) => entry.uid === uid)
        if (!currentItem) return

        const gridRect = currentGrid.getBoundingClientRect()
        const nx = Math.max(
          0,
          Math.min(
            GRID_COLS - currentItem.w,
            Math.round((ev.clientX - gridRect.left - offsetX) / (cellW + GRID_GAP)),
          ),
        )
        const ny = Math.max(
          0,
          Math.round((ev.clientY - gridRect.top - offsetY) / (ROW_HEIGHT + GRID_GAP)),
        )

        const scrollEl =
          scrollContainerRef?.current ?? currentGrid.closest<HTMLElement>(".mo-content")
        if (scrollEl) {
          if (ev.clientY > window.innerHeight - AUTOSCROLL_BOTTOM_MARGIN_PX) {
            scrollEl.scrollBy(0, AUTOSCROLL_STEP_PX)
          } else if (ev.clientY < AUTOSCROLL_TOP_PX) {
            scrollEl.scrollBy(0, -AUTOSCROLL_STEP_PX)
          }
        }

        if (nx !== currentItem.x || ny !== currentItem.y) {
          changed = true
          const moved = working.map((entry) =>
            entry.uid === uid ? { ...entry, x: nx, y: ny } : entry,
          ) as GridItem[]
          working = compactLayout(moved, uid)
          onLiveChangeRef.current?.(working)
        }
      }

      const cleanupListeners = () => {
        window.removeEventListener("pointermove", handlePointerMove)
        window.removeEventListener("pointerup", handlePointerEnd)
        window.removeEventListener("pointercancel", handlePointerEnd)
      }

      const handlePointerEnd = () => {
        cleanupListeners()
        activeCleanupRef.current = null
        if (activated) {
          setDraggingUid(null)
          const compacted = compactLayout(working)
          if (changed) {
            onCommitRef.current(compacted)
          } else {
            onLiveChangeRef.current?.(compacted)
          }
          if (resetMovedTimerRef.current !== null) {
            window.clearTimeout(resetMovedTimerRef.current)
          }
          resetMovedTimerRef.current = window.setTimeout(() => {
            if (recentlyMovedUidRef.current === uid) {
              recentlyMovedUidRef.current = null
            }
          }, 0)
        }
      }

      activeCleanupRef.current = () => {
        cleanupListeners()
        setDraggingUid(null)
      }

      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", handlePointerEnd)
      window.addEventListener("pointercancel", handlePointerEnd)
    },
    [disabled, gridRef, scrollContainerRef, abortActiveSession],
  )

  const startResize = useCallback(
    (uid: string, direction: ResizeDirection, event: ReactPointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()

      const gridEl = gridRef.current
      if (!gridEl) return

      const initialItems = cloneItems(itemsRef.current)
      const startItem = initialItems.find((entry) => entry.uid === uid)
      if (!startItem) return

      const cellW = measureCellWidth(gridEl)
      if (cellW <= 0) return

      abortActiveSession()

      const meta = getWidgetMeta(startItem.widget)
      const startClientX = event.clientX
      const startClientY = event.clientY
      const startW = startItem.w
      const startH = startItem.h

      let working = initialItems
      let changed = false

      setResizing({ uid, w: startW, h: startH })

      const handlePointerMove = (ev: PointerEvent) => {
        const currentGrid = gridRef.current
        if (!currentGrid) return
        const liveCellW = measureCellWidth(currentGrid) || cellW
        const currentItem = working.find((entry) => entry.uid === uid)
        if (!currentItem) return

        const nextW =
          direction === "y"
            ? currentItem.w
            : Math.max(
                meta.minW,
                Math.min(
                  GRID_COLS - currentItem.x,
                  Math.round(startW + (ev.clientX - startClientX) / (liveCellW + GRID_GAP)),
                ),
              )

        const nextH =
          direction === "x"
            ? currentItem.h
            : Math.max(
                meta.minH,
                Math.min(
                  MAX_WIDGET_HEIGHT,
                  Math.round(startH + (ev.clientY - startClientY) / (ROW_HEIGHT + GRID_GAP)),
                ),
              )

        if (nextW !== currentItem.w || nextH !== currentItem.h) {
          changed = true
          const resized = working.map((entry) =>
            entry.uid === uid ? { ...entry, w: nextW, h: nextH } : entry,
          ) as GridItem[]
          working = compactLayout(resized, uid)
          setResizing({ uid, w: nextW, h: nextH })
          onLiveChangeRef.current?.(working)
        }
      }

      const cleanupListeners = () => {
        window.removeEventListener("pointermove", handlePointerMove)
        window.removeEventListener("pointerup", handlePointerEnd)
        window.removeEventListener("pointercancel", handlePointerEnd)
      }

      const handlePointerEnd = () => {
        cleanupListeners()
        activeCleanupRef.current = null
        setResizing(null)
        const compacted = compactLayout(working)
        if (changed) {
          onCommitRef.current(compacted)
        } else {
          onLiveChangeRef.current?.(compacted)
        }
      }

      activeCleanupRef.current = () => {
        cleanupListeners()
        setResizing(null)
      }

      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", handlePointerEnd)
      window.addEventListener("pointercancel", handlePointerEnd)
    },
    [disabled, gridRef, abortActiveSession],
  )

  return {
    draggingUid,
    resizing,
    wasRecentlyMoved,
    startDrag,
    startResize,
  }
}
