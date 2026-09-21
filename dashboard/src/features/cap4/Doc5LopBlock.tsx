import { useEffect } from "react"
import { useLearningReading } from "@/features/journey-identity/hooks"
import { cn } from "@/shared/lib/cn"
import {
  LOP_DEFS,
  NHAN_DINH_LABEL,
  NHAN_DINH_OPTIONS,
  countCungGocNhin,
  countDongThuan,
} from "./doc5Lop"
import type { Lop, Lop5Partial, NhanDinhLop } from "./types"
import "./cap4.css"

/** The existing five-layer form, backed by a frozen server reading dataset.
 * Completing all five answers commits the first submission before requesting
 * AI reveal. User edits remain allowed; they never rewrite identity evidence.
 */
export interface Doc5LopBlockProps {
  symbol: string
  /** Live market price (VND) — preferred over BCTC's cached `current_price`. */
  currentPrice: number
  doc5Lop: Lop5Partial
  onRate: (lop: Lop, nhanDinh: NhanDinhLop) => void
  /**
   * Fires with the AI's per-lớp 3-mức view ONLY once all 5 lớp are rated (i.e.
   * once the đối chiếu is legitimately revealed). The caller retains it only
   * for the local bus and display. The write API accepts the user's self-rating
   * only; the server owns the AI snapshot and comparison counters.
   */
  onAi5Lop?: (ai5Lop: Lop5Partial) => void
}

export function Doc5LopBlock({ symbol, doc5Lop, onRate, onAi5Lop }: Doc5LopBlockProps) {
  const reading = useLearningReading(symbol, doc5Lop)
  const soDaCham = LOP_DEFS.filter(def => doc5Lop[def.lop] != null).length
  // Only expose an AI snapshot actually returned by the reveal endpoint.
  // `useLearningReading` may expose a neutral UI fallback after a failed
  // request so the lesson does not become a trading gate; that fallback is
  // not evidence and must never be treated as the revealed comparison locally.
  const ai5Lop = reading.reveal.data?.ai_answers ?? null
  const rows = reading.reveal.data?.readings ?? reading.dataset.data?.readings
  const resolved = LOP_DEFS.map(def => ({
    lop: def.lop,
    loading: reading.dataset.isPending,
    degraded: !rows?.[def.lop] || rows[def.lop].degraded ||
      (ai5Lop != null && !reading.reveal.data?.ai_answers[def.lop]),
    lines: rows?.[def.lop].lines ?? [],
  }))
  const ai5LopKey = ai5Lop ? JSON.stringify(ai5Lop) : null
  useEffect(() => {
    if (ai5Lop) onAi5Lop?.(ai5Lop)
    // Same map is delivered only once; the receipt remains immutable on server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai5LopKey])

  const soDongThuan = countDongThuan(ai5Lop)
  const soCungGocNhin = countCungGocNhin(doc5Lop, ai5Lop)

  return (
    <div className="cap4-doc5lop" data-testid="cap4-doc5lop">
      <div className="cap4-block-tag">{"ĐỌC 5 LỚP"}</div>
      {/* ★ Số thứ tự «1.» KHÔNG phải trang trí: mockup `iqx-cap4-datlenh.html`
          đánh số ba mục của thẻ KẾ HOẠCH là 1./2./3., và khối này THAY CHỖ
          mục ① «1. Lý do mua» của Cấp 1 (`PlanFormCap1` ẩn trường đó ở Cấp 4).
          Thiếu số, panel Cấp 4/5 đọc thành "… → 2. Vùng mua → 3. Cắt lỗ/Chốt
          lời" — nhảy thẳng từ không-số sang 2. */}
      <div className="cap4-block-title">
        {"1. Đọc 5 lớp phân tích — tự chấm từng lớp, AI đối chiếu sau"}
      </div>

      {LOP_DEFS.map((def) => {
        const r = resolved.find((x) => x.lop === def.lop)!
        const picked = doc5Lop[def.lop] ?? null
        const aiMuc = ai5Lop?.[def.lop]
        const cungGocNhin = aiMuc != null && picked != null && aiMuc === picked

        return (
          <div key={def.lop} className="cap4-lop-row" data-testid={`cap4-lop-${def.lop}`}>
            <div className="cap4-lop-head">
              <span className="cap4-lop-icon">{def.icon}</span>
              <span className="cap4-lop-name">{def.label}</span>
            </div>

            {/* Chi tiết dữ liệu thật — hiện sẵn, không cần bấm mở (spec §5.1). */}
            {r.loading ? (
              <p className="cap4-lop-hint">{"Đang tải dữ liệu lớp…"}</p>
            ) : r.degraded ? (
              <p className="cap4-lop-hint">{"Chưa có dữ liệu lớp này."}</p>
            ) : (
              <div className="cap4-lop-data">
                {r.lines.map((line, i) => (
                  <p key={i} className="cap4-lop-line">
                    {line}
                  </p>
                ))}
              </div>
            )}

            <div className="cap4-lop-rate-label">{"Bạn đọc lớp này là:"}</div>
            <div className="cap4-lop-rate-group">
              {NHAN_DINH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={cn(
                    "cap4-rate-btn",
                    `cap4-rate-btn--${opt.value}`,
                    picked === opt.value && "cap4-rate-btn--on",
                  )}
                  aria-pressed={picked === opt.value}
                  onClick={() => onRate(def.lop, opt.value)}
                  data-testid={`cap4-rate-${def.lop}-${opt.value}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Ô đối chiếu AI — ẨN cho tới khi chấm đủ 5 lớp (spec §5.2). */}
            {ai5Lop != null && (
              <div
                className={cn(
                  "cap4-ai-cell",
                  r.degraded
                    ? "cap4-ai-cell--nodata"
                    : cungGocNhin
                      ? "cap4-ai-cell--cung"
                      : "cap4-ai-cell--khac",
                )}
                data-testid={`cap4-ai-${def.lop}`}
              >
                {r.degraded
                  ? "⚪ Chưa có dữ liệu lớp này để đối chiếu"
                  : cungGocNhin
                    ? `✓ Cùng góc nhìn với AI — AI đánh giá: ${NHAN_DINH_LABEL[aiMuc!]}`
                    : `↔ Góc nhìn khác AI — AI đánh giá: ${NHAN_DINH_LABEL[aiMuc!]}`}
              </div>
            )}
          </div>
        )
      })}

      {reading.settledFailure && (
        <p role="status" className="cap4-lop-hint">
          Chưa lưu được dữ liệu đối chiếu. Bạn vẫn có thể tiếp tục kế hoạch;
          bản này chưa được dùng để xác định Linh thú.
        </p>
      )}
      {ai5Lop == null && !reading.settledFailure ? (
        <div className="cap4-locked" data-testid="cap4-ai-locked">
          <div className="cap4-locked-main">
            {soDaCham === 5 ? "Đang lưu bản tự chấm và tải AI đối chiếu…" : "🔒 Chấm đủ 5 lớp để xem AI đối chiếu và đặt lệnh"}
          </div>
          <div className="cap4-locked-sub">{`Đã chấm ${soDaCham}/5 lớp`}</div>
        </div>
      ) : ai5Lop == null ? (
        <div className="cap4-locked" data-testid="cap4-ai-unavailable">
          <div className="cap4-locked-main">AI đối chiếu đang tạm thời chưa khả dụng</div>
          <div className="cap4-locked-sub">
            Bản tự chấm đủ 5 lớp vẫn được dùng cho tiến độ; bạn có thể tiếp tục đặt lệnh.
          </div>
        </div>
      ) : (
        <div className="cap4-dongthuan">
          <div className="cap4-dongthuan-main" data-testid="cap4-dongthuan-summary">
            {`Điểm đồng thuận ${soDongThuan}/5 · Cùng góc nhìn AI ${soCungGocNhin}/5`}
          </div>
          {/* §C12c + spec §4.2 — where the numbers come from, and that a
              different reading is a góc nhìn khác, not a mistake. */}
          <div className="cap4-dongthuan-sub" data-testid="cap4-dongthuan-provenance">
            {`${soDongThuan}/5 lớp AI đánh giá Ủng hộ · bạn cùng góc nhìn AI ở ${soCungGocNhin}/5 lớp. Lệch AI là góc nhìn khác cần kiểm chứng bằng kết quả lệnh, không phải lỗi đọc.`}
          </div>
        </div>
      )}
    </div>
  )
}
