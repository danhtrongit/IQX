import type { ReactNode } from "react"

export interface SubQuestionProps {
  /** short code, e.g. "6A" */
  code: string
  /** the sub-question */
  question: string
  /** plain-language answer */
  answer: string
  /** DuoPanel / checklist / chart */
  children?: ReactNode
}

/**
 * Câu hỏi con của khối 6 (6A / 6B / 6C…): mã + tiêu đề + câu trả lời + nội dung.
 * NEGATIVE CONSTRAINT: KHÔNG tag/verdict pill — chỉ có mã câu hỏi.
 */
export function SubQuestion({ code, question, answer, children }: SubQuestionProps) {
  return (
    <div className="rounded-lg bg-secondary p-4 sm:p-5">
      <div className="flex items-baseline gap-2.5">
        <span className="rounded-[3px] bg-primary/12 px-2 py-0.5 text-xs font-bold tracking-[0.05em] text-primary">
          {code}
        </span>
        <span className="font-heading text-lg font-semibold leading-snug tracking-tight">
          {question}
        </span>
      </div>
      {answer ? (
        <p className="mt-2.5 mb-5 max-w-[78ch] text-sm leading-6 text-muted-foreground">{answer}</p>
      ) : null}
      {children}
    </div>
  )
}
