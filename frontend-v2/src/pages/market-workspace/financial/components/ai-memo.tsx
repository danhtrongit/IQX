export interface AiMemoProps {
  /** big lead sentence */
  lead: string
  /** ~3 AI paragraphs (kinh doanh / dòng tiền / định giá + rủi ro) */
  paragraphs: string[]
  /** ◆ Điểm khỏe — 4–5 bullets */
  strengths: string[]
  /** ◆ Cần theo dõi — 1–3 bullets */
  watchlist: string[]
}

/**
 * KHỐI 1 — câu chuyện doanh nghiệp: 1 khối liền mạch (lead + đoạn văn + 2 danh
 * sách điểm khỏe / cần theo dõi).
 *
 * NEGATIVE CONSTRAINT: KHÔNG nhãn "AI viết · N từ" — câu chuyện bắt đầu thẳng
 * bằng câu lead.
 */
export function AiMemo({ lead, paragraphs, strengths, watchlist }: AiMemoProps) {
  return (
    <div className="rounded-lg border-l-4 border-l-accent bg-card p-5 sm:p-7">
      <div className="font-heading text-xl font-medium leading-snug tracking-tight">{lead}</div>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-muted-foreground">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-1 gap-6 border-t border-border pt-5 sm:grid-cols-2 sm:gap-x-10">
        <div>
          <div className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-price-up">
            ◆ Điểm khỏe
          </div>
          <ul className="space-y-2.5">
            {strengths.map((s, i) => (
              <li
                key={i}
                className="relative pl-4 text-[13px] leading-snug text-muted-foreground before:absolute before:top-1.5 before:left-0 before:size-[5px] before:rounded-full before:bg-price-up"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-price-ref">
            ◆ Cần theo dõi
          </div>
          <ul className="space-y-2.5">
            {watchlist.map((w, i) => (
              <li
                key={i}
                className="relative pl-4 text-[13px] leading-snug text-muted-foreground before:absolute before:top-1.5 before:left-0 before:size-[5px] before:rounded-full before:bg-price-ref"
              >
                {w}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
