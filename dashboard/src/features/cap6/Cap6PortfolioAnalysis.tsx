import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import { LOP_KEYS } from "@/features/cap4/doc5Lop"
import type { Cap4Progress } from "@/features/cap4/types"
import { Cap5PortfolioAnalysis } from "@/features/cap5/Cap5PortfolioAnalysis"
import type { Cap5Progress } from "@/features/cap5/types"
import { useThachThucCap6 } from "./hooks"
import {
  computeCap6Khoi14LopTheoKieu,
  computeCap6Khoi15DoiChieu,
  type Khoi14Cell,
} from "./portfolioAnalysisCap6"
import type { Cap6TradeRecord } from "./tradeLogCap6"
import { TARGET_KIEU_DA_GAP, TARGET_LENH_DOI_CHIEU, type Cap6Progress } from "./types"
import { lopLabelCap4 } from "@/features/cap4/coachTemplateCap4"
import "./cap6-analysis.css"

/**
 * Trang Phân tích danh mục Cấp 6 (spec `IQX-Cap6-Spec.md` §7).
 *
 * **TÁI SỬ DỤNG Ở TẦNG COMPONENT (documented choice, đúng tiền lệ Cấp 5 → Cấp 4):**
 * mọi khối Cấp 1-5 (①-⑬) được render bằng CHÍNH `Cap5PortfolioAnalysis` — KHÔNG
 * mirror lại markup. Component đó compose sạch: nhận `trades`/`dailyScores`/
 * `cap2-5Progress` qua props, không bọc modal, không sở hữu state, và hook duy nhất
 * nó dùng (`useDanhSachDungNgoai` cho khối ⑬) là hook của chính nó, tự fail-closed.
 * `Cap6TradeRecord extends Cap5TradeRecord` nên mảng lệnh truyền THẲNG vào được.
 * Spec §7 cũng nói rõ các khối Cấp 1-5 "kế thừa".
 *
 * Hệ quả (như Cấp 3/4/5 đã ghi): KHÔNG sửa được markup khối ① của cấp dưới (ngoài
 * quyền sở hữu file), nên phần "Cấp 6 thêm" cho khối ① là một thẻ đầu trang RIÊNG
 * (`cap6-pa-khoi1`) đặt NGAY TRÊN các khối kế thừa.
 *
 * ★ **KHỐI ⑮ ĐỌC TỪ SERVER, KHÔNG TÍNH LẠI Ở CLIENT.** `GET /cap6/thach-thuc` trả
 * về `nhom_khop`/`nhom_lech` gồm số lệnh, số thắng, tỷ lệ thắng, cờ `du_du_lieu`
 * (ngưỡng ≥3 lệnh/nhóm) và `giai_thich` — authoritative, ghép lệnh mua-bán
 * server-side, và **chính là con số nuôi nhiệm vụ ③** (spec §7 nói thẳng: "đây chính
 * là thước đo nhiệm vụ ③"). Tính lại từ nhật ký localStorage sẽ sinh một con số thứ
 * hai, lệch, mâu thuẫn với widget Thách thức ở tab Hành trình. Khi query lỗi/đang
 * tải thì khối nói thẳng là chưa lấy được số — fail-closed, KHÔNG đắp tạm bằng phép
 * tính client. Cùng tiền lệ khối ⑬ của Cấp 5 và ⑨ của Cấp 4.
 *
 * ⑭ thì CHƯA có endpoint nào (BE Cấp 6 không liệt kê từng lệnh kèm kiểu × lớp), nên
 * nó tính từ nhật ký client (`tradeLogCap6.ts`) và đánh dấu thiếu dữ liệu một cách
 * trung thực: **một ô cần ≥3 lệnh mới được gán nhãn**.
 *
 * ★★ **Lệch gợi ý KHÔNG BAO GIỜ là "sai".** Hai nhóm của ⑮ được trình bày ngang
 * nhau, không nhóm nào có màu/icon cảnh báo; và khi nhóm khớp KHÔNG thắng hơn thì
 * khối nói thẳng ra thay vì bảo vệ bảng trọng số (spec §7 "trung thực, không xu
 * nịnh").
 */
export interface Cap6PortfolioAnalysisProps {
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
  /** Nhật ký lệnh đã đóng ở Cấp 6 (`useCap6TradeLog`). */
  trades: Cap6TradeRecord[]
  /** Nhật ký điểm kỷ luật hằng ngày (`useCap2TradeLog().scores` — dùng chung). */
  dailyScores: Cap2DailyScoreRecord[]
  /** "Now" tham chiếu cho các khối có cửa sổ thời gian (khối ③/⑥/⑦ của Cấp 2). */
  now?: Date
}

const SECTION_HEADER =
  "text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--primary-6))]"
const CARD =
  "space-y-2 rounded-md border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-3"
/** Đỏ son Cấp 6 `#d64550` — nhãn "mới ở Cấp 6" (khác vàng kim Cấp 5, tím Cấp 4). */
const BADGE_NEW =
  "rounded-full border border-[#d64550] px-1.5 py-px text-[9px] font-semibold text-[#d64550]"
const NOTE = "text-xs text-[var(--color-text-3)]"
const HINT = "text-[10px] leading-snug text-[var(--color-text-3)]"

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/**
 * `64` → `"64%"`, `0` → `"0%"`, `null` → `"chưa đủ dữ liệu"`.
 *
 * ★★ **`null` ≠ `0`** (hợp đồng `Cap6Progress.ty_le_thang_*`, backend `4b01918`):
 * `null` = nhóm chưa có lệnh đã đóng nào · `0%` = có lệnh đã đóng và không lệnh
 * nào thắng. `Math.round(null)` trả `0` và sẽ nói với người dùng rằng họ thua
 * sạch một nhóm họ chưa từng có lệnh — nên KHÔNG có `?? 0` ở file này.
 */
function pctHoacChuaDu(pct: number | null): string {
  return pct == null ? "chưa đủ dữ liệu" : `${Math.round(pct)}%`
}

export function Cap6PortfolioAnalysis({
  cap2Progress,
  cap3Progress,
  cap4Progress,
  cap5Progress,
  cap6Progress,
  trades,
  dailyScores,
  now,
}: Cap6PortfolioAnalysisProps) {
  const khoi14 = computeCap6Khoi14LopTheoKieu(trades)
  const thachThucQuery = useThachThucCap6()
  const tt = thachThucQuery.data
  const khoi15 = computeCap6Khoi15DoiChieu(tt?.nhom_khop ?? null, tt?.nhom_lech ?? null)

  /** Tra ô theo (kiểu, lớp) — ma trận chỉ giữ ô có ≥1 lệnh. */
  const cellAt = new Map<string, Khoi14Cell>(
    khoi14.cells.map((c) => [`${c.kieu}|${c.lop}`, c]),
  )

  return (
    <div className="space-y-3">
      {/* Khối ① (phần Cấp 6 thêm) — 4 số server + mốc nhiệm vụ ③ */}
      <div className={CARD} data-testid="cap6-pa-khoi1">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER}>
            {"HỒ SƠ NHÀ ĐẦU TƯ CỦA BẠN · Cấp 6 «Đối chiếu»"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 6</span>
        </div>
        {cap6Progress ? (
          <>
            <p className="text-xs text-[var(--color-text-1)]">
              {`Đã đi qua bước Đối chiếu ở ${fmtInt(
                cap6Progress.so_lenh_doi_chieu,
              )}/${TARGET_LENH_DOI_CHIEU} lệnh có mâu thuẫn · gặp ${fmtInt(
                cap6Progress.so_kieu_da_gap,
              )}/${TARGET_KIEU_DA_GAP} kiểu cổ phiếu khác nhau.`}
            </p>
            <p className="text-xs text-[var(--color-text-1)]" data-testid="cap6-pa-khoi1-tyle">
              {`Tỷ lệ thắng nhóm khớp gợi ý: ${pctHoacChuaDu(
                cap6Progress.ty_le_thang_khop,
              )} · nhóm lệch: ${pctHoacChuaDu(cap6Progress.ty_le_thang_lech)}.`}
            </p>
            <p className={HINT}>
              {
                "Hai con số trên do hệ thống chốt (mỗi nhóm cần ít nhất 3 lệnh đã đóng mới được so). «Chưa đủ dữ liệu» nghĩa là nhóm đó chưa có lệnh đã đóng nào — KHÔNG phải bằng 0%. Lệch gợi ý là một sự thật trung tính — nó chỉ quyết định lệnh vào nhóm nào để so, không bao giờ là một điểm trừ."
              }
            </p>
          </>
        ) : (
          <p className={NOTE}>
            {"Chưa có hồ sơ Cấp 6 — các số của cấp này chỉ hiện sau khi bạn vào Cấp 6."}
          </p>
        )}
      </div>

      {/* Mọi khối Cấp 1-5 — render lại nguyên bằng component của Cấp 5 */}
      <Cap5PortfolioAnalysis
        cap2Progress={cap2Progress}
        cap3Progress={cap3Progress}
        cap4Progress={cap4Progress}
        cap5Progress={cap5Progress}
        trades={trades}
        dailyScores={dailyScores}
        now={now}
      />

      {/* ⑭ Lớp nào đúng cho kiểu nào (spec §7) */}
      <div className={CARD} data-testid="cap6-pa-khoi14">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER} data-testid="cap6-pa-khoi14-header">
            {`⑭ LỚP NÀO ĐÚNG CHO KIỂU NÀO — ${fmtInt(khoi14.soLenhCoDoiChieu)} LỆNH`}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 6</span>
        </div>

        {khoi14.kieuDaGap.length > 0 && (
          <div className="overflow-x-auto">
            <table className="cap6-pa-matrix" data-testid="cap6-pa-khoi14-table">
              <thead>
                <tr>
                  <th />
                  {LOP_KEYS.map((lop) => (
                    <th key={lop}>{lopLabelCap4(lop)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {khoi14.kieuDaGap.map((kieu) => (
                  <tr key={kieu} data-testid={`cap6-pa-khoi14-row-${kieu}`}>
                    <th scope="row">
                      {/* `kieuDaGap` chỉ chứa kiểu có ≥1 ô nên `find` luôn ra. */}
                      {khoi14.cells.find((c) => c.kieu === kieu)?.kieuTen ?? kieu}
                    </th>
                    {LOP_KEYS.map((lop) => {
                      const cell = cellAt.get(`${kieu}|${lop}`)
                      return (
                        <td
                          key={lop}
                          className={
                            cell == null
                              ? "cap6-pa-cell cap6-pa-cell--trong"
                              : cell.duDuLieu
                                ? "cap6-pa-cell"
                                : "cap6-pa-cell cap6-pa-cell--chuadu"
                          }
                          data-testid={`cap6-pa-khoi14-cell-${kieu}-${lop}`}
                        >
                          {cell?.nhan ?? "—"}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {khoi14.phatHien && (
          <p className="cap6-pa-phathien" data-testid="cap6-pa-khoi14-phathien">
            {`🎯 ${khoi14.phatHien}`}
          </p>
        )}
        {khoi14.insufficientNote && (
          <p className={NOTE} data-testid="cap6-pa-khoi14-note">
            {khoi14.insufficientNote}
          </p>
        )}
        {khoi14.soLenhChuaPhanLoaiKieu > 0 && (
          <p className={HINT} data-testid="cap6-pa-khoi14-chuaphanloai">
            {`Đã để riêng ${fmtInt(
              khoi14.soLenhChuaPhanLoaiKieu,
            )} lệnh có đối chiếu nhưng kiểu cổ phiếu chưa phân loại — không gộp vào kiểu nào.`}
          </p>
        )}
        <p className={HINT} data-testid="cap6-pa-khoi14-giaithich">
          {khoi14.giaiThich}
        </p>
      </div>

      {/* ⑮ Đối chiếu có giúp không — DỮ LIỆU SERVER (spec §7) */}
      <div className={CARD} data-testid="cap6-pa-khoi15">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER} data-testid="cap6-pa-khoi15-header">
            {"⑮ ĐỐI CHIẾU CÓ GIÚP KHÔNG"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 6</span>
        </div>

        {thachThucQuery.isPending ? (
          <p className={NOTE} data-testid="cap6-pa-khoi15-loading">
            {"Đang tải số khớp/lệch từ hệ thống…"}
          </p>
        ) : (
          <>
            {/* ★★ HAI Ô CHỈ HIỆN KHI SERVER ĐÃ TRẢ SỐ. Khi query lỗi, mọi trường
                của `khop`/`lech` là giá trị mặc định của `toNhom` — render chúng
                sẽ in `0/0 lệnh đã đóng` NGAY TRÊN câu "Chưa lấy được số khớp/lệch",
                tức là nói với một người có 8 lệnh khớp thắng 6 rằng họ có 0. Cờ
                `coSoLieuServer` là CỔNG DUY NHẤT của việc đó (không lặp lại điều
                kiện `data == null` ở đây — hai cổng sẽ âm thầm phân kỳ). */}
            {khoi15.coSoLieuServer && (
            <div className="cap6-pa-nhom-row" data-testid="cap6-pa-khoi15-counts">
              {[khoi15.khop, khoi15.lech].map((nhom, i) => (
                <div
                  key={i}
                  className={`cap6-pa-nhom ${i === 0 ? "cap6-pa-nhom--khop" : "cap6-pa-nhom--lech"}`}
                  data-testid={`cap6-pa-khoi15-nhom-${i === 0 ? "khop" : "lech"}`}
                >
                  <div className="cap6-pa-nhom-value">
                    {nhom.tyLeThang != null ? `${Math.round(nhom.tyLeThang)}%` : "—"}
                  </div>
                  <div className="cap6-pa-nhom-label">{nhom.ten}</div>
                  <div className="cap6-pa-nhom-count">
                    {`${fmtInt(nhom.soThang)}/${fmtInt(nhom.soLenh)} lệnh đã đóng`}
                  </div>
                </div>
              ))}
            </div>
            )}

            {khoi15.phatHien && (
              <p className="cap6-pa-phathien" data-testid="cap6-pa-khoi15-phathien">
                {khoi15.phatHien}
              </p>
            )}
            {khoi15.thieuDuLieuNote && (
              <p className={NOTE} data-testid="cap6-pa-khoi15-note">
                {khoi15.thieuDuLieuNote}
              </p>
            )}
            {/* Câu của server, NGUYÊN VĂN (§C12c) — nó là bản authoritative. */}
            {tt?.doi_chieu_giup_ich.giai_thich && (
              <p className={HINT} data-testid="cap6-pa-khoi15-server">
                {tt.doi_chieu_giup_ich.giai_thich}
              </p>
            )}
          </>
        )}

        <p className={HINT} data-testid="cap6-pa-khoi15-giaithich">
          {khoi15.giaiThich}
        </p>
      </div>
    </div>
  )
}
