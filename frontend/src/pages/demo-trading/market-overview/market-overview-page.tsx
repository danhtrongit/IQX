import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import "./market-overview.css"
import { resolveWidgetState } from "./api"
import { GridCanvas, type GridCardShellProps } from "./grid/grid-canvas"
import { WidgetShell } from "./grid/widget-shell"
import { serializeWidgetStateKey, useWidgetSnapshot } from "./hooks"
import { useMarketOverviewRealtime } from "./realtime-bridge"
import { CatalogDrawer } from "./shell/catalog-drawer"
import { EmptyPageState } from "./shell/empty-page-state"
import { TabBar } from "./shell/tab-bar"
import { TabContextMenu } from "./shell/tab-context-menu"
import { ToastBar } from "./shell/toast-bar"
import {
  TEMPLATE_PAGE_ID,
  getRememberedScrollTop,
  rememberScrollTop,
  usePagesController,
} from "./shell/use-pages-controller"
import type { GridItem, WidgetSlug, WidgetStateMap } from "./types"
import { getWidgetRenderer } from "./widgets/registry"

const DRAWER_WIDTH_PX = 400
const MIN_CONTENT_WIDTH_WITH_DRAWER_PX = 740
const MAX_SCROLL_RESTORE_ATTEMPTS = 12

interface ConnectedWidgetCardProps<W extends WidgetSlug = WidgetSlug> {
  item: GridItem<W>
  shellProps: GridCardShellProps
  active: boolean
  onUpdateState: (uid: string, patch: Readonly<Record<string, unknown>>) => void
}

function ConnectedWidgetCardBase<W extends WidgetSlug>({
  item,
  shellProps,
  active,
  onUpdateState,
}: ConnectedWidgetCardProps<W>) {
  const widget = item.widget as W
  const resolvedState = useMemo(
    () =>
      resolveWidgetState(
        widget,
        item.state as Readonly<Record<string, unknown>>,
      ),
    [widget, item.state],
  )

  const query = useWidgetSnapshot(widget, resolvedState, active)
  const snapshot = query.data
  const renderer = getWidgetRenderer(widget)

  const handleStateChange = useCallback(
    (patch: Partial<WidgetStateMap[W]>) => {
      onUpdateState(item.uid, patch as Readonly<Record<string, unknown>>)
    },
    [item.uid, onUpdateState],
  )

  const handleRetry = useCallback(() => {
    void query.refetch()
  }, [query])

  const headerControls = renderer.renderHeaderControls?.({
    state: resolvedState,
    onStateChange: handleStateChange,
  })
  const footer = renderer.renderFooter?.()
  const pruneMeta = useMemo(
    () => renderer.getPruneMeta?.(resolvedState, snapshot?.data),
    [renderer, resolvedState, snapshot?.data],
  )

  const isLoading = query.isPending || (query.isFetching && !snapshot)
  const errorText = query.isError && !snapshot ? "Chưa tải được dữ liệu" : null
  const contentVersion = `${serializeWidgetStateKey(widget, resolvedState)}:${snapshot?.meta.asOf ?? ""}:${snapshot?.meta.isMarketOpen ? 1 : 0}`

  const body = renderer.renderBody({
    state: resolvedState,
    data: snapshot?.data,
    meta: snapshot?.meta,
    isNarrow: shellProps.isNarrow,
    onStateChange: handleStateChange,
  })

  return (
    <WidgetShell
      {...shellProps}
      loading={isLoading}
      error={errorText}
      onRetry={handleRetry}
      headerControls={headerControls}
      footer={footer}
      pruneMeta={pruneMeta}
      contentVersion={contentVersion}
    >
      {body}
    </WidgetShell>
  )
}

function areCardPropsEqual(
  prev: ConnectedWidgetCardProps,
  next: ConnectedWidgetCardProps,
): boolean {
  return (
    prev.item === next.item &&
    prev.active === next.active &&
    prev.onUpdateState === next.onUpdateState &&
    prev.shellProps.editable === next.shellProps.editable &&
    prev.shellProps.isNarrow === next.shellProps.isNarrow &&
    prev.shellProps.isDragging === next.shellProps.isDragging &&
    prev.shellProps.resizeBadge === next.shellProps.resizeBadge &&
    prev.shellProps.justAdded === next.shellProps.justAdded &&
    prev.shellProps.gridOrder === next.shellProps.gridOrder &&
    prev.shellProps.onRemove === next.shellProps.onRemove &&
    prev.shellProps.onHeaderPointerDown === next.shellProps.onHeaderPointerDown &&
    prev.shellProps.onResizePointerDown === next.shellProps.onResizePointerDown
  )
}

const ConnectedWidgetCard = memo(
  ConnectedWidgetCardBase,
  areCardPropsEqual,
) as typeof ConnectedWidgetCardBase

export function MarketOverviewPage() {
  const queryClient = useQueryClient()
  const controller = usePagesController()

  const rootRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const scrollRestoredRef = useRef<boolean>(false)
  const [rootWidth, setRootWidth] = useState<number>(0)
  const [contentWidth, setContentWidth] = useState<number>(0)

  // Track root & content widths so push-vs-overlay drawer and JS/CSS narrow breakpoints align to the exact pixel.
  useEffect(() => {
    const rootEl = rootRef.current
    const contentEl = contentRef.current
    if (!rootEl) return

    let rafId = 0
    const syncWidths = () => {
      const nextRoot = Math.round(rootEl.clientWidth)
      if (nextRoot > 0) {
        setRootWidth((prev) => (prev === nextRoot ? prev : nextRoot))
      }
      if (contentEl) {
        const nextContent = Math.round(contentEl.clientWidth)
        if (nextContent > 0) {
          setContentWidth((prev) => (prev === nextContent ? prev : nextContent))
        }
      }
    }

    rafId = requestAnimationFrame(syncWidths)
    if (typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(rafId)
    }

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(syncWidths)
    })
    observer.observe(rootEl)
    if (contentEl) observer.observe(contentEl)

    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [])

  // Restore remembered scrollTop on mount or tab change without StrictMode or post-detach unmount clobbering it to 0.
  const activePageId = controller.activePageId
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return

    scrollRestoredRef.current = false
    const saved = getRememberedScrollTop(activePageId)
    let rafId = 0
    let fallbackTimer: number | null = null
    let attempts = 0

    const tryRestore = () => {
      const node = contentRef.current
      if (!node) return
      if (saved <= 0) {
        node.scrollTop = 0
        scrollRestoredRef.current = true
        return
      }
      node.scrollTop = saved
      const maxScrollable = node.scrollHeight - node.clientHeight
      if (maxScrollable >= saved - 2 && node.scrollTop >= saved - 2) {
        scrollRestoredRef.current = true
        return
      }
      attempts += 1
      if (attempts < MAX_SCROLL_RESTORE_ATTEMPTS) {
        rafId = requestAnimationFrame(tryRestore)
      } else {
        scrollRestoredRef.current = true
      }
    }

    rafId = requestAnimationFrame(tryRestore)
    if (saved > 0) {
      fallbackTimer = window.setTimeout(() => {
        if (!scrollRestoredRef.current && contentRef.current) {
          contentRef.current.scrollTop = saved
          scrollRestoredRef.current = true
        }
      }, 350)
    }

    return () => {
      cancelAnimationFrame(rafId)
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer)
      }
      if (scrollRestoredRef.current && el.isConnected) {
        rememberScrollTop(activePageId, el.scrollTop)
      }
    }
  }, [activePageId])

  // Stream incremental WS deltas in 3-second batches for active visible widgets.
  useMarketOverviewRealtime(controller.activeItems, queryClient, true)

  // Keep push-drawer only when remaining content width stays strictly above the 740px narrow breakpoint.
  const drawerOverlay =
    rootWidth > 0 && rootWidth - DRAWER_WIDTH_PX <= MIN_CONTENT_WIDTH_WITH_DRAWER_PX

  const handleOpenCatalogDefault = useCallback(() => {
    controller.openCatalog(null)
  }, [controller])

  const handleUpdateWidgetState = controller.updateWidgetState

  const renderCard = useCallback(
    (item: GridItem, shellProps: GridCardShellProps) => (
      <ConnectedWidgetCard
        key={item.uid}
        item={item}
        shellProps={shellProps}
        active
        onUpdateState={handleUpdateWidgetState}
      />
    ),
    [handleUpdateWidgetState],
  )

  const contentClassName =
    controller.drawerOpen && !drawerOverlay ? "mo-content mo-dr-push" : "mo-content"

  return (
    <div ref={rootRef} className="mo-root" data-testid="market-overview-page">
      <div
        ref={contentRef}
        className={contentClassName}
        onScroll={(event) => {
          const nextTop = event.currentTarget.scrollTop
          if (scrollRestoredRef.current || nextTop > 0) {
            scrollRestoredRef.current = true
            rememberScrollTop(activePageId, nextTop)
          }
        }}
      >
        <TabBar
          pages={controller.pages}
          activePageId={controller.activePageId}
          templatePageId={TEMPLATE_PAGE_ID}
          isTemplateActive={controller.isTemplateActive}
          activePageHasWidgets={controller.activeItems.length > 0}
          locked={controller.locked}
          renamingPageId={controller.renamingPageId}
          menuOpenPageId={controller.menuState?.pageId ?? null}
          onSelectPage={controller.selectPage}
          onCreatePage={controller.createPage}
          onStartRename={controller.startRename}
          onCommitRename={controller.commitRename}
          onCancelRename={controller.cancelRename}
          onOpenMenu={controller.openTabMenu}
          onReorderPages={controller.reorderPages}
          onPackLayout={controller.packActiveLayout}
          onToggleLock={controller.toggleLock}
          onOpenCatalog={handleOpenCatalogDefault}
        />

        <GridCanvas
          items={controller.activeItems}
          readonly={controller.isTemplateActive}
          locked={controller.locked}
          justAddedUid={controller.justAddedUid}
          contentWidth={contentWidth}
          scrollContainerRef={contentRef}
          emptyState={
            !controller.isTemplateActive ? (
              <EmptyPageState onOpenCatalog={handleOpenCatalogDefault} />
            ) : undefined
          }
          onLayoutChange={controller.updateLayout}
          onRemoveWidget={controller.removeWidget}
          onOpenSlotCatalog={controller.openCatalog}
          renderCard={renderCard}
        />
      </div>

      {!controller.isTemplateActive && (
        <CatalogDrawer
          open={controller.drawerOpen}
          overlay={drawerOverlay}
          widgets={controller.catalog}
          placedCounts={controller.placedCounts}
          targetSlot={controller.slotTarget}
          onClearTargetSlot={controller.clearSlotTarget}
          onAddWidget={controller.addWidget}
          onClose={controller.closeCatalog}
        />
      )}

      <TabContextMenu
        pageId={controller.menuState?.pageId ?? null}
        anchorRect={controller.menuState?.anchorRect ?? null}
        onRename={controller.startRename}
        onDuplicate={controller.duplicatePage}
        onDelete={controller.deletePage}
        onClose={controller.closeTabMenu}
      />

      <ToastBar toast={controller.toast} onDismiss={controller.dismissToast} />
    </div>
  )
}
