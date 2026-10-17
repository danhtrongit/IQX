import { Check, ClipboardCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { LessonContent } from "../content-types"
import { DONE_LABEL, gateState, QUIZ_START_LABEL, SCENARIO_GATE_LABEL } from "../quiz/quiz-copy"

/**
 * End of a lesson or of the practice room: "Làm bài kiểm tra" with its question count, "Đã hoàn
 * thành" once passed (not clickable, spec §2.1-6), or the scenario gate of chapters 2 and 3.
 */
export function LessonQuizGate({ lesson, onStart }: { lesson: LessonContent; onStart: () => void }) {
  const state = gateState(lesson)
  return (
    <section aria-label="Bài kiểm tra" className="mt-3 rounded-lg border border-border bg-card p-4 sm:p-5">
      {state === "passed" ? (
        <Button type="button" variant="outline" disabled className="text-academy-label disabled:opacity-100">
          <Check aria-hidden="true" />
          {DONE_LABEL}
        </Button>
      ) : state === "scenario" ? (
        <Button
          type="button"
          variant="outline"
          disabled
          className="h-auto min-h-8 max-w-full border-dashed py-2 text-left whitespace-normal text-academy-label disabled:opacity-100"
        >
          {SCENARIO_GATE_LABEL}
        </Button>
      ) : (
        <div className="flex flex-col items-start gap-1">
          <Button type="button" onClick={onStart} className="max-[480px]:w-full">
            <ClipboardCheck aria-hidden="true" />
            {QUIZ_START_LABEL}
          </Button>
          <span className="text-xs text-academy-subtle tabular-nums">{lesson.question_count} câu</span>
        </div>
      )}
      {lesson.best_score !== null && state !== "passed" && (
        <p className="mt-2 text-xs text-academy-subtle tabular-nums">
          Điểm cao nhất {lesson.best_score}/{lesson.question_count} · {lesson.attempts_submitted} lượt đã nộp
        </p>
      )}
    </section>
  )
}
