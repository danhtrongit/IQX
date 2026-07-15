import type { ReactNode } from "react"

export interface SubQuestionProps {
  /** short code, e.g. "6A" */
  code: string
  /** the sub-question, serif */
  question: string
  /** plain-language answer */
  answer: string
  /** DuoPanel / checklist / chart */
  children?: ReactNode
}

/**
 * Câu hỏi con của khối 6 (6A / 6B / 6C…): mã + tiêu đề + câu trả lời + nội dung.
 *
 * NEGATIVE CONSTRAINT (SPEC §4): KHÔNG tag/verdict pill. Chỉ có mã câu hỏi
 * (`.bctc-sub-code`) — không phải nhãn kết luận.
 */
export function SubQuestion({ code, question, answer, children }: SubQuestionProps) {
  return (
    <div className="bctc-sub">
      <div className="bctc-sub-head">
        <div className="bctc-sub-q">
          <span className="bctc-sub-code">{code}</span>
          {question}
        </div>
      </div>
      <div className="bctc-sub-ans">{answer}</div>
      {children}
    </div>
  )
}
