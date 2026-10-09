import { useEffect, useRef, useState } from "react"
import { Check, Coins, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { QUIZ_QUESTION_COUNT, type AcademyLesson, type AcademySubmitResult, type ReviewItem } from "../api"
import { scrollReaderToTop } from "../scroll"
import { QuestionFigure } from "./question-figure"
import {
  creditedText,
  nextToolFor,
  optionLetter,
  PENDING_COINS_TEXT,
  RECEIVED_TEXT,
  REPASS_NOTE,
  RETAKE_CONFIRM,
  resultHeadline,
  resultNote,
  rewardView,
} from "./quiz-copy"

function ReviewCard({
  item,
  position,
  lesson,
  onReviewSection,
}: {
  item: ReviewItem
  position: number
  lesson: AcademyLesson
  onReviewSection: (section: number) => void
}) {
  const chosen = item.options.findIndex((option) => option.chosen)
  const correct = item.options.findIndex((option) => option.correct)
  const section = item.section ? lesson.sections[item.section - 1] : undefined
  return (
    <details
      open={!item.correct}
      className={cn("group overflow-hidden rounded-lg border bg-card", item.correct ? "border-border" : "border-destructive/50")}
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 p-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:p-4 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", item.correct ? "bg-price-up/15 text-price-up" : "bg-destructive/15 text-destructive")}
        >
          {item.correct ? <Check className="size-3.5" /> : <X className="size-3.5" />}
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-semibold">
            <span className="sr-only">{item.correct ? "Đúng. " : "Sai. "}</span>
            Câu {position} {item.topic ? `· ${item.topic}` : ""}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Bạn chọn {chosen >= 0 ? optionLetter(chosen) : "—"} · Đáp án {correct >= 0 ? optionLetter(correct) : "—"}
          </span>
        </span>
      </summary>
      <div className="space-y-3 border-t border-border p-3 sm:p-4">
        <p className="text-sm leading-6 font-medium">{item.prompt}</p>
        {item.figure && <QuestionFigure figure={item.figure} label={`Hình của câu ${position}`} caption={false} />}
        {item.hint && (
          <details className="academy-details">
            <summary>Công thức sử dụng</summary>
            <p className="pt-2 text-sm leading-6 whitespace-pre-line">{item.hint}</p>
          </details>
        )}
        <ul className="m-0 list-none space-y-2 p-0">
          {item.options.map((option, optionIndex) => (
            <li
              key={option.id}
              className={cn(
                "rounded-md border p-3 text-sm leading-6",
                option.correct ? "border-price-up/60 bg-price-up/5" : option.chosen ? "border-destructive/50 bg-destructive/5" : "border-border",
              )}
            >
              <b className="block [overflow-wrap:anywhere]">
                {optionLetter(optionIndex)}. {option.text}
                {option.chosen && " · Đã chọn"}
                {option.correct && " · Đúng"}
              </b>
              {option.explanation && <span className="mt-1 block text-muted-foreground [overflow-wrap:anywhere]">{option.explanation}</span>}
            </li>
          ))}
        </ul>
        {item.explanation && <p className="text-sm leading-6 text-muted-foreground">{item.explanation}</p>}
        {item.section && section && (
          <Button type="button" variant="link" size="sm" className="h-auto px-0 whitespace-normal" onClick={() => onReviewSection(item.section as number)}>
            Xem lại phần {item.section}: {section.title} →
          </Button>
        )}
      </div>
    </details>
  )
}

/**
 * Result of a graded attempt: score, Đúng/Sai, what a pass opened, the coin outcome the server
 * confirmed, and a per-question review (wrong answers open, right ones collapsed) in the letter
 * order of the attempt, with every option's explanation.
 */
export function QuizResult({
  lesson,
  result,
  fresh,
  onExitToLesson,
  onRetake,
  onOpenBot,
  onOpenFilter,
}: {
  lesson: AcademyLesson
  result: AcademySubmitResult
  /** `true` right after a submit; a review of an older attempt does not announce coins again. */
  fresh: boolean
  onExitToLesson: (section?: number) => void
  onRetake: () => void
  onOpenBot: () => void
  onOpenFilter: () => void
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    // The result opens at its top, whatever the learner had scrolled to while answering.
    scrollReaderToTop(headingRef.current)
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  const reward = fresh ? rewardView(result) : null
  const tool = nextToolFor(lesson, result.completion.completed)
  const good = result.passed

  return (
    <div className="space-y-4">
      <section aria-labelledby="quiz-result-heading" className="rounded-lg border border-border bg-card p-4 text-center sm:p-6">
        <p className="text-[11px] font-semibold tracking-wider text-primary uppercase">Kết quả · {lesson.name}</p>
        <p className={cn("mt-2 font-heading text-6xl leading-none font-bold tabular-nums", good ? "text-price-up" : "text-destructive")} aria-label={`Điểm ${result.score} trên ${QUIZ_QUESTION_COUNT}`}>
          {result.score}
          <small className="text-2xl font-semibold text-muted-foreground"> / {QUIZ_QUESTION_COUNT}</small>
        </p>
        <h2 id="quiz-result-heading" ref={headingRef} tabIndex={-1} className="mt-3 text-lg font-semibold outline-none">
          {resultHeadline(good, lesson.chapter)}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Đúng {result.correct} câu · Sai {result.wrong} câu.
        </p>
        <p className="mt-2 text-sm">{resultNote(result, lesson)}</p>
        {reward && (
          <p role="status" className="mt-3 inline-flex items-center justify-center gap-2 text-sm font-medium">
            {reward.kind === "credited" && (
              <>
                <Coins className="size-4 text-accent" aria-hidden="true" />
                <strong>{creditedText(reward.delta)}</strong>
              </>
            )}
            {reward.kind === "pending" && (
              <>
                <span className="inline-flex items-center gap-1 text-(--status-success)">
                  <Check className="size-3.5" aria-hidden="true" />
                  Đã học
                </span>
                <span className="text-muted-foreground">{PENDING_COINS_TEXT}</span>
              </>
            )}
            {reward.kind === "received" && <strong>{RECEIVED_TEXT}</strong>}
            {reward.kind === "repass" && <span className="text-muted-foreground">{REPASS_NOTE}</span>}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" onClick={() => onExitToLesson()}>
            Xem bài học
          </Button>
          <Button type="button" onClick={() => setConfirmOpen(true)}>
            Làm lại
          </Button>
          {tool === "bot" && (
            <Button type="button" variant="outline" onClick={onOpenBot}>
              Về Bot
            </Button>
          )}
          {tool === "filter" && (
            <Button type="button" variant="outline" onClick={onOpenFilter}>
              Mở Bộ lọc
            </Button>
          )}
        </div>
      </section>

      <h2 className="font-heading text-lg font-semibold">Đáp án và giải thích</h2>
      {result.review_available ? (
        <div className="space-y-3">
          {result.results.map((item, index) => (
            <ReviewCard key={item.question_id} item={item} position={index + 1} lesson={lesson} onReviewSection={(section) => onExitToLesson(section)} />
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
          Chưa xem lại được đáp án của lượt làm này vì bộ câu hỏi đã được cập nhật. Điểm và kết quả vẫn được giữ.
        </p>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Làm lại bài kiểm tra</DialogTitle>
            <DialogDescription>{RETAKE_CONFIRM}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="-mx-6 -mb-6 px-6 pb-6">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Hủy
            </Button>
            <Button
              type="button"
              onClick={() => {
                setConfirmOpen(false)
                onRetake()
              }}
            >
              Bắt đầu lượt mới
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
