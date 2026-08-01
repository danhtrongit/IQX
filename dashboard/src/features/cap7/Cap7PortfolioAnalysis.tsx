import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap4Progress } from "@/features/cap4/types"
import type { Cap5Progress } from "@/features/cap5/types"
import { Cap6PortfolioAnalysis } from "@/features/cap6/Cap6PortfolioAnalysis"
import type { Cap6Progress } from "@/features/cap6/types"
import { useThachThucCap7 } from "./hooks"
import {
  computeCap7Khoi16DocLuc,
  computeCap7Khoi17KyLuatCo,
  type Khoi17Nhom,
} from "./portfolioAnalysisCap7"
import type { Cap7TradeRecord } from "./tradeLogCap7"
import type { Cap7Progress } from "./types"
import "./cap7-analysis.css"

/**
 * Trang Phân tích danh mục Cấp 7 (spec `IQX-Cap7-Spec.md` §7).
 *
 * **TÁI SỬ DỤNG Ở TẦNG COMPONENT (documented choice, đúng tiền lệ Cấp 6 → Cấp 5):**
 * mọi khối Cấp 1-6 (①-⑮) được render bằng CHÍNH `Cap6PortfolioAnalysis` — KHÔNG
 * mirror lại markup. Component đó compose sạch: nhận `trades`/`dailyScores`/
 * `cap2-6Progress` qua props, không bọc modal, không sở hữu state, và các hook nó
 * dùng (`useThachThucCap6`, và của cấp dưới `useDanhSachDungNgoai`/`useVuKhiDiemMu`)
 * đều tự fail-closed. `Cap7TradeRecord extends Cap6TradeRecord` nên mảng lệnh
 * truyền THẲNG vào được. Spec §7 cũng nói rõ các khối Cấp 1-6 "kế thừa".
 *
 * Hệ quả (như Cấp 3/4/5/6 đã ghi): KHÔNG sửa được markup khối ① của cấp dưới
 * (ngoài quyền sở hữu file), nên phần "Cấp 7 thêm" cho khối ① là một thẻ đầu
 * trang RIÊNG (`cap7-pa-khoi1`) đặt NGAY TRÊN các khối kế thừa.
 *
 * ★★ **TỶ LỆ ĐỌC LỰC ĐÚNG VÀ 3 CON SỐ CỜ ĐỌC TỪ SERVER.** `GET /cap7/thach-thuc`
 * trả về chúng kèm cờ `du_du_lieu` và `giai_thich` — authoritative, chấm bằng giá
 * đóng cửa thật của phiên đích, và **chính là con số nuôi nhiệm vụ ③**. Query
 * lỗi/đang tải → khối nói thẳng là chưa lấy được, KHÔNG đắp tạm bằng phép tính
 * client (cùng tiền lệ khối ⑮ của Cấp 6, ⑬ của Cấp 5, ⑨ của Cấp 4).
 *
 * Riêng **xu hướng** của ⑯ và **so 2 nhóm cờ** của ⑰ thì chưa có endpoint nào (BE
 * Cấp 7 không liệt kê từng lệnh kèm thứ tự đóng và `dien_bien_pct`), nên hai thứ
 * đó tính từ nhật ký client (`tradeLogCap7.ts`) và đánh dấu thiếu dữ liệu một
 * cách trung thực: **xu hướng cần ≥6 lệnh đã chấm, mỗi nhóm cờ cần ≥3 lệnh.**
 *
 * ★★ **`docLucDung === null` KHÔNG BAO GIỜ là "đọc sai"** — nó là *chưa tới hạn
 * chấm*. Số lệnh chưa chấm được in ra thành lời ở cả thẻ đầu trang lẫn khối ⑯ để
 * tỷ lệ không bị đọc nhầm là tính trên tất cả lệnh.
 *
 * ★★ **Mua đuổi không bị phạt** (spec §5) và **cờ chỉ là heuristic** (spec §9):
 * hai nhóm của ⑰ được trình bày ngang nhau, không nhóm nào có màu/icon cảnh báo,
 * và khi nhóm mua đuổi KHÔNG xấu hơn thì khối nói thẳng ra.
 */
export interface Cap7PortfolioAnalysisProps {
  /** Hồ sơ Cấp 2 — cho khối ④ + nhãn khối ① của Cấp 2. */
  cap2Progress: Cap2Progress | null
  /** Hồ sơ Cấp 3 — cho khẩu vị đang dùng + ngày vào Cấp 3. */
  cap3Progress: Cap3Progress | null
  /** Hồ sơ Cấp 4 — số lệnh đọc đủ 5 lớp + vũ khí/điểm mù server đã chốt. */
  cap4Progress: Cap4Progress | null
  /** Hồ sơ Cấp 5 — số lệnh phân loại + tỷ lệ quyết định đúng server đã chốt. */
  cap5Progress: Cap5Progress | null
  /** Hồ sơ Cấp 6 — số lệnh đối chiếu, số kiểu đã gặp, 2 tỷ lệ khớp/lệch. */
  cap6Progress: Cap6Progress | null
  /** Hồ sơ Cấp 7 — số lệnh đọc lực, số lần chờ xác nhận, tỷ lệ đọc lực đúng. */
  cap7Progress: Cap7Progress | null
  /** Nhật ký lệnh đã đóng ở Cấp 7 (`useCap7TradeLog`). */
  trades: Cap7TradeRecord[]
  /** Nhật ký điểm kỷ luật hằng ngày (`useCap2TradeLog().scores` — dùng chung). */
  dailyScores: Cap2DailyScoreRecord[]
  /** "Now" tham chiếu cho các khối có cửa sổ thời gian (khối ③/⑥/⑦ của Cấp 2). */
  now?: Date
}

const SECTION_HEADER =
  "text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--primary-6))]"
const CARD =
  "space-y-2 rounded-md border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-3"
/** Hồng magenta Cấp 7 `#c65cae` — nhãn "mới ở Cấp 7" (khác đỏ son Cấp 6). */
const BADGE_NEW =
  "rounded-full border border-[#c65cae] px-1.5 py-px text-[9px] font-semibold text-[#c65cae]"
const NOTE = "text-xs text-[var(--color-text-3)]"
const HINT = "text-[10px] leading-snug text-[var(--color-text-3)]"

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/** `+3.0%` / `−2.0%` — dấu trừ typographic "−" (U+2212), như Cấp 0-6. */
function fmtPct(pct: number): string {
  const r = Math.round(pct * 10) / 10
  const sign = r > 0 ? "+" : r < 0 ? "−" : ""
  return `${sign}${Math.abs(r).toFixed(1)}%`
}

/** Một ô nhóm của ⑰ — hai ô dùng CHUNG khuôn, không ô nào là màu cảnh báo. */
function NhomO({ nhom, testId }: { nhom: Khoi17Nhom; testId: string }) {
  return (
    <div className="cap7-pa-nhom" data-testid={testId}>
      <div className="cap7-pa-nhom-value">
        {nhom.dienBienTb != null ? fmtPct(nhom.dienBienTb) : "—"}
      </div>
      <div className="cap7-pa-nhom-label">{nhom.ten}</div>
      <div className="cap7-pa-nhom-count">
        {`${fmtInt(nhom.soCoDienBien)}/${fmtInt(nhom.soLenhDaDong)} lệnh có diễn biến`}
      </div>
    </div>
  )
}

export function Cap7PortfolioAnalysis({
  cap2Progress,
  cap3Progress,
  cap4Progress,
  cap5Progress,
  cap6Progress,
  cap7Progress,
  trades,
  dailyScores,
  now,
}: Cap7PortfolioAnalysisProps) {
  const thachThucQuery = useThachThucCap7()
  const tt = thachThucQuery.data ?? null
  const khoi16 = computeCap7Khoi16DocLuc(tt, trades)
  const khoi17 = computeCap7Khoi17KyLuatCo(tt, trades)

  return (
    <div className="space-y-3">
      {/* Khối ① (phần Cấp 7 thêm) — số server + mẫu số THẬT của tỷ lệ */}
      <div className={CARD} data-testid="cap7-pa-khoi1">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER}>
            {"HỒ SƠ NHÀ ĐẦU TƯ CỦA BẠN · Cấp 7 «Đọc sổ lệnh»"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 7</span>
        </div>
        {cap7Progress ? (
          <>
            <p className="text-xs text-[var(--color-text-1)]">
              {`Đã ghi bước đọc lực ở ${fmtInt(
                cap7Progress.so_lenh_doc_luc,
              )} lệnh mua · gặp cờ cảnh giác ${fmtInt(
                cap7Progress.so_lan_gap_co,
              )} lần, trong đó chờ xác nhận ${fmtInt(
                cap7Progress.so_lan_khong_duoi_theo_co,
              )} lần và mua đuổi ${fmtInt(cap7Progress.so_lan_mua_duoi_theo)} lần.`}
            </p>
            <p className="text-xs text-[var(--color-text-1)]">
              {`Tỷ lệ đọc lực đúng: ${Math.round(
                cap7Progress.ty_le_doc_luc_dung,
              )}% — tính trên ${fmtInt(cap7Progress.so_lenh_da_cham)} lệnh đã chấm.`}
            </p>
            <p className={HINT}>
              {`${fmtInt(
                cap7Progress.so_lenh_chua_cham,
              )} lệnh chưa tới hạn chấm nằm NGOÀI mẫu số — hệ thống chỉ chấm sau ${fmtInt(
                cap7Progress.so_phien_cham,
              )} phiên giao dịch kể từ lúc mua, và một lệnh chưa chấm không bao giờ bị tính là đọc sai. Mua đuổi cũng chỉ được ghi lại để bạn tự so ở khối ⑰.`}
            </p>
          </>
        ) : (
          <p className={NOTE}>
            {"Chưa có hồ sơ Cấp 7 — các số của cấp này chỉ hiện sau khi bạn vào Cấp 7."}
          </p>
        )}
      </div>

      {/* Mọi khối Cấp 1-6 — render lại nguyên bằng component của Cấp 6 */}
      <Cap6PortfolioAnalysis
        cap2Progress={cap2Progress}
        cap3Progress={cap3Progress}
        cap4Progress={cap4Progress}
        cap5Progress={cap5Progress}
        cap6Progress={cap6Progress}
        trades={trades}
        dailyScores={dailyScores}
        now={now}
      />

      {/* ⑯ Đọc lực có đúng không — TỶ LỆ TỪ SERVER, xu hướng từ nhật ký (spec §7) */}
      <div className={CARD} data-testid="cap7-pa-khoi16">
        <div className="flex items-center gap-2">
          {/* ★★ Số lệnh đã chấm CHỈ vào tiêu đề khi server đã trả nó. Chưa tải
              được/lỗi thì `soDaCham` là placeholder 0, và `— 0 LỆNH ĐÃ CHẤM` là
              một lời khẳng định về người dùng mà câu "chưa lấy được" bên dưới
              không gỡ nổi. */}
          <span className={SECTION_HEADER} data-testid="cap7-pa-khoi16-header">
            {khoi16.coSoLieuServer
              ? `⑯ ĐỌC LỰC CÓ ĐÚNG KHÔNG — ${fmtInt(khoi16.soDaCham)} LỆNH ĐÃ CHẤM`
              : "⑯ ĐỌC LỰC CÓ ĐÚNG KHÔNG"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 7</span>
        </div>

        {thachThucQuery.isPending ? (
          <p className={NOTE} data-testid="cap7-pa-khoi16-loading">
            {"Đang tải tỷ lệ đọc lực đúng từ hệ thống…"}
          </p>
        ) : (
          <>
            {/* CỔNG DUY NHẤT của ngưỡng <3 lệnh đã chấm nằm ở
                `computeCap7Khoi16DocLuc`: nó trả `tyLe === null` CHÍNH XÁC khi
                thống kê phải bị ẩn (spec §7). Lặp lại điều kiện đó ở đây sẽ tạo
                một cổng thứ hai không ai kiểm được — thừa, và sẽ âm thầm phân kỳ
                nếu một trong hai bên đổi. */}
            {khoi16.tyLe != null && (
              <div className="cap7-pa-tyle" data-testid="cap7-pa-khoi16-tyle">
                <span className="cap7-pa-tyle-value">{`${khoi16.tyLe}%`}</span>
                <span className="cap7-pa-tyle-label">
                  {`đọc lực đúng trên ${fmtInt(khoi16.soDaCham)} lệnh đã chấm · ${fmtInt(
                    khoi16.soChuaCham,
                  )} lệnh chưa tới hạn chấm`}
                </span>
              </div>
            )}
            {khoi16.phatHien && (
              <p className="cap7-pa-phathien" data-testid="cap7-pa-khoi16-phathien">
                {`🎯 ${khoi16.phatHien}`}
              </p>
            )}
            {khoi16.thieuDuLieuNote && (
              <p className={NOTE} data-testid="cap7-pa-khoi16-note">
                {khoi16.thieuDuLieuNote}
              </p>
            )}
            {khoi16.xuHuong && (
              <p className="cap7-pa-xuhuong" data-testid="cap7-pa-khoi16-xuhuong">
                {khoi16.xuHuong.cauChu}
              </p>
            )}
            {khoi16.xuHuongNote && (
              <p className={HINT} data-testid="cap7-pa-khoi16-xuhuong-note">
                {khoi16.xuHuongNote}
              </p>
            )}
            {/* Câu của server, NGUYÊN VĂN (§C12c) — nó là bản authoritative. */}
            {khoi16.giaiThichServer && (
              <p className={HINT} data-testid="cap7-pa-khoi16-server">
                {khoi16.giaiThichServer}
              </p>
            )}
          </>
        )}

        <p className={HINT} data-testid="cap7-pa-khoi16-giaithich">
          {khoi16.giaiThich}
        </p>
      </div>

      {/* ⑰ Kỷ luật cảnh giác lệnh treo lớn (spec §7) */}
      <div className={CARD} data-testid="cap7-pa-khoi17">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER} data-testid="cap7-pa-khoi17-header">
            {"⑰ KỶ LUẬT CẢNH GIÁC LỆNH TREO LỚN"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 7</span>
        </div>

        {thachThucQuery.isPending ? (
          <p className={NOTE} data-testid="cap7-pa-khoi17-loading">
            {"Đang tải số lần gặp cờ từ hệ thống…"}
          </p>
        ) : (
          <>
            {/* ★★ 3 con số CHỈ hiện khi server đã trả chúng. Nhánh lỗi trước đây
                in "0 lần · 0 lần · 0 lần" ngay trên câu "Chưa lấy được số lần gặp
                cờ" — ba con số đó là placeholder của tầng compute, và với người đã
                gặp cờ 8 lần thì chúng là ba lời nói sai. */}
            {khoi17.coSoLieuServer && (
              <p className="text-xs text-[var(--color-text-1)]" data-testid="cap7-pa-khoi17-counts">
                {`Gặp cờ cảnh giác: ${fmtInt(khoi17.soLanGapCo)} lần · chờ xác nhận: ${fmtInt(
                  khoi17.soChoXacNhan,
                )} lần · mua đuổi: ${fmtInt(khoi17.soMuaDuoi)} lần.`}
              </p>
            )}

            {/* Hai nhóm cạnh nhau, TRÌNH BÀY NGANG NHAU (spec §5). */}
            <div className="cap7-pa-nhom-row">
              <NhomO nhom={khoi17.choXacNhan} testId="cap7-pa-khoi17-nhom-cho" />
              <NhomO nhom={khoi17.muaDuoi} testId="cap7-pa-khoi17-nhom-duoi" />
            </div>

            {khoi17.phatHien && (
              <p className="cap7-pa-phathien" data-testid="cap7-pa-khoi17-phathien">
                {khoi17.phatHien}
              </p>
            )}
            {khoi17.thieuDuLieuNote && (
              <p className={NOTE} data-testid="cap7-pa-khoi17-note">
                {khoi17.thieuDuLieuNote}
              </p>
            )}
          </>
        )}

        <p className={HINT} data-testid="cap7-pa-khoi17-giaithich">
          {khoi17.giaiThich}
        </p>
      </div>
    </div>
  )
}
