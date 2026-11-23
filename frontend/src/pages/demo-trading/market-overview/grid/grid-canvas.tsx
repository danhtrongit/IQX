import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import { getWidgetMeta } from "../catalog"
import type { EmptyHole, GridItem } from "../types"
import { EmptySlot } from "./empty-slot"
import {
  createEndSlot,
  expandWidgetIntoHole,
  findEmptyHoles,
  findExpandableNeighbor,
  type RowPruneMeta,
} from "./engine"
import { useGridPointer } from "./use-grid-pointer"
import { WidgetShell, type WidgetShellProps } from "./widget-shell"

const NARROW_BREAKPOINT_PX = 740

export interface GridWidgetSlotContent {
  title?: string
  headerControls?: ReactNode
  body: ReactNode
  footer?: ReactNode
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  pruneMeta?: RowPruneMeta
  contentVersion?: unknown
}

export type GridCardShellProps = Omit<
  WidgetShellProps,
  | "gridRef"
  | "title"
  | "headerControls"
  | "footer"
  | "loading"
  | "error"
  | "onRetry"
  | "pruneMeta"
  | "contentVersion"
  | "children"
>

export interface GridCanvasProps {
  items: readonly GridItem[]
  readonly: boolean
  locked: boolean
  justAddedUid?: string | null
  contentWidth?: number
  scrollContainerRef?: RefObject<HTMLElement | null>
  emptyState?: ReactNode
  onLayoutChange: (nextItems: GridItem[]) => void
  onRemoveWidget: (uid: string) => void
  onOpenSlotCatalog: (slot: EmptyHole) => void
  renderCard?: (item: GridItem, shellProps: GridCardShellProps) => ReactNode
  renderWidget?: (
    item: GridItem,
    context: { isNarrow: boolean; editable: boolean },
  ) => GridWidgetSlotContent
}

export function GridCanvas({
  items,
  readonly,
  locked,
  justAddedUid = null,
  contentWidth,
  scrollContainerRef,
  emptyState,
  onLayoutChange,
  onRemoveWidget,
  onOpenSlotCatalog,
  renderCard,
  renderWidget,
}: GridCanvasProps) {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [measuredNarrow, setMeasuredNarrow] = useState(false)
  const [liveItems, setLiveItems] = useState<GridItem[] | null>(null)

  useEffect(() => {
    if (contentWidth !== undefined && contentWidth > 0) return
    const targetEl =
      scrollContainerRef?.current ??
      gridRef.current?.parentElement ??
      gridRef.current
    if (!targetEl) return

    let rafId = 0
    const syncNarrow = () => {
      const width = Math.round(targetEl.clientWidth)
      if (width <= 0) return
      const next = width <= NARROW_BREAKPOINT_PX
      setMeasuredNarrow((prev) => (prev === next ? prev : next))
    }

    rafId = requestAnimationFrame(syncNarrow)

    if (typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(rafId)
    }

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(syncNarrow)
    })
    observer.observe(targetEl)

    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [contentWidth, scrollContainerRef])

  const isNarrow =
    contentWidth !== undefined && contentWidth > 0
      ? contentWidth <= NARROW_BREAKPOINT_PX
      : measuredNarrow

  // Smoothly scroll newly added widget into view when `justAddedUid` changes.
  useEffect(() => {
    if (!justAddedUid) return
    const gridEl = gridRef.current
    if (!gridEl) return

    const timer = window.setTimeout(() => {
      const card = gridEl.querySelector<HTMLElement>(`.mo-wg[data-uid="${justAddedUid}"]`)
      if (card && typeof card.scrollIntoView === "function") {
        card.scrollIntoView({ behavior: "smooth", block: "nearest" })
      }
    }, 80)

    return () => window.clearTimeout(timer)
  }, [justAddedUid])

  const editable = !readonly && !locked
  const pointerDisabled = !editable || isNarrow

  const handleLiveChange = useCallback((nextItems: GridItem[]) => {
    setLiveItems(nextItems)
  }, [])

  const handleCommit = useCallback(
    (nextItems: GridItem[]) => {
      setLiveItems(null)
      onLayoutChange(nextItems)
    },
    [onLayoutChange],
  )

  const { draggingUid, resizing, startDrag, startResize } = useGridPointer({
    gridRef,
    scrollContainerRef,
    items,
    disabled: pointerDisabled,
    onLiveChange: handleLiveChange,
    onCommit: handleCommit,
  })

  const isInteracting = draggingUid !== null || resizing !== null
  const renderedItems = isInteracting && liveItems ? liveItems : items

  const orderByUid = useMemo(() => {
    const sorted = [...renderedItems].sort((a, b) => a.y - b.y || a.x - b.x)
    const map = new Map<string, number>()
    sorted.forEach((entry, index) => {
      map.set(entry.uid, index)
    })
    return map
  }, [renderedItems])

  const slots = useMemo(() => {
    if (!editable || isNarrow || isInteracting || renderedItems.length === 0) {
      return { holes: [] as EmptyHole[], endSlot: null as EmptyHole | null }
    }
    return {
      holes: findEmptyHoles(renderedItems),
      endSlot: createEndSlot(renderedItems),
    }
  }, [editable, isNarrow, isInteracting, renderedItems])

  const handleExpandHole = useCallback(
    (targetUid: string, hole: EmptyHole) => {
      const expanded = expandWidgetIntoHole(items, targetUid, hole)
      onLayoutChange(expanded)
    },
    [items, onLayoutChange],
  )

  const gridClasses = ["mo-grid"]
  if (readonly) gridClasses.push("mo-ro")
  if (locked) gridClasses.push("mo-locked")
  if (draggingUid !== null) gridClasses.push("mo-dragging")
  if (resizing !== null) gridClasses.push("mo-sizing")

  return (
    <div className="mo-gwrap">
      <div ref={gridRef} className={gridClasses.join(" ")}>
        {renderedItems.length === 0
          ? emptyState
          : renderedItems.map((item) => {
              const badge =
                resizing && resizing.uid === item.uid
                  ? `${resizing.w}×${resizing.h}`
                  : null

              const baseShellProps: GridCardShellProps = {
                item,
                editable,
                isNarrow,
                isDragging: draggingUid === item.uid,
                resizeBadge: badge,
                justAdded: justAddedUid === item.uid,
                gridOrder: orderByUid.get(item.uid),
                onRemove: onRemoveWidget,
                onHeaderPointerDown: startDrag,
                onResizePointerDown: startResize,
              }

              if (renderCard) {
                return renderCard(item, baseShellProps)
              }

              if (!renderWidget) return null
              const slotContent = renderWidget(item, { isNarrow, editable })

              return (
                <WidgetShell
                  key={item.uid}
                  {...baseShellProps}
                  gridRef={gridRef}
                  title={slotContent.title}
                  loading={slotContent.loading}
                  error={slotContent.error}
                  onRetry={slotContent.onRetry}
                  headerControls={slotContent.headerControls}
                  footer={slotContent.footer}
                  pruneMeta={slotContent.pruneMeta}
                  contentVersion={slotContent.contentVersion}
                >
                  {slotContent.body}
                </WidgetShell>
              )
            })}

        {slots.holes.map((hole) => {
          const neighbor = findExpandableNeighbor(renderedItems, hole)
          const expandable = neighbor
            ? {
                uid: neighbor.item.uid,
                widgetTitle: getWidgetMeta(neighbor.item.widget).title,
              }
            : null

          return (
            <EmptySlot
              key={`hole-${hole.x}-${hole.y}-${hole.w}-${hole.h}`}
              slot={hole}
              expandable={expandable}
              onAdd={onOpenSlotCatalog}
              onExpand={handleExpandHole}
            />
          )
        })}

        {slots.endSlot && (
          <EmptySlot slot={slots.endSlot} onAdd={onOpenSlotCatalog} />
        )}
      </div>
    </div>
  )
}
