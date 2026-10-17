import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { PanelState } from "@/components/layout/panel-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { isCatalogMismatch, isItemLocked, isScenarioRequired, submitAttempt, type ItemResponse, type SubmitResult } from "../api"
import { invalidateAfterSubmit } from "../queries"
import { markAttemptDone, pruneAttemptKeys } from "../view-state"
import { bootQuiz, pickAttemptKey, type QuizIntent } from "./boot-quiz"
import { QuizQuestion } from "./quiz-question"
import { QuizScore } from "./quiz-score"

/**
 * One run of the quiz of an item (a new run remounts it): it boots through `bootQuiz` (resume or
 * start), shows one question per screen and ends on the score-only result. The lesson content is
 * hidden while this is on screen.
 */
export function QuizFlow({
  item,
  intent,
  onExit,
  onRetake,
  onReview,
  onNext,
  onReload,
  onScenarioRequired,
}: {
  item: ItemResponse
  intent: QuizIntent
  /** "Thoát": back to the content; the draft stays on the server. */
  onExit: () => void
  onRetake: () => void
  onReview: () => void
  onNext: (itemId: string) => void
  /** The item changed under the learner (new catalog, lock): read it again and leave the quiz. */
  onReload: () => void
  /** 403 ACADEMY_SCENARIO_REQUIRED: the scenario choice is missing on the server. */
  onScenarioRequired: () => void
}) {
  const { user } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()
  const [key] = useState(() => {
    pruneAttemptKeys(item.catalog_version)
    return pickAttemptKey(userId, item.catalog_version, item.id, intent)
  })
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null)

  const boot = useQuery({
    queryKey: ["academy", "quiz-run", userId, item.id, key, intent.kind],
    queryFn: ({ signal }) =>
      bootQuiz({ queryClient, userId, lessonId: item.id, catalogVersion: item.catalog_version, intent, key, signal }),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  })

  // The server says the scenario choice is missing: back to the content, at the scenario (design §7.3).
  const scenarioMissing = boot.isError && isScenarioRequired(boot.error)
  useEffect(() => {
    if (scenarioMissing) onScenarioRequired()
  }, [scenarioMissing, onScenarioRequired])

  /** Another tab submitted this attempt: its stored result is replayed (score only), never re-graded. */
  async function showCommittedResult(attemptId: string) {
    try {
      const result = await submitAttempt(attemptId, [], key)
      markAttemptDone(userId, item.catalog_version, item.id)
      invalidateAfterSubmit(queryClient, userId, item.id, result)
      setSubmitted(result)
    } catch {
      onExit()
    }
  }

  const score = (result: SubmitResult) => (
    <QuizScore item={item} result={result} onReview={onReview} onRetake={onRetake} onNext={onNext} />
  )

  if (submitted) return score(submitted)
  if (boot.isPending) {
    return (
      <div className="space-y-3" aria-busy="true" role="status" aria-label="Đang chuẩn bị bài kiểm tra">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }
  if (boot.isError) {
    if (isScenarioRequired(boot.error)) {
      return (
        <PanelState
          title="Chưa chọn cách xử lý tình huống"
          description="Chọn một phương án ở phần Tình huống rồi làm bài kiểm tra."
          action={{ label: "Đến phần Tình huống", onClick: onScenarioRequired }}
        />
      )
    }
    const stale = isCatalogMismatch(boot.error) || isItemLocked(boot.error)
    return (
      <PanelState
        title={stale ? "Học viện vừa được cập nhật" : "Chưa bắt đầu được bài kiểm tra"}
        description={stale ? "Hãy tải lại bài rồi làm bài kiểm tra mới." : errorMessage(boot.error)}
        action={stale ? { label: "Tải lại bài", onClick: onReload } : { label: "Thử lại", onClick: () => void boot.refetch() }}
      />
    )
  }
  if (boot.data.kind === "result") return score(boot.data.result)
  const { attempt, draft, resumed } = boot.data
  return (
    <QuizQuestion
      item={item}
      attempt={attempt}
      draft={draft}
      resumed={resumed}
      idempotencyKey={key}
      onSubmitted={setSubmitted}
      onAlreadySubmitted={() => void showCommittedResult(attempt.attempt_id)}
      onExit={onExit}
      onRestart={onRetake}
      onReload={onReload}
    />
  )
}
