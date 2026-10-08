import { useEffect, useId, useRef, useState } from "react"
import { Check, ChevronRight, RefreshCw } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { useWorkspaceFrame } from "@/components/layout/workspace-frame-context"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { AcademyCatalog, AcademyProgress, CatalogChapter } from "./api"
import { CATALOG_CHAPTER_COUNT, CATALOG_LESSON_COUNT, chapterDone, completedLessonIds } from "./catalog-model"
import { useAcademyNavigation } from "./navigation"
import { useAcademyCatalog, useAcademyProgress, useRefreshAcademy } from "./queries"
import { scrollContainerOf } from "./scroll"
import { loadPanelState, savePanelState } from "./view-state"

/** `ch07-l01` → 7: the chapter of a lesson id, known before the catalog arrives. */
function chapterOfLesson(lessonId: string | null): number | null {
  const match = lessonId ? /^ch(\d{2})-l\d{2}$/.exec(lessonId) : null
  return match ? Number(match[1]) : null
}

function ProgressCard({
  progress,
  catalog,
  failed,
  loading,
  onRetry,
}: {
  progress: AcademyProgress | undefined
  catalog: AcademyCatalog | undefined
  failed: boolean
  loading: boolean
  onRetry: () => void
}) {
  const total = progress?.course_total ?? catalog?.lesson_count ?? CATALOG_LESSON_COUNT
  const done = progress?.course_done
  return (
    <section aria-label="Tiến độ học tập" className="rounded-lg border border-border bg-card p-3.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted-foreground">Tiến độ học tập</span>
        <b className="text-primary tabular-nums">{done === undefined ? "—" : `${done} / ${total}`}</b>
      </div>
      <div
        role="progressbar"
        aria-label="Tiến độ học tập"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={done === undefined ? "Chưa có tiến độ" : `${done} trên ${total} bài`}
        className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted"
      >
        <i className="block h-full bg-primary" style={{ width: done === undefined ? 0 : `${Math.min(100, (done / total) * 100)}%` }} />
      </div>
      {done === undefined && loading && !failed && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          Đang tải tiến độ…
        </p>
      )}
      {failed && (
        <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-destructive">
          <span>{done === undefined ? "Chưa tải được tiến độ." : "Chưa làm mới được tiến độ."}</span>
          <Button type="button" variant="ghost" size="xs" onClick={onRetry}>
            Thử lại
          </Button>
        </div>
      )}
    </section>
  )
}

function ChapterGroup({
  chapter,
  open,
  onToggle,
  completed,
  progress,
  currentLessonId,
  onSelect,
}: {
  chapter: CatalogChapter
  open: boolean
  onToggle: () => void
  completed: ReadonlySet<string>
  progress: AcademyProgress | undefined
  currentLessonId: string | null
  onSelect: (lessonId: string) => void
}) {
  const listId = useId()
  const done = chapterDone(progress, chapter)
  return (
    <section data-chapter={chapter.no} className="overflow-hidden rounded-lg border border-border bg-card">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={onToggle}
          className="flex w-full items-center gap-2.5 px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
        >
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-90")} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <small className="mb-0.5 block text-[10px] tracking-wider text-muted-foreground">CHƯƠNG {chapter.no}</small>
            <b className="block text-xs leading-snug font-semibold">{chapter.title}</b>
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums" aria-label={done === null ? `${chapter.lessons.length} bài` : `${done} trên ${chapter.lessons.length} bài đã học`}>
            {done === null ? "—" : done}/{chapter.lessons.length}
          </span>
        </button>
      </h3>
      <ul id={listId} hidden={!open} className="m-0 list-none px-3 pb-1">
        {chapter.lessons.map((lesson) => {
          const current = currentLessonId === lesson.id
          const learned = completed.has(lesson.id)
          return (
            <li
              key={lesson.id}
              data-academy-row={lesson.id}
              className={cn("flex items-center gap-2 border-t border-border py-3", current && "-mx-2 rounded-sm border-t-transparent bg-primary/10 px-2")}
            >
              <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <b className={cn("block text-xs leading-snug font-medium", current && "text-foreground")}>{lesson.name}</b>
                {learned && (
                  <small className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-(--status-success)">
                    <Check className="size-3" aria-hidden="true" />
                    Đã học
                  </small>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                aria-label={`Xem bài ${lesson.name}`}
                aria-current={current ? "true" : undefined}
                onClick={() => onSelect(lesson.id)}
              >
                Xem bài
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * «Học viện» tool panel: the 13 chapters and 71 lessons of the catalog with the learner's
 * progress. A lesson row has exactly two things: its name (with "Đã học" once completed) and
 * "Xem bài". No switch, no configuration, no practice and no badge lives here.
 *
 * Chapter 1 is open on the very first visit only; after that the learner's own open/closed
 * choice is kept for the session and a refetch never re-opens anything. The panel scrolls on its own
 * and keeps its position.
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
  const completed = completedLessonIds(progress)
  const lessonId = nav.lessonId

  const [openChapters, setOpenChapters] = useState<number[] | null>(() => loadPanelState(userId).openChapters)
  const [revealedFor, setRevealedFor] = useState<string | null>(null)
  const openSet = new Set(openChapters ?? [1])

  // A lesson was opened (menu or deep link, e.g. from a locked Bot indicator): show its chapter once.
  const lessonChapter = chapterOfLesson(lessonId)
  if (lessonId && lessonChapter !== null && revealedFor !== lessonId) {
    setRevealedFor(lessonId)
    if (!openSet.has(lessonChapter)) setOpenChapters([...openSet, lessonChapter])
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

  // Bring the current lesson's row into view once per opened lesson (never on a refetch).
  const scrolledFor = useRef<string | null>(null)
  useEffect(() => {
    if (!lessonId || !catalogReady || scrolledFor.current === lessonId || !contentRef.current) return
    scrolledFor.current = lessonId
    const row = contentRef.current.querySelector<HTMLElement>(`[data-academy-row="${lessonId}"]`)
    const viewport = scrollContainerOf(contentRef.current)
    if (!row || !viewport) return
    const rowBox = row.getBoundingClientRect()
    const viewportBox = viewport.getBoundingClientRect()
    if (rowBox.top < viewportBox.top || rowBox.bottom > viewportBox.bottom) viewport.scrollTop += rowBox.top - viewportBox.top - 18
  }, [lessonId, catalogReady])

  function toggle(no: number) {
    const next = new Set(openSet)
    if (next.has(no)) next.delete(no)
    else next.add(no)
    setOpenChapters([...next].sort((a, b) => a - b))
  }

  function select(id: string) {
    nav.openLesson(id)
    // On a phone the list is a layer: choosing a lesson closes it so the lesson can be read.
    if (frame?.overlay) frame.setOpen(false)
  }

  // Lessons, progress and coins belong to an account: a guest is asked to sign in and nothing is requested.
  if (!isAuthenticated && !isLoading) {
    return (
      <SidebarPanel title="Học viện" description={`${CATALOG_CHAPTER_COUNT} chương · ${CATALOG_LESSON_COUNT} bài học`}>
        <PanelState
          title="Đăng nhập để học"
          description="Bài học, tiến độ và xu học tập được lưu theo tài khoản của bạn."
          action={{ label: "Đăng nhập", onClick: () => openAuth("login") }}
        />
      </SidebarPanel>
    )
  }

  const refreshing = catalogQuery.isFetching || progressQuery.isFetching
  const chapterCount = catalog?.chapter_count ?? CATALOG_CHAPTER_COUNT
  const lessonCount = catalog?.lesson_count ?? CATALOG_LESSON_COUNT

  return (
    <SidebarPanel
      title="Học viện"
      description={`${chapterCount} chương · ${lessonCount} bài học`}
      actions={
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Làm mới Học viện" disabled={refreshing} onClick={() => void refresh()}>
          <RefreshCw className={cn(refreshing && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
        </Button>
      }
    >
      <div ref={contentRef} className="space-y-3">
        <ProgressCard
          progress={progress}
          catalog={catalog}
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
              completed={completed}
              progress={progress}
              currentLessonId={lessonId}
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
