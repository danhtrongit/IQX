/**
 * Thi đai (spec v1.2 §5.3): 8 câu, mỗi câu một biểu đồ có mẫu tô vàng ở các nến cuối và 3 đến 4 tên thẻ để chọn.
 * Đề, đáp án, điểm, lên đai và thưởng xu do server quyết định: màn này chỉ gửi lựa chọn rồi hiện đúng điều server
 * trả về (đúng hay sai, đáp án đúng, kết quả cuối). Thoát giữa chừng chỉ đóng màn; server bỏ lượt thi ở lần
 * bắt đầu kế tiếp.
 */
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cdCard } from "@/lib/candle-dojo/cards"
import { CD_DOJOS } from "@/lib/candle-dojo/lessons"
import { cn } from "@/lib/utils"
import { useAnswerDojoExam, useStartDojoExam, type CandleDojoExam, type CandleDojoExamAnswer } from "./candle-dojo-api"
import { CD_CHART_COLORS } from "./candle-chart-model"
import { CandleChart } from "./candle-chart"
import { beltAdjective, COIN_TEXT } from "./candle-dojo-model"
import { BeltAvatar } from "./dojo-belt"
import { describeExamError, type DojoFailure } from "./dojo-errors"
import { ChartStage, FeedbackBar, FocusHeader, StepLabel } from "./dojo-focus"
import { DojoError } from "./dojo-rows"

type ExamResult = NonNullable<CandleDojoExamAnswer["result"]>
type Feedback = { option: string; correct: boolean; answer: string }

const cardName = (id: string) => cdCard(id)?.name ?? id

function ExamSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Đang mở bài thi" data-testid="dojo-exam-loading">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-[240px] rounded-xl" />
      <div className="grid gap-2 min-[900px]:grid-cols-2">{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-12 rounded-xl" />)}</div>
    </div>
  )
}

function ExamOption({ option, picked, feedback, disabled, onChoose }: {
  option: string
  picked: string | null
  feedback: Feedback | null
  disabled: boolean
  onChoose: (option: string) => void
}) {
  const right = feedback !== null && option === feedback.answer
  const wrong = feedback !== null && option === feedback.option && !feedback.correct
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={picked === option}
      data-option={option}
      data-state={right ? "right" : wrong ? "wrong" : undefined}
      onClick={() => onChoose(option)}
      className={cn(
        "min-h-12 rounded-xl border-2 bg-card px-3 py-3 text-center text-[15px] font-extrabold text-foreground outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
        right ? "border-chart-3 bg-chart-3/10" : wrong ? "border-destructive bg-destructive/10" : picked === option ? "border-primary" : "border-border",
        disabled ? "cursor-default" : "hover:border-primary/50",
      )}
    >
      {cardName(option)}
    </button>
  )
}

function ExamResultView({ result, dojo, onExit, onRetry }: {
  result: ExamResult
  dojo: number
  onExit: () => void
  onRetry: () => void
}) {
  const title = result.belt_up ? "Lên đai!" : result.passed ? "Đã qua bài thi" : "Chưa qua"
  return (
    <div className="flex flex-col items-center gap-3.5 pt-4 text-center" data-testid="dojo-exam-result" data-passed={result.passed} data-belt-up={result.belt_up}>
      <h2 className="font-heading text-[26px] font-bold text-foreground">{title}</h2>
      <BeltAvatar belt={result.belt} size={110} className="mb-2" />
      <p className="font-bold text-foreground tabular-nums">{`Đúng ${result.score}/${result.total} · cần ${result.pass_mark}`}</p>
      {result.belt_up ? (
        <p className="font-extrabold text-foreground">
          {`Đai ${beltAdjective(result.belt)} · `}
          <span className={cn("tabular-nums", COIN_TEXT)}>{`+${result.reward_xu} xu`}</span>
          {dojo < CD_DOJOS.length - 1 ? ` · mở Dojo ${dojo + 1}` : ""}
        </p>
      ) : result.passed ? (
        <p className="font-semibold text-foreground">{`Bạn đã có đai ${beltAdjective(dojo)} từ trước nên không nhận thêm xu.`}</p>
      ) : (
        <p className="font-semibold text-foreground">Ôn lại các bài rồi thi lại.</p>
      )}
      <div className="flex w-full max-w-[360px] flex-col gap-2">
        {result.passed ? (
          <Button type="button" size="lg" className="h-11 text-base font-bold" onClick={onExit}>Về Dojo</Button>
        ) : (
          <>
            <Button type="button" size="lg" className="h-11 text-base font-bold" onClick={onRetry}>Thi lại</Button>
            <Button type="button" size="lg" variant="outline" className="h-11 text-base font-bold" onClick={onExit}>Về Dojo</Button>
          </>
        )}
      </div>
    </div>
  )
}

export function DojoExam({ dojo, onExit }: { dojo: number; onExit: () => void }) {
  const { mutateAsync: startExam } = useStartDojoExam()
  const { mutateAsync: answerExam, isPending: answering } = useAnswerDojoExam()
  const [exam, setExam] = useState<CandleDojoExam | null>(null)
  const [startFailure, setStartFailure] = useState<DojoFailure | null>(null)
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [answerFailure, setAnswerFailure] = useState<DojoFailure | null>(null)
  /** The option whose answer did not reach the server, so "Thử lại" can send it again. */
  const [retryOption, setRetryOption] = useState<string | null>(null)
  const [result, setResult] = useState<ExamResult | null>(null)
  const [showResult, setShowResult] = useState(false)
  const attempt = useRef(0)
  const started = useRef(false)

  const begin = useCallback(async () => {
    const run = ++attempt.current
    setExam(null)
    setStartFailure(null)
    setIndex(0)
    setPicked(null)
    setFeedback(null)
    setAnswerFailure(null)
    setRetryOption(null)
    setResult(null)
    setShowResult(false)
    try {
      const next = await startExam(dojo)
      if (run === attempt.current) setExam(next)
    } catch (error) {
      if (run === attempt.current) setStartFailure(describeExamError(error, "start"))
    }
  }, [dojo, startExam])

  // One attempt per visit, even when React mounts the effect twice in development.
  useEffect(() => {
    if (started.current) return
    started.current = true
    void begin()
  }, [begin])

  const belt = beltAdjective(dojo)
  const title = `Thi đai ${belt}`

  async function choose(option: string) {
    const question = exam?.questions[index]
    if (!exam || !question || feedback || answering) return
    setPicked(option)
    setAnswerFailure(null)
    try {
      const response = await answerExam({ attemptId: exam.attempt_id, index: question.index, option })
      setFeedback({ option, correct: response.correct, answer: response.answer })
      if (response.finished && response.result) setResult(response.result)
    } catch (error) {
      setAnswerFailure(describeExamError(error, "answer"))
      setRetryOption(option)
      setPicked(null)
    }
  }

  function next() {
    if (!exam) return
    if (index + 1 < exam.questions.length) {
      setIndex(index + 1)
      setPicked(null)
      setFeedback(null)
      setAnswerFailure(null)
      setRetryOption(null)
    } else if (result) {
      setShowResult(true)
    }
  }

  if (startFailure) {
    return (
      <div className="space-y-3" data-testid="dojo-exam-error">
        <FocusHeader exitLabel="Thoát bài thi" onExit={onExit} total={8} current={0} />
        <DojoError
          message={startFailure.message}
          onRetry={startFailure.blocked ? undefined : () => void begin()}
          retryLabel="Thử lại"
        />
        <Button type="button" variant="outline" onClick={onExit}>Về Dojo</Button>
      </div>
    )
  }

  if (!exam) {
    return (
      <div>
        <FocusHeader exitLabel="Thoát bài thi" onExit={onExit} total={8} current={0} />
        <ExamSkeleton />
      </div>
    )
  }

  if (showResult && result) {
    return <ExamResultView result={result} dojo={dojo} onExit={onExit} onRetry={() => void begin()} />
  }

  const question = exam.questions[index]
  const total = exam.questions.length
  const last = index + 1 >= total
  const bandStart = question.bars.length - question.n
  return (
    <div data-testid="dojo-exam" data-question={index}>
      <FocusHeader exitLabel="Thoát bài thi" onExit={onExit} total={total} current={index} />
      <StepLabel>{`${title} · câu ${index + 1}/${total}`}</StepLabel>
      <h2 className="mb-2.5 font-heading text-xl font-bold text-foreground min-[900px]:text-2xl">Vùng tô vàng là mẫu nào?</h2>
      <ChartStage>
        <CandleChart
          bars={question.bars}
          height={210}
          bands={[{ start: bandStart, end: question.bars.length - 1, color: CD_CHART_COLORS.gold }]}
          aria-label={`Biểu đồ nến câu ${index + 1}, vùng tô vàng là mẫu cần nhận ra`}
        />
      </ChartStage>
      <div
        role="group"
        aria-label="Chọn tên mẫu nến"
        className={cn("mt-3 grid gap-2", question.options.length === 3 ? "min-[900px]:grid-cols-3" : "min-[900px]:grid-cols-2")}
      >
        {question.options.map((option) => (
          <ExamOption
            key={option}
            option={option}
            picked={picked}
            feedback={feedback}
            disabled={feedback !== null || answering}
            onChoose={(value) => void choose(value)}
          />
        ))}
      </div>
      {answerFailure && (
        <DojoError
          className="mt-3"
          message={answerFailure.message}
          onRetry={answerFailure.restart ? () => void begin() : retryOption ? () => void choose(retryOption) : undefined}
          retrying={answering}
          retryLabel={answerFailure.restart ? "Thi lại" : "Thử lại"}
        />
      )}
      {answerFailure?.restart && (
        <Button type="button" variant="outline" className="mt-2" onClick={onExit}>Về Dojo</Button>
      )}
      {feedback && (
        <FeedbackBar
          good={feedback.correct}
          title={feedback.correct ? "Đúng!" : "Chưa đúng."}
          detail={feedback.correct ? undefined : `Đáp án: ${cardName(feedback.answer)}`}
          actionLabel={last ? "Xem kết quả" : "Câu tiếp"}
          onAction={next}
        />
      )}
    </div>
  )
}
