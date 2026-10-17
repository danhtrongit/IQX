import { useEffect, useRef } from "react"
import { Check, ClipboardCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ExamContent } from "../content-types"
import { DONE_LABEL, EXAM_RULE, EXAM_START_LABEL } from "../quiz/quiz-copy"

/**
 * Intro of a chapter exam (spec §3.3): "Bài thi Chương c", the catalog intro plus the bold rule,
 * and "Bắt đầu làm bài". Once passed: "Đã hoàn thành" and "Xem lại Chương c".
 */
export function ExamIntro({
  exam,
  onStart,
  onReviewChapter,
}: {
  exam: ExamContent
  onStart: () => void
  onReviewChapter: (() => void) | null
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [])
  const passed = exam.state === "passed"
  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <h2 ref={headingRef} tabIndex={-1} className="font-heading text-2xl leading-tight font-bold text-foreground outline-none sm:text-[28px]">
        Bài thi Chương {exam.chapter}
      </h2>
      <p className="mt-3 max-w-[70ch] text-sm leading-7 text-foreground">
        {exam.intro} <b>{EXAM_RULE}</b>
      </p>
      {exam.best_score !== null && !passed && (
        <p className="mt-2 text-xs text-academy-subtle tabular-nums">
          Điểm cao nhất {exam.best_score}/{exam.question_count} · {exam.attempts_submitted} lượt đã nộp
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {passed ? (
          <>
            <Button type="button" variant="outline" disabled className="text-academy-label disabled:opacity-100">
              <Check aria-hidden="true" />
              {DONE_LABEL}
            </Button>
            {onReviewChapter && (
              <Button type="button" variant="ghost" onClick={onReviewChapter}>
                Xem lại Chương {exam.chapter}
              </Button>
            )}
          </>
        ) : (
          <Button type="button" onClick={onStart}>
            <ClipboardCheck aria-hidden="true" />
            {EXAM_START_LABEL}
          </Button>
        )}
      </div>
    </section>
  )
}
