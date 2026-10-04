import { useState } from "react"
import { ArrowLeft, CheckCircle2, RotateCcw, XCircle } from "lucide-react"
import { useMutation, useQuery } from "@tanstack/react-query"

import { PanelState } from "@/components/layout/panel-state"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { newIdempotencyKey } from "@/lib/shared-config"
import { cn } from "@/lib/utils"

import {
  createAttempt,
  isContentVersionMismatch,
  QUIZ_QUESTION_COUNT,
  submitAttempt,
  type AttemptResult,
  type LessonDetail,
} from "./api"
import { capabilityLabel } from "./rule-labels"

export type QuizViewProps = {
  lesson: LessonDetail
  capabilityNames: ReadonlyMap<string, string>
  onExit: () => void
  /** Called after a graded submit so progress/grants refresh. */
  onGraded: () => void
  /** Content changed while the quiz was open: refresh the lesson. */
  onContentChanged: () => void
}

/**
 * 8-question quiz. Questions come from `POST /academy/attempts` (no answer keys);
 * grading, review and grants come only from the submit response. The attempt is
 * keyed by an idempotency key so retrying returns the same attempt/order; retake
 * uses a fresh key → a new attempt.
 */
export function QuizView({ lesson, capabilityNames, onExit, onGraded, onContentChanged }: QuizViewProps) {
  const { user } = useAuth()
  const [attemptKey, setAttemptKey] = useState(newIdempotencyKey)
  const [submitKey, setSubmitKey] = useState(newIdempotencyKey)
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const attempt = useQuery({
    queryKey: ["academy-attempt", user?.id ?? "anonymous", lesson.id, lesson.content_version, attemptKey],
    queryFn: ({ signal }) => createAttempt(
      { lesson_id: lesson.id, content_version: lesson.content_version, idempotency_key: attemptKey },
      signal,
    ),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const submit = useMutation<AttemptResult, unknown, { attemptId: string }>({
    mutationFn: ({ attemptId }) => submitAttempt(
      attemptId,
      Object.entries(answers).map(([question_id, option_id]) => ({ question_id, option_id })),
      submitKey,
    ),
    onSuccess: onGraded,
  })

  const retake = () => {
    submit.reset()
    setAnswers({})
    setSubmitKey(newIdempotencyKey())
    setAttemptKey(newIdempotencyKey())
  }

  const result = submit.data
  const questions = attempt.data?.questions ?? []
  const answered = questions.filter(question => answers[question.id]).length
  const complete = questions.length > 0 && answered === questions.length
  const resultByQuestion = new Map(result?.results.map(item => [item.question_id, item]))

  return (
    <section className="mx-auto w-full max-w-[880px] space-y-5" aria-labelledby="academy-quiz-title">
      <Button variant="ghost" size="sm" onClick={onExit}>
        <ArrowLeft aria-hidden="true" />
        Về bài học
      </Button>
      <header className="space-y-1">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Bài kiểm tra · {QUIZ_QUESTION_COUNT} câu</p>
        <h2 id="academy-quiz-title" className="font-heading text-2xl font-semibold tracking-tight">{lesson.name}</h2>
        <p className="text-sm text-muted-foreground">Cần đúng {QUIZ_QUESTION_COUNT}/{QUIZ_QUESTION_COUNT} câu để đạt và mở quyền sử dụng.</p>
      </header>

      {attempt.isPending && (
        <div className="space-y-3" aria-busy="true" aria-label="Đang tạo bài kiểm tra">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      )}

      {attempt.isError && (isContentVersionMismatch(attempt.error)
        ? <PanelState
            title="Nội dung bài học vừa được cập nhật"
            description="Bài kiểm tra phải khớp phiên bản nội dung. Tải lại bài học rồi làm bài mới."
            action={{ label: "Tải lại bài học", onClick: onContentChanged }}
          />
        : <PanelState
            title="Không tạo được bài kiểm tra"
            description={errorMessage(attempt.error)}
            action={{ label: "Thử lại", onClick: () => void attempt.refetch() }}
          />)}

      {result && (
        <Alert className={result.passed ? "border-(--status-success)" : "border-destructive/50"}>
          {result.passed ? <CheckCircle2 className="text-(--status-success)" /> : <XCircle className="text-destructive" />}
          <AlertTitle className="text-lg">
            {result.score}/{result.total} câu đúng · {result.passed ? "Đạt" : "Chưa đạt"}
          </AlertTitle>
          <AlertDescription className="space-y-2">
            {result.passed
              ? <p>Bạn đã hoàn thành bài học. Việc đạt bài không tự bật chỉ báo nào trong cấu hình.</p>
              : <p>Cần đúng {result.total}/{result.total} câu để đạt. Xem lại giải thích bên dưới rồi làm lại.{lesson.passed ? " Kết quả đạt trước đó vẫn được giữ." : ""}</p>}
            {result.newly_granted.length > 0 && (
              <div>
                <p className="font-medium text-foreground">Quyền mới được mở:</p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {result.newly_granted.map(capability => (
                    <li key={capability}><Badge>{capabilityLabel(capability, capabilityNames)}</Badge></li>
                  ))}
                </ul>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {attempt.data && (
        <form
          className="space-y-4"
          onSubmit={event => {
            event.preventDefault()
            if (!complete || result || submit.isPending || !attempt.data) return
            submit.mutate({ attemptId: attempt.data.attempt_id })
          }}
        >
          {questions.map((question, index) => {
            const review = resultByQuestion.get(question.id)
            const headingId = `quiz-${question.id}-title`
            return (
              <Card key={question.id} className="gap-3">
                <CardHeader className="flex-row items-start justify-between gap-3">
                  <CardTitle id={headingId} className="text-base leading-6 font-medium">{index + 1}. {question.question}</CardTitle>
                  {review && (
                    <Badge variant={review.correct ? "default" : "destructive"} className="shrink-0">
                      {review.correct ? "Đúng" : "Sai"}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <RadioGroup
                    aria-labelledby={headingId}
                    value={answers[question.id] ?? ""}
                    onValueChange={value => setAnswers(previous => ({ ...previous, [question.id]: value }))}
                    disabled={!!result || submit.isPending}
                  >
                    {question.options.map(option => {
                      const optionId = `quiz-${question.id}-${option.id}`
                      const isCorrect = review?.correct_option_id === option.id
                      const isWrongChoice = !!review && review.option_id === option.id && !review.correct
                      return (
                        <div
                          key={option.id}
                          className={cn(
                            "flex items-start gap-3 rounded-sm border border-border p-3",
                            isCorrect && "border-(--status-success) bg-muted",
                            isWrongChoice && "border-destructive bg-destructive/10",
                          )}
                        >
                          <RadioGroupItem id={optionId} value={option.id} className="mt-0.5" />
                          <Label htmlFor={optionId} className="flex-1 leading-6 font-normal">
                            {option.text}
                            {isCorrect && <span className="sr-only"> (đáp án đúng)</span>}
                            {isWrongChoice && <span className="sr-only"> (bạn chọn, chưa đúng)</span>}
                          </Label>
                        </div>
                      )
                    })}
                  </RadioGroup>
                  {review?.explanation && <p className="text-sm leading-6 text-muted-foreground">{review.explanation}</p>}
                </CardContent>
              </Card>
            )
          })}

          {submit.isError && (
            <p role="alert" className="text-sm text-destructive">{errorMessage(submit.error)}</p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            {result ? (
              <>
                <Button type="button" variant="outline" onClick={retake}>
                  <RotateCcw aria-hidden="true" />
                  Làm lại
                </Button>
                <Button type="button" onClick={onExit}>Về bài học</Button>
              </>
            ) : (
              <>
                <Button type="submit" disabled={!complete || submit.isPending}>
                  {submit.isPending ? "Đang chấm…" : "Nộp bài"}
                </Button>
                <span className="text-sm text-muted-foreground" aria-live="polite">
                  Đã trả lời {answered}/{questions.length} câu
                </span>
              </>
            )}
          </div>
        </form>
      )}
    </section>
  )
}
