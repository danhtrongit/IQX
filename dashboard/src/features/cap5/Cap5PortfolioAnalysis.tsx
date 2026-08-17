import { cn } from "@/shared/lib/cn"
import type { Cap2AnalysisHost } from "@/features/cap2/Cap2PortfolioAnalysis"
import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import { Cap4PortfolioAnalysis } from "@/features/cap4/Cap4PortfolioAnalysis"
import type { Cap4Progress } from "@/features/cap4/types"
import { useDanhSachDungNgoai } from "./hooks"
import {
  computeCap5Khoi12MaTran,
  KHOI12_MIN_LENH,
  type Khoi12Cell,
} from "./portfolioAnalysisCap5"
import type { Cap5TradeRecord } from "./tradeLogCap5"
import { TARGET_TY_LE_QUYET_DINH_DUNG, type Cap5Progress } from "./types"
import "./cap5-analysis.css"

/**
 * Trang Phân tích danh mục Cấp 5 (spec `IQX-Cap5-Spec.md` §6).
 *
 * **TÁI SỬ DỤNG Ở TẦNG COMPONENT (documented choice):** mọi khối Cấp 1-4 được
 * render bằng CHÍNH `Cap4PortfolioAnalysis` — KHÔNG mirror lại markup. Đã đọc
 * component đó trước khi chọn và nó compose sạch: nhận
 * `trades`/`dailyScores`/`cap2-3-4Progress` qua props, không bọc modal, không sở
 * hữu state, và hook duy nhất nó dùng (`useVuKhiDiemMu` cho khối ⑨) là hook của
 * chính nó, tự fail-closed khi lỗi/đang tải. `Cap5TradeRecord extends
 * Cap4TradeRecord` nên mảng lệnh truyền THẲNG vào được. Spec §6 cũng nói rõ các
 * khối Cấp 1-4 "GIỮ NGUYÊN". Đây đúng tiền lệ Cấp 3 → Cấp 2 và Cấp 4 → Cấp 3.
 *
 * Hệ quả (như Cấp 3/4 đã ghi): KHÔNG sửa được markup khối ① của cấp dưới (ngoài
 * quyền sở hữu file), nên phần "Cấp 5 thêm" cho khối ① là một thẻ đầu trang RIÊNG
 * (`cap5-pa-khoi1`) đặt NGAY TRÊN các khối kế thừa.
 *
 * ★ **KHỐI ⑬ ĐỌC TỪ SERVER, KHÔNG TÍNH LẠI Ở CLIENT.** `GET /cap5/dung-ngoai`
 * (hook `useDanhSachDungNgoai`) trả về CẢ số liệu né đúng/né hụt/trung tính/chưa
 * tới hạn, lý do hay dùng, ngưỡng chấm, `giai_thich` và cờ `du_de_phan_tich` —
 * authoritative, có backfill (job cuối phiên chấm mọi nước đủ 5 phiên) và đúng
 * bằng con số nuôi nhiệm vụ ③. Tính lại từ nhật ký localStorage sẽ sinh một con số
 * thứ hai, lệch, mâu thuẫn với màn Hành trình. Khi query lỗi/đang tải thì khối này
 * nói thẳng là chưa lấy được số — fail-closed, KHÔNG đắp tạm bằng phép tính
 * client. Cùng tiền lệ khối ⑨ của Cấp 4.
 *
 * ⑫ thì CHƯA có endpoint nào, nên nó tính từ nhật ký client (`tradeLogCap5.ts`) và
 * đánh dấu thiếu dữ liệu một cách trung thực (xem `portfolioAnalysisCap5.ts`). Vì
 * ma trận chỉ đếm được lệnh ghi TRÊN MÁY NÀY, khối ⑫ hiện THÊM tỷ lệ quyết định
 * đúng do server chốt (`cap5_progress.ty_le_quyet_dinh_dung`) và nói rõ hai con số
 * có thể lệch — thay vì lặng lẽ hiện con số thấp hơn.
 *
 * Ở tầng compute, component chỉ gọi `computeCap5Khoi12MaTran` thay vì
 * `computeCap5PortfolioAnalysis`: `Cap4PortfolioAnalysis` đã tự tính các khối kế
 * thừa bên trong, nên gọi hàm tổng ở đây sẽ tính lại y hệt lần thứ hai mà không
 * dùng (cùng lập luận Cấp 3/4 đã ghi).
 */
export interface Cap5PortfolioAnalysisProps {
  /** Hồ sơ Cấp 2 — cho khối ④ + nhãn khối ① của Cấp 2. */
  cap2Progress: Cap2Progress | null
  /** Hồ sơ Cấp 3 — cho khẩu vị đang dùng + ngày vào Cấp 3. */
  cap3Progress: Cap3Progress | null
  /** Hồ sơ Cấp 4 — số lệnh đọc đủ 5 lớp + vũ khí/điểm mù server đã chốt. */
  cap4Progress: Cap4Progress | null
  /** Hồ sơ Cấp 5 — số lệnh phân loại + tỷ lệ quyết định đúng server đã chốt. */
  cap5Progress: Cap5Progress | null
  /** Nhật ký lệnh đã đóng ở Cấp 5 (`useCap5TradeLog`). */
  trades: Cap5TradeRecord[]
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
/** Vàng kim Cấp 5 `#e0b64d` — nhãn "mới ở Cấp 5" (khác tím Cấp 4, brand Cấp 2/3). */
const BADGE_NEW =
  "rounded-full border border-[#e0b64d] px-1.5 py-px text-[9px] font-semibold text-[#e0b64d]"
const NOTE = "text-xs text-[var(--color-text-3)]"
const HINT = "text-[10px] leading-snug text-[var(--color-text-3)]"

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/** `+3.2%` / `−1.8%` — dấu trừ typographic "−" (U+2212), như Cấp 0-4. */
function fmtPctSigned(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

/** `2026-08-05` → `05/08/2026`; trả lại nguyên văn nếu không parse được. */
function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("vi-VN")
}

/** "12 (48%)" hoặc "—" khi chưa có gì được đo (KHÔNG in "0 (0%)"). */
function fmtCell(count: number, pct: number | null): string {
  return pct == null ? "—" : `${fmtInt(count)} (${pct}%)`
}

/** 1 hàng verdict của ma trận 2×2 — view-model thuần, chỉ dùng trong file này. */
interface Khoi12Row {
  key: "dung" | "sai"
  label: string
  thang: Khoi12Cell
  thua: Khoi12Cell
  total: number
  totalPct: number | null
}

export function Cap5PortfolioAnalysis({
  cap2Progress,
  cap3Progress,
  cap4Progress,
  cap5Progress,
  trades,
  dailyScores,
  now,
  host,
}: Cap5PortfolioAnalysisProps) {
  const khoi12 = computeCap5Khoi12MaTran(trades)
  const dungNgoaiQuery = useDanhSachDungNgoai()
  const dn = dungNgoaiQuery.data

  const byO4 = new Map(khoi12.cells.map((c) => [c.o4, c]))
  const rows: Khoi12Row[] = [
    {
      key: "dung",
      label: "QĐ ĐÚNG",
      thang: byO4.get("dung_thang")!,
      thua: byO4.get("dung_thua")!,
      total: khoi12.soQuyetDinhDung,
      totalPct: khoi12.tyLeQuyetDinhDung,
    },
    {
      key: "sai",
      label: "QĐ SAI",
      thang: byO4.get("sai_thang")!,
      thua: byO4.get("sai_thua")!,
      total: khoi12.soQuyetDinhSai,
      totalPct: khoi12.tyLeQuyetDinhSai,
    },
  ]

  /** Nước đứng ngoài ĐÃ được server chấm — mỗi dòng là dữ liệu thật, không suy ra. */
  const daCham = dn?.items.filter((i) => i.ket_qua != null) ?? []
  const chuaToiHan = dn?.items.filter((i) => i.ket_qua == null) ?? []

  return (
    <div className="space-y-3">
      {/* Khối ① (phần Cấp 5 thêm) — số lệnh phân loại + tỷ lệ quyết định đúng */}
      <div className={CARD} data-testid="cap5-pa-khoi1">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER}>
            {"HỒ SƠ NHÀ ĐẦU TƯ CỦA BẠN · Cấp 5 «Lão luyện»"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 5</span>
        </div>
        {cap5Progress ? (
          <>
            <p className="text-xs text-[var(--color-text-1)]">
              {`Đã phân loại 4 ô ở ${fmtInt(cap5Progress.so_lenh_phan_loai)} lệnh · ${fmtInt(
                cap5Progress.so_lan_dung_ngoai_da_cham,
              )} nước đứng ngoài đã được chấm.`}
            </p>
            <p className="text-xs text-[var(--color-text-1)]">
              {`Tỷ lệ quyết định đúng (hệ thống chốt): ${Math.round(
                cap5Progress.ty_le_quyet_dinh_dung,
              )}% · mốc nhiệm vụ ③: ${TARGET_TY_LE_QUYET_DINH_DUNG}%.`}
            </p>
          </>
        ) : (
          <p className={NOTE}>
            {"Chưa có hồ sơ Cấp 5 — các số của cấp này chỉ hiện sau khi bạn vào Cấp 5."}
          </p>
        )}
      </div>

      {/* Mọi khối Cấp 1-4 — render lại nguyên bằng component của Cấp 4 */}
      <Cap4PortfolioAnalysis
        cap2Progress={cap2Progress}
        cap3Progress={cap3Progress}
        cap4Progress={cap4Progress}
        trades={trades}
        dailyScores={dailyScores}
        now={now}
        host={
          host ?? {
            levelLabel: "Cấp 5 «Lão luyện»",
            sinceIso: cap5Progress?.entered_at ?? null,
          }
        }
      />

      {/* ⑫ Ma trận quyết định (spec §6) */}
      <div className={CARD} data-testid="cap5-pa-khoi12">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER} data-testid="cap5-pa-khoi12-header">
            {`⑫ MA TRẬN QUYẾT ĐỊNH — ${fmtInt(khoi12.soDaPhanLoai)} LỆNH`}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 5</span>
        </div>

        <table className="cap5-pa-matrix" data-testid="cap5-pa-khoi12-table">
          <thead>
            <tr>
              <th />
              <th>Thắng</th>
              <th>Thua</th>
              <th>Tổng</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} data-testid={`cap5-pa-khoi12-row-${row.key}`}>
                <th scope="row">{row.label}</th>
                <td
                  className={`cap5-pa-matrix-cell cap5-pa-matrix-cell--${row.thang.o4}`}
                  data-testid={`cap5-pa-khoi12-cell-${row.thang.o4}`}
                >
                  {fmtCell(row.thang.count, row.thang.pct)}
                </td>
                <td
                  className={`cap5-pa-matrix-cell cap5-pa-matrix-cell--${row.thua.o4}`}
                  data-testid={`cap5-pa-khoi12-cell-${row.thua.o4}`}
                >
                  {fmtCell(row.thua.count, row.thua.pct)}
                </td>
                <td
                  className="cap5-pa-matrix-total"
                  data-testid={`cap5-pa-khoi12-total-${row.key}`}
                >
                  {fmtCell(row.total, row.totalPct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 2 con số của cả cấp, cạnh nhau — quy trình vs kết quả (spec §6). */}
        <div className="flex gap-3">
          <div className="flex-1 text-center">
            <div
              className="text-lg font-bold tabular-nums text-[#e0b64d]"
              data-testid="cap5-pa-khoi12-tyle-dung"
            >
              {khoi12.tyLeQuyetDinhDung != null ? `${khoi12.tyLeQuyetDinhDung}%` : "—"}
            </div>
            <div className={HINT}>tỷ lệ quyết định đúng (quy trình)</div>
          </div>
          <div className="flex-1 text-center">
            <div
              className="text-lg font-bold tabular-nums text-[var(--color-text-2)]"
              data-testid="cap5-pa-khoi12-tyle-thang"
            >
              {khoi12.tyLeThang != null ? `${khoi12.tyLeThang}%` : "—"}
            </div>
            <div className={HINT}>tỷ lệ thắng (kết quả)</div>
          </div>
        </div>

        {khoi12.phatHien && (
          <p
            className={cn("cap5-pa-phathien", khoi12.canhBao && "cap5-pa-phathien--canhbao")}
            data-testid="cap5-pa-khoi12-phathien"
          >
            {khoi12.canhBao ? khoi12.phatHien : `🎯 ${khoi12.phatHien}`}
          </p>
        )}
        {khoi12.insufficientNote && (
          <p className={NOTE} data-testid="cap5-pa-khoi12-note">
            {khoi12.insufficientNote}
          </p>
        )}
        {khoi12.insufficient && khoi12.soDaPhanLoai > 0 && (
          <p className={HINT} data-testid="cap5-pa-khoi12-chuadu">
            {`Số trong bảng là số thật nhưng chưa đủ để kết luận (cần ${KHOI12_MIN_LENH} lệnh đã phân loại).`}
          </p>
        )}
        {khoi12.soChuaPhanLoai > 0 && (
          <p className={HINT} data-testid="cap5-pa-khoi12-chuaphanloai">
            {`Đã loại ${fmtInt(khoi12.soChuaPhanLoai)} lệnh khỏi ma trận vì lệnh đó chưa được phân loại 4 ô — không gộp vào ô nào.`}
          </p>
        )}
        {cap5Progress && (
          <p className={HINT} data-testid="cap5-pa-khoi12-server">
            {`Hệ thống chốt tỷ lệ quyết định đúng ${Math.round(
              cap5Progress.ty_le_quyet_dinh_dung,
            )}% trên ${fmtInt(
              cap5Progress.so_lenh_phan_loai,
            )} lệnh — đó là con số nuôi nhiệm vụ ③. Ma trận trên chỉ đếm được lệnh ghi trên máy này, nên hai con số có thể lệch.`}
          </p>
        )}
        <p className={HINT} data-testid="cap5-pa-khoi12-giaithich">
          {khoi12.giaiThich}
        </p>
      </div>

      {/* ⑬ Nhật ký đứng ngoài — DỮ LIỆU SERVER (spec §6) */}
      <div className={CARD} data-testid="cap5-pa-khoi13">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER} data-testid="cap5-pa-khoi13-header">
            {dn
              ? `⑬ ĐỨNG NGOÀI CÓ CHỦ ĐÍCH — ${fmtInt(dn.so_lan)} LẦN`
              : "⑬ ĐỨNG NGOÀI CÓ CHỦ ĐÍCH"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 5</span>
        </div>

        {dungNgoaiQuery.isPending ? (
          <p className={NOTE} data-testid="cap5-pa-khoi13-note">
            {"Đang tải nhật ký đứng ngoài…"}
          </p>
        ) : dungNgoaiQuery.isError || !dn ? (
          <p className={NOTE} data-testid="cap5-pa-khoi13-note">
            {"Chưa lấy được nhật ký đứng ngoài từ hệ thống. Khối này chỉ hiện số do hệ thống chấm từ giá thật — sẽ hiện lại khi tải được."}
          </p>
        ) : dn.so_lan === 0 ? (
          <p className={NOTE} data-testid="cap5-pa-khoi13-note">
            {'Bạn chưa ghi nước đứng ngoài nào. Dùng nút "🚫 Tôi đứng ngoài mã này hôm nay" ở panel đặt lệnh để ghi lại vì sao bạn KHÔNG mua.'}
          </p>
        ) : (
          <>
            {/* <3 lần đã chấm → CHỈ đếm, ẩn thống kê né đúng/hụt (spec §6). */}
            {dn.du_de_phan_tich ? (
              <div className="cap5-pa-dn-counts" data-testid="cap5-pa-khoi13-counts">
                <span className="cap5-pa-dn-count cap5-pa-dn-count--ne_dung">
                  {"Né đúng: "}
                  <span className="cap5-pa-dn-count-value">{fmtInt(dn.so_ne_dung)}</span>
                </span>
                <span className="cap5-pa-dn-count cap5-pa-dn-count--ne_hut">
                  {"Né hụt: "}
                  <span className="cap5-pa-dn-count-value">{fmtInt(dn.so_ne_hut)}</span>
                </span>
                <span className="cap5-pa-dn-count">
                  {"Trung tính: "}
                  <span className="cap5-pa-dn-count-value">{fmtInt(dn.so_trung_tinh)}</span>
                </span>
                <span className="cap5-pa-dn-count">
                  {"Chưa tới hạn: "}
                  <span className="cap5-pa-dn-count-value">{fmtInt(dn.so_chua_toi_han)}</span>
                </span>
              </div>
            ) : (
              <p className={NOTE} data-testid="cap5-pa-khoi13-chuadu">
                {`Đã ghi ${fmtInt(dn.so_lan)} lần đứng ngoài · ${fmtInt(
                  dn.so_lan_da_cham,
                )} đã tới hạn và được chấm. Cần thêm ${fmtInt(
                  Math.max(0, dn.so_lan_toi_thieu_phan_tich - dn.so_lan_da_cham),
                )} nước đứng ngoài đã tới hạn để có phân tích.`}
              </p>
            )}

            {dn.du_de_phan_tich && dn.ly_do_hay_dung && (
              <p className="text-xs text-[var(--color-text-1)]" data-testid="cap5-pa-khoi13-lydo">
                {`Lý do hay dùng: «${dn.ly_do_hay_dung.ten}» (${fmtInt(
                  dn.ly_do_hay_dung.so_lan,
                )} lần)`}
              </p>
            )}

            {/* Danh sách các lần ĐÃ CHẤM — dữ liệu thô của server, không phải thống
                kê, nên vẫn hiện khi chưa đủ ngưỡng phân tích. */}
            {daCham.length > 0 && (
              <ul className="cap5-pa-dn-list" data-testid="cap5-pa-khoi13-list">
                {daCham.map((item) => (
                  <li
                    key={item.id}
                    className="cap5-pa-dn-item"
                    data-testid={`cap5-pa-khoi13-item-${item.id}`}
                    data-ket-qua={item.ket_qua ?? ""}
                  >
                    <span className="cap5-pa-dn-symbol">{item.symbol}</span>
                    <span className="cap5-pa-dn-reason">{item.ly_do_ten}</span>
                    <span className={`cap5-pa-dn-kq cap5-pa-dn-kq--${item.ket_qua}`}>
                      {item.ket_qua_ten ?? item.ket_qua}
                    </span>
                    <span className="cap5-pa-dn-pct">
                      {item.pct_thay_doi != null
                        ? `${fmtPctSigned(item.pct_thay_doi)} sau ${fmtInt(dn.so_phien_cham)} phiên`
                        : "chưa có giá đối chiếu"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {chuaToiHan.length > 0 && (
              <p className={HINT} data-testid="cap5-pa-khoi13-chuatoihan">
                {`${fmtInt(chuaToiHan.length)} nước đứng ngoài chưa tới hạn chấm (${chuaToiHan
                  .map((i) => `${i.symbol} — ${fmtDate(i.han_cham_date)}`)
                  .join(" · ")}).`}
              </p>
            )}

            <p className={HINT} data-testid="cap5-pa-khoi13-nguong">
              {`Chấm sau ${fmtInt(dn.so_phien_cham)} phiên · né đúng khi giá ≤ +${
                dn.nguong_ne_dung_pct
              }% · né hụt khi giá ≥ +${dn.nguong_ne_hut_pct}% · giữa hai mức là trung tính (không tính đúng cũng không tính hụt).`}
            </p>
          </>
        )}

        {dn && (
          <p className={HINT} data-testid="cap5-pa-khoi13-giaithich">
            {dn.giai_thich}
          </p>
        )}
      </div>
    </div>
  )
}
