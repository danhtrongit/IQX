import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, ArrowRight, BookOpen, Check, ListTree } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { useWorkspaceFrame } from "@/components/layout/workspace-frame-context"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { isLessonNotFound, LESSON_REWARD_XU, type AcademyLesson } from "./api"
import { BlockRenderer } from "./blocks/block-renderer"
import { chapterDone, locateLessons } from "./catalog-model"
import { GuideCompletion } from "./guide-completion"
import { useAcademyNavigation } from "./navigation"
import { academyKeys, useAcademyCatalog, useAcademyLesson, useAcademyProgress } from "./queries"
import type { QuizIntent } from "./quiz/boot-quiz"
import { QuizEntry } from "./quiz/quiz-entry"
import { QuizFlow } from "./quiz/quiz-flow"
import { scrollReaderTo, scrollReaderToTop } from "./scroll"
import "./academy.css"

type Mode = { kind: "read" } | { kind: "quiz"; run: number; intent: QuizIntent }

const sectionNumber = (index: number) => String(index + 1).padStart(2, "0")

function StatusTags({ lesson }: { lesson: AcademyLesson }) {
  const coinsConfirmed = lesson.reward?.status === "credited" || lesson.reward?.status === "already_rewarded"
  if (!lesson.completed) return null
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 rounded-sm border border-price-up/50 bg-price-up/10 px-2 py-0.5 text-xs font-semibold text-price-up">
        <Check className="size-3" aria-hidden="true" />
        Đã học
      </span>
      {coinsConfirmed && (
        <span className="rounded-sm border border-accent/60 bg-accent/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-accent">
          Đã nhận {LESSON_REWARD_XU} xu
        </span>
      )}
    </div>
  )
}

function ReaderSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-busy="true" aria-label="Đang tải nội dung">
      <Skeleton className="h-36 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}

/**
 * The lesson in the left area: header (chapter, lesson number, title, "Đã học"), the four part
 * links, the typed blocks of every section, then either the quiz entry (quiz lessons) or the
 * "Hoàn thành bài học" button (guides), and the previous / next lesson of the chapter.
 * Mount it with `key={lessonId}`: a slow response of lesson A can never paint into lesson B.
 */
export function LessonReader({ lessonId }: { lessonId: string }) {
  const nav = useAcademyNavigation()
  const frame = useWorkspaceFrame()
  const queryClient = useQueryClient()
  const lessonQuery = useAcademyLesson(lessonId)
  const catalogQuery = useAcademyCatalog()
  const progressQuery = useAcademyProgress()
  const [mode, setMode] = useState<Mode>({ kind: "read" })
  const [jump, setJump] = useState<number | null>(null)
  const runs = useRef(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const rootRef = useRef<HTMLElement>(null)

  const lesson = lessonQuery.data
  const location = locateLessons(catalogQuery.data).get(lessonId)
  const published = lesson?.content_status === "published"
  const readingMode = mode.kind === "read"

  // A lesson was opened: bring its heading into focus once its content is on screen.
  const ready = lesson !== undefined
  useEffect(() => {
    if (!ready) return
    headingRef.current?.focus({ preventScroll: true })
    scrollReaderToTop(rootRef.current)
  }, [ready])

  // Returning from the quiz: to the requested part ("Xem lại phần N"), else to the top of the lesson.
  useEffect(() => {
    if (!readingMode) return
    const frameId = window.requestAnimationFrame(() => {
      if (jump !== null) {
        scrollReaderTo(document.getElementById(`academy-section-${jump}`))
        setJump(null)
      }
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [readingMode, jump])

  const startQuiz = useCallback((intent: QuizIntent) => {
    runs.current += 1
    setMode({ kind: "quiz", run: runs.current, intent })
    window.requestAnimationFrame(() => scrollReaderToTop(rootRef.current))
  }, [])

  const exitQuiz = useCallback((section?: number) => {
    setMode({ kind: "read" })
    if (section) setJump(section)
    else window.requestAnimationFrame(() => scrollReaderToTop(rootRef.current))
  }, [])

  const reloadLesson = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: academyKeys.catalog })
    void queryClient.invalidateQueries({ queryKey: ["academy", "lesson"] })
    setMode({ kind: "read" })
  }, [queryClient])

  const prevLesson = location?.prev ?? null
  const nextLesson = location?.next ?? null
  const chapterTotal = location?.chapterSize
  const doneInChapter = location ? chapterDone(progressQuery.data, location.chapter) : null
  const chapterComplete = location !== undefined && doneInChapter !== null && doneInChapter === chapterTotal

  return (
    <article ref={rootRef} aria-label={lesson?.title ?? "Bài học"} data-lesson-id={lessonId} className="mx-auto w-full min-w-0 max-w-[1000px]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={nav.closeLesson}>
          <ArrowLeft aria-hidden="true" />
          Về linh thú
        </Button>
        <div className="flex items-center gap-2">
          {location && (
            <span className="text-xs text-muted-foreground tabular-nums">
              Bài {location.position} / {location.chapterSize}
            </span>
          )}
          {frame?.overlay && (
            <Button type="button" variant="outline" size="sm" onClick={() => frame.setOpen(true)}>
              <ListTree aria-hidden="true" />
              Danh sách bài
            </Button>
          )}
        </div>
      </div>

      {lessonQuery.isPending ? (
        <ReaderSkeleton />
      ) : lessonQuery.isError || !lesson ? (
        <PanelState
          title={isLessonNotFound(lessonQuery.error) ? "Không tìm thấy bài học" : "Chưa tải được nội dung bài học"}
          description={
            isLessonNotFound(lessonQuery.error)
              ? "Bài học này không có trong danh mục Học viện."
              : `${errorMessage(lessonQuery.error)} Tiến độ đã xác nhận của bạn được giữ nguyên.`
          }
          action={isLessonNotFound(lessonQuery.error) ? undefined : { label: "Thử lại", onClick: () => void lessonQuery.refetch() }}
        />
      ) : (
        <>
          {readingMode && (
            <header className="rounded-lg border border-border bg-card p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold tracking-wider text-primary uppercase">
                <span>
                  Chương {lesson.chapter}
                  {location ? ` · ${location.chapter.title}` : ""}
                </span>
                {location && (
                  <span className="text-muted-foreground tabular-nums">
                    {sectionNumber(location.position - 1)} / {sectionNumber(location.chapterSize - 1)}
                  </span>
                )}
              </div>
              <h2 id="academy-reader-heading" ref={headingRef} tabIndex={-1} className="mt-2 font-heading text-2xl leading-tight font-bold outline-none sm:text-[28px]">
                {lesson.title}
              </h2>
              {lesson.lead && <p className="mt-3 max-w-[70ch] text-sm leading-7 text-muted-foreground">{lesson.lead}</p>}
              <StatusTags lesson={lesson} />
              {lesson.completion.mode === "guide" && location && doneInChapter !== null && (
                <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                  Chương {lesson.chapter} · {doneInChapter}/{location.chapterSize} bài
                </p>
              )}
            </header>
          )}

          {!published ? (
            <section className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-4 py-10 text-center" aria-live="polite">
              <BookOpen className="size-6 text-muted-foreground/70" aria-hidden="true" />
              <h3 className="text-sm font-semibold">Nội dung chưa được xuất bản</h3>
              <p className="max-w-md text-xs leading-relaxed text-muted-foreground">Bài học này chưa có nội dung để đọc, và chưa thể làm bài kiểm tra hay hoàn thành.</p>
            </section>
          ) : mode.kind === "quiz" ? (
            <QuizFlow
              key={mode.run}
              lesson={lesson}
              intent={mode.intent}
              onExitToLesson={exitQuiz}
              onRetake={() => startQuiz({ kind: "retake" })}
              onReloadLesson={reloadLesson}
              onOpenBot={nav.openBot}
              onOpenFilter={nav.openFilter}
            />
          ) : (
            <>
              <nav aria-label="Các phần của bài" className="my-3 flex flex-wrap gap-2">
                {lesson.sections.map((section, index) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => scrollReaderTo(document.getElementById(`academy-section-${index + 1}`))}
                    className="min-w-24 flex-1 rounded-md border border-border bg-card px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {sectionNumber(index)} · {lesson.nav_labels?.[index] ?? section.title}
                  </button>
                ))}
              </nav>

              {lesson.sections.map((section, index) => (
                <section
                  key={section.id}
                  id={`academy-section-${index + 1}`}
                  aria-labelledby={`academy-section-title-${index + 1}`}
                  className="mt-3 min-w-0 scroll-mt-3 rounded-lg border border-border bg-card p-4 sm:p-6"
                >
                  <h3 id={`academy-section-title-${index + 1}`} className="mb-4 flex items-center gap-3 border-b border-border pb-3 font-heading text-lg font-semibold">
                    <span aria-hidden="true" className="grid h-7 min-w-7 place-items-center rounded-sm border border-border bg-muted px-1 text-[11px] font-semibold text-primary tabular-nums">
                      {sectionNumber(index)}
                    </span>
                    {section.title}
                  </h3>
                  <BlockRenderer blocks={section.blocks} context={{ charts: lesson.charts, onReload: () => void lessonQuery.refetch() }} />
                </section>
              ))}

              {lesson.completion.mode === "guide" ? (
                <GuideCompletion lesson={lesson} onReload={reloadLesson} />
              ) : (
                <QuizEntry
                  lesson={lesson}
                  onStart={() => startQuiz({ kind: "start" })}
                  onReview={(attemptId) => startQuiz({ kind: "review", attemptId })}
                  onOpenBot={nav.openBot}
                  onOpenFilter={nav.openFilter}
                />
              )}

              {location && (
                <nav aria-label="Bài trước và bài sau" className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  {prevLesson ? (
                    <Button type="button" variant="outline" onClick={() => nav.openLesson(prevLesson.id)} className="h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-left">
                      <ArrowLeft aria-hidden="true" />
                      {prevLesson.name}
                    </Button>
                  ) : (
                    <span />
                  )}
                  {nextLesson ? (
                    <Button type="button" variant="outline" onClick={() => nav.openLesson(nextLesson.id)} className="ml-auto h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-left">
                      {nextLesson.name}
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  ) : (
                    <span className={cn("ml-auto text-xs text-muted-foreground")}>
                      {chapterComplete ? `Đã hoàn thành Chương ${location.chapter.no}` : `Hết nội dung Chương ${location.chapter.no}`}
                    </span>
                  )}
                </nav>
              )}
            </>
          )}
        </>
      )}
    </article>
  )
}
