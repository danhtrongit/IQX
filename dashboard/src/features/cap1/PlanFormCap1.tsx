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
/**
 * Mô tả 1 dòng của từng lý do, hiện ngay trên hàng chọn (mockup
 * `iqx-cap1-datlenh.html`) — bản rút gọn của cột "Nguồn dữ liệu" spec §4
 * (`LyDoOption.source` giữ nguyên bản đầy đủ, dùng ở AI Thanh tra).
 * Khai báo tại đây (không thêm field vào `LY_DO_OPTIONS`) vì `types.ts` là
 * hợp đồng dùng chung cho cả Cấp 2-8.
 */
const LY_DO_DESC: Record<LyDo, string> = {
  ky_thuat: "xu hướng giá",
  dong_tien: "khối ngoại + tự doanh",
  noi_bo: "lãnh đạo mua",
  tin_tuc: "tin doanh nghiệp",
  dinh_gia: "từ BCTC",
}

export interface PlanFormCap1Props {
  /** Mã đang đặt lệnh — dùng làm nhãn a11y cho nhóm 5 lý do. */
  symbol: string
  lyDo: LyDo | null
  onLyDoChange: (lyDo: LyDo) => void
  vungMua: number | null
  onVungMuaChange: (value: number | null) => void
  /**
   * Hide Trường 1 (the 1-trong-5 lý do chips) while keeping Trường 2 (Vùng
   * mua) — Cấp 4 «Thuần thục» REPLACES "chọn 1 lý do" with its khối "Đọc 5
   * lớp" but keeps Vùng mua untouched (Cấp 4 spec §5's "Vùng mua … GIỮ
   * NGUYÊN"). Defaults to `false`, so Cấp 1/2/3 render exactly as before.
   */
  hideLyDo?: boolean
}

export function PlanFormCap1({
  symbol,
  lyDo,
  onLyDoChange,
  vungMua,
  onVungMuaChange,
  hideLyDo = false,
}: PlanFormCap1Props) {
  return (
    <div className="mt-2 space-y-2.5 rounded-md border border-[var(--color-border-2)] bg-[var(--color-fill-2)] p-2.5">
      <div className="text-[9px] font-bold uppercase tracking-wider text-[rgb(var(--primary-6))]">
        {"KẾ HOẠCH"}
      </div>

      {/* Trường 1 — Lý do mua (ẩn ở Cấp 4: khối "Đọc 5 lớp" thay thế) */}
      {!hideLyDo && (
        <div className="space-y-1.5">
          <div className="text-[10.5px] uppercase tracking-wide text-[var(--color-text-2)]">
            {"1. Lý do mua — chọn 1 trong 5 lớp"}
          </div>
          <div role="group" aria-label={`Lý do mua ${symbol}`} className="flex flex-col gap-1.5">
            {LY_DO_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onLyDoChange(opt.value)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[7px] border px-2.5 py-2 text-left transition-colors",
                  lyDo === opt.value
                    ? "border-[rgb(var(--primary-6))] bg-[rgb(var(--primary-6))]/15"
                    : "border-[var(--color-border-2)] bg-[var(--color-bg-2)]",
                )}
              >
                <span className="text-[15px] leading-none">{opt.icon}</span>
                <span
                  className={cn(
                    "flex-1 text-[12.5px] font-semibold",
                    lyDo === opt.value
                      ? "text-[rgb(var(--primary-6))]"
                      : "text-[var(--color-text-1)]",
                  )}
                >
                  {opt.label}
                </span>
                <span className="text-[10.5px] text-[var(--color-text-3)]">
                  {LY_DO_DESC[opt.value]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Trường 2 — Vùng mua */}
      <div className="space-y-0.5">
        <label className="text-[10px] uppercase tracking-wide text-[var(--color-text-3)]">
          {"2. Vùng mua (giá cụ thể)"}
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
