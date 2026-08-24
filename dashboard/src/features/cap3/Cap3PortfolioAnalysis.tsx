import { cn } from "@/shared/lib/cn"
import {
  Cap2PortfolioAnalysis,
  type Cap2AnalysisHost,
} from "@/features/cap2/Cap2PortfolioAnalysis"
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
 * render bằng CHÍNH `Cap2PortfolioAnalysis` (① hồ sơ, ② bảng 5 lý do, ③ độ phủ
 * 5 lý do, ④ cơ chế cắt lỗ/chốt lời — 4 khối Cấp 2 còn lại) — KHÔNG
 * mirror lại markup như Cấp 2 phải làm với Cấp 1. Lý do khác nhau: `Cap2PortfolioAnalysis`
 * là component THUẦN TRÌNH BÀY nhận `trades`/`dailyScores`/`progress` qua props
 * và không bọc modal/không sở hữu state, còn `Cap3TradeRecord extends
 * Cap2TradeRecord` nên mảng lệnh truyền thẳng vào được; hơn nữa spec §8 nói rõ
 * các khối Cấp 1-2 "GIỮ NGUYÊN" (khác §12 của Cấp 2, nơi khối 1/3/4 buộc phải
 * đổi nội dung nên không thể dùng lại markup Cấp 1).
 *
 * Yêu cầu "khối ① thêm hiển thị khẩu vị rủi ro" được đáp ứng bằng một thẻ đầu
 * trang RIÊNG của Cấp 3 (`cap3-pa-khoi1`) đặt NGAY TRÊN các khối kế thừa.
 *
 * ★ **`host` (xem `Cap2AnalysisHost`)** — các khối kế thừa nhận `trades` là nhật
 * ký CỦA CẤP 3 nhưng `progress` là hồ sơ Cấp 2, nên nếu không nói rõ ngữ cảnh
 * chúng sẽ tự xưng "Cấp 2 «Kỷ luật» · N lệnh · từ {ngày vào Cấp 2}" — N của cấp
 * này, ngày của cấp kia, lại đứng ngay dưới thẻ `cap3-pa-khoi1`. `host` cũng tắt
 * ô tiến độ "n/10 lệnh có CL/CL" (mốc TỐT NGHIỆP CẤP 2, ở đây luôn 10/10) và
 * đổi câu "… sẽ đến ở các cấp sau" (người đọc đang ở cấp sau).
 *
 * ★ **ĐÁNH SỐ KHỐI** — mockup `iqx-cap3-phantich-danhmuc.html` đánh hai khối mới
 * là ⑦⑧ vì lúc vẽ Cấp 2 có 6 khối; Cấp 2 viết lại chỉ còn ①..④ (đã bỏ «Điểm kỷ
 * luật 30 ngày»/«Vi phạm theo tuần»/«Phát hiện từ ghi chú»), nên UI hiển thị ⑤⑥
 * cho liền mạch. Tầng compute GIỮ tên theo spec (`computeCap3Khoi7TuTin`,
 * `khoi7TuTin`/`khoi8KhoiLuong`) vì đó là ID khối trong `IQX-Cap3-Spec.md` §8 và
 * Cấp 4-8 đọc lại các tên đó — đổi tên sẽ lan qua 5 cấp đang tắt mà không đổi
 * được gì cho người dùng. Ánh xạ: ⑦ (spec) = ⑤ (UI), ⑧ (spec) = ⑥ (UI).
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
  /**
   * Ngữ cảnh cấp cho các khối KẾ THỪA của Cấp 2 (xem `Cap2AnalysisHost`). Mặc
   * định là chính Cấp 3. Cấp 4-8 render lại component này với nhật ký lệnh của
   * CHÍNH NÓ nên phải truyền `host` của cấp mình, nếu không khối ① sẽ tự xưng
   * "Cấp 3 «Bản lĩnh»" trong trang của cấp cao hơn.
   */
  host?: Cap2AnalysisHost
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
  host,
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

      {/* Mọi khối Cấp 1-2 — render lại nguyên bằng component của Cấp 2.
          `host` nói cho nó biết nó đang đứng trong trang của Cấp 3: `trades` là
          nhật ký Cấp 3 nên khối ① phải mang nhãn + ngày của Cấp 3, ô tiến độ
          "n/10 lệnh có CL/CL" (mốc tốt nghiệp Cấp 2) phải tắt, và câu "sẽ đến ở
          các cấp sau" phải đổi. */}
      <Cap2PortfolioAnalysis
        progress={cap2Progress}
        trades={trades}
        dailyScores={dailyScores}
        now={now}
        host={
          host ?? {
            levelLabel: "Cấp 3 «Bản lĩnh»",
            sinceIso: cap3Progress?.entered_at ?? null,
          }
        }
      />

      {/* ⑤ Thắng/thua theo mức tự tin (spec §8 — mockup đánh ⑦, xem docstring) */}
      <div className={CARD} data-testid="cap3-pa-khoi5">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER}>{"⑤ THẮNG/THUA THEO MỨC TỰ TIN"}</span>
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
                data-testid={`cap3-pa-khoi5-row-${row.mucTuTin}`}
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
            data-testid="cap3-pa-khoi5-phathien"
          >
            {`🎯 ${khoi7.phatHien}`}
          </p>
        )}
        {khoi7.insufficientNote && (
          <p className="text-xs text-[var(--color-text-3)]" data-testid="cap3-pa-khoi5-note">
            {khoi7.insufficientNote}
          </p>
        )}
      </div>

      {/* ⑥ Khối lượng có đi theo tự tin không (spec §8 — mockup đánh ⑧) */}
      <div className={CARD} data-testid="cap3-pa-khoi6">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER}>{"⑥ KHỐI LƯỢNG CÓ ĐI THEO TỰ TIN KHÔNG?"}</span>
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
                data-testid={`cap3-pa-khoi6-row-${row.mucTuTin}`}
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
            data-testid="cap3-pa-khoi6-phathien"
          >
            {`📊 ${khoi8.phatHien}`}
          </p>
        )}
        {khoi8.insufficientNote && (
          <p className="text-xs text-[var(--color-text-3)]" data-testid="cap3-pa-khoi6-note">
            {khoi8.insufficientNote}
          </p>
        )}
      </div>
    </div>
  )
}
