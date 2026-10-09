import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { PanelState } from "@/components/layout/panel-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { fetchAttemptReview, isNotPublished, isVersionConflict, type AcademyLesson, type AcademySubmitResult } from "../api"
import { invalidateAfterSubmit } from "../queries"
import { markAttemptDone } from "../view-state"
import { bootQuiz, pickAttemptKey, type QuizIntent } from "./boot-quiz"
import { QuizResult } from "./quiz-result"
import { QuizTaking } from "./quiz-taking"

/**
 * One run of the quiz of a lesson (a new run remounts it). It boots through `bootQuiz`
 * (resume, start or review), shows one question at a time, and ends on the result screen.
 */
export function QuizFlow({
  lesson,
  intent,
  onExitToLesson,
  onRetake,
  onReloadLesson,
  onOpenBot,
  onOpenFilter,
}: {
  lesson: AcademyLesson
  intent: QuizIntent
  onExitToLesson: (section?: number) => void
  onRetake: () => void
  onReloadLesson: () => void
  onOpenBot: () => void
  onOpenFilter: () => void
}) {
  const { user } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()
  const [key] = useState(() => pickAttemptKey(userId, lesson.id, intent))
  const [submitted, setSubmitted] = useState<{ result: AcademySubmitResult; fresh: boolean } | null>(null)

  const boot = useQuery({
    queryKey: ["academy", "quiz-run", userId, lesson.id, key, intent.kind, intent.kind === "review" ? intent.attemptId : ""],
    queryFn: ({ signal }) => bootQuiz({ queryClient, userId, lessonId: lesson.id, catalogVersion: lesson.catalog_version, intent, key, signal }),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  })

  async function showCommittedResult(attemptId: string) {
    try {
      const result = await fetchAttemptReview(attemptId)
      markAttemptDone(userId, lesson.id)
      invalidateAfterSubmit(queryClient, result.completion.completed)
      setSubmitted({ result, fresh: false })
    } catch {
      onExitToLesson()
    }
  }

  if (submitted) {
    return (
      <QuizResult lesson={lesson} result={submitted.result} fresh={submitted.fresh} onExitToLesson={onExitToLesson} onRetake={onRetake} onOpenBot={onOpenBot} onOpenFilter={onOpenFilter} />
    )
  }
  if (boot.isPending) {
    return (
      <div className="space-y-3" aria-busy="true" role="status" aria-label="Đang chuẩn bị bài kiểm tra">
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }
  if (boot.isError) {
    const stale = isVersionConflict(boot.error) || isNotPublished(boot.error)
    return (
      <PanelState
        title={stale ? "Bài học vừa được cập nhật" : "Chưa bắt đầu được bài kiểm tra"}
        description={stale ? "Hãy tải lại bài học rồi làm bài kiểm tra mới." : errorMessage(boot.error)}
        action={stale ? { label: "Tải lại bài học", onClick: onReloadLesson } : { label: "Thử lại", onClick: () => void boot.refetch() }}
      />
    )
  }
  if (boot.data.kind === "result") {
    return (
      <QuizResult
        lesson={lesson}
        result={boot.data.result}
        fresh={intent.kind !== "review"}
        onExitToLesson={onExitToLesson}
        onRetake={onRetake}
        onOpenBot={onOpenBot}
        onOpenFilter={onOpenFilter}
      />
    )
  }
  const { attempt, draft, resumed } = boot.data
  return (
    <QuizTaking
      lesson={lesson}
      attempt={attempt}
      draft={draft}
      resumed={resumed}
      idempotencyKey={key}
      onSubmitted={(result) => setSubmitted({ result, fresh: true })}
      onAlreadySubmitted={() => void showCommittedResult(attempt.attempt_id)}
      onExit={() => onExitToLesson()}
      onRestart={onRetake}
      onReload={onReloadLesson}
    />
  )
}
