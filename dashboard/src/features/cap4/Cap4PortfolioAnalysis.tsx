import { cn } from "@/shared/lib/cn"
import type { Cap2AnalysisHost } from "@/features/cap2/Cap2PortfolioAnalysis"
import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import { Cap3PortfolioAnalysis } from "@/features/cap3/Cap3PortfolioAnalysis"
import type { Cap3Progress } from "@/features/cap3/types"
import { lopLabelCap4 } from "./coachTemplateCap4"
import { useVuKhiDiemMu } from "./hooks"
import {
  computeCap4Khoi10DongThuan,
  computeCap4Khoi11GocNhinRieng,
  KHOI10_MIN_TRADES_PER_NHOM,
} from "./portfolioAnalysisCap4"
import type { Cap4TradeRecord } from "./tradeLogCap4"
import type { Cap4Progress, LopWinRate } from "./types"

/**
 * Trang Phân tích danh mục Cấp 4 (spec `IQX-Cap4-Spec.md` §7).
 *
 * **TÁI SỬ DỤNG Ở TẦNG COMPONENT (documented choice):** mọi khối Cấp 1-3 được
 * render bằng CHÍNH `Cap3PortfolioAnalysis` (khối ① hồ sơ + khẩu vị, ② bảng 5 lý
 * do, ③ vi phạm, ④ cửa sổ 20 lệnh, ⑤ điểm kỷ luật, ⑥ vi phạm theo tuần, ⑦ phát
 * hiện từ ghi chú, ⑦ tự tin, ⑧ khối lượng, mẫu tự phát hiện) — KHÔNG mirror lại
 * markup. Lý do y như Cấp 3 đã ghi khi nó dùng lại `Cap2PortfolioAnalysis`:
 * component đó THUẦN TRÌNH BÀY (nhận `trades`/`dailyScores`/`progress` qua
 * props, không bọc modal, không sở hữu state), `Cap4TradeRecord extends
 * Cap3TradeRecord` nên mảng lệnh truyền thẳng vào được, và spec §7 nói rõ các
 * khối Cấp 1-3 "GIỮ NGUYÊN".
 *
 * Hệ quả: KHÔNG sửa được markup khối ① của Cấp 3 (ngoài quyền sở hữu file), nên
 * phần "Cấp 4 thêm" cho khối ① là một thẻ đầu trang RIÊNG (`cap4-pa-khoi1`) đặt
 * NGAY TRÊN các khối kế thừa — cùng tiền lệ Cấp 3 đã dựng.
 *
 * ★ **KHỐI ⑨ ĐỌC TỪ SERVER, KHÔNG TÍNH LẠI Ở CLIENT.** `GET /cap4/vu-khi-diem-mu`
 * (hook `useVuKhiDiemMu`) tính % thắng thật mỗi lớp từ `order_kehoach` JOIN
 * `order_ketso` — authoritative, có backfill cho lệnh đóng trước khi FE ship, và
 * ĐÚNG bằng con số nuôi nhiệm vụ ③ + widget Thách thức. Tính lại từ nhật ký
 * localStorage sẽ sinh ra một con số thứ hai, thấp hơn, mâu thuẫn với màn Hành
 * trình. Khi query lỗi/đang tải thì khối này nói thẳng là chưa lấy được số —
 * fail-closed, KHÔNG đắp tạm bằng phép tính client.
 *
 * ⑩ và ⑪ thì CHƯA có endpoint nào, nên chúng tính từ nhật ký client
 * (`tradeLogCap4.ts`) và đánh dấu thiếu dữ liệu một cách trung thực (xem
 * `portfolioAnalysisCap4.ts`).
 *
 * Ở tầng compute, component chỉ gọi 2 hàm khối mới thay vì
 * `computeCap4PortfolioAnalysis`: `Cap3PortfolioAnalysis` đã tự tính các khối kế
 * thừa bên trong, nên gọi hàm tổng ở đây sẽ tính lại y hệt lần thứ hai mà không
 * dùng (cùng lập luận Cấp 3 đã ghi).
 */
export interface Cap4PortfolioAnalysisProps {
  /** Hồ sơ Cấp 2 — cho khối ④ + nhãn khối ① của Cấp 2. */
  cap2Progress: Cap2Progress | null
  /** Hồ sơ Cấp 3 — cho khẩu vị đang dùng + ngày vào Cấp 3. */
  cap3Progress: Cap3Progress | null
  /** Hồ sơ Cấp 4 — số lệnh đọc đủ 5 lớp + vũ khí/điểm mù server đã chốt. */
  cap4Progress: Cap4Progress | null
  /** Nhật ký lệnh đã đóng ở Cấp 4 (`useCap4TradeLog`). */
  trades: Cap4TradeRecord[]
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
/** Tím Cấp 4 `#a78bfa` — nhãn "mới ở Cấp 4" (khác badge brand của Cấp 2/3). */
const BADGE_NEW =
  "rounded-full border border-[#a78bfa] px-1.5 py-px text-[9px] font-semibold text-[#a78bfa]"
const TH = "py-1 text-left font-medium text-[var(--color-text-3)]"
const TD = "py-1 text-[var(--color-text-1)]"
const NOTE = "text-xs text-[var(--color-text-3)]"
const HINT = "text-[10px] leading-snug text-[var(--color-text-3)]"

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/** Nhãn "vũ khí" (xanh) / "điểm mù" (đỏ) — chỉ khi server đã kết luận. */
function NhanTag({ nhan }: { nhan: LopWinRate["nhan"] }) {
  if (nhan === "vu_khi") {
    return (
      <span className="rounded-full bg-[rgba(53,208,127,0.14)] px-1.5 py-px text-[9px] font-semibold text-up">
        vũ khí
      </span>
    )
  }
  if (nhan === "diem_mu") {
    return (
      <span className="rounded-full bg-[rgba(255,107,107,0.14)] px-1.5 py-px text-[9px] font-semibold text-down">
        điểm mù
      </span>
    )
  }
  return null
}

export function Cap4PortfolioAnalysis({
  cap2Progress,
  cap3Progress,
  cap4Progress,
  trades,
  dailyScores,
  now,
  host,
}: Cap4PortfolioAnalysisProps) {
  const vuKhiQuery = useVuKhiDiemMu()
  const vuKhi = vuKhiQuery.data
  const khoi10 = computeCap4Khoi10DongThuan(trades)
  const khoi11 = computeCap4Khoi11GocNhinRieng(trades)

  const vuKhiLop = cap4Progress?.vu_khi_lop ?? vuKhi?.vu_khi_lop ?? null
  const diemMuLop = cap4Progress?.diem_mu_lop ?? vuKhi?.diem_mu_lop ?? null

  return (
    <div className="space-y-3">
      {/* Khối ① (phần Cấp 4 thêm) — số lệnh đọc đủ 5 lớp + vũ khí/điểm mù */}
      <div className={CARD} data-testid="cap4-pa-khoi1">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER}>
            {"HỒ SƠ NHÀ ĐẦU TƯ CỦA BẠN · Cấp 4 «Thuần thục»"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 4</span>
        </div>
        {cap4Progress ? (
          <>
            <p className="text-xs text-[var(--color-text-1)]">
              {`Đã đọc + tự chấm đủ 5 lớp ở ${fmtInt(cap4Progress.so_lenh_doc_du_5lop)} lệnh.`}
            </p>
            <p className="text-xs text-[var(--color-text-1)]">
              {`Vũ khí: ${vuKhiLop ? lopLabelCap4(vuKhiLop) : "chưa đủ dữ liệu"} · Điểm mù: ${
                diemMuLop ? lopLabelCap4(diemMuLop) : "chưa đủ dữ liệu"
              }`}
            </p>
          </>
        ) : (
          <p className={NOTE}>
            {"Chưa có hồ sơ Cấp 4 — các số của cấp này chỉ hiện sau khi bạn vào Cấp 4."}
          </p>
        )}
      </div>

      {/* Mọi khối Cấp 1-3 — render lại nguyên bằng component của Cấp 3 */}
      <Cap3PortfolioAnalysis
        cap2Progress={cap2Progress}
        cap3Progress={cap3Progress}
        trades={trades}
        dailyScores={dailyScores}
        now={now}
        host={
          host ?? {
            levelLabel: "Cấp 4 «Thuần thục»",
            sinceIso: cap4Progress?.entered_at ?? null,
          }
        }
      />

      {/* ⑨ Bạn đọc lớp nào chuẩn nhất — DỮ LIỆU SERVER (spec §7) */}
      <div className={CARD} data-testid="cap4-pa-khoi9">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER}>
            {"⑨ BẠN ĐỌC LỚP NÀO CHUẨN NHẤT (VŨ KHÍ & ĐIỂM MÙ)"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 4</span>
        </div>
        <p className={HINT}>
          {'Khi bạn tự đọc một lớp là "Ủng hộ", tỷ lệ lệnh đó thắng — đo bằng kết quả thật, không phải độ khớp AI.'}
        </p>

        {vuKhiQuery.isPending ? (
          <p className={NOTE} data-testid="cap4-pa-khoi9-note">
            {"Đang tải số liệu vũ khí/điểm mù…"}
          </p>
        ) : vuKhiQuery.isError || !vuKhi ? (
          <p className={NOTE} data-testid="cap4-pa-khoi9-note">
            {"Chưa lấy được số liệu vũ khí/điểm mù từ hệ thống. Khối này chỉ hiện số do hệ thống tính từ lệnh thật — sẽ hiện lại khi tải được."}
          </p>
        ) : (
          <div className="space-y-2">
            {vuKhi.lop.map((row) => (
              <div
                key={row.lop}
                data-testid={`cap4-pa-khoi9-row-${row.lop}`}
                data-lop={row.lop}
                className="space-y-1"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-24 shrink-0 text-[var(--color-text-1)]">
                    {lopLabelCap4(row.lop)}
                  </span>
                  <span className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--color-fill-2)]">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        row.nhan === "vu_khi"
                          ? "bg-[#35d07f]"
                          : row.nhan === "diem_mu"
                            ? "bg-[#ff6b6b]"
                            : "bg-[#ffc53d]",
                      )}
                      style={{ width: `${Math.max(0, Math.min(100, row.win_rate ?? 0))}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      "w-10 shrink-0 text-right tabular-nums font-semibold",
                      row.nhan === "vu_khi" && "text-up",
                      row.nhan === "diem_mu" && "text-down",
                    )}
                  >
                    {row.win_rate != null ? `${Math.round(row.win_rate)}%` : "—"}
                  </span>
                  <NhanTag nhan={row.nhan} />
                  {row.nhan === "chua_du_du_lieu" && (
                    <span className={HINT} data-testid="cap4-pa-khoi9-chuadu">
                      {`chưa đủ dữ liệu (cần ${vuKhi.so_lenh_toi_thieu} lệnh)`}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-baseline gap-2 pl-24">
                  <span className={cn(HINT, "tabular-nums")}>
                    {`${fmtInt(row.n_wins)}/${fmtInt(row.n_orders)} lệnh`}
                  </span>
                  {/* §C12c — giải thích do server sinh, kèm nguồn gốc con số. */}
                  <span className={HINT}>{row.giai_thich}</span>
                </div>
              </div>
            ))}
            <p className={HINT} data-testid="cap4-pa-khoi9-giaithich">
              {vuKhi.giai_thich}
            </p>
          </div>
        )}
      </div>

      {/* ⑩ Đọc toàn cảnh có giúp chọn lệnh tốt hơn không (spec §7) */}
      <div className={CARD} data-testid="cap4-pa-khoi10">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER}>
            {"⑩ ĐỌC TOÀN CẢNH CÓ GIÚP CHỌN LỆNH TỐT HƠN KHÔNG?"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 4</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className={TH}>Độ đồng thuận</th>
              <th className={TH}>Tỷ lệ thắng</th>
              <th className={TH}>Số lệnh</th>
            </tr>
          </thead>
          <tbody>
            {khoi10.rows.map((row) => (
              <tr
                key={row.band}
                className="border-t border-[var(--color-border-2)]"
                data-testid={`cap4-pa-khoi10-row-${row.band}`}
              >
                <td className={TD}>{row.label}</td>
                <td
                  className={cn(
                    TD,
                    "tabular-nums",
                    row.winRate != null && row.winRate >= 60 && "text-up",
                    row.winRate != null && row.winRate < 40 && "text-down",
                  )}
                >
                  {row.winRate != null ? `${row.winRate}%` : "—"}
                  {row.insufficient && row.count > 0 && (
                    <span className={cn(HINT, "ml-1")}>
                      {`· chưa đủ (thiếu ${Math.max(0, KHOI10_MIN_TRADES_PER_NHOM - row.count)})`}
                    </span>
                  )}
                </td>
                <td className={cn(TD, "tabular-nums")}>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {khoi10.phatHien && (
          <p className="text-xs text-[var(--color-text-1)]" data-testid="cap4-pa-khoi10-phathien">
            {`🎯 ${khoi10.phatHien}`}
          </p>
        )}
        {khoi10.insufficientNote && (
          <p className={NOTE} data-testid="cap4-pa-khoi10-note">
            {khoi10.insufficientNote}
          </p>
        )}
        {khoi10.excludedNoAi > 0 && (
          <p className={HINT} data-testid="cap4-pa-khoi10-excluded">
            {`Đã loại ${fmtInt(khoi10.excludedNoAi)} lệnh khỏi bảng vì lệnh đó chưa có đối chiếu AI (bạn chưa chấm đủ 5 lớp lúc đặt) — không gộp vào nhóm 0-1 lớp.`}
          </p>
        )}
        <p className={HINT} data-testid="cap4-pa-khoi10-giaithich">
          {khoi10.giaiThich}
        </p>
      </div>

      {/* ⑪ Góc nhìn riêng của bạn (khác AI) — spec §7, trình bày TRUNG THỰC */}
      <div className={CARD} data-testid="cap4-pa-khoi11">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER}>{"⑪ GÓC NHÌN RIÊNG CỦA BẠN (KHÁC AI)"}</span>
          <span className={BADGE_NEW}>mới ở Cấp 4</span>
        </div>
        <div className="flex gap-3">
          <div className="flex-1 text-center">
            <div
              className="text-lg font-bold tabular-nums text-[var(--color-text-1)]"
              data-testid="cap4-pa-khoi11-khacai"
            >
              {khoi11.soLanKhacAi}
            </div>
            <div className={HINT}>lần đọc khác AI</div>
          </div>
          <div className="flex-1 text-center">
            <div
              className="text-lg font-bold tabular-nums text-up"
              data-testid="cap4-pa-khoi11-bandung"
            >
              {khoi11.soLanBanDung}
            </div>
            <div className={HINT}>bạn đúng (lệnh thắng)</div>
          </div>
          <div className="flex-1 text-center">
            <div
              className="text-lg font-bold tabular-nums text-[#ffc53d]"
              data-testid="cap4-pa-khoi11-aidung"
            >
              {khoi11.soLanAiDung}
            </div>
            <div className={HINT}>AI đúng (lệnh thua)</div>
          </div>
        </div>
        {khoi11.phatHien && (
          <p className="text-xs text-[var(--color-text-1)]" data-testid="cap4-pa-khoi11-phathien">
            {`🧭 ${khoi11.phatHien}`}
          </p>
        )}
        {khoi11.insufficientNote && (
          <p className={NOTE} data-testid="cap4-pa-khoi11-note">
            {khoi11.insufficientNote}
          </p>
        )}
        <p className={HINT} data-testid="cap4-pa-khoi11-giaithich">
          {khoi11.giaiThich}
        </p>
      </div>
    </div>
  )
}
