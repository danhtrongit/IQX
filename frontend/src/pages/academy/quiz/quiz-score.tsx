import { useEffect, useRef } from "react"
import { ArrowRight, Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ItemResponse, SubmitResult } from "../api"
import { scrollReaderToTop } from "../scroll"
import { chapterPill, DONE_LABEL, quizLabel, reviewLabel, unlockedPill } from "./quiz-copy"

/**
 * Result of a graded attempt: "n/N" and Đạt / Chưa đạt, nothing else about the questions (no correct
 * option, no wrong-question list, no explanation). A pass shows what it opened: the indicator pills
 * ("Đã mở chỉ báo X") or, for an exam, "Đã hoàn thành Chương c".
 */
export function QuizScore({
  item,
  result,
  onReview,
  onRetake,
  onNext,
}: {
  item: ItemResponse
  result: SubmitResult
  /** "Xem lại bài" (back to the content) or, for an exam, "Xem lại Chương c". */
  onReview: () => void
  onRetake: () => void
  onNext: (itemId: string) => void
}) {
  const headingRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    // The result opens at its top, whatever the learner had scrolled to while answering.
    scrollReaderToTop(headingRef.current)
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  const passed = result.passed
  return (
    <section aria-label={`Kết quả ${quizLabel(item)}`} className="rounded-lg border border-border bg-card p-5 text-center sm:p-8">
      <p className="text-sm font-semibold text-primary">{quizLabel(item)}</p>
      <p
        ref={headingRef}
        tabIndex={-1}
        aria-label={`Điểm ${result.score} trên ${result.total}`}
        className={cn("mt-3 font-heading text-6xl leading-none font-bold tabular-nums outline-none", passed ? "text-(--status-success)" : "text-destructive")}
      >
        {result.score}/{result.total}
      </p>
      <p className={cn("mt-3 text-lg font-semibold", passed ? "text-(--status-success)" : "text-destructive")}>
        {passed ? "Đạt" : "Chưa đạt"}
      </p>
      {passed && (result.unlocked_labels.length > 0 || result.chapter_completed !== null) && (
        <ul className="m-0 mt-3 flex list-none flex-wrap justify-center gap-2 p-0">
          {result.unlocked_labels.map((label) => (
            <li key={label} className="rounded-full border border-(--status-success)/50 bg-(--status-success)/10 px-3 py-1 text-sm font-medium text-foreground">
              {unlockedPill(label)}
            </li>
          ))}
          {result.chapter_completed !== null && (
            <li className="rounded-full border border-(--status-success)/50 bg-(--status-success)/10 px-3 py-1 text-sm font-medium text-foreground">
              {chapterPill(result.chapter_completed)}
            </li>
          )}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {passed ? (
          <Button type="button" variant="outline" disabled className="text-academy-label disabled:opacity-100">
            <Check aria-hidden="true" />
            {DONE_LABEL}
          </Button>
        ) : (
          <Button type="button" onClick={onRetake}>
            Làm lại
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onReview}>
          {reviewLabel(item)}
        </Button>
        {passed && result.next_item_id && (
          <Button type="button" variant="secondary" onClick={() => onNext(result.next_item_id as string)}>
            Bài tiếp theo
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </div>
    </section>
  )
}
