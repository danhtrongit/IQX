import { ClipboardCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/lib/format"
import { QUIZ_QUESTION_COUNT, type AcademyLesson } from "../api"
import { useAcademyHistory, useAcademyResume } from "../queries"
import { nextToolFor, QUIZ_RESUME_LABEL, QUIZ_START_LABEL } from "./quiz-copy"

/**
 * End of a quiz lesson: "Làm bài kiểm tra · 8 câu" (or "Tiếp tục bài kiểm tra" when the server holds an
 * open attempt), the best score, the passed-lesson shortcut to the Bot or the Bộ lọc, and the learner's
 * earlier attempts with their reviews. A lesson without a published question bank offers no quiz at all.
 */
export function QuizEntry({
  lesson,
  onStart,
  onReview,
  onOpenBot,
  onOpenFilter,
}: {
  lesson: AcademyLesson
  onStart: () => void
  onReview: (attemptId: string) => void
  onOpenBot: () => void
  onOpenFilter: () => void
}) {
  const ready = lesson.completion.assessment_ready
  const resume = useAcademyResume(lesson.id, ready)
  const history = useAcademyHistory(lesson.id, ready && lesson.attempts_submitted > 0)
  const open = resume.data?.attempt ?? null
  const tool = nextToolFor(lesson, lesson.completed)

  return (
    <section aria-labelledby="academy-quiz-entry" className="mt-3 rounded-lg border border-border bg-card p-4 sm:p-5">
      <h3 id="academy-quiz-entry" className="font-heading text-base font-semibold">
        Bài kiểm tra {lesson.name}
      </h3>
      {ready ? (
        <>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {QUIZ_QUESTION_COUNT} câu về công thức, đọc dữ liệu, tham số và vận dụng. Có thể dùng máy tính. Kết quả được chấm khi bạn nộp đủ câu trả lời.
          </p>
          {lesson.best_score !== null && (
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              Điểm cao nhất {lesson.best_score}/{QUIZ_QUESTION_COUNT} · {lesson.attempts_submitted} lượt đã nộp
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={onStart} className="max-[480px]:w-full">
              <ClipboardCheck aria-hidden="true" />
              {open ? QUIZ_RESUME_LABEL : QUIZ_START_LABEL}
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
          {open && (
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
              Lượt đang làm dở: đã trả lời {open.draft.answered_count} / {open.draft.total}.
            </p>
          )}
          {history.data && history.data.items.length > 0 && (
            <details className="academy-details mt-3">
              <summary>Các lượt đã làm ({history.data.total})</summary>
              <ul className="m-0 mt-2 list-none space-y-1.5 p-0">
                {history.data.items.map((item) => (
                  <li key={item.attempt_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="tabular-nums">
                      {formatDateTime(item.submitted_at)} · <b>{item.score}/{item.total}</b> · {item.passed ? "Đạt" : "Chưa đạt"}
                    </span>
                    {item.review_available && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => onReview(item.attempt_id)}>
                        Xem kết quả
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Bài kiểm tra của bài này chưa sẵn sàng.</p>
      )}
    </section>
  )
}
