import { useState } from "react"
import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2AnalysisHost } from "@/features/cap2/Cap2PortfolioAnalysis"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap4Progress } from "@/features/cap4/types"
import { Cap5PortfolioAnalysis } from "@/features/cap5/Cap5PortfolioAnalysis"
import type { Cap5Progress } from "@/features/cap5/types"
import { usePhanTichCap6 } from "./hooks"
import type { ConflictLevel, Khoi14RowCap6, Khoi15RowCap6 } from "./mauThuanTypes"
import { conflictLevelIcon, conflictLevelLabel, mucTieuNhatQuan } from "./nhanDinhCap6"
import type { Cap6TradeRecord } from "./tradeLogCap6"
import type { Cap6Progress } from "./types"
import "./cap6-analysis.css"

/**
 * Trang Phân tích danh mục Cấp 6 (spec `IQX-Cap6-Spec.md` §7).
 *
 * **TÁI SỬ DỤNG Ở TẦNG COMPONENT (documented choice, đúng tiền lệ Cấp 5 → Cấp 4):**
 * mọi khối Cấp 1-5 (①-⑬) được render bằng CHÍNH `Cap5PortfolioAnalysis` — KHÔNG
 * mirror lại markup. Component đó compose sạch: nhận `trades`/`dailyScores`/
 * `cap2-5Progress` qua props, không bọc modal, không sở hữu state, và KHÔNG còn gọi
 * hook query nào của riêng Cấp 5 (khối ⑬ giờ là phễu săn mã, tính từ
 * `Cap5Progress` truyền vào).
 * `Cap6TradeRecord extends Cap5TradeRecord` nên mảng lệnh truyền THẲNG vào được.
 * Spec §7 cũng nói rõ các khối Cấp 1-5 "kế thừa".
 *
 * Hệ quả (như Cấp 3/4/5 đã ghi): KHÔNG sửa được markup khối ① của cấp dưới (ngoài
 * quyền sở hữu file), nên phần "Cấp 6 thêm" cho khối ① là một thẻ đầu trang RIÊNG
 * (`cap6-pa-khoi1`) đặt NGAY TRÊN các khối kế thừa.
 *
 * ★ Khối ⑭/⑮ đọc duy nhất từ `GET /cap6/phan-tich`. Client không tính lại
 * chỉ số hoặc dùng chúng làm cổng hành trình: chúng là phân tích mô tả của
 * hành vi mâu thuẫn, còn nhiệm vụ duy nhất do service suy từ bộ đếm nhất quán.
 * Khi query lỗi hoặc đang tải, UI nói rõ không có dữ liệu thay vì dựng số cục bộ.
 */
export interface Cap6PortfolioAnalysisProps {
  /** Hồ sơ Cấp 2 — cho khối ④ + nhãn khối ① của Cấp 2. */
  cap2Progress: Cap2Progress | null
  /** Hồ sơ Cấp 3 — cho khẩu vị đang dùng + ngày vào Cấp 3. */
  cap3Progress: Cap3Progress | null
  /** Hồ sơ Cấp 4 — số lệnh đọc đủ 5 lớp + vũ khí/điểm mù server đã chốt. */
  cap4Progress: Cap4Progress | null
  /** Hồ sơ Cấp 5 — 2 nhiệm vụ săn mã + phễu săn mã (khối ⑬) server đã chốt. */
  cap5Progress: Cap5Progress | null
  /** Hồ sơ Cấp 6 — bộ đếm xử lý mâu thuẫn nhất quán do server chốt. */
  cap6Progress: Cap6Progress | null
  /** Nhật ký lệnh đã đóng ở Cấp 6 (`useCap6TradeLog`). */
  trades: Cap6TradeRecord[]
  /** Nhật ký điểm kỷ luật hằng ngày (`useCap2TradeLog().scores` — dùng chung). */
  dailyScores: Cap2DailyScoreRecord[]
  /** "Now" tham chiếu cho các khối có cửa sổ thời gian (khối ③/⑥/⑦ của Cấp 2). */
  now?: Date
  /**
   * ★ Ngữ cảnh cấp cho MỌI khối kế thừa (xem `Cap2AnalysisHost`). Mặc định là
   * chính cấp này. Cấp cao hơn render lại component này với nhật ký lệnh của
   * CHÍNH NÓ, nên PHẢI truyền `host` của cấp mình — nếu không khối ① sẽ ghép
   * "số lệnh của cấp trên" với "nhãn + ngày vào cấp dưới" trong cùng một câu.
   */
  host?: Cap2AnalysisHost
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
 * `64` → `"64%"` · `0` → `"0%"` · `null` → `"chưa đủ dữ liệu"`.
 *
 * ★★ **`null` ≠ `0`** (luật số 7): `null` = nhóm chưa có lệnh đã đóng nào ·
 * `0%` là một KẾT QUẢ THẬT (có lệnh, không lệnh nào thắng). `Math.round(null)`
 * trả `0` và sẽ nói với người dùng rằng họ thua sạch một nhóm họ chưa từng có
 * lệnh — nên KHÔNG có `?? 0` ở file này.
 */
function pctHoacChuaDu(pct: number | null | undefined): string {
  return pct == null ? "chưa đủ dữ liệu" : `${Math.round(pct)}%`
}

/** `%` vốn, `null` → câu riêng (KHÔNG vẽ thành 0%). */
function pctVonHoacChuaCo(pct: number | null): string {
  return pct == null ? "chưa có lệnh nào" : `${Math.round(pct)}% vốn`
}

/**
 * Nhãn cột "Khớp?" của khối ⑭ — BA trạng thái.
 *
 * ★★ `khop === null` là **CHƯA XÉT ĐƯỢC** (chưa đủ lệnh để so), KHÔNG phải
 * "lệch": gộp hai cái đó lại là kết luận người dùng nghĩ một đằng làm một nẻo
 * dựa trên một phép so chưa từng được thực hiện.
 *
 * ★ Mockup `iqx-cap6-phantich-danhmuc.html` có một trạng thái thứ ba giữa hai
 * cực ("~ hơi cao"), nhưng wire `khoi_14.rows[].khop` chỉ là `bool | null` —
 * không có trường nào mang mức độ "hơi". Bịa ra một ngưỡng ở FE là dựng một con
 * số thứ hai cạnh con số server, nên chỗ đó dùng "chưa xét được".
 */
function khopText(khop: boolean | null): string {
  if (khop === true) return "✓ hợp lý"
  if (khop === false) return "✗ lệch"
  return "chưa xét được"
}

function khopClass(khop: boolean | null): string {
  if (khop === true) return "cap6-pa-khop cap6-pa-khop--ok"
  if (khop === false) return "cap6-pa-khop cap6-pa-khop--lech"
  return "cap6-pa-khop cap6-pa-khop--chuadu"
}

/** "🔴 Nghiêm trọng" — một nguồn nhãn duy nhất, dùng chung với panel + Kết sổ. */
function mucText(muc: ConflictLevel): string {
  return `${conflictLevelIcon(muc)} ${conflictLevelLabel(muc)}`
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
  host,
}: Cap6PortfolioAnalysisProps) {
  const phanTichQuery = usePhanTichCap6()
  const pt = phanTichQuery.data
  /**
   * Chồng khối Cấp 1-5 THU GỌN mặc định — mockup `iqx-cap6-phantich-danhmuc.html`
   * vẽ đúng một thanh `.collapsed` cho cả chồng đó, kèm nhãn "(giữ nguyên, bấm
   * để mở)". "Thu gọn" KHÔNG phải "bỏ": mọi khối ①-⑬ vẫn ở nguyên đó.
   */
  const [moKeThua, setMoKeThua] = useState(false)

  return (
    <div className="space-y-3">
      {/* Khối ① (phần Cấp 6 thêm) — hai số hành vi + lãi CHỈ hiển thị */}
      <div className={CARD} data-testid="cap6-pa-khoi1">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER}>
            {"HỒ SƠ NHÀ ĐẦU TƯ CỦA BẠN · Cấp 6 «Bậc thầy»"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 6</span>
        </div>
        {cap6Progress ? (
          <>
            <p className="text-xs text-[var(--color-text-1)]" data-testid="cap6-pa-khoi1-hanhvi">
              {`Xử lý mâu thuẫn nhất quán ${fmtInt(
                cap6Progress.so_lan_xu_ly_nhat_quan ?? 0,
              )}/${fmtInt(mucTieuNhatQuan(cap6Progress))} lần · trong đó ${fmtInt(
                cap6Progress.so_lan_xu_ly_veto_nhat_quan ?? 0,
              )} lần có phủ quyết rất xấu.`}
            </p>
            {/* ★ ĐÂY là một trong hai chỗ duy nhất `tong_lai_lenh_cap6_pct` được
                phép hiện (spec §11: "CHỈ để hiển thị ở Kết sổ/Phân tích"). Nó
                KHÔNG phải cổng, và câu ngay dưới nói thẳng điều đó. */}
            <p className="text-xs text-[var(--color-text-1)]" data-testid="cap6-pa-khoi1-lai">
              {`Lãi/lỗ tổng của các lệnh đã đóng từ khi vào Cấp 6: ${pctHoacChuaDu(
                cap6Progress.tong_lai_lenh_cap6_pct,
              )}.`}
            </p>
            <p className={HINT}>
              {
                "Chỉ số «xử lý mâu thuẫn nhất quán» là thước đo tốt nghiệp duy nhất của Cấp 6: hệ thống chốt từ chính các lệnh của bạn khi mức mâu thuẫn bạn tự đọc khớp với hành động thật (đọc nghiêm trọng thì mua nhỏ hoặc đứng ngoài). Số lần có phủ quyết rất xấu chỉ là phần mô tả của hồ sơ, không phải điều kiện lên cấp. Con số lãi/lỗ chỉ để bạn tự xem — nó KHÔNG phải điều kiện lên cấp: quyết định đúng vẫn có thể lỗ, và ngược lại. «Chưa đủ dữ liệu» nghĩa là chưa có lệnh nào đã đóng, KHÔNG phải bằng 0%."
              }
            </p>
          </>
        ) : (
          <p className={NOTE}>
            {"Chưa có hồ sơ Cấp 6 — các số của cấp này chỉ hiện sau khi bạn vào Cấp 6."}
          </p>
        )}
      </div>

      {/* Mọi khối Cấp 1-5 — render lại nguyên bằng component của Cấp 5, THU GỌN
          sau một thanh bấm (mockup `.collapsed`). */}
      <div className={CARD} data-testid="cap6-pa-kethua-card">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER}>{"CÁC KHỐI TỪ CẤP 1-5"}</span>
          <span className={NOTE}>{"(giữ nguyên, bấm để mở)"}</span>
        </div>
        <button
          type="button"
          className="cap6-pa-kethua"
          aria-expanded={moKeThua}
          data-testid="cap6-pa-kethua-toggle"
          onClick={() => setMoKeThua((v) => !v)}
        >
          <span>{"Lý do · Kỷ luật · Vũ khí/điểm mù · Đồng thuận · Bộ lọc săn · Phễu kỷ luật"}</span>
          <span className="cap6-pa-kethua-chev">{moKeThua ? "▾" : "▸"}</span>
        </button>
      </div>

      {moKeThua && (
      <div data-testid="cap6-pa-kethua">
      <Cap5PortfolioAnalysis
        cap2Progress={cap2Progress}
        cap3Progress={cap3Progress}
        cap4Progress={cap4Progress}
        cap5Progress={cap5Progress}
        trades={trades}
        dailyScores={dailyScores}
        now={now}
        host={
          host ?? {
            levelLabel: "Cấp 6 «Bậc thầy»",
            sinceIso: cap6Progress?.entered_at ?? null,
          }
        }
      />
      </div>
      )}

      {/* ⑭ Nhận định của bạn có khớp hành động không (spec §9) */}
      <div className={CARD} data-testid="cap6-pa-khoi14">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER} data-testid="cap6-pa-khoi14-header">
            {"⑭ NHẬN ĐỊNH CỦA BẠN CÓ KHỚP HÀNH ĐỘNG KHÔNG"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 6</span>
        </div>
        <p className={NOTE}>
          {
            "Khi gặp mâu thuẫn, bạn đọc mức độ thế nào — và hành động (khối lượng, tự tin) có tương xứng không."
          }
        </p>

        {phanTichQuery.isPending ? (
          <p className={NOTE} data-testid="cap6-pa-khoi14-loading">
            {"Đang tải số nhận định vs hành động từ hệ thống…"}
          </p>
        ) : !pt ? (
          <p className={NOTE} data-testid="cap6-pa-khoi14-error">
            {"Chưa lấy được số nhận định vs hành động lúc này. Chưa có số thì khối này không đoán thay — thử lại sau."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="cap6-pa-table" data-testid="cap6-pa-khoi14-table">
                <thead>
                  <tr>
                    <th scope="col">{"Bạn đọc mâu thuẫn"}</th>
                    <th scope="col">{"Khối lượng TB"}</th>
                    <th scope="col">{"Khớp?"}</th>
                  </tr>
                </thead>
                <tbody>
                  {pt.khoi_14.rows.map((row: Khoi14RowCap6) => (
                    <tr key={row.muc} data-testid={`cap6-pa-khoi14-row-${row.muc}`}>
                      <th scope="row">{mucText(row.muc)}</th>
                      <td className="cap6-pa-num">{pctVonHoacChuaCo(row.kl_tb_pct_von)}</td>
                      <td className={khopClass(row.khop)}>{khopText(row.khop)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* ★ Chưa đủ mẫu thì nói THẲNG, không để nhận xét đứng một mình như
                một kết luận đã chắc. */}
            {!pt.khoi_14.du_mau && (
              <p className={NOTE} data-testid="cap6-pa-khoi14-chuadumau">
                {"Chưa đủ lệnh để kết luận về thói quen của bạn — bảng trên là những gì đã có, chưa phải một nhận xét chắc chắn."}
              </p>
            )}
            {/* Nhận xét của server, NGUYÊN VĂN (§C12c). */}
            {pt.khoi_14.nhan_xet && (
              <p className="cap6-pa-phathien" data-testid="cap6-pa-khoi14-nhanxet">
                {pt.khoi_14.nhan_xet}
              </p>
            )}
          </>
        )}

        <p className={HINT} data-testid="cap6-pa-khoi14-giaithich">
          {
            "Khối lượng TB tính theo % vốn của các lệnh CÓ mâu thuẫn, nhóm theo mức bạn tự đọc. Chỉ soi khối lượng và mức tự tin — KHÔNG soi cắt lỗ, vì cắt lỗ chỉ là chọn cách tính chứ không phản ánh mức thận trọng. «Chưa xét được» nghĩa là nhóm đó chưa đủ lệnh để so, KHÔNG phải là lệch."
          }
        </p>
      </div>

      {/* ⑮ Kết quả theo mức nhận định (spec §9) */}
      <div className={CARD} data-testid="cap6-pa-khoi15">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER} data-testid="cap6-pa-khoi15-header">
            {"⑮ KẾT QUẢ THEO MỨC NHẬN ĐỊNH"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 6</span>
        </div>
        <p className={NOTE}>
          {
            "Đọc mâu thuẫn ở mỗi mức, kết quả thực tế ra sao — để biết bản năng đọc của bạn có chuẩn không."
          }
        </p>

        {phanTichQuery.isPending ? (
          <p className={NOTE} data-testid="cap6-pa-khoi15-loading">
            {"Đang tải kết quả theo mức nhận định từ hệ thống…"}
          </p>
        ) : !pt ? (
          <p className={NOTE} data-testid="cap6-pa-khoi15-error">
            {"Chưa lấy được kết quả theo mức nhận định lúc này. Chưa có số thì khối này không đoán thay — thử lại sau."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="cap6-pa-table" data-testid="cap6-pa-khoi15-table">
                <thead>
                  <tr>
                    <th scope="col">{"Mức nhận định"}</th>
                    <th scope="col">{"Số lệnh"}</th>
                    <th scope="col">{"Thắng"}</th>
                  </tr>
                </thead>
                <tbody>
                  {pt.khoi_15.rows.map((row: Khoi15RowCap6) => (
                    <tr key={row.muc} data-testid={`cap6-pa-khoi15-row-${row.muc}`}>
                      <th scope="row">{`${mucText(row.muc)} → vẫn vào`}</th>
                      <td className="cap6-pa-num">{fmtInt(row.so_lenh)}</td>
                      <td className="cap6-pa-num">
                        {/* ★ Hai cổng riêng: `du_mau === false` là "chưa đủ để
                            nói", `ty_le_thang_pct === null` là "chưa có lệnh đã
                            đóng". Cả hai đều KHÔNG được vẽ thành 0%. */}
                        {row.du_mau ? pctHoacChuaDu(row.ty_le_thang_pct) : "chưa đủ dữ liệu"}
                      </td>
                    </tr>
                  ))}
                  {/* Dòng "Nghiêm trọng → không mua: N lần" (spec §9) — hành động
                      CÓ KỶ LUẬT, nên cột kết quả là "đứng ngoài", không phải một
                      tỷ lệ thắng (lệnh không tồn tại thì không có kết quả). */}
                  <tr data-testid="cap6-pa-khoi15-row-khongmua">
                    <th scope="row">{"🛑 Nghiêm trọng → không mua"}</th>
                    <td className="cap6-pa-num">{fmtInt(pt.khoi_15.so_lan_nghiem_khong_mua)}</td>
                    <td className="cap6-pa-num">{"đứng ngoài"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {pt.khoi_15.nhan_xet && (
              <p className="cap6-pa-phathien" data-testid="cap6-pa-khoi15-nhanxet">
                {pt.khoi_15.nhan_xet}
              </p>
            )}
          </>
        )}

        <p className={HINT} data-testid="cap6-pa-khoi15-giaithich">
          {
            "Tỷ lệ thắng tính trên các lệnh CÓ mâu thuẫn đã đóng, nhóm theo mức bạn tự đọc lúc đặt. Dòng «không mua» đếm THÔ mọi lần bạn đọc nghiêm trọng rồi chọn đứng ngoài — đó là một hành động có kỷ luật, không phải điểm trừ, và IQX KHÔNG theo dõi giá mã sau đó. ★ Con số này có thể LỚN HƠN số ở khối ① phía trên: cổng tốt nghiệp gộp nhiều lần bấm trên CÙNG một mã trong CÙNG một phiên thành một lần, còn ở đây đếm đủ mọi lần bấm. Hai con số lệch nhau là đúng, không phải lỗi."
          }
        </p>
      </div>
    </div>
  )
}
