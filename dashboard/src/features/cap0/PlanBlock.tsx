import { InputNumber } from "@arco-design/web-react"
import { cn } from "@/shared/lib/cn"

/**
 * "Kế hoạch" block (spec §4 THÊM MỚI) — inserted into `OrderEntry`
 * (`features/trading/TradingPanel.tsx`) between the fee summary and the
 * "ĐẶT LỆNH MUA" button. Reused by both:
 *  - Nhiệm vụ ① (`presetMode="filled"`): SL/TP are read-only, system-computed
 *    presets (−5%/+10% off the current price) — this delivery's only wired
 *    mode.
 *  - Nhiệm vụ ⑤ (`presetMode="manual"`, a LATER task): empty, user-typed
 *    SL/TP inputs — rendered here so that later task can reuse this
 *    component as-is, but its "cổng chất lượng" keydown-gating logic lives
 *    in the caller, not here.
 */

const REASON_CHIPS: readonly string[] = [
  "Công ty tôi biết",
  "Người quen giới thiệu",
  "Thấy trên mạng",
  "Giá đang tăng",
  "Thử cho biết",
]

function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("vi-VN")
}

export interface PlanBlockProps {
  /** Current order symbol — the question is "Vì sao bạn chọn {symbol}?" (spec §4's literal copy uses "VNM", the Cấp 0 preselected symbol). */
  symbol: string
  presetMode: "filled" | "manual"
  reason: string | null
  onReason: (reason: string) => void
  /** Cắt lỗ — preset price in "filled" mode, user-typed value (or `null` until typed) in "manual" mode. */
  sl: number | null
  /** Chốt lời — preset price in "filled" mode, user-typed value (or `null` until typed) in "manual" mode. */
  tp: number | null
  /** "manual" mode only (nhiệm vụ ⑤, later task). */
  onSlChange?: (value: number | null) => void
  /** "manual" mode only — spec §4 Chặng 3 "cổng chất lượng 1: event `keydown`".
   *  Typed `(e: Event) => void` to match Arco's `InputNumber.onKeyDown`. */
  onSlKeydown?: (e: Event) => void
  onTpChange?: (value: number | null) => void
}

export function PlanBlock({
  symbol,
  presetMode,
  reason,
  onReason,
  sl,
  tp,
  onSlChange,
  onSlKeydown,
  onTpChange,
}: PlanBlockProps) {
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

      {presetMode === "filled" ? (
        <>
          <div className="flex gap-1.5">
            <div className="flex-1 rounded-md border border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-2 py-1.5">
              <div className="text-[8.5px] uppercase tracking-wide text-[var(--color-text-3)]">
                {"Cắt lỗ (đề xuất)"}
              </div>
              <div className="mt-0.5 font-mono text-[11.5px] font-bold text-down">
                {sl != null ? `${fmtVnd(sl)} · −5%` : "—"}
              </div>
            </div>
            <div className="flex-1 rounded-md border border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-2 py-1.5">
              <div className="text-[8.5px] uppercase tracking-wide text-[var(--color-text-3)]">
                {"Chốt lời (đề xuất)"}
              </div>
              <div className="mt-0.5 font-mono text-[11.5px] font-bold text-up">
                {tp != null ? `${fmtVnd(tp)} · +10%` : "—"}
              </div>
            </div>
          </div>
          <p className="text-[9.5px] leading-relaxed text-[var(--color-text-3)]">
            {"Cắt lỗ: nếu giá giảm tới đây, bán để bảo toàn vốn. Lệnh đầu hệ thống đề xuất sẵn — chỉ cần đồng ý."}
          </p>
        </>
      ) : (
        <div className="flex gap-1.5">
          <div className="flex-1 space-y-0.5">
            <label className="text-[8.5px] uppercase tracking-wide text-[var(--color-text-3)]">
              {"Cắt lỗ (đề xuất)"}
            </label>
            <InputNumber
              mode="button"
              size="mini"
              step={100}
              value={sl ?? undefined}
              onChange={(v) => onSlChange?.(v ?? null)}
              onKeyDown={onSlKeydown}
              className="w-full"
            />
          </div>
          <div className="flex-1 space-y-0.5">
            <label className="text-[8.5px] uppercase tracking-wide text-[var(--color-text-3)]">
              {"Chốt lời (đề xuất)"}
            </label>
            <InputNumber
              mode="button"
              size="mini"
              step={100}
              value={tp ?? undefined}
              onChange={(v) => onTpChange?.(v ?? null)}
              className="w-full"
            />
          </div>
        </div>
      )}
    </div>
  )
}
