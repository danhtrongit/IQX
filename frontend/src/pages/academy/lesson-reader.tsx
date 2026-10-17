import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { PanelState } from "@/components/layout/panel-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { isItemLocked, isNotFound } from "./api"
import { catalogItems, itemStates, locateItem, locatorText } from "./catalog-model"
import { useAcademyNavigation } from "./navigation"
import { academyKeys, useAcademyCatalog, useAcademyItem, useAcademyProgress } from "./queries"
import type { QuizIntent } from "./quiz/boot-quiz"
import { QuizFlow } from "./quiz/quiz-flow"
import { ExamIntro } from "./reader/exam-intro"
import { LessonView } from "./reader/lesson-view"
import { LockedState } from "./reader/locked-state"
import { ReaderTopbar } from "./reader/reader-topbar"
import { scrollReaderTo, scrollReaderToTop } from "./scroll"
import "./academy.css"

type Mode = { kind: "read" } | { kind: "quiz"; run: number; intent: QuizIntent }

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
 * The open item in the left area: a lesson or the practice room (content, quiz gate, pager), a
 * chapter exam (intro), or the quiz of either (content hidden). A locked item (403) shows
 * LockedState. Mount it with `key={lessonId}`: a slow response of item A never paints into item B.
 */
export function LessonReader({ lessonId }: { lessonId: string }) {
  const { user } = useAuth()
  const nav = useAcademyNavigation()
  const queryClient = useQueryClient()
  const itemQuery = useAcademyItem(lessonId)
  const catalogQuery = useAcademyCatalog()
  const progressQuery = useAcademyProgress()
  const [mode, setMode] = useState<Mode>({ kind: "read" })
  const [focusScenario, setFocusScenario] = useState(false)
  const runs = useRef(0)
  const rootRef = useRef<HTMLElement>(null)

  const item = itemQuery.data
  const catalog = catalogQuery.data
  const progress = progressQuery.data
  const states = itemStates(progress)
  const location = locateItem(catalog, lessonId)
  const catalogItem = item ?? catalogItems(catalog).get(lessonId) ?? null
  const locator = catalogItem ? locatorText(catalogItem, location?.chapter.lesson_count ?? null) : null

  const ready = item !== undefined
  useEffect(() => {
    if (ready) scrollReaderToTop(rootRef.current)
  }, [ready])

  // Back from the quiz because the scenario choice is missing: show the scenario once it is on screen.
  useEffect(() => {
    if (!focusScenario || mode.kind !== "read" || !item) return
    const frameId = window.requestAnimationFrame(() => {
      scrollReaderTo(rootRef.current?.querySelector<HTMLElement>("[data-academy-scenario]") ?? null)
      setFocusScenario(false)
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [focusScenario, mode.kind, item])

  const startQuiz = useCallback((intent: QuizIntent) => {
    runs.current += 1
    setMode({ kind: "quiz", run: runs.current, intent })
    window.requestAnimationFrame(() => scrollReaderToTop(rootRef.current))
  }, [])

  const exitQuiz = useCallback(() => {
    setMode({ kind: "read" })
    window.requestAnimationFrame(() => scrollReaderToTop(rootRef.current))
  }, [])

  const reloadItem = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: academyKeys.catalog })
    void queryClient.invalidateQueries({ queryKey: academyKeys.progress(user?.id) })
    void queryClient.invalidateQueries({ queryKey: academyKeys.item(user?.id, lessonId) })
    setMode({ kind: "read" })
  }, [queryClient, user?.id, lessonId])

  const scenarioRequired = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: academyKeys.item(user?.id, lessonId) })
    setMode({ kind: "read" })
    setFocusScenario(true)
  }, [queryClient, user?.id, lessonId])

  const review = useCallback(() => {
    // An exam leads back to the first item of its chapter ("Xem lại Chương c"); a lesson to its content.
    if (item?.kind === "chapter_exam" && location) nav.openLesson(location.firstOfChapter.id)
    else exitQuiz()
  }, [item?.kind, location, nav, exitQuiz])

  return (
    <article ref={rootRef} aria-label={catalogItem?.name ?? "Bài học"} data-lesson-id={lessonId} className="mx-auto w-full min-w-0 max-w-[1000px]">
      <ReaderTopbar locator={locator} onClose={nav.closeLesson} />

      {itemQuery.isPending ? (
        <ReaderSkeleton />
      ) : itemQuery.isError || !item ? (
        isItemLocked(itemQuery.error) ? (
          <LockedState currentItemId={progress?.current_item_id ?? null} onOpen={nav.openLesson} />
        ) : (
          <PanelState
            title={isNotFound(itemQuery.error) ? "Không tìm thấy bài học" : "Chưa tải được nội dung bài học"}
            description={
              isNotFound(itemQuery.error)
                ? "Bài học này không có trong danh mục Học viện."
                : `${errorMessage(itemQuery.error)} Tiến độ đã xác nhận của bạn được giữ nguyên.`
            }
            action={isNotFound(itemQuery.error) ? undefined : { label: "Thử lại", onClick: () => void itemQuery.refetch() }}
          />
        )
      ) : mode.kind === "quiz" ? (
        <QuizFlow
          key={mode.run}
          item={item}
          intent={mode.intent}
          onExit={exitQuiz}
          onRetake={() => startQuiz({ kind: "retake" })}
          onReview={review}
          onNext={nav.openLesson}
          onReload={reloadItem}
          onScenarioRequired={scenarioRequired}
        />
      ) : item.kind === "chapter_exam" ? (
        <ExamIntro
          exam={item}
          onStart={() => startQuiz({ kind: "start" })}
          onReviewChapter={location ? () => nav.openLesson(location.firstOfChapter.id) : null}
        />
      ) : (
        <LessonView lesson={item} location={location} states={states} onStartQuiz={() => startQuiz({ kind: "start" })} onOpen={nav.openLesson} />
      )}
    </article>
  )
}
