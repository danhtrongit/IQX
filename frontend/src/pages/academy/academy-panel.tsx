import { useEffect, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { useWorkspaceFrame } from "@/components/layout/workspace-frame-context"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { chapterOfItem, itemStates, REQUIRED_TOTAL_FALLBACK } from "./catalog-model"
import { useAcademyNavigation } from "./navigation"
import { ChapterGroup } from "./panel/chapter-group"
import { ProgressCard } from "./panel/progress-card"
import { useAcademyCatalog, useAcademyProgress, useRefreshAcademy } from "./queries"
import { scrollContainerOf } from "./scroll"
import { loadPanelState, savePanelState } from "./view-state"

/**
 * «Học viện» tool panel: "Học viện", "{required_total} bài học", the progress card and one group per
 * published chapter. Every row shows the server-computed state (`progress.items[].state`): "Xem lại",
 * "Học bài" / "Làm bài", or a lock with "Chưa mở". No switch, no configuration and no practice tool.
 *
 * Until the learner decides, the chapter of the open item (or of the current item) is open; after that
 * the learner's own open/closed choice is kept for the session and a refetch never re-opens anything.
 */
export function AcademyPanel() {
  const { user, isAuthenticated, isLoading, openAuth } = useAuth()
  const userId = user?.id
  const frame = useWorkspaceFrame()
  const nav = useAcademyNavigation()
  const catalogQuery = useAcademyCatalog()
  const progressQuery = useAcademyProgress()
  const refresh = useRefreshAcademy()
  const contentRef = useRef<HTMLDivElement>(null)

  const catalog = catalogQuery.data
  const progress = progressQuery.data
  const states = itemStates(progress)
  const openItemId = nav.lessonId

  const [openChapters, setOpenChapters] = useState<number[] | null>(() => loadPanelState(userId).openChapters)
  const [revealedFor, setRevealedFor] = useState<string | null>(null)
  const defaultChapter = chapterOfItem(openItemId) ?? chapterOfItem(progress?.current_item_id ?? null) ?? 1
  const openSet = new Set(openChapters ?? [defaultChapter])

  // An item was opened (row or deep link, e.g. from a locked Bot indicator): show its chapter once.
  const openChapter = chapterOfItem(openItemId)
  if (openItemId && openChapter !== null && revealedFor !== openItemId) {
    setRevealedFor(openItemId)
    if (openChapters !== null && !openSet.has(openChapter)) setOpenChapters([...openSet, openChapter].sort((a, b) => a - b))
  }

  useEffect(() => {
    savePanelState(userId, { openChapters })
  }, [userId, openChapters])

  // The panel keeps its scroll position across tool switches and refetches.
  const restored = useRef(false)
  const catalogReady = catalog !== undefined
  useEffect(() => {
    if (restored.current || !catalogReady || !contentRef.current) return
    restored.current = true
    const viewport = scrollContainerOf(contentRef.current)
    const top = loadPanelState(userId).scrollTop
    if (viewport && top > 0) viewport.scrollTop = top
  }, [catalogReady, userId])

  useEffect(() => {
    const viewport = contentRef.current ? scrollContainerOf(contentRef.current) : null
    if (!viewport) return
    let frameId = 0
    const onScroll = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => savePanelState(userId, { scrollTop: viewport.scrollTop }))
    }
    viewport.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      viewport.removeEventListener("scroll", onScroll)
      window.cancelAnimationFrame(frameId)
    }
  }, [userId])

  // Bring the open item's row into view once per opened item (never on a refetch).
  const scrolledFor = useRef<string | null>(null)
  useEffect(() => {
    if (!openItemId || !catalogReady || scrolledFor.current === openItemId || !contentRef.current) return
    scrolledFor.current = openItemId
    const row = contentRef.current.querySelector<HTMLElement>(`[data-academy-row="${openItemId}"]`)
    const viewport = scrollContainerOf(contentRef.current)
    if (!row || !viewport) return
    const rowBox = row.getBoundingClientRect()
    const viewportBox = viewport.getBoundingClientRect()
    if (rowBox.top < viewportBox.top || rowBox.bottom > viewportBox.bottom) viewport.scrollTop += rowBox.top - viewportBox.top - 18
  }, [openItemId, catalogReady])

  function toggle(no: number) {
    const next = new Set(openSet)
    if (next.has(no)) next.delete(no)
    else next.add(no)
    setOpenChapters([...next].sort((a, b) => a - b))
  }

  function select(id: string) {
    nav.openLesson(id)
    // On a phone the list is a layer: choosing an item closes it so the item can be read.
    if (frame?.overlay) frame.setOpen(false)
  }

  // Lessons, progress and coins belong to an account: a guest is asked to sign in and nothing is requested.
  if (!isAuthenticated && !isLoading) {
    return (
      <SidebarPanel title="Học viện" description={`${REQUIRED_TOTAL_FALLBACK} bài học`}>
        <PanelState
          title="Đăng nhập để học"
          description="Bài học, tiến độ và xu học tập được lưu theo tài khoản của bạn."
          action={{ label: "Đăng nhập", onClick: () => openAuth("login") }}
        />
      </SidebarPanel>
    )
  }

  const refreshing = catalogQuery.isFetching || progressQuery.isFetching
  const total = catalog?.required_total ?? REQUIRED_TOTAL_FALLBACK

  return (
    <SidebarPanel
      title="Học viện"
      description={`${total} bài học`}
      actions={
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Làm mới Học viện" disabled={refreshing} onClick={() => void refresh()}>
          <RefreshCw className={cn(refreshing && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
        </Button>
      }
    >
      <div ref={contentRef} className="space-y-3">
        <ProgressCard
          progress={progress}
          total={total}
          failed={progressQuery.isError}
          loading={progressQuery.isPending}
          onRetry={() => void progressQuery.refetch()}
        />
        {catalog ? (
          catalog.chapters.map((chapter) => (
            <ChapterGroup
              key={chapter.no}
              chapter={chapter}
              open={openSet.has(chapter.no)}
              onToggle={() => toggle(chapter.no)}
              states={states}
              progress={progress}
              currentItemId={openItemId}
              onSelect={select}
            />
          ))
        ) : catalogQuery.isError ? (
          <PanelState
            title="Chưa tải được danh sách bài học"
            description={`${errorMessage(catalogQuery.error)} Tiến độ đã xác nhận của bạn được giữ nguyên.`}
            action={{ label: "Thử lại", onClick: () => void catalogQuery.refetch() }}
          />
        ) : (
          <div className="space-y-3" role="status" aria-busy="true" aria-label="Đang tải danh sách bài học">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        )}
      </div>
    </SidebarPanel>
  )
}
