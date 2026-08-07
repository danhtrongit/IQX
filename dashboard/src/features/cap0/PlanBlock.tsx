import { cn } from "@/shared/lib/cn"

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

export function PlanBlock({ symbol, reason, onReason }: PlanBlockProps) {
  return (
    <div className="mt-2 space-y-2 rounded-md border border-[var(--color-border-2)] bg-[var(--color-fill-2)] p-2.5">
      <div className="text-[9px] font-bold uppercase tracking-wider text-[rgb(var(--primary-6))]">
        {"KẾ HOẠCH"}
      </div>

      <div className="text-xs font-semibold text-[var(--color-text-1)]">
        {"Vì sao bạn chọn "}
        {symbol}
        {"?"}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {REASON_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onReason(chip)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[10.5px] transition-colors",
              reason === chip
                ? "border-[rgb(var(--primary-6))] bg-[rgb(var(--primary-6))]/15 font-semibold text-[rgb(var(--primary-6))]"
                : "border-[var(--color-border-2)] bg-[var(--color-bg-2)] text-[var(--color-text-3)]",
            )}
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  )
}
