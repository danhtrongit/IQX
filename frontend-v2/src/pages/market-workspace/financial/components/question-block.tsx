import type { ReactNode } from "react"

export interface QuestionBlockProps {
  /** block number (2–7); shown zero-padded in the header rule */
  num: number
  /** section title (đứng một mình bên trái) */
  title: string
  /** the user-facing question */
  question: string
  /** the plain-language answer paragraph (this IS the verdict — no pill) */
  answer: string
  /** charts / metric rows / drilldown */
  children?: ReactNode
  tourId?: string
}

/**
 * Block header rule: số thứ tự (zero-padded) + tiêu đề + đường kẻ.
 * Dùng chung cho mọi khối, kể cả khối 01 (câu chuyện) không có qcard.
 */
export function BlockHeader({ num, title }: { num: number; title: string }) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="grid size-[26px] shrink-0 place-items-center rounded-[2px] bg-foreground font-heading text-xs font-semibold tabular-nums text-background">
        {String(num).padStart(2, "0")}
      </span>
      <span className="font-heading text-[13px] font-bold uppercase tracking-[0.13em]">{title}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

/**
 * Khung 1 khối (khối 2–7): block-header rule + qcard (câu hỏi + câu trả lời
 * văn + nội dung).
 *
 * NEGATIVE CONSTRAINT: KHÔNG verdict pill/badge ở góc phải khối. Kết luận của
 * khối nằm trong câu trả lời văn ngay dưới tiêu đề.
 */
export function QuestionBlock({ num, title, question, answer, children, tourId }: QuestionBlockProps) {
  return (
    <section className="space-y-3" data-tour-id={tourId}>
      <BlockHeader num={num} title={title} />

      <div className="rounded-lg bg-card p-5 sm:p-7">
        <div className="font-heading text-xl font-semibold leading-snug tracking-tight sm:text-[23px]">
          {question}
        </div>
        {answer ? (
          <p className="mt-1.5 mb-5 max-w-[72ch] text-sm leading-6 text-muted-foreground">
            {answer}
          </p>
        ) : null}
        {children}
      </div>
    </section>
  )
}
