import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react"
import { getWidgetMeta } from "../catalog"
import type { GridItem } from "../types"
import type { RowPruneMeta } from "./engine"
import { useContainerScale } from "./use-container-scale"
import type { ResizeDirection } from "./use-grid-pointer"
import { useRowFitting } from "./use-row-fitting"

export interface WidgetShellProps {
  item: GridItem
  title?: string
  gridRef?: RefObject<HTMLElement | null>
  editable: boolean
  isNarrow: boolean
  isDragging?: boolean
  resizeBadge?: string | null
  justAdded?: boolean
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  headerControls?: ReactNode
  footer?: ReactNode
  pruneMeta?: RowPruneMeta
  contentVersion?: unknown
  gridOrder?: number
  onRemove?: (uid: string) => void
  onHeaderPointerDown?: (uid: string, event: ReactPointerEvent<HTMLElement>) => void
  onResizePointerDown?: (
    uid: string,
    direction: ResizeDirection,
    event: ReactPointerEvent<HTMLElement>,
  ) => void
  children?: ReactNode
}

type WidgetCardStyle = CSSProperties & {
  "--mh": string
}

function WidgetSkeleton() {
  return (
    <div
      className="flex h-full w-full flex-col gap-2.5 p-3"
      role="status"
      aria-label="Đang tải dữ liệu"
    >
      <div className="mo-sk h-5 w-2/5" />
      <div className="mo-sk h-3.5 w-3/5" />
      <div className="mo-sk min-h-[60px] flex-1 w-full" />
    </div>
  )
}

export function WidgetShell({
  item,
  title,
  gridRef,
  editable,
  isNarrow,
  isDragging = false,
  resizeBadge = null,
  justAdded = false,
  loading = false,
  error = null,
  onRetry,
  headerControls,
  footer,
  pruneMeta,
  contentVersion,
  gridOrder,
  onRemove,
  onHeaderPointerDown,
  onResizePointerDown,
  children,
}: WidgetShellProps) {
  const widgetRef = useRef<HTMLElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const meta = getWidgetMeta(item.widget)
  const resolvedTitle = title ?? meta.title

  useContainerScale({
    widgetRef,
    gridRef,
    defaultCols: meta.defaultW,
    defaultRows: meta.defaultH,
    isNarrow,
  })

  useRowFitting({
    bodyRef,
    widget: item.widget,
    isNarrow,
    pruneMeta,
    contentVersion,
  })

  const mobileHeight = Math.max(260, Math.min(640, item.h * 58))
  const cardStyle: WidgetCardStyle = {
    gridColumn: `${item.x + 1} / span ${item.w}`,
    gridRow: `${item.y + 1} / span ${item.h}`,
    order: gridOrder,
    "--mh": `${mobileHeight}px`,
  }

  const classNames = ["mo-wg"]
  if (isDragging) classNames.push("mo-lift")
  if (resizeBadge !== null) classNames.push("mo-sizing")
  if (justAdded) classNames.push("mo-just-added")

  const showInteractiveHandles = editable && !isNarrow

  return (
    <article
      ref={widgetRef}
      className={classNames.join(" ")}
      data-uid={item.uid}
      data-widget={item.widget}
      style={cardStyle}
      aria-label={resolvedTitle}
    >
      <header
        className="mo-wh"
        onPointerDown={
          showInteractiveHandles && onHeaderPointerDown
            ? (event) => onHeaderPointerDown(item.uid, event)
            : undefined
        }
      >
        <span className="mo-t" title={resolvedTitle}>
          {resolvedTitle}
        </span>
        <span className="mo-sp" />
        {headerControls ? (
          <div className="mo-wh-ctrl" data-no-drag="true">
            {headerControls}
          </div>
        ) : null}
        {editable && (
          <button
            type="button"
            className="mo-del"
            data-no-drag="true"
            title="Xoá khỏi dashboard"
            aria-label={`Xoá ${resolvedTitle} khỏi dashboard`}
            onClick={() => onRemove?.(item.uid)}
          >
            ✕
          </button>
        )}
      </header>

      <div ref={bodyRef} className="mo-wb">
        {loading ? (
          <WidgetSkeleton />
        ) : error ? (
          <div className="mo-state" role="alert">
            <b>Chưa tải được dữ liệu</b>
            {onRetry && (
              <button type="button" className="mo-btn" onClick={onRetry}>
                Tải lại
              </button>
            )}
          </div>
        ) : (
          children
        )}
      </div>

      {!loading && !error && footer ? <footer className="mo-wf">{footer}</footer> : null}

      {showInteractiveHandles && onResizePointerDown && (
        <>
          <div
            className="mo-rzr"
            data-no-drag="true"
            onPointerDown={(event) => onResizePointerDown(item.uid, "x", event)}
          />
          <div
            className="mo-rzb"
            data-no-drag="true"
            onPointerDown={(event) => onResizePointerDown(item.uid, "y", event)}
          />
          <div
            className="mo-rz"
            data-no-drag="true"
            title="Kéo để đổi kích thước"
            onPointerDown={(event) => onResizePointerDown(item.uid, "xy", event)}
          />
        </>
      )}

      {resizeBadge !== null && (
        <span className="mo-rbadge" aria-live="polite">
          {resizeBadge}
        </span>
      )}
    </article>
  )
}
