import { cn } from "@/shared/lib/cn"
import { LY_DO_OPTIONS, type LyDo } from "@/features/cap1/types"
import {
  computeCap2PortfolioAnalysis,
  VI_PHAM_LOAI_LABELS,
  type Cap2DailyScoreRecord,
  type Cap2TradeRecord,
  type ReflectionPatternId,
} from "./portfolioAnalysisCap2"
import type { Cap2Progress } from "./types"
import "./cap2-analysis.css"

export interface Cap2PortfolioAnalysisProps {
  progress: Cap2Progress | null
  trades: Cap2TradeRecord[]
  dailyScores: Cap2DailyScoreRecord[]
  /** Reference "now" for the date-windowed blocks (Khối 3/6/7 + mẫu 9-11).
   * Defaults to the real current time; tests pass a fixed instant. */
  now?: Date
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

const SECTION_HEADER =
  "text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--primary-6))]"
const CARD =
  "space-y-2 rounded-md border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-3"

const PATTERN_LABEL: Record<ReflectionPatternId, string> = {
  loss_aversion: "Sợ mất lãi (loss aversion)",
  chi_so_hoa: "Chỉ số hóa",
  fomo: "FOMO",
  tin_tuc: "Phản ứng theo tin",
  khong_tin_phan_tich: "Không tin phân tích",
  cam_xuc_manh: "Cảm xúc mạnh",
}

/**
 * Trang Phân tích danh mục Cấp 2 (spec `IQX-Cap2-Spec.md` §12).
 *
 * **Does NOT reuse `Cap1PortfolioAnalysis` (documented choice):** its
 * internal Khối1-4 renderers are module-private (not exported), and per §12
 * Khối 1's label, Khối 3's content (5-lý-do coverage → 4-loại vi phạm) and
 * Khối 4's content (6-nhiệm-vụ checklist → cửa sổ 20 lệnh) all need to
 * DIFFER for Cấp 2 anyway. Instead this component renders its own JSX for
 * all 7 khối, sourcing Khối 1/2's DATA (not markup) from
 * `computeCap2PortfolioAnalysis`, which itself delegates that compute to
 * `computeCap1PortfolioAnalysis` — the delegation happens at the compute
 * layer, matching Cấp 1's exact numbers/thresholds without re-implementing
 * them.
 *
 * Fully presentational (mirrors `Cap1PortfolioAnalysis`'s convention): the
 * real container wires `trades`/`dailyScores` from whatever Cấp-2 history
 * mechanism exists (out of this task's scope — see `portfolioAnalysisCap2.ts`'s
 * docstring) and passes them in as props.
 */
export function Cap2PortfolioAnalysis({ progress, trades, dailyScores, now }: Cap2PortfolioAnalysisProps) {
  const result = computeCap2PortfolioAnalysis(trades, dailyScores, progress, now)

  return (
    <div className="space-y-3">
      {/* Khối 1 — hồ sơ tổng quan (label Cấp 2, spec §12) */}
      <div className={CARD} data-testid="cap2-pa-khoi1">
        <div className={SECTION_HEADER}>{"HỒ SƠ NHÀ ĐẦU TƯ CỦA BẠN · Cấp 2 «Kỷ luật»"}</div>
        <p className="text-xs text-[var(--color-text-2)]">
          {`${result.khoi1.totalTrades} lệnh Thực chiến`}
          {progress ? ` · từ ${fmtDate(progress.entered_at)}` : null}
        </p>
        {result.khoi1.totalTrades > 0 ? (
          <>
            <p className="text-xs text-[var(--color-text-1)]">
              {`Tỷ lệ thắng: ${result.khoi1.winRate}% · ${result.khoi1.wins} lãi / ${result.khoi1.losses} lỗ`}
            </p>
            {result.khoi1.preferredLyDo && (
              <p className="text-xs text-[var(--color-text-1)]">
                {`Cách chọn ưa thích: ${lyDoIcon(result.khoi1.preferredLyDo)} ${lyDoLabel(result.khoi1.preferredLyDo)} (${result.khoi1.preferredLyDoCount} lần dùng)`}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-[var(--color-text-3)]">{"Chưa có lệnh Thực chiến nào đã đóng."}</p>
        )}
      </div>

      {/* Khối 2 — bảng thắng/thua theo 5 lý do (delegated, unchanged) */}
      {result.hideKhoi2 ? (
        <div className={CARD} data-testid="cap2-pa-khoi2-hidden">
          <p className="text-xs text-[var(--color-text-3)]">{result.khoi2HiddenNote}</p>
        </div>
      ) : (
        <div className={CARD} data-testid="cap2-pa-khoi2">
          <div className={SECTION_HEADER}>{"BẢNG THẮNG/THUA THEO 5 LÝ DO"}</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--color-text-3)]">
                <th className="py-1 font-medium">Lý do</th>
                <th className="py-1 font-medium">Số lệnh</th>
                <th className="py-1 font-medium">Tỷ lệ thắng</th>
                <th className="py-1 font-medium">Tổng lãi/lỗ</th>
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

      {/* Khối 3 — vi phạm theo 4 loại (§12 adjustment) */}
      <div className={CARD} data-testid="cap2-pa-khoi3">
        <div className={SECTION_HEADER}>{`DANH SÁCH VI PHẠM · ${result.khoi3.windowDays} NGÀY QUA`}</div>
        {result.khoi3.note ? (
          <p className="text-xs text-[var(--color-text-3)]">{result.khoi3.note}</p>
        ) : (
          <ul className="space-y-1 text-xs text-[var(--color-text-1)]">
            {result.khoi3.rows.map((row) => (
              <li key={row.loai} className="flex items-center justify-between">
                <span>{VI_PHAM_LOAI_LABELS[row.loai]}</span>
                <span className="tabular-nums text-[var(--color-text-2)]">
                  {`${row.count} lần${row.pct != null ? ` (${row.pct}%)` : ""}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Khối 4 — cửa sổ 20 lệnh + điều kiện lên Cấp 3 (§12 adjustment) */}
      <div className={CARD} data-testid="cap2-pa-khoi4">
        <div className={SECTION_HEADER}>{"CỬA SỔ 20 LỆNH GẦN NHẤT"}</div>
        <div className="cap2-pa-khoi4-grid">
          {result.khoi4.cells.map((cell, i) => (
            <span
              key={`${cell.orderId}-${i}`}
              className={cn("cap2-pa-khoi4-cell", cell.viPham && "cap2-pa-khoi4-cell--vipham")}
              title={cell.orderId}
            />
          ))}
        </div>
        <p
          className={cn(
            "text-xs",
            result.khoi4.readyToGraduate ? "font-semibold text-up" : "text-[var(--color-text-2)]",
          )}
        >
          {result.khoi4.readyToGraduate ? `🎉 ${result.khoi4.note}` : result.khoi4.note}
        </p>
      </div>

      {/* Khối 5 — điểm kỷ luật 30 ngày */}
      <div className={CARD} data-testid="cap2-pa-khoi5">
        <div className={SECTION_HEADER}>{"ĐIỂM KỶ LUẬT · 30 NGÀY"}</div>
        {result.khoi5.series.length > 0 && (
          <div className="cap2-pa-khoi5-chart">
            {result.khoi5.series.map((d, i) => (
              <span
                key={`${d.ngay}-${i}`}
                className={cn("cap2-pa-khoi5-bar", `cap2-pa-khoi5-bar--${d.xepLoai}`)}
                style={{ height: `${Math.max(4, d.diem)}%` }}
                title={`${d.ngay}: ${d.diem}`}
              />
            ))}
          </div>
        )}
        <div className="cap2-pa-khoi5-avg-row">
          <div className="cap2-pa-khoi5-avg">
            <span className="cap2-pa-khoi5-avg-label">TB 7 ngày</span>
            <span className="cap2-pa-khoi5-avg-value" data-testid="cap2-pa-khoi5-avg7">
              {result.khoi5.avg7 ?? "—"}
            </span>
          </div>
          <div className="cap2-pa-khoi5-avg">
            <span className="cap2-pa-khoi5-avg-label">TB 30 ngày</span>
            <span className="cap2-pa-khoi5-avg-value" data-testid="cap2-pa-khoi5-avg30">
              {result.khoi5.avg30 ?? "—"}
            </span>
          </div>
        </div>
        <div className="cap2-pa-khoi5-dist">
          <span>
            <span className="cap2-pa-khoi5-dist-dot cap2-pa-khoi5-dist-dot--xanh" />
            Xanh <b>{result.khoi5.distribution.xanh}</b>
          </span>
          <span>
            <span className="cap2-pa-khoi5-dist-dot cap2-pa-khoi5-dist-dot--vang" />
            Vàng <b>{result.khoi5.distribution.vang}</b>
          </span>
          <span>
            <span className="cap2-pa-khoi5-dist-dot cap2-pa-khoi5-dist-dot--do" />
            Đỏ <b>{result.khoi5.distribution.do}</b>
          </span>
        </div>
        {result.khoi5.insufficientNote && (
          <p className="text-xs text-[var(--color-text-3)]">{result.khoi5.insufficientNote}</p>
        )}
      </div>

      {/* Khối 6 — phân loại vi phạm theo tuần */}
      <div className={CARD} data-testid="cap2-pa-khoi6">
        <div className={SECTION_HEADER}>{"PHÂN LOẠI VI PHẠM THEO TUẦN"}</div>
        <table className="cap2-pa-khoi6-table">
          <thead>
            <tr>
              <th>Tuần</th>
              <th>Cắt lỗ chậm</th>
              <th>Chốt lời hụt</th>
              <th>Bán sớm</th>
              <th>Nhồi lệnh</th>
            </tr>
          </thead>
          <tbody>
            {result.khoi6.weeks.map((week) => (
              <tr key={week.weekIndex}>
                <td>{`Tuần ${week.weekIndex + 1}`}</td>
                <td>{week.counts.cat_lo_cham}</td>
                <td>{week.counts.chot_loi_hut}</td>
                <td>{week.counts.ban_som_khi_lo}</td>
                <td>{week.counts.nhoi_lenh}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-[var(--color-text-2)]">{result.khoi6.trendNote}</p>
      </div>

      {/* Khối 7 — phát hiện từ ghi chú */}
      <div className={CARD} data-testid="cap2-pa-khoi7">
        <div className={SECTION_HEADER}>{"REFLECTION INSIGHTS · 4 TUẦN GẦN NHẤT"}</div>
        {result.khoi7.insufficientNote ? (
          <p className="text-xs text-[var(--color-text-3)]">{result.khoi7.insufficientNote}</p>
        ) : result.khoi7.insights.length > 0 ? (
          result.khoi7.insights.map((insight) => (
            <div key={insight.patternId} className="cap2-pa-khoi7-insight">
              <div className="text-[11px] font-semibold text-[var(--color-text-1)]">
                {PATTERN_LABEL[insight.patternId]}
              </div>
              <p>{insight.text}</p>
            </div>
          ))
        ) : (
          <p className="text-xs text-[var(--color-text-3)]">
            {"Không phát hiện mẫu nội tâm rõ rệt trong các ghi chú."}
          </p>
        )}
      </div>

      {/* Mẫu tự phát hiện — mẫu 1-3 (Cấp 1) + mẫu 9-12 (Cấp 2), tối đa 3 */}
      {result.mauPhatHien.length > 0 ? (
        <div className={CARD} data-testid="cap2-pa-mau">
          <div className={SECTION_HEADER}>{"MẪU TỰ PHÁT HIỆN"}</div>
          {result.mauPhatHien.map((mau) => (
            <p
              key={mau.id}
              className="text-xs text-[var(--color-text-1)]"
              data-testid={`cap2-pa-mau-${mau.id}`}
            >
              {mau.text}
            </p>
          ))}
        </div>
      ) : (
        result.mauInsufficientNote && (
          <div className={CARD} data-testid="cap2-pa-mau-empty">
            <div className={SECTION_HEADER}>{"MẪU TỰ PHÁT HIỆN"}</div>
            <p className="text-xs text-[var(--color-text-3)]">{result.mauInsufficientNote}</p>
          </div>
        )
      )}
    </div>
  )
}
