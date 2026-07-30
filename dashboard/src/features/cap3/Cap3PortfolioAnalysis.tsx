import { cn } from "@/shared/lib/cn"
import { Cap2PortfolioAnalysis } from "@/features/cap2/Cap2PortfolioAnalysis"
import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import { KHAU_VI_PCT } from "./khoiLuong"
import {
  computeCap3Khoi7TuTin,
  computeCap3Khoi8KhoiLuong,
  KHOI7_MIN_TRADES_PER_MUC,
} from "./portfolioAnalysisCap3"
import type { Cap3TradeRecord } from "./tradeLogCap3"
import type { Cap3Progress, KhauViLoai } from "./types"

/**
 * Trang Phân tích danh mục Cấp 3 (spec `IQX-Cap3-Spec.md` §8).
 *
 * **TÁI SỬ DỤNG Ở TẦNG COMPONENT (documented choice):** mọi khối Cấp 1-2 được
 * render bằng CHÍNH `Cap2PortfolioAnalysis` (khối 1 hồ sơ, khối 2 bảng 5 lý do,
 * khối 3 vi phạm, khối 4 cửa sổ 20 lệnh, khối 5 điểm kỷ luật, khối 6 vi phạm
 * theo tuần, khối 7 phát hiện từ ghi chú, mẫu tự phát hiện) — KHÔNG mirror lại
 * markup như Cấp 2 phải làm với Cấp 1. Lý do khác nhau: `Cap2PortfolioAnalysis`
 * là component THUẦN TRÌNH BÀY nhận `trades`/`dailyScores`/`progress` qua props
 * và không bọc modal/không sở hữu state, còn `Cap3TradeRecord extends
 * Cap2TradeRecord` nên mảng lệnh truyền thẳng vào được; hơn nữa spec §8 nói rõ
 * các khối Cấp 1-2 "GIỮ NGUYÊN" (khác §12 của Cấp 2, nơi khối 1/3/4 buộc phải
 * đổi nội dung nên không thể dùng lại markup Cấp 1).
 *
 * Hệ quả: KHÔNG sửa được markup khối ① của Cấp 2 (ngoài quyền sở hữu file), nên
 * yêu cầu "khối ① thêm hiển thị khẩu vị rủi ro" được đáp ứng bằng một thẻ đầu
 * trang RIÊNG của Cấp 3 (`cap3-pa-khoi1`) đặt NGAY TRÊN các khối kế thừa —
 * cùng thông tin, không phải sửa file Cấp 2.
 *
 * Ở tầng compute, component này chỉ gọi 2 hàm khối mới
 * (`computeCap3Khoi7TuTin` / `computeCap3Khoi8KhoiLuong`) thay vì
 * `computeCap3PortfolioAnalysis`: `Cap2PortfolioAnalysis` đã tự gọi
 * `computeCap2PortfolioAnalysis` bên trong, nên gọi hàm tổng ở đây sẽ tính lại
 * y hệt các khối kế thừa lần thứ hai mà không dùng. Hàm tổng vẫn là API
 * delegate đầy đủ cho consumer/test (xem `portfolioAnalysisCap3.ts`).
 */
export interface Cap3PortfolioAnalysisProps {
  /** Hồ sơ Cấp 2 — cho khối 4 (điều kiện lên Cấp 3) + nhãn khối 1 của Cấp 2. */
  cap2Progress: Cap2Progress | null
  /** Hồ sơ Cấp 3 — cho khẩu vị đang dùng + ngày vào Cấp 3. */
  cap3Progress: Cap3Progress | null
  /** Nhật ký lệnh đã đóng ở Cấp 3 (`useCap3TradeLog`). */
  trades: Cap3TradeRecord[]
  /** Nhật ký điểm kỷ luật hằng ngày (`useCap2TradeLog().scores` — dùng chung). */
  dailyScores: Cap2DailyScoreRecord[]
  /** "Now" tham chiếu cho các khối có cửa sổ thời gian (khối 3/6/7 của Cấp 2). */
  now?: Date
}

const KHAU_VI_LABEL: Record<KhauViLoai, string> = {
  than_trong: "Thận trọng",
  can_bang: "Cân bằng",
  tan_cong: "Tấn công",
}

const SECTION_HEADER =
  "text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--primary-6))]"
const CARD =
  "space-y-2 rounded-md border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-3"
const BADGE_NEW =
  "rounded-full border border-[rgb(var(--primary-6))] px-1.5 py-px text-[9px] font-semibold text-[rgb(var(--primary-6))]"
const TH = "py-1 text-left font-medium text-[var(--color-text-3)]"
const TD = "py-1 text-[var(--color-text-1)]"

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN")
}

/** `+6.0%` / `−1.5%` / `0.0%` — dấu trừ typographic, số en-US (§E). */
function fmtPctSigned(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/** Dấu "chưa đủ dữ liệu" cho 1 hàng mức tự tin — nói thẳng còn thiếu bao nhiêu. */
function InsufficientMark({ count }: { count: number }) {
  const missing = Math.max(0, KHOI7_MIN_TRADES_PER_MUC - count)
  return (
    <span className="ml-1 text-[10px] text-[var(--color-text-3)]">
      {`· chưa đủ (thiếu ${missing})`}
    </span>
  )
}

export function Cap3PortfolioAnalysis({
  cap2Progress,
  cap3Progress,
  trades,
  dailyScores,
  now,
}: Cap3PortfolioAnalysisProps) {
  const khoi7 = computeCap3Khoi7TuTin(trades)
  const khoi8 = computeCap3Khoi8KhoiLuong(trades)
  const khauVi = cap3Progress?.khau_vi ?? null

  return (
    <div className="space-y-3">
      {/* Khối ① (phần Cấp 3 thêm) — khẩu vị rủi ro đang dùng, spec §8 */}
      <div className={CARD} data-testid="cap3-pa-khoi1">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER}>
            {"HỒ SƠ NHÀ ĐẦU TƯ CỦA BẠN · Cấp 3 «Bản lĩnh»"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 3</span>
        </div>
        <p className="text-xs text-[var(--color-text-1)]">
          {khauVi
            ? `Khẩu vị: ${KHAU_VI_LABEL[khauVi]} (trần ${KHAU_VI_PCT[khauVi]}% vốn/lệnh)`
            : "Chưa đặt khẩu vị rủi ro — mọi lệnh Cấp 3 cần đặt khẩu vị trước."}
        </p>
        {cap3Progress && (
          <p className="text-xs text-[var(--color-text-3)]">
            {`${khoi7.totalTrades} lệnh Cấp 3 đã kết sổ · từ ${fmtDate(cap3Progress.entered_at)}`}
          </p>
        )}
      </div>

      {/* Mọi khối Cấp 1-2 — render lại nguyên bằng component của Cấp 2 */}
      <Cap2PortfolioAnalysis
        progress={cap2Progress}
        trades={trades}
        dailyScores={dailyScores}
        now={now}
      />

      {/* ⑦ Thắng/thua theo mức tự tin (spec §8) */}
      <div className={CARD} data-testid="cap3-pa-khoi7">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER}>{"⑦ THẮNG/THUA THEO MỨC TỰ TIN"}</span>
          <span className={BADGE_NEW}>mới ở Cấp 3</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className={TH}>Mức tự tin</th>
              <th className={TH}>Lệnh</th>
              <th className={TH}>Thắng</th>
              <th className={TH}>Lãi/lỗ TB</th>
            </tr>
          </thead>
          <tbody>
            {khoi7.rows.map((row) => (
              <tr
                key={row.mucTuTin}
                className="border-t border-[var(--color-border-2)]"
                data-testid={`cap3-pa-khoi7-row-${row.mucTuTin}`}
              >
                <td className={TD}>{row.label}</td>
                <td className={cn(TD, "tabular-nums")}>
                  {row.count}
                  {row.insufficient && <InsufficientMark count={row.count} />}
                </td>
                <td className={cn(TD, "tabular-nums")}>
                  {row.winRate != null ? `${row.winRate}%` : "—"}
                </td>
                <td
                  className={cn(
                    TD,
                    "tabular-nums",
                    row.avgPnlPct != null && row.avgPnlPct > 0 && "text-up",
                    row.avgPnlPct != null && row.avgPnlPct < 0 && "text-down",
                  )}
                >
                  {row.avgPnlPct != null ? fmtPctSigned(row.avgPnlPct) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {khoi7.phatHien && (
          <p
            className="text-xs text-[var(--color-text-1)]"
            data-testid="cap3-pa-khoi7-phathien"
          >
            {`🎯 ${khoi7.phatHien}`}
          </p>
        )}
        {khoi7.insufficientNote && (
          <p className="text-xs text-[var(--color-text-3)]" data-testid="cap3-pa-khoi7-note">
            {khoi7.insufficientNote}
          </p>
        )}
      </div>

      {/* ⑧ Khối lượng có đi theo tự tin không (spec §8) */}
      <div className={CARD} data-testid="cap3-pa-khoi8">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER}>{"⑧ KHỐI LƯỢNG CÓ ĐI THEO TỰ TIN KHÔNG?"}</span>
          <span className={BADGE_NEW}>mới ở Cấp 3</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className={TH}>Mức tự tin</th>
              <th className={TH}>Lệnh</th>
              <th className={TH}>KL TB</th>
              <th className={TH}>% vốn TB</th>
              <th className={TH}>Cách hay dùng</th>
            </tr>
          </thead>
          <tbody>
            {khoi8.rows.map((row) => (
              <tr
                key={row.mucTuTin}
                className="border-t border-[var(--color-border-2)]"
                data-testid={`cap3-pa-khoi8-row-${row.mucTuTin}`}
              >
                <td className={TD}>{row.label}</td>
                <td className={cn(TD, "tabular-nums")}>
                  {row.count}
                  {row.insufficient && <InsufficientMark count={row.count} />}
                </td>
                <td className={cn(TD, "tabular-nums")}>
                  {row.avgKhoiLuong != null ? fmtInt(row.avgKhoiLuong) : "—"}
                </td>
                <td className={cn(TD, "tabular-nums")}>
                  {row.avgPctVon != null ? `${row.avgPctVon}%` : "—"}
                </td>
                <td className={TD}>{row.cachHayDungLabel ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {khoi8.phatHien && (
          <p
            className="text-xs text-[var(--color-text-1)]"
            data-testid="cap3-pa-khoi8-phathien"
          >
            {`📊 ${khoi8.phatHien}`}
          </p>
        )}
        {khoi8.insufficientNote && (
          <p className="text-xs text-[var(--color-text-3)]" data-testid="cap3-pa-khoi8-note">
            {khoi8.insufficientNote}
          </p>
        )}
      </div>
    </div>
  )
}
