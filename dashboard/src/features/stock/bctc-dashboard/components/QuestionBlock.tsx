import type { ReactNode } from "react"

export interface QuestionBlockProps {
  /** block number (0–7); shown zero-padded in the header rule */
  num: number
  /** section title (đứng một mình bên trái) */
  title: string
  /** the user-facing question, serif */
  question: string
  /** the plain-language answer paragraph (this IS the verdict — no pill) */
  answer: string
  /** charts / metric rows / drilldown */
  children?: ReactNode
}

/**
 * Khung 1 khối (khối 2–5 & 7): block-header rule + qcard (câu hỏi + câu trả lời
 * văn + nội dung).
 *
 * NEGATIVE CONSTRAINT (SPEC §4): KHÔNG verdict pill/badge ở góc phải khối. Kết
 * luận của khối nằm trong câu trả lời văn ngay dưới tiêu đề. Tiêu đề đứng một
 * mình bên trái (không có phần tử đối trọng bên phải).
 */
export function QuestionBlock({ num, title, question, answer, children }: QuestionBlockProps) {
  const label = String(num).padStart(2, "0")
  return (
    <section className="bctc-block">
      <div className="bctc-block-tag">
        <span className="bctc-bt-num">{label}</span>
        <span className="bctc-bt-title">{title}</span>
        <span className="bctc-bt-line" />
      </div>
      <div className="bctc-qcard">
        <div className="bctc-qcard-head">
          <div className="bctc-qcard-q">{question}</div>
        </div>
        <div className="bctc-qcard-answer">{answer}</div>
        {children}
      </div>
    </section>
  )
}
