import { cn } from "@/shared/lib/cn"
import { computeCap1PortfolioAnalysis, type Khoi4Task, type ReasonRow } from "./portfolioAnalysis"
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

function fmtVndSigned(n: number): string {
  const rounded = Math.round(n)
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toLocaleString("en-US")} ₫`
}

const SECTION_HEADER =
  "text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--primary-6))]"
const CARD =
  "space-y-2 rounded-md border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-3"

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
      <div className={SECTION_HEADER}>{"HỒ SƠ NHÀ ĐẦU TƯ CỦA BẠN · Cấp 1 «Học việc»"}</div>
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
      <div className={SECTION_HEADER}>{"ĐỘ PHỦ 5 LÝ DO"}</div>
      <div className="flex flex-wrap gap-2 text-xs text-[var(--color-text-1)]">
        {LY_DO_OPTIONS.map((opt) => (
          <span key={opt.value}>
            {opt.icon} {coverage[opt.value] ? "✓" : "✗"}
          </span>
        ))}
      </div>
      <p className="text-xs text-[var(--color-text-2)]">{`→ Đã dùng ${usedCount}/5`}</p>
      <div className={cn(SECTION_HEADER, "mt-2")}>{"CHỌN LÝ DO CÓ CƠ SỞ"}</div>
      <p className="text-xs text-[var(--color-text-2)]">
        {`Lệnh có lý do ✅ Ủng hộ lúc đặt: ${ungHoCount}/${totalTrades} · Nhiệm vụ ④: ${Math.min(ungHoCount, 3)}/3${task4Done ? " ✓" : ""}`}
      </p>
    </div>
  )
}

/**
 * spec §7 Khối 4 bottom line ("Còn 2 lý do · 1 lần xem lại · 3 lệnh nữa để
 * lên Cấp 2.") — only mentions the 3 COUNT-based nhiệm vụ (③⑤⑥), plus ①②
 * by name if either isn't done yet. Deliberately worded differently from
 * each task's own `progressText` (e.g. "3 lệnh nữa" not "10 lệnh") so this
 * summary line never duplicates a task row's exact text.
 */
function khoi4SummaryLine(tasks: Khoi4Task[], progress: Cap1Progress | null): string | null {
  const done = (no: number) => tasks.find((t) => t.no === no)?.done ?? false
  const parts: string[] = []
  if (!done(1)) parts.push("① lệnh đầu có kế hoạch")
  if (!done(2)) parts.push("② kết sổ đầu tiên")
  const soLyDoRemain = Math.max(0, 5 - (progress?.so_ly_do_da_dung ?? 0))
  const soXemRemain = Math.max(0, 3 - (progress?.so_lan_xem_danh_muc ?? 0))
  const soLenhRemain = Math.max(0, 10 - (progress?.so_lenh_thuc_chien ?? 0))
  if (!done(3) && soLyDoRemain > 0) parts.push(`${soLyDoRemain} lý do`)
  if (!done(5) && soXemRemain > 0) parts.push(`${soXemRemain} lần xem lại`)
  if (!done(6) && soLenhRemain > 0) parts.push(`${soLenhRemain} lệnh nữa`)
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
      <div className={SECTION_HEADER}>{"6 NHIỆM VỤ CẤP 1"}</div>
      <p className="text-[9.5px] text-[var(--color-text-3)]">{`${tasksDone}/6`}</p>
      <ul className="space-y-1 text-xs text-[var(--color-text-1)]">
        {tasks.map((task) => (
          <li key={task.no} data-testid={`cap1-pa-task-${task.no}`}>
            {task.done ? "✅" : "🔲"} {`①②③④⑤⑥`[task.no - 1]} {task.label}
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
          <div className={SECTION_HEADER}>{"MẪU TỰ PHÁT HIỆN"}</div>
          {result.mauPhatHien.map((mau) => (
            <p key={mau.id} className="text-xs text-[var(--color-text-1)]">
              {mau.text}
            </p>
          ))}
        </div>
      ) : (
        result.mauInsufficientNote && (
          <div className={CARD}>
            <div className={SECTION_HEADER}>{"MẪU TỰ PHÁT HIỆN"}</div>
            <p className="text-xs text-[var(--color-text-3)]">{result.mauInsufficientNote}</p>
          </div>
        )
      )}
    </div>
  )
}
