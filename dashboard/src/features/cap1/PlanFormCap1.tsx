import { InputNumber } from "@arco-design/web-react"
import { cn } from "@/shared/lib/cn"
import { LY_DO_OPTIONS } from "./types"
import type { LyDo } from "./types"

/**
 * Form Kế hoạch 2 trường (spec §4, THÊM MỚI) — "Trái tim Cấp 1". Replaces the
 * Cấp 0 "5 chip lý do đời thường" block in `TradingPanel`'s order entry.
 *
 * Trường 1 — Lý do mua: 1-trong-5 lý do (spec §4 table, `LY_DO_OPTIONS`).
 * Trường 2 — Vùng mua: number, default = giá hiện tại (the caller resolves
 * the default — same "computed, not stored" convention `TradingPanel` already
 * uses for Cấp 0's preset SL/TP — and passes it down as `vungMua`).
 *
 * Purely presentational + controlled: no SL/TP here (spec §4 "KHÔNG có Cắt
 * lỗ / Chốt lời ở Cấp 1").
 */
export interface PlanFormCap1Props {
  symbol: string
  lyDo: LyDo | null
  onLyDoChange: (lyDo: LyDo) => void
  vungMua: number | null
  onVungMuaChange: (value: number | null) => void
}

export function PlanFormCap1({
  symbol,
  lyDo,
  onLyDoChange,
  vungMua,
  onVungMuaChange,
}: PlanFormCap1Props) {
  return (
    <div className="mt-2 space-y-2.5 rounded-md border border-[var(--color-border-2)] bg-[var(--color-fill-2)] p-2.5">
      <div className="text-[9px] font-bold uppercase tracking-wider text-[rgb(var(--primary-6))]">
        {"KẾ HOẠCH"}
      </div>

      {/* Trường 1 — Lý do mua */}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-[var(--color-text-1)]">
          {"Vì sao bạn mua "}
          {symbol}
          {"?"}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {LY_DO_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onLyDoChange(opt.value)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10.5px] transition-colors",
                lyDo === opt.value
                  ? "border-[rgb(var(--primary-6))] bg-[rgb(var(--primary-6))]/15 font-semibold text-[rgb(var(--primary-6))]"
                  : "border-[var(--color-border-2)] bg-[var(--color-bg-2)] text-[var(--color-text-3)]",
              )}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Trường 2 — Vùng mua */}
      <div className="space-y-0.5">
        <label className="text-[8.5px] uppercase tracking-wide text-[var(--color-text-3)]">
          {"Vùng mua"}
        </label>
        <InputNumber
          mode="button"
          size="mini"
          step={100}
          min={0}
          value={vungMua ?? undefined}
          onChange={(v) => onVungMuaChange(v ?? null)}
          className="w-full"
        />
      </div>
    </div>
  )
}
