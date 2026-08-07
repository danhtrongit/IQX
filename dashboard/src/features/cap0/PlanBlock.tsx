import { cn } from "@/shared/lib/cn"
import "./cap0.css"

/**
 * "Kế hoạch" block (spec v3.0 §4 THÊM MỚI) — inserted into `OrderEntry`
 * (`features/trading/TradingPanel.tsx`) between the fee summary and the
 * "ĐẶT LỆNH MUA" button.
 *
 * Its entire content is the label, the question, and the 5 chip lý do đời
 * thường — nothing else. v2.2 also rendered a cắt lỗ/chốt lời pair here (a
 * read-only −5%/+10% preset for nhiệm vụ ①, then user-typed inputs for the old
 * nhiệm vụ ⑤); v3.0 removes cắt lỗ/chốt lời from Cấp 0 entirely — "Khối Kế
 * hoạch chỉ có chip lý do đời thường + câu hỏi — KHÔNG cắt lỗ/chốt lời" (§4),
 * restated in the preamble, §0, §8 and §13. They first appear at Cấp 2.
 */

const REASON_CHIPS: readonly string[] = [
  "Công ty tôi biết",
  "Người quen giới thiệu",
  "Thấy trên mạng",
  "Giá đang tăng",
  "Thử cho biết",
]

export interface PlanBlockProps {
  /** Current order symbol — the question is "Vì sao bạn chọn {symbol}?" (spec §4's literal copy uses "VNM", the Cấp 0 preselected symbol). */
  symbol: string
  reason: string | null
  onReason: (reason: string) => void
}

/**
 * Styling follows `iqx-cap0-datlenh.html`'s `.plan` card (brand-tinted
 * gradient + brand border, pill chips). It renders only inside Cấp 0, i.e.
 * always under `Cap0TradingPage`'s `.cap0` wrapper, so the cap0 design tokens
 * resolve — each rule still carries a literal fallback (same convention as
 * `.cap0-mode`) so the block degrades to a readable card if it is ever mounted
 * outside that scope.
 */
export function PlanBlock({ symbol, reason, onReason }: PlanBlockProps) {
  return (
    <div className="cap0-plan">
      <div className="cap0-plan-tag">{"KẾ HOẠCH"}</div>

      <div className="cap0-plan-q">
        {"Vì sao bạn chọn "}
        {symbol}
        {"?"}
      </div>

      <div className="cap0-plan-chips">
        {REASON_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onReason(chip)}
            className={cn("cap0-chip", reason === chip && "cap0-chip--on")}
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  )
}
