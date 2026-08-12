import { cn } from "@/shared/lib/cn"
import {
  CAP1_TOTAL_TASKS,
  computeCap1PortfolioAnalysis,
  type Khoi4Task,
  type MauPhatHien,
  type MauPhatHienId,
  type ReasonRow,
} from "./portfolioAnalysis"
import type { Cap1TradeRecord } from "./tradeLog"
import { LY_DO_OPTIONS, type Cap1Progress, type LyDo } from "./types"

export interface Cap1PortfolioAnalysisProps {
  progress: Cap1Progress | null
  trades: Cap1TradeRecord[]
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

/**
 * `+950,000đ` / `−50,000đ`. Ký hiệu tiền là `đ` dính liền số — ĐÚNG mockup và
 * đúng `cap0/DebriefModal.tsx#fmtVndSigned`; ` ₫` (glyph khác + dấu cách) đọc
 * như một đơn vị thứ hai trong cùng một sản phẩm. Dấu trừ là "−" (U+2212) chứ
 * không phải hyphen, cùng lý do đã ghi ở Cấp 0.
 */
function fmtVndSigned(n: number): string {
  const rounded = Math.round(n)
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toLocaleString("en-US")}đ`
}

const SECTION_HEADER =
  "text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--primary-6))]"
const CARD =
  "space-y-2 rounded-md border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-3"

/**
 * Tiêu đề 4 khối + khối mẫu — nguyên văn mockup `iqx-cap1-phantich-danhmuc.html`
 * (số khoanh tròn ①..④). Bản chữ của spec §7 ("HỒ SƠ NHÀ ĐẦU TƯ CỦA BẠN…",
 * "Lệnh có lý do ✅ Ủng hộ lúc đặt…") vẫn giữ NGUYÊN VĂN bên trong từng khối.
 */
const KHOI_TITLE = {
  khoi1: "① Hồ sơ tổng quan",
  khoi2: "② Thắng / thua theo 5 lý do",
  khoi3: "③ Độ phủ 5 lý do + Chọn lý do có cơ sở",
  khoi4: "④ Tiến trình 5 nhiệm vụ",
  mau: "🔍 Mẫu hệ thống phát hiện (về lý do)",
} as const

/** Icon + tên mẫu (spec §7 "Mẫu 1/2/3 — …") + biến thể màu (mockup `.pat.good` / `.pat.info`). */
const MAU_META: Record<MauPhatHienId, { icon: string; lead: string; variant: "good" | "info" }> = {
  vu_khi_rieng: { icon: "🎯", lead: "Vũ khí riêng", variant: "good" },
  diem_mu: { icon: "⚠", lead: "Điểm mù", variant: "info" },
  co_so_dang_gia: { icon: "✅", lead: "Cơ sở đáng giá", variant: "info" },
}

const MAU_VARIANT: Record<"good" | "info", string> = {
  good: "border-up/25 bg-up/[0.08]",
  info: "border-[rgb(var(--primary-6))]/30 bg-[rgb(var(--primary-6))]/10",
}

function MauRow({ mau }: { mau: MauPhatHien }) {
  const meta = MAU_META[mau.id]
  return (
    <div
      data-testid={`cap1-mau-${mau.id}`}
      className={cn("flex gap-2 rounded-md border p-2.5", MAU_VARIANT[meta.variant])}
    >
      <span className="text-[15px] leading-tight">{meta.icon}</span>
      <p className="text-[11px] leading-relaxed text-[var(--color-text-2)]">
        <b className="text-[var(--color-text-1)]">{meta.lead}</b>
        {" — "}
        {mau.text}
      </p>
    </div>
  )
}

function ReasonBadgeIcon({ badge }: { badge: ReasonRow["badge"] }) {
  if (!badge) return null
  return <span>{badge}</span>
}

function Khoi1({
  progress,
  khoi1,
}: {
  progress: Cap1Progress | null
  khoi1: ReturnType<typeof computeCap1PortfolioAnalysis>["khoi1"]
}) {
  return (
    <div className={CARD}>
      <div className={SECTION_HEADER}>{KHOI_TITLE.khoi1}</div>
      <p className="text-[10.5px] text-[var(--color-text-3)]">
        {"HỒ SƠ NHÀ ĐẦU TƯ CỦA BẠN · Cấp 1 «Học việc»"}
      </p>
      <p className="text-xs text-[var(--color-text-2)]">
        {`${khoi1.totalTrades} lệnh Thực chiến`}
        {progress ? ` · từ ${fmtDate(progress.entered_at)}` : null}
      </p>
      {khoi1.totalTrades > 0 ? (
        <>
          <p className="text-xs text-[var(--color-text-1)]">
            {`Tỷ lệ thắng: ${khoi1.winRate}% · ${khoi1.wins} lãi / ${khoi1.losses} lỗ`}
          </p>
          {khoi1.preferredLyDo && (
            <p className="text-xs text-[var(--color-text-1)]">
              {`Cách chọn ưa thích: ${lyDoIcon(khoi1.preferredLyDo)} ${lyDoLabel(khoi1.preferredLyDo)} (${khoi1.preferredLyDoCount} lần dùng)`}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-[var(--color-text-3)]">
          {"Chưa có lệnh Thực chiến nào đã đóng."}
        </p>
      )}
      <p className="text-[9.5px] italic text-[var(--color-text-3)]">
        {"(Cấp 1 chưa có chỉ số Kỷ luật — đó là chỉ số đầu bảng Cấp 2.)"}
      </p>
    </div>
  )
}

function Khoi2({ rows }: { rows: ReasonRow[] }) {
  return (
    <div className={CARD}>
      <div className={SECTION_HEADER}>{KHOI_TITLE.khoi2}</div>
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
          {rows.map((row) => (
            <tr key={row.lyDo} className="border-t border-[var(--color-border-2)]">
              <td className="py-1">
                {lyDoIcon(row.lyDo)} {lyDoLabel(row.lyDo)} <ReasonBadgeIcon badge={row.badge} />
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
  )
}

function Khoi2Hidden({ note }: { note: string }) {
  return (
    <div className={CARD}>
      <p className="text-xs text-[var(--color-text-3)]">{note}</p>
    </div>
  )
}

function Khoi3({
  coverage,
  usedCount,
  ungHoCount,
  task4Done,
  totalTrades,
}: {
  coverage: Record<LyDo, boolean>
  usedCount: number
  ungHoCount: number
  task4Done: boolean
  totalTrades: number
}) {
  return (
    <div className={CARD}>
      <div className={SECTION_HEADER}>{KHOI_TITLE.khoi3}</div>
      <div className="flex flex-wrap gap-2 text-xs text-[var(--color-text-1)]">
        {LY_DO_OPTIONS.map((opt) => (
          <span key={opt.value}>
            {opt.icon} {coverage[opt.value] ? "✓" : "✗"}
          </span>
        ))}
      </div>
      <p className="text-xs text-[var(--color-text-2)]">{`→ Đã dùng ${usedCount}/5`}</p>
      <p className="text-xs text-[var(--color-text-2)]">
        {`Lệnh có lý do ✅ Ủng hộ lúc đặt: ${ungHoCount}/${totalTrades} · Nhiệm vụ ④: ${Math.min(ungHoCount, 3)}/3${task4Done ? " ✓" : ""}`}
      </p>
    </div>
  )
}

/**
 * spec §7 Khối 4 bottom line ("Còn 2 lý do · 3 lệnh nữa để lên Cấp 2.") — only
 * mentions the 2 COUNT-based nhiệm vụ còn lại (③⑤), plus ①② by name if either
 * isn't done yet. Deliberately worded differently from each task's own
 * `progressText` (e.g. "3 lệnh nữa" not "10 lệnh") so this summary line never
 * duplicates a task row's exact text.
 *
 * ★ Vế "· 1 lần xem lại" đã đi cùng nhiệm vụ «Xem lại danh mục» bị bỏ — dòng
 * này không được đòi user một việc hành trình không còn tính nữa.
 */
function khoi4SummaryLine(tasks: Khoi4Task[], progress: Cap1Progress | null): string | null {
  const done = (no: number) => tasks.find((t) => t.no === no)?.done ?? false
  const parts: string[] = []
  if (!done(1)) parts.push("① lệnh đầu có kế hoạch")
  if (!done(2)) parts.push("② kết sổ đầu tiên")
  const soLyDoRemain = Math.max(0, 5 - (progress?.so_ly_do_da_dung ?? 0))
  const soLenhRemain = Math.max(0, 10 - (progress?.so_lenh_thuc_chien ?? 0))
  if (!done(3) && soLyDoRemain > 0) parts.push(`${soLyDoRemain} lý do`)
  if (!done(5) && soLenhRemain > 0) parts.push(`${soLenhRemain} lệnh nữa`)
  return parts.length > 0 ? `Còn ${parts.join(" · ")} để lên Cấp 2.` : null
}

function Khoi4({
  tasksDone,
  tasks,
  readyToGraduate,
  progress,
}: {
  tasksDone: number
  tasks: Khoi4Task[]
  readyToGraduate: boolean
  progress: Cap1Progress | null
}) {
  const summary = khoi4SummaryLine(tasks, progress)
  return (
    <div className={CARD}>
      <div className={SECTION_HEADER}>{KHOI_TITLE.khoi4}</div>
      <p className="text-[9.5px] text-[var(--color-text-3)]">{`${tasksDone}/${CAP1_TOTAL_TASKS}`}</p>
      <ul className="space-y-1 text-xs text-[var(--color-text-1)]">
        {tasks.map((task) => (
          <li key={task.no} data-testid={`cap1-pa-task-${task.no}`}>
            {task.done ? "✅" : "🔲"} {`①②③④⑤`[task.no - 1]} {task.label}
            {task.progressText ? ` (${task.progressText})` : null}
          </li>
        ))}
      </ul>
      {readyToGraduate ? (
        <p className="text-xs font-semibold text-up">
          {"🎉 Bạn ĐỦ điều kiện lên Cấp 2! Xem màn tốt nghiệp →"}
        </p>
      ) : (
        summary && <p className="text-xs text-[var(--color-text-2)]">{summary}</p>
      )}
    </div>
  )
}

/**
 * Trang Phân tích danh mục Cấp 1 (spec §7) — 4 khối + 3 mẫu tự phát hiện.
 * Fully presentational (mirrors `PortfolioReport`'s `injected` convention):
 * the real page/container composes this with `useCap1PortfolioAnalysis()`;
 * this component just renders `computeCap1PortfolioAnalysis(trades, progress)`.
 */
export function Cap1PortfolioAnalysis({ progress, trades }: Cap1PortfolioAnalysisProps) {
  const result = computeCap1PortfolioAnalysis(trades, progress)

  return (
    <div className="space-y-3">
      <Khoi1 progress={progress} khoi1={result.khoi1} />

      {result.hideKhoi2 ? (
        <Khoi2Hidden note={result.khoi2HiddenNote ?? ""} />
      ) : (
        <Khoi2 rows={result.khoi2} />
      )}

      <Khoi3
        coverage={result.khoi3.coverage}
        usedCount={result.khoi3.usedCount}
        ungHoCount={result.khoi3.ungHoCount}
        task4Done={result.khoi3.task4Done}
        totalTrades={progress?.so_lenh_thuc_chien ?? result.khoi1.totalTrades}
      />

      <Khoi4
        tasksDone={result.khoi4.tasksDone}
        tasks={result.khoi4.tasks}
        readyToGraduate={result.khoi4.readyToGraduate}
        progress={progress}
      />

      {result.mauPhatHien.length > 0 ? (
        <div className={CARD}>
          <div className={SECTION_HEADER}>{KHOI_TITLE.mau}</div>
          {result.mauPhatHien.map((mau) => (
            <MauRow key={mau.id} mau={mau} />
          ))}
        </div>
      ) : (
        result.mauInsufficientNote && (
          <div className={CARD}>
            <div className={SECTION_HEADER}>{KHOI_TITLE.mau}</div>
            <p className="text-xs text-[var(--color-text-3)]">{result.mauInsufficientNote}</p>
          </div>
        )
      )}
    </div>
  )
}
