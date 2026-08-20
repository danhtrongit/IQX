import { cn } from "@/shared/lib/cn"
import type { Cap2AnalysisHost } from "@/features/cap2/Cap2PortfolioAnalysis"
import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import { Cap4PortfolioAnalysis } from "@/features/cap4/Cap4PortfolioAnalysis"
import type { Cap4Progress } from "@/features/cap4/types"
import {
  computeCap5Khoi12BoLoc,
  computeCap5Khoi13Pheu,
  KHOI12_KEM_PCT,
  KHOI12_MIN_LENH,
  KHOI12_TOT_PCT,
  type Khoi12FilterRow,
} from "./portfolioAnalysisCap5"
import type { Cap5TradeRecord } from "./tradeLogCap5"
import {
  CAP5_SO_MA_MUA_TARGET,
  CAP5_SO_MA_SAN_TARGET,
  huntFilterTen,
  type Cap5Progress,
} from "./types"
import "./cap5-analysis.css"

/**
 * Trang Phân tích danh mục Cấp 5 (spec `IQX-Cap5-Spec.md` §9, mockup
 * `iqx-cap5-phantich-danhmuc.html`).
 *
 * **TÁI SỬ DỤNG Ở TẦNG COMPONENT (documented choice):** mọi khối Cấp 1-4 được
 * render bằng CHÍNH `Cap4PortfolioAnalysis` — KHÔNG mirror lại markup. Đã đọc
 * component đó trước khi chọn và nó compose sạch: nhận
 * `trades`/`dailyScores`/`cap2-3-4Progress` qua props, không bọc modal, không sở
 * hữu state, và hook duy nhất nó dùng (`useVuKhiDiemMu` cho khối ⑨) là hook của
 * chính nó, tự fail-closed khi lỗi/đang tải. `Cap5TradeRecord extends
 * Cap4TradeRecord` nên mảng lệnh truyền THẲNG vào được. Spec §9 cũng nói rõ các
 * khối Cấp 1-4 "GIỮ NGUYÊN". Đây đúng tiền lệ Cấp 3 → Cấp 2 và Cấp 4 → Cấp 3.
 *
 * Hệ quả (như Cấp 3/4 đã ghi): KHÔNG sửa được markup khối ① của cấp dưới (ngoài
 * quyền sở hữu file), nên phần "Cấp 5 thêm" cho khối ① là một thẻ đầu trang RIÊNG
 * (`cap5-pa-khoi1`) đặt NGAY TRÊN các khối kế thừa.
 *
 * ★★ **HAI KHỐI CŨ ĐÃ NGHỈ HƯU** (⑫ ma trận 4 ô đọc từ nhật ký, ⑬ nhật ký đứng
 * ngoài đọc từ `GET /cap5/dung-ngoai`). Thay bằng ĐÚNG 2 khối của spec mới:
 *
 *  - **⑫ Bộ lọc nào ra mã thắng nhiều nhất** — tính từ nhật ký client
 *    (`tradeLogCap5.ts`, mỗi lệnh mang `huntFilter` của chính nó). Ngưỡng mẫu
 *    `KHOI12_MIN_LENH` là CỨNG: dưới ngưỡng thì ô tỷ lệ để "—" chứ không suy ra
 *    100% từ một lệnh thắng, và cả khối không rút ra kết luận nào.
 *  - **⑬ Kỷ luật săn mã (phễu)** — đọc THẲNG 3 con số của `GET /cap5/progress`
 *    (authoritative, có backfill, và đúng bằng con số nuôi 2 nhiệm vụ). Tầng
 *    giữa NULL-able: chưa có mẻ chấm 5 lớp thì in "—", không phải 0.
 *
 * Ở tầng compute, component chỉ gọi 2 hàm khối thay vì
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
  /** Hồ sơ Cấp 5 — số mã đã săn / đã mua + `best_filter` server đã chốt. */
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

/** "—" cho MỌI giá trị chưa biết. Một chỗ duy nhất để không cấp nào in "0" thay. */
function fmtNullableInt(n: number | null): string {
  return n == null ? "—" : fmtInt(n)
}

/** Nhóm màu thanh của một bộ lọc — chỉ áp cho dòng ĐÃ đủ mẫu. */
function barTone(row: Khoi12FilterRow): string {
  if (!row.duMau || row.tyLeThang == null) return ""
  if (row.tyLeThang >= KHOI12_TOT_PCT) return "cap5-pa-flt-bar--tot"
  if (row.tyLeThang < KHOI12_KEM_PCT) return "cap5-pa-flt-bar--kem"
  return "cap5-pa-flt-bar--vua"
}

/** Một dòng bộ lọc (mockup `.flt-row`). */
function FilterRow({ row }: { row: Khoi12FilterRow }) {
  return (
    <div
      className={cn("cap5-pa-flt", !row.duMau && "cap5-pa-flt--chuadu")}
      data-testid={`cap5-pa-khoi12-row-${row.filter}`}
      data-dumau={row.duMau ? "true" : "false"}
    >
      <span className="cap5-pa-flt-nm">{row.label}</span>
      <div className={cn("cap5-pa-flt-bar", barTone(row))}>
        {/* Thanh chỉ vẽ khi có tỷ lệ THẬT — chưa đủ mẫu thì không có gì để vẽ. */}
        <i style={{ width: `${row.tyLeThang ?? 0}%` }} />
      </div>
      <span className="cap5-pa-flt-pct" data-testid={`cap5-pa-khoi12-pct-${row.filter}`}>
        {row.tyLeThang == null ? "—" : `${row.tyLeThang}%`}
      </span>
      <span className="cap5-pa-flt-n">
        {row.duMau
          ? `${fmtInt(row.soLenh)} lệnh`
          : `${fmtInt(row.soLenh)}/${fmtInt(KHOI12_MIN_LENH)}`}
      </span>
    </div>
  )
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
  const khoi12 = computeCap5Khoi12BoLoc(trades)
  const khoi13 = computeCap5Khoi13Pheu(cap5Progress ?? null)
  const bestFilterTen = huntFilterTen(cap5Progress?.best_filter ?? null)

  return (
    <div className="space-y-3">
      {/* Khối ① (phần Cấp 5 thêm) — số mã đã săn / đã mua + bộ lọc mạnh nhất */}
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
              {`Đã săn ${fmtInt(cap5Progress.so_ma_da_san)}/${fmtInt(
                CAP5_SO_MA_SAN_TARGET,
              )} mã vào Watchlist · đã mua ${fmtInt(
                cap5Progress.so_ma_mua_tu_watchlist,
              )}/${fmtInt(CAP5_SO_MA_MUA_TARGET)} mã từ Watchlist.`}
            </p>
            {/* ★ `best_filter` chưa có KHÔNG được in thành một bộ lọc bất kỳ. */}
            <p className={NOTE} data-testid="cap5-pa-khoi1-best">
              {bestFilterTen
                ? `Bộ lọc mạnh nhất của bạn (hệ thống chốt): «${bestFilterTen}».`
                : "Bộ lọc mạnh nhất: chưa đủ dữ liệu để chốt — cần thêm lệnh đã đóng từ mã bạn săn."}
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

      {/* ⑫ Bộ lọc nào mang lại mã thắng nhiều nhất (spec §9) */}
      <div className={CARD} data-testid="cap5-pa-khoi12">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER} data-testid="cap5-pa-khoi12-header">
            {"⑫ BỘ LỌC NÀO MANG LẠI MÃ THẮNG NHIỀU NHẤT"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 5</span>
        </div>
        <p className={HINT}>
          {"Trong các mã bạn săn từ mỗi bộ lọc rồi thực sự vào lệnh, tỷ lệ thắng — đo bằng kết " +
            "quả thật."}
        </p>

        {khoi12.rows.length > 0 && (
          <div data-testid="cap5-pa-khoi12-rows">
            {khoi12.rows.map((row) => (
              <FilterRow key={row.filter} row={row} />
            ))}
          </div>
        )}

        {/* Trạng thái rỗng TRUNG THỰC + số còn thiếu (không suy tỷ lệ từ 1-2 lệnh). */}
        {khoi12.insufficientNote && (
          <p className={NOTE} data-testid="cap5-pa-khoi12-chuadu">
            {khoi12.insufficientNote}
          </p>
        )}

        {khoi12.phatHien && (
          <div
            className={cn("cap5-pa-pat", khoi12.canhBao && "cap5-pa-pat--canhbao")}
            data-testid="cap5-pa-khoi12-phathien"
          >
            <span className="cap5-pa-pat-ic">{khoi12.canhBao ? "⚠" : "🎯"}</span>
            <span>{khoi12.phatHien}</span>
          </div>
        )}

        {khoi12.soLenhKhongSan > 0 && (
          <p className={HINT} data-testid="cap5-pa-khoi12-khongsan">
            {`${fmtInt(khoi12.soLenhKhongSan)} lệnh đã đóng KHÔNG đến từ săn mã (bạn tự chọn mã) ` +
              "— chúng không thuộc bộ lọc nào nên không nằm trong bảng trên."}
          </p>
        )}

        <p className={HINT} data-testid="cap5-pa-khoi12-giaithich">
          {khoi12.giaiThich}
        </p>
      </div>

      {/* ⑬ Kỷ luật săn mã — phễu 3 tầng (spec §9) */}
      <div className={CARD} data-testid="cap5-pa-khoi13">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER} data-testid="cap5-pa-khoi13-header">
            {"⑬ KỶ LUẬT SĂN MÃ"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 5</span>
        </div>

        <div className="cap5-pa-funnel" data-testid="cap5-pa-khoi13-funnel">
          {khoi13.tang.map((t, i) => (
            <div className="cap5-pa-fn-row" key={i} data-testid={`cap5-pa-khoi13-tang-${i + 1}`}>
              <span className="cap5-pa-fn-ic">{t.ic}</span>
              <span className="cap5-pa-fn-lb">{t.label}</span>
              <span
                className={cn("cap5-pa-fn-v", t.value == null && "cap5-pa-fn-v--chuabiet")}
                data-chuabiet={t.value == null ? "true" : "false"}
              >
                {fmtNullableInt(t.value)}
              </span>
            </div>
          ))}
        </div>

        {/* ★ Tầng giữa "—" phải được GIẢI THÍCH, nếu không nó trông như lỗi. */}
        {khoi13.soMaChoDuLop == null && khoi13.soMaDaSan != null && (
          <p className={NOTE} data-testid="cap5-pa-khoi13-chuadolop">
            {"Tầng giữa chưa đo được: điểm đồng thuận 5 lớp của các mã trong Watchlist được chấm " +
              "theo mẻ 1 lần/ngày sau phiên. Nó sẽ có số sau mẻ chấm gần nhất."}
          </p>
        )}

        {khoi13.insufficientNote && (
          <p className={NOTE} data-testid="cap5-pa-khoi13-chuadu">
            {khoi13.insufficientNote}
          </p>
        )}

        {khoi13.phatHien && (
          <div className="cap5-pa-pat" data-testid="cap5-pa-khoi13-phathien">
            <span className="cap5-pa-pat-ic">🧭</span>
            <span>{khoi13.phatHien}</span>
          </div>
        )}

        <p className={HINT} data-testid="cap5-pa-khoi13-giaithich">
          {khoi13.giaiThich}
        </p>
      </div>
    </div>
  )
}
