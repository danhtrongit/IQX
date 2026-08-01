import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap4Progress } from "@/features/cap4/types"
import type { Cap5Progress } from "@/features/cap5/types"
import type { Cap6Progress } from "@/features/cap6/types"
import { Cap7PortfolioAnalysis } from "@/features/cap7/Cap7PortfolioAnalysis"
import type { Cap7TradeRecord } from "@/features/cap7/tradeLogCap7"
import type { Cap7Progress } from "@/features/cap7/types"
import { cn } from "@/shared/lib/cn"
import { useThachThucCap8 } from "./hooks"
import { computeCap8Khoi18BanDoRuiRo } from "./portfolioAnalysisCap8"
import type { Cap8Progress } from "./types"
import "./cap8-analysis.css"

/**
 * Trang Phân tích danh mục Cấp 8 (spec `IQX-Cap8-Spec.md` §7).
 *
 * **TÁI SỬ DỤNG Ở TẦNG COMPONENT (documented choice, đúng tiền lệ Cấp 6 → 7):**
 * mọi khối Cấp 1-7 (①-⑰) được render bằng CHÍNH `Cap7PortfolioAnalysis` — KHÔNG
 * mirror lại markup. Component đó compose sạch (nhận progress + nhật ký qua
 * props, không bọc modal, không sở hữu state, các hook nó dùng đều fail-closed)
 * và Cấp 8 KHÔNG thêm trường nào vào nhật ký lệnh, nên mảng `Cap7TradeRecord[]`
 * truyền THẲNG xuống. Spec §7 cũng nói rõ các khối Cấp 1-7 "kế thừa".
 *
 * Hệ quả (như Cấp 3/4/5/6/7 đã ghi): KHÔNG sửa được markup khối ① của cấp dưới,
 * nên phần "Cấp 8 thêm" cho khối ① là một thẻ đầu trang RIÊNG (`cap8-pa-khoi1`)
 * đặt NGAY TRÊN các khối kế thừa.
 *
 * ★★ **TOÀN BỘ KHỐI ⑱ ĐẾN TỪ SERVER** (`GET /cap8/thach-thuc` → `danh_muc`) —
 * ba thước đo cần ngành ICB, lịch sử giá và cắt lỗ của từng vị thế, không thứ
 * nào có ở frontend. Chưa tải được → khối nói thẳng, KHÔNG đắp tạm.
 *
 * ★★ **`null` KHÔNG BAO GIỜ HIỆN THÀNH `0`.** `Cap8Progress.don_nganh_max_pct`
 * và `tong_rui_ro_pct` là ẢNH CHỤP của lần chấm gần nhất và là `null` cho tới
 * lần đầu tiên. `?? 0` ở đây sẽ nói với user rằng danh mục hoàn toàn an toàn
 * trong khi thật ra chưa có gì được tính — nên cả hai render là "chưa tính được".
 *
 * ★★ **Spec §9: KHÔNG dựng lại báo cáo Người quản lý danh mục.** Khối ⑱ là bản
 * in-context gọn; dòng cross-ref PM luôn có mặt để user biết bản sâu ở đâu.
 */
export interface Cap8PortfolioAnalysisProps {
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
  /** Hồ sơ Cấp 8 — số lệnh kiểm tra + 2 ảnh chụp danh mục (có thể `null`). */
  cap8Progress: Cap8Progress | null
  /** Nhật ký lệnh đã đóng (`useCap7TradeLog` — Cấp 8 không thêm trường nào). */
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
/** Xanh lá Cấp 8 `#3f9b5a` — nhãn "mới ở Cấp 8" (khác hồng magenta Cấp 7). */
const BADGE_NEW =
  "rounded-full border border-[#3f9b5a] px-1.5 py-px text-[9px] font-semibold text-[#3f9b5a]"
const NOTE = "text-xs text-[var(--color-text-3)]"
const HINT = "text-[10px] leading-snug text-[var(--color-text-3)]"

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/** `46%` — số en-US, làm tròn nguyên; dấu trừ typographic "−" (U+2212). */
function fmtPct0(pct: number): string {
  const r = Math.round(pct)
  return `${r < 0 ? "−" : ""}${Math.abs(r)}%`
}

/**
 * ★ MỘT con số `null` của Cấp 8 = CHƯA TÍNH ĐƯỢC. Không có `?? 0` ở bất kỳ đâu
 * trong file này: `0%` dồn ngành và `0%` tổng rủi ro là hai câu khẳng định rất
 * mạnh về mức an toàn của danh mục, và không ai có cơ sở để nói chúng khi phép
 * đo chưa từng chạy.
 */
function pctHoacChuaTinh(pct: number | null): string {
  return pct == null ? "chưa tính được" : fmtPct0(pct)
}

export function Cap8PortfolioAnalysis({
  cap2Progress,
  cap3Progress,
  cap4Progress,
  cap5Progress,
  cap6Progress,
  cap7Progress,
  cap8Progress,
  trades,
  dailyScores,
  now,
}: Cap8PortfolioAnalysisProps) {
  const thachThucQuery = useThachThucCap8()
  const khoi18 = computeCap8Khoi18BanDoRuiRo(thachThucQuery.data ?? null)

  return (
    <div className="space-y-3">
      {/* Khối ① (phần Cấp 8 thêm) — số server, `null` hiện thành "chưa tính được" */}
      <div className={CARD} data-testid="cap8-pa-khoi1">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER}>
            {"HỒ SƠ NHÀ ĐẦU TƯ CỦA BẠN · Cấp 8 «Quản trị rủi ro danh mục»"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 8</span>
        </div>
        {cap8Progress ? (
          <>
            <p className="text-xs text-[var(--color-text-1)]">
              {`Đã qua bước Kiểm tra danh mục ở ${fmtInt(
                cap8Progress.so_lenh_kiem_tra,
              )} lệnh mua · có cảnh báo ${fmtInt(
                cap8Progress.so_lan_co_canh_bao,
              )} lần, trong đó vẫn mua ${fmtInt(
                cap8Progress.bat_chap_gan_day,
              )} lần ở ${fmtInt(cap8Progress.cua_so_gan_day)} lệnh gần nhất.`}
            </p>
            <p
              className="text-xs text-[var(--color-text-1)]"
              data-testid="cap8-pa-khoi1-so"
            >
              {`Ngành lớn nhất: ${pctHoacChuaTinh(
                cap8Progress.don_nganh_max_pct,
              )} · tổng vốn ở rủi ro: ${pctHoacChuaTinh(cap8Progress.tong_rui_ro_pct)}.`}
            </p>
            <p className={HINT}>
              {
                "Hai con số trên là ảnh chụp của lần hệ thống chấm danh mục gần nhất, không phải " +
                "giá trị định giá lại lúc bạn mở trang này — «chưa tính được» nghĩa là hệ thống " +
                "chưa chấm lần nào, KHÔNG phải bằng 0. Bản đồ ở khối ⑱ bên dưới mới là số của " +
                "phiên hiện tại."
              }
            </p>
          </>
        ) : (
          <p className={NOTE}>
            {"Chưa có hồ sơ Cấp 8 — các số của cấp này chỉ hiện sau khi bạn vào Cấp 8."}
          </p>
        )}
      </div>

      {/* Mọi khối Cấp 1-7 — render lại nguyên bằng component của Cấp 7 */}
      <Cap7PortfolioAnalysis
        cap2Progress={cap2Progress}
        cap3Progress={cap3Progress}
        cap4Progress={cap4Progress}
        cap5Progress={cap5Progress}
        cap6Progress={cap6Progress}
        cap7Progress={cap7Progress}
        trades={trades}
        dailyScores={dailyScores}
        now={now}
      />

      {/* ⑱ Bản đồ rủi ro danh mục — TOÀN BỘ từ server (spec §7) */}
      <div className={CARD} data-testid="cap8-pa-khoi18">
        <div className="flex items-center gap-2">
          <span className={SECTION_HEADER} data-testid="cap8-pa-khoi18-header">
            {"⑱ BẢN ĐỒ RỦI RO DANH MỤC"}
          </span>
          <span className={BADGE_NEW}>mới ở Cấp 8</span>
        </div>

        {thachThucQuery.isPending ? (
          <p className={NOTE} data-testid="cap8-pa-khoi18-loading">
            {"Đang tải bản đồ rủi ro danh mục từ hệ thống…"}
          </p>
        ) : (
          <>
            {khoi18.duDuLieu && (
              <>
                <div className="cap8-pa-nhan">{"Phân bổ ngành"}</div>
                <div className="cap8-pa-phanbo" data-testid="cap8-pa-phanbo">
                  {khoi18.phanBoNganh.map((o) => {
                    const canh = o.pct > khoi18.nguongDonNganhPct
                    const max = khoi18.donNganhMax?.nganh === o.nganh
                    return (
                      <span
                        key={o.nganh}
                        className={cn(
                          "cap8-pa-o",
                          canh ? "cap8-pa-o--canh" : max && "cap8-pa-o--max",
                        )}
                        data-testid={`cap8-pa-o-${o.nganh}`}
                      >
                        {`${o.nganh} `}
                        <span className="cap8-pa-o-pct">{fmtPct0(o.pct)}</span>
                        {canh ? " ⚠" : ""}
                      </span>
                    )
                  })}
                </div>

                {/* ★ <2 vị thế → ẩn HẲN phần tương quan (spec §7: cần ≥2 mã). */}
                {khoi18.hienTuongQuan && (
                  <>
                    <div className="cap8-pa-nhan">{"Cặp tương quan cao"}</div>
                    <p
                      className={cn(
                        "cap8-pa-dong",
                        !khoi18.tuongQuanDuLieu && "cap8-pa-dong--chua",
                      )}
                      data-testid="cap8-pa-tuongquan"
                    >
                      {khoi18.tuongQuanText}
                    </p>
                  </>
                )}

                <div className="cap8-pa-nhan">{"Tổng vốn ở rủi ro"}</div>
                <p
                  className={cn(
                    "cap8-pa-dong",
                    khoi18.tongRuiRoVuotTran && "cap8-pa-dong--canh",
                  )}
                  data-testid="cap8-pa-tongruiro"
                >
                  {`${khoi18.tongRuiRoText}${khoi18.tongRuiRoVuotTran ? " ⚠" : ""}`}
                </p>
                {/* ★ Hai con số KHÔNG cùng một nghĩa — nói ngay dưới chúng. */}
                <p className={HINT} data-testid="cap8-pa-tran-note">
                  {khoi18.tranKhauViNote}
                </p>
                {/* ★ Vị thế chưa có cắt lỗ: rủi ro CHƯA BIẾT, không phải 0. */}
                {khoi18.caveat && (
                  <p className="cap8-pa-caveat" data-testid="cap8-pa-caveat">
                    {`⚠ ${khoi18.caveat}`}
                  </p>
                )}
              </>
            )}

            {khoi18.phatHien && (
              <p className="cap8-pa-phathien" data-testid="cap8-pa-phathien">
                {`🎯 ${khoi18.phatHien}`}
              </p>
            )}
            {khoi18.thieuDuLieuNote && (
              <p className={NOTE} data-testid="cap8-pa-khoi18-note">
                {khoi18.thieuDuLieuNote}
              </p>
            )}
            {/* Câu của server cho điều kiện ③, NGUYÊN VĂN (§C12c). */}
            {khoi18.giaiThichServer && (
              <p className={HINT} data-testid="cap8-pa-khoi18-server">
                {khoi18.giaiThichServer}
              </p>
            )}
          </>
        )}

        {/* Spec §9 — Cấp 8 KHÔNG dựng lại PM; dòng này LUÔN có mặt. */}
        <p className={NOTE} data-testid="cap8-pa-crossref">
          {khoi18.crossRefPm}
        </p>
        <p className={HINT} data-testid="cap8-pa-khoi18-giaithich">
          {khoi18.giaiThich}
        </p>
      </div>
    </div>
  )
}
