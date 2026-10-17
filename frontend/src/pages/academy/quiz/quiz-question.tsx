import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowRight, LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  isAttemptNotFound,
  isCatalogMismatch,
  isInvalidAnswers,
  submitAttempt,
  type AttemptResponse,
  type DraftState,
  type ItemResponse,
  type SubmitResult,
} from "../api"
import { invalidateAfterSubmit } from "../queries"
import { scrollReaderTo } from "../scroll"
import { markAttemptDone } from "../view-state"
import { creditedToast, NEXT_QUESTION_LABEL, quizLabel, SUBMIT_LABEL } from "./quiz-copy"
import { useDraftSync } from "./use-draft-sync"

function answerMap(attempt: AttemptResponse, saved: DraftState["answers"] | undefined): Record<string, string> {
  const map: Record<string, string> = {}
  for (const answer of saved ?? []) {
    const question = attempt.questions.find((candidate) => candidate.id === answer.question_id)
    if (question?.options.some((option) => option.id === answer.option_id)) map[answer.question_id] = answer.option_id
  }
  return map
}

/** Resume at the first unanswered question; with every answer saved, at the last one (ready to submit). */
function firstOpenIndex(attempt: AttemptResponse, answers: Record<string, string>): number {
  const at = attempt.questions.findIndex((question) => !answers[question.id])
  return at < 0 ? Math.max(0, attempt.questions.length - 1) : at
}

type SubmitFailure = { kind: "retry" | "restart" | "reload"; message: string }

function describeSubmitFailure(error: unknown): SubmitFailure {
  if (isInvalidAnswers(error)) return { kind: "restart", message: "Bài làm chưa hợp lệ. Hãy bắt đầu một lượt mới." }
  if (isAttemptNotFound(error)) return { kind: "restart", message: "Không tìm thấy lượt làm bài này. Hãy bắt đầu một lượt mới." }
  if (isCatalogMismatch(error)) return { kind: "reload", message: "Học viện vừa được cập nhật. Hãy tải lại bài rồi làm một lượt mới." }
  return { kind: "retry", message: `${errorMessage(error)} Lựa chọn của bạn vẫn được giữ, hãy thử nộp lại.` }
}

/**
 * One question per screen, in the server's frozen order. "Câu tiếp theo" is enabled only after a
 * choice, the last question has "Nộp bài", and there is no way back to an earlier question. Nothing
 * here knows which option is right: the score only comes back from the submit response.
 */
export function QuizQuestion({
  item,
  attempt,
  draft,
  resumed,
  idempotencyKey,
  onSubmitted,
  onAlreadySubmitted,
  onExit,
  onRestart,
  onReload,
}: {
  item: ItemResponse
  attempt: AttemptResponse
  draft: DraftState | null
  resumed: boolean
  idempotencyKey: string
  onSubmitted: (result: SubmitResult) => void
  onAlreadySubmitted: () => void
  onExit: () => void
  onRestart: () => void
  onReload: () => void
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const total = attempt.questions.length
  const [answers, setAnswers] = useState<Record<string, string>>(() => answerMap(attempt, draft?.answers))
  const [index, setIndex] = useState(() => firstOpenIndex(attempt, answerMap(attempt, draft?.answers)))
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<SubmitFailure | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const cardRef = useRef<HTMLElement>(null)
  const shownIndex = useRef(index)

  const adopt = useCallback(
    (saved: DraftState["answers"]) => setAnswers((previous) => ({ ...previous, ...answerMap(attempt, saved) })),
    [attempt],
  )
  const sync = useDraftSync({
    attemptId: attempt.attempt_id,
    lessonId: item.id,
    initialRevision: draft?.revision ?? 0,
    onAdopt: adopt,
    onAlreadySubmitted,
  })

  // A new question brings its prompt into view and focus (not on the first render).
  useEffect(() => {
    if (shownIndex.current === index) return
    shownIndex.current = index
    headingRef.current?.focus({ preventScroll: true })
    scrollReaderTo(cardRef.current, 16)
  }, [index])

  const question = attempt.questions[index]
  const chosen = question ? answers[question.id] : undefined
  const last = index === total - 1
  const complete = attempt.questions.every((candidate) => answers[candidate.id])

  function choose(optionId: string) {
    if (submitting || !question) return
    setAnswers((previous) => ({ ...previous, [question.id]: optionId }))
    setFailure(null)
    sync.save(question.id, optionId)
  }

  async function submit() {
    if (!complete || submitting) return
    setSubmitting(true)
    setFailure(null)
    try {
      const result = await submitAttempt(
        attempt.attempt_id,
        attempt.questions.map((candidate) => ({ question_id: candidate.id, option_id: answers[candidate.id] })),
        idempotencyKey,
      )
      markAttemptDone(user?.id, attempt.catalog_version, item.id)
      invalidateAfterSubmit(queryClient, user?.id, item.id, result)
      const coins = result.completion.newly_completed ? creditedToast(result) : null
      if (coins) toast.success(coins)
      onSubmitted(result)
    } catch (error) {
      setFailure(describeSubmitFailure(error))
      setSubmitting(false)
    }
  }

  if (!question) return null

  return (
    <section ref={cardRef} aria-labelledby="quiz-question-heading" className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-primary">{quizLabel(item)}</span>
        <span className="flex items-center gap-3">
          <b className="tabular-nums" aria-hidden="true">
            Câu {index + 1}/{total}
          </b>
          <span className="sr-only">
            Câu {index + 1} trên {total}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={onExit}>
            Thoát
          </Button>
        </span>
      </div>
      <ol aria-hidden="true" data-quiz-dots className="m-0 mt-3 flex max-w-[calc(30*1.125rem)] list-none flex-wrap gap-1.5 p-0">
        {attempt.questions.map((candidate, position) => (
          <li
            key={candidate.id}
            data-state={position === index ? "current" : answers[candidate.id] ? "done" : "todo"}
            className={cn(
              "h-1.5 w-3 rounded-full",
              position === index ? "bg-primary" : answers[candidate.id] ? "bg-primary/45" : "bg-muted",
            )}
          />
        ))}
      </ol>
      {resumed && index > 0 && <p className="mt-3 text-xs text-academy-subtle">Đã khôi phục lượt làm bài đang dở.</p>}

      <h3
        id="quiz-question-heading"
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 text-base leading-7 font-semibold text-foreground outline-none sm:text-[17px] [overflow-wrap:anywhere]"
      >
        {question.prompt}
      </h3>
      <fieldset className="mt-4 min-w-0 space-y-2 border-0 p-0">
        <legend className="sr-only">Chọn một phương án</legend>
        {question.options.map((option) => {
          const selected = chosen === option.id
          return (
            <label
              key={option.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm leading-6 text-foreground transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/60",
              )}
            >
              <input
                type="radio"
                name={`quiz-${question.id}`}
                value={option.id}
                checked={selected}
                disabled={submitting}
                onChange={() => choose(option.id)}
                className="mt-1.5 size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0 [overflow-wrap:anywhere]">{option.text}</span>
            </label>
          )
        })}
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {last ? (
          <Button type="button" disabled={!chosen || !complete || submitting} onClick={() => void submit()}>
            {submitting && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {submitting ? "Đang chấm…" : SUBMIT_LABEL}
          </Button>
        ) : (
          <Button type="button" disabled={!chosen || submitting} onClick={() => setIndex(index + 1)}>
            {NEXT_QUESTION_LABEL}
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </div>
      <p role="status" className="mt-2 min-h-4 text-xs text-academy-subtle">
        {sync.status === "saving" && "Đang lưu lựa chọn…"}
        {sync.status === "error" && "Chưa lưu được lựa chọn. Bài làm vẫn được giữ trên trang này."}
        {sync.status === "idle" && sync.adopted && "Lựa chọn đã được cập nhật từ một thiết bị khác."}
      </p>
      {failure && (
        <div role="alert" className="mt-3 flex flex-col items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
          <p>{failure.message}</p>
          {failure.kind === "retry" && (
            <Button type="button" variant="outline" size="sm" onClick={() => void submit()} disabled={!complete}>
              Nộp lại
            </Button>
          )}
          {failure.kind === "restart" && (
            <Button type="button" variant="outline" size="sm" onClick={onRestart}>
              Bắt đầu lượt mới
            </Button>
          )}
          {failure.kind === "reload" && (
            <Button type="button" variant="outline" size="sm" onClick={onReload}>
              Tải lại bài
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
