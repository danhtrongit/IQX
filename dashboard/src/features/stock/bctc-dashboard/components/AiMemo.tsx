export interface AiMemoProps {
  /** big serif lead sentence */
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
 * NEGATIVE CONSTRAINT (SPEC §4): KHÔNG nhãn "AI viết · N từ". Câu chuyện bắt đầu
 * thẳng bằng câu lead — không có tag/pulse-dot ở góc khối.
 */
export function AiMemo({ lead, paragraphs, strengths, watchlist }: AiMemoProps) {
  return (
    <div className="bctc-memo">
      <div className="bctc-memo-lead">{lead}</div>
      <div className="bctc-memo-body">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <div className="bctc-memo-flags">
        <div className="bctc-mf-col">
          <div className="bctc-mf-h bctc-mf-h--good">◆ Điểm khỏe</div>
          <ul className="bctc-flag-list bctc-flag-list--good">
            {strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="bctc-mf-col">
          <div className="bctc-mf-h bctc-mf-h--watch">◆ Cần theo dõi</div>
          <ul className="bctc-flag-list bctc-flag-list--watch">
            {watchlist.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
