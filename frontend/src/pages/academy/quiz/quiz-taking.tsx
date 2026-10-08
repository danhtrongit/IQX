import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/api"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import {
  isAttemptNotFound,
  isInvalidAnswers,
  isVersionConflict,
  QUIZ_QUESTION_COUNT,
  submitAttempt,
  type AcademyAttempt,
  type AcademyLesson,
  type AcademySubmitResult,
  type DraftState,
} from "../api"
import { invalidateAfterSubmit } from "../queries"
import { scrollReaderTo } from "../scroll"
import { markAttemptDone } from "../view-state"
import { QuestionFigure } from "./question-figure"
import { creditedText, optionLetter, PENDING_COINS_TEXT } from "./quiz-copy"
import { useDraftSync } from "./use-draft-sync"

function answerMap(attempt: AcademyAttempt, saved: DraftState["answers"] | undefined): Record<string, string> {
  const map: Record<string, string> = {}
  for (const answer of saved ?? []) {
    const question = attempt.questions.find((candidate) => candidate.id === answer.question_id)
    if (question?.options.some((option) => option.id === answer.option_id)) map[answer.question_id] = answer.option_id
  }
  return map
}

type SubmitFailure = { kind: "retry" | "restart" | "reload"; message: string }

function describeSubmitFailure(error: unknown): SubmitFailure {
  if (isInvalidAnswers(error)) return { kind: "retry", message: `Cần trả lời đủ ${QUIZ_QUESTION_COUNT} câu, mỗi câu một đáp án hợp lệ. Hãy kiểm tra lại lựa chọn.` }
  if (isAttemptNotFound(error)) return { kind: "restart", message: "Không tìm thấy lượt làm bài này. Hãy bắt đầu một lượt mới." }
  if (isVersionConflict(error)) return { kind: "reload", message: "Nội dung hoặc bộ câu hỏi vừa được cập nhật. Hãy tải lại bài học rồi làm một lượt mới." }
  return { kind: "retry", message: `${errorMessage(error)} Lựa chọn của bạn vẫn được giữ, hãy thử nộp lại.` }
}

/**
 * One question at a time with a 1-8 strip. Nothing here knows which option is right: correctness,
 * score, completion and coins only come back from the submit response.
 */
export function QuizTaking({
  lesson,
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
  lesson: AcademyLesson
  attempt: AcademyAttempt
  draft: DraftState | null
  resumed: boolean
  idempotencyKey: string
  onSubmitted: (result: AcademySubmitResult) => void
  onAlreadySubmitted: () => void
  onExit: () => void
  onRestart: () => void
  onReload: () => void
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const total = attempt.questions.length
  const [answers, setAnswers] = useState<Record<string, string>>(() => answerMap(attempt, draft?.answers))
  const [index, setIndex] = useState(() => {
    const firstOpen = attempt.questions.findIndex((question) => !answerMap(attempt, draft?.answers)[question.id])
    return firstOpen < 0 ? 0 : firstOpen
  })
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
    lessonId: lesson.id,
    initialRevision: draft?.revision ?? 0,
    onAdopt: adopt,
    onAlreadySubmitted,
  })

  // Moving to another question brings its heading into view and focus (not on the first render).
  useEffect(() => {
    if (shownIndex.current === index) return
    shownIndex.current = index
    headingRef.current?.focus({ preventScroll: true })
    scrollReaderTo(cardRef.current, 96)
  }, [index])

  const question = attempt.questions[index]
  const answered = attempt.questions.filter((candidate) => answers[candidate.id]).length
  const complete = answered === total
  const last = index === total - 1

  function choose(questionId: string, optionId: string) {
    if (submitting) return
    setAnswers((previous) => ({ ...previous, [questionId]: optionId }))
    setFailure(null)
    sync.save(questionId, optionId)
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
      markAttemptDone(user?.id, lesson.id)
      invalidateAfterSubmit(queryClient, result.completion.completed)
      if (result.completion.newly_completed) {
        if (result.reward?.status === "credited") toast.success(creditedText(result.reward.delta))
        else if (result.reward?.status === "unavailable") toast(PENDING_COINS_TEXT)
      }
      onSubmitted(result)
    } catch (error) {
      setFailure(describeSubmitFailure(error))
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <header className="rounded-lg border border-border bg-card p-4 sm:p-5">
        <p className="text-[11px] font-semibold tracking-wider text-primary uppercase">
          Bài kiểm tra · Chương {lesson.chapter}
        </p>
        <h2 className="mt-1 font-heading text-2xl font-bold leading-tight">{lesson.name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Chọn một đáp án cho mỗi câu. Chuyển câu hoặc xem lại bài học không làm mất lựa chọn trong lượt này.
        </p>
        {resumed && <p className="mt-1 text-xs text-muted-foreground">Đã khôi phục lượt làm bài đang dở.</p>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <b aria-live="polite">
            Đã trả lời {answered} / {total}
          </b>
          <Button type="button" variant="ghost" size="sm" onClick={onExit}>
            Bài học ↗
          </Button>
        </div>
        <nav aria-label="Chuyển câu hỏi" className="mt-3">
          <ol className="m-0 grid list-none grid-cols-8 gap-1.5 p-0 sm:gap-2">
            {attempt.questions.map((candidate, position) => {
              const done = Boolean(answers[candidate.id])
              const current = position === index
              return (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => setIndex(position)}
                    aria-label={`Câu ${position + 1}${done ? ", đã trả lời" : ""}`}
                    aria-current={current ? "step" : undefined}
                    className={cn(
                      "h-10 w-full rounded-sm border text-sm font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      current ? "border-primary ring-2 ring-primary/40" : "border-border",
                      done ? "bg-primary/15 text-foreground" : "bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {position + 1}
                    {done && <span className="sr-only"> (đã trả lời)</span>}
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>
      </header>

      <section ref={cardRef} aria-labelledby="quiz-question-heading" className="rounded-lg border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-semibold tracking-wide uppercase">
            Câu {index + 1} / {total}
          </span>
          {question.topic && <span>{question.topic}</span>}
        </div>
        <h3 id="quiz-question-heading" ref={headingRef} tabIndex={-1} className="mt-3 text-base leading-7 font-semibold outline-none sm:text-[17px]">
          {question.prompt}
        </h3>
        {question.figure && <QuestionFigure figure={question.figure} label={`Hình của câu ${index + 1}`} />}
        {question.hint && (
          <details className="academy-details">
            <summary>Công thức sử dụng</summary>
            <p className="pt-2 text-sm leading-6 whitespace-pre-line">{question.hint}</p>
          </details>
        )}
        <fieldset className="mt-4 min-w-0 space-y-2 border-0 p-0">
          <legend className="mb-2 text-xs text-muted-foreground">Chọn một đáp án</legend>
          {question.options.map((option, position) => {
            const selected = answers[question.id] === option.id
            return (
              <label
                key={option.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm leading-6 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                  selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/60",
                )}
              >
                <input
                  type="radio"
                  name={`quiz-${question.id}`}
                  value={option.id}
                  checked={selected}
                  disabled={submitting}
                  onChange={() => choose(question.id, option.id)}
                  className="mt-1.5 size-4 shrink-0 accent-primary"
                />
                <span className="w-5 shrink-0 font-semibold text-muted-foreground">{optionLetter(position)}.</span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{option.text}</span>
              </label>
            )
          })}
        </fieldset>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" disabled={index === 0 || submitting} onClick={() => setIndex(index - 1)}>
            <ArrowLeft aria-hidden="true" />
            Câu trước
          </Button>
          {last ? (
            <Button type="button" disabled={!complete || submitting} onClick={() => void submit()}>
              {submitting && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {submitting ? "Đang chấm…" : "Nộp bài"}
            </Button>
          ) : (
            <Button type="button" disabled={submitting} onClick={() => setIndex(index + 1)}>
              Câu tiếp
              <ArrowRight aria-hidden="true" />
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
          {last && !complete ? `Còn ${total - answered} câu chưa trả lời.` : "Bạn có thể sửa lựa chọn trước khi nộp."}
        </p>
        <p role="status" className="mt-1 min-h-4 text-xs text-muted-foreground">
          {sync.status === "saving" && "Đang lưu lựa chọn…"}
          {sync.status === "error" && "Chưa lưu được lựa chọn lên máy chủ. Bài làm vẫn được giữ trên trang này."}
          {sync.status === "idle" && sync.adopted && "Lựa chọn đã được cập nhật từ một thiết bị khác."}
        </p>
        {failure && (
          <div role="alert" className="mt-3 flex flex-col items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
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
                Tải lại bài học
              </Button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
