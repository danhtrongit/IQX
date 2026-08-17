import { cn } from "@/shared/lib/cn"
import { LY_DO_OPTIONS, type LyDo } from "@/features/cap1/types"
import {
  computeCap2PortfolioAnalysis,
  type Cap2DailyScoreRecord,
  type Cap2TradeRecord,
} from "./portfolioAnalysisCap2"
import type { Cap2Progress } from "./types"
import "./cap2-analysis.css"

/**
 * Ngữ cảnh khi 4 khối này được RENDER LẠI bên trong trang Phân tích của một cấp
 * CAO HƠN (Cấp 3-8 cộng dồn bằng chính component này). Bỏ trống = trang Phân
 * tích của chính Cấp 2.
 *
 * ★ Vì sao cần: cấp cao hơn truyền `trades` = nhật ký lệnh CỦA CHÍNH NÓ nhưng
 * `progress` = hồ sơ Cấp 2 (khối ④ đọc 3 con số server chỉ Cấp 2 có). Nếu khối
 * ① vẫn tự xưng "Cấp 2 «Kỷ luật» · N lệnh · từ {ngày vào Cấp 2}" thì N là lệnh
 * của cấp trên còn ngày là của Cấp 2 — hai nửa của hai cấp khác nhau trong cùng
 * một câu, lại đứng ngay dưới thẻ hồ sơ riêng của cấp đó.
 */
export interface Cap2AnalysisHost {
  /** Nhãn cấp đang chứa các khối này, vd. `Cấp 3 «Bản lĩnh»`. */
  levelLabel: string
  /** `entered_at` của cấp đó (ISO) — nguồn của `trades`. */
  sinceIso: string | null
}

export interface Cap2PortfolioAnalysisProps {
  progress: Cap2Progress | null
  trades: Cap2TradeRecord[]
  /** ★ Không còn khối nào của Cấp 2 đọc nhật ký điểm kỷ luật — xem docstring
   *  của `computeCap2PortfolioAnalysis`. Prop giữ lại vì Cấp 3-8 truyền qua. */
  dailyScores: Cap2DailyScoreRecord[]
  /** Reference "now" — giữ cho tương thích chữ ký; không khối nào còn dùng. */
  now?: Date
  /** Xem `Cap2AnalysisHost`. Bỏ trống = đang ở trang Phân tích của Cấp 2. */
  host?: Cap2AnalysisHost
}

function lyDoIcon(lyDo: LyDo): string {
  return LY_DO_OPTIONS.find((o) => o.value === lyDo)?.icon ?? "•"
}

function lyDoLabel(lyDo: LyDo): string {
  return LY_DO_OPTIONS.find((o) => o.value === lyDo)?.label ?? lyDo
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN")
}

function fmtVndSigned(n: number): string {
  const rounded = Math.round(n)
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toLocaleString("en-US")} ₫`
}

/** Splits on `**bold**` markers and renders them as `<strong>` — cùng quy ước
 *  `GraduationModalCap2`/`cap0/GraduationModal.tsx` đang dùng. */
function renderInlineBold(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

const SECTION_HEADER =
  "text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--primary-6))]"
const CARD =
  "space-y-2 rounded-md border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-3"

/**
 * Tiêu đề 4 khối — nguyên văn mockup `iqx-cap2-phantich-danhmuc.html` (số
 * khoanh tròn ①..④), kèm hai loại nhãn phụ mockup vẽ: "(giữ từ Cấp 1)" và
 * "mới ở Cấp 2".
 */
const KHOI_TITLE = {
  khoi1: "① Hồ sơ tổng quan",
  khoi2: "② Thắng / thua theo 5 lý do",
  khoi3: "③ Độ phủ 5 lý do",
  khoi4: "④ Bạn đã dùng cơ chế cắt lỗ / chốt lời thế nào",
} as const

const KEEP_FLAG = "text-[9px] font-normal normal-case tracking-normal text-[var(--color-text-3)]"

/**
 * Câu `.pat.info` thay thế khi khối ④ đứng trong trang Phân tích của cấp CAO
 * HƠN. Câu gốc (`SCOPE_NOTE`, `portfolioAnalysisCap2.ts`) hứa "rèn kỷ luật sâu
 * hơn … sẽ đến ở các cấp sau" — người đọc ĐANG ở các cấp sau đó.
 */
const HOST_SCOPE_NOTE =
  "Ba con số này **cộng dồn từ Cấp 2** — chúng cho thấy cơ chế cắt lỗ / chốt lời đã thành thói quen tới đâu, chứ không phải nhiệm vụ phải làm lại."
const ADD_FLAG =
  "rounded-full bg-[rgba(125,211,192,0.16)] px-[7px] py-[2px] text-[9px] font-bold normal-case tracking-normal text-[#7dd3c0]"

/**
 * Trang Phân tích danh mục Cấp 2 — 4 khối của mockup
 * `iqx-cap2-phantich-danhmuc.html`.
 *
 * **Does NOT reuse `Cap1PortfolioAnalysis` (documented choice):** its internal
 * khối renderers are module-private (not exported), and khối ① của Cấp 2 thêm
 * hai ô thống kê riêng còn khối ③ rút gọn so với Cấp 1. Component này vẽ JSX
 * riêng cho cả 4 khối, nhưng lấy DỮ LIỆU (không phải markup) từ
 * `computeCap2PortfolioAnalysis`, vốn uỷ quyền ①②③ xuống
 * `computeCap1PortfolioAnalysis` — trùng khớp con số của Cấp 1 mà không viết
 * lại phép tính.
 *
 * ★ **KHÔNG chép `:root` của mockup.** Hai file mockup mới đặt `--t2`/`--t3`
 * bằng `--t1` (`#f0f2f7`); mang vào app sẽ làm trắng xoá mọi chữ phụ ở MỌI cấp.
 *
 * Fully presentational (mirrors `Cap1PortfolioAnalysis`): container thật
 * (`Cap2PortfolioAnalysisPanel`) nối `progress`/`trades` vào và truyền xuống.
 */
export function Cap2PortfolioAnalysis({
  progress,
  trades,
  dailyScores,
  now,
  host,
}: Cap2PortfolioAnalysisProps) {
  const result = computeCap2PortfolioAnalysis(trades, dailyScores, progress, now)
  const { khoi1, khoi3, khoi4 } = result
  const levelLabel = host?.levelLabel ?? "Cấp 2 «Kỷ luật»"
  const sinceIso = host ? host.sinceIso : (progress?.entered_at ?? null)

  return (
    <div className="space-y-3">
      {/* ① Hồ sơ tổng quan — Cấp 1 + 2 ô thống kê riêng của Cấp 2 */}
      <div className={CARD} data-testid="cap2-pa-khoi1">
        <div className={SECTION_HEADER}>{KHOI_TITLE.khoi1}</div>
        <p className="text-[10.5px] text-[var(--color-text-3)]" data-testid="cap2-pa-khoi1-scope">
          {levelLabel}
          {` · ${khoi1.totalTrades} lệnh`}
          {sinceIso ? ` · từ ${fmtDate(sinceIso)}` : null}
        </p>

        <div className="cap2-pa-stats">
          <div className="cap2-pa-stat cap2-pa-stat--main">
            <span className="cap2-pa-stat-label">Tỷ lệ thắng</span>
            <span
              className={cn(
                "cap2-pa-stat-value cap2-pa-stat-value--main",
                khoi1.winRate != null && khoi1.winRate >= 50 && "text-up",
              )}
              data-testid="cap2-pa-winrate"
            >
              {khoi1.winRate != null ? `${khoi1.winRate}%` : "—"}
            </span>
            <span className="cap2-pa-stat-sub">
              {khoi1.totalTrades > 0
                ? `${khoi1.wins} lãi / ${khoi1.losses} lỗ`
                : "chưa có lệnh đã đóng"}
            </span>
          </div>

          {/* Ô tiến độ "n/10 lệnh có CL/CL" là MỐC TỐT NGHIỆP CẤP 2. Ai đang ở
              cấp cao hơn thì đã ≥10 từ lâu → ô ghim cứng "10/10" vĩnh viễn, nên
              chỉ hiện ở trang Phân tích của chính Cấp 2. */}
          {!host && (
            <div className="cap2-pa-stat">
              <span className="cap2-pa-stat-label">Đã đặt CL/CL</span>
              <span
                className="cap2-pa-stat-value cap2-pa-stat-value--teal"
                data-testid="cap2-pa-slp-orders"
              >
                {`${khoi4.soLenhCoSlTp}/${khoi4.soLenhCoSlTpTarget}`}
              </span>
              <span className="cap2-pa-stat-sub">mọi lệnh</span>
            </div>
          )}

          {/* ★ `khoi4.tongDung` đọc `Cap2Progress.so_lan_thuc_hien_dung`, mà
              server (`_cap2_ketso_rows`) chỉ chặn cận DƯỚI `closed_at >=
              cap2.entered_at` — không có cận trên. Nên ở trang của cấp cao hơn
              nó là con số CỘNG DỒN TỪ CẤP 2, đứng ngay dưới một tiêu đề ghi
              nhãn + ngày của cấp đang xem. Dòng phụ phải nói đúng phạm vi đó,
              nếu không user Cấp 3 chưa đóng lệnh nào vẫn đọc thành "đã làm đúng
              7 lần trong Cấp 3". */}
          <div className="cap2-pa-stat">
            <span className="cap2-pa-stat-label">Thực hiện đúng</span>
            <span className="cap2-pa-stat-value cap2-pa-stat-value--teal" data-testid="cap2-pa-exec-total">
              {khoi4.tongDung}
            </span>
            <span className="cap2-pa-stat-sub" data-testid="cap2-pa-exec-total-scope">
              {host ? "khi giá chạm mốc · cộng dồn từ Cấp 2" : "khi giá chạm mốc"}
            </span>
          </div>
        </div>

        {khoi1.preferredLyDo && (
          <p className="text-xs text-[var(--color-text-1)]">
            {`Cách chọn ưa thích: ${lyDoIcon(khoi1.preferredLyDo)} ${lyDoLabel(khoi1.preferredLyDo)} (${khoi1.preferredLyDoCount} lần dùng)`}
          </p>
        )}
      </div>

      {/* ② Bảng thắng/thua theo 5 lý do (uỷ quyền Cấp 1, không đổi) */}
      {result.hideKhoi2 ? (
        <div className={CARD} data-testid="cap2-pa-khoi2-hidden">
          <p className="text-xs text-[var(--color-text-3)]">{result.khoi2HiddenNote}</p>
        </div>
      ) : (
        <div className={CARD} data-testid="cap2-pa-khoi2">
          <div className={cn(SECTION_HEADER, "flex items-center gap-2")}>
            <span>{KHOI_TITLE.khoi2}</span>
            <span className={KEEP_FLAG}>(giữ từ Cấp 1)</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--color-text-3)]">
                <th className="py-1 font-medium">Lý do</th>
                <th className="py-1 font-medium">Lệnh</th>
                <th className="py-1 font-medium">Thắng</th>
                <th className="py-1 font-medium">Lãi/lỗ</th>
              </tr>
            </thead>
            <tbody>
              {result.khoi2.map((row) => (
                <tr key={row.lyDo} className="border-t border-[var(--color-border-2)]">
                  <td className="py-1">
                    {lyDoIcon(row.lyDo)} {lyDoLabel(row.lyDo)} {row.badge}
                  </td>
                  <td className="py-1">{row.count}</td>
                  <td className="py-1">{row.winRate != null ? `${row.winRate}%` : "—"}</td>
                  <td
                    className={cn(
                      "py-1 tabular-nums",
                      row.totalPnlVnd > 0 && "text-up",
                      row.totalPnlVnd < 0 && "text-down",
                    )}
                  >
                    {fmtVndSigned(row.totalPnlVnd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ③ Độ phủ 5 lý do (uỷ quyền Cấp 1) */}
      <div className={CARD} data-testid="cap2-pa-khoi3">
        <div className={cn(SECTION_HEADER, "flex items-center gap-2")}>
          <span>{KHOI_TITLE.khoi3}</span>
          <span className={KEEP_FLAG}>(giữ từ Cấp 1)</span>
        </div>
        <div className="cap2-pa-coverage">
          {LY_DO_OPTIONS.map((opt) => (
            <span
              key={opt.value}
              data-testid={`cap2-pa-coverage-${opt.value}`}
              className={khoi3.coverage[opt.value] ? "" : "cap2-pa-coverage-off"}
            >
              {opt.icon}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs text-[var(--color-text-2)]">
          <span>Đã dùng</span>
          <span
            className={cn("tabular-nums font-semibold", khoi3.usedCount >= 4 && "text-up")}
            data-testid="cap2-pa-coverage-count"
          >
            {`${khoi3.usedCount}/${LY_DO_OPTIONS.length}`}
          </span>
        </div>
      </div>

      {/* ④ Bạn đã dùng cơ chế cắt lỗ / chốt lời thế nào — MỚI ở Cấp 2 */}
      <div className={CARD} data-testid="cap2-pa-khoi4">
        <div className={cn(SECTION_HEADER, "flex flex-wrap items-center gap-2")}>
          <span>{KHOI_TITLE.khoi4}</span>
          {host ? (
            <span className={KEEP_FLAG}>(giữ từ Cấp 2)</span>
          ) : (
            <span className={ADD_FLAG}>mới ở Cấp 2</span>
          )}
        </div>

        <div className="cap2-pa-exec">
          <div className="cap2-pa-exec-box">
            <div className="cap2-pa-exec-ic">🛑</div>
            <div className="cap2-pa-exec-value" data-testid="cap2-pa-exec-catlo">
              {khoi4.catLoDung}
            </div>
            <div className="cap2-pa-exec-label">
              lần cắt lỗ
              <br />
              khi giá chạm
            </div>
          </div>
          <div className="cap2-pa-exec-box">
            <div className="cap2-pa-exec-ic">🎯</div>
            <div className="cap2-pa-exec-value" data-testid="cap2-pa-exec-chotloi">
              {khoi4.chotLoiDung}
            </div>
            <div className="cap2-pa-exec-label">
              lần chốt lời
              <br />
              khi giá chạm
            </div>
          </div>
          <div className="cap2-pa-exec-box">
            <div className="cap2-pa-exec-ic">✅</div>
            <div className="cap2-pa-exec-value" data-testid="cap2-pa-exec-tong">
              {khoi4.tongDung}
            </div>
            <div className="cap2-pa-exec-label">
              tổng lần
              <br />
              thực hiện đúng
            </div>
          </div>
        </div>

        {khoi4.patternNote && (
          <div className="cap2-pa-pat cap2-pa-pat--good" data-testid="cap2-pa-pat-good">
            <span className="cap2-pa-pat-ic">🎓</span>
            <span className="cap2-pa-pat-text">{khoi4.patternNote}</span>
          </div>
        )}
        {khoi4.emptyNote && (
          <div className="cap2-pa-pat cap2-pa-pat--empty" data-testid="cap2-pa-pat-empty">
            <span className="cap2-pa-pat-ic">⏳</span>
            <span className="cap2-pa-pat-text">{khoi4.emptyNote}</span>
          </div>
        )}
        <div className="cap2-pa-pat cap2-pa-pat--info" data-testid="cap2-pa-pat-info">
          <span className="cap2-pa-pat-ic">💡</span>
          <span className="cap2-pa-pat-text">
            {renderInlineBold(host ? HOST_SCOPE_NOTE : khoi4.scopeNote)}
          </span>
        </div>
      </div>
    </div>
  )
}
