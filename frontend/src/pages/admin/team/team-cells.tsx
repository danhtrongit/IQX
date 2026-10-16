import { Progress } from "@/components/ui/progress"
import { formatNumber } from "@/lib/format"
import { PnlPct } from "@/pages/admin/core/components/user-trading-insights"

import type { TeamAcademySummary, TeamPnl } from "./api"
import { ACADEMY_ALL_DONE_LABEL, ACADEMY_NOT_STARTED_LABEL, NOT_ACTIVATED_LABEL } from "./labels"

/** Lợi nhuận chỉ ở dạng %, xanh khi lãi, đỏ khi lỗ; chưa kích hoạt thì ghi rõ (§5.1.3). */
export function PnlCell({ value }: { value: TeamPnl }) {
  if (!value.activated) return <span className="text-muted-foreground">{NOT_ACTIVATED_LABEL}</span>
  return <PnlPct value={value.pnlPct} />
}

function percent(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0
}

/** Bài đang học kèm thanh tiến độ "x/T bài" (§5.1.3). */
export function AcademyProgressCell({ academy }: { academy: TeamAcademySummary }) {
  if (!academy.started) return <span className="text-muted-foreground">{ACADEMY_NOT_STARTED_LABEL}</span>
  const label = academy.allDone ? ACADEMY_ALL_DONE_LABEL : (academy.currentLessonLabel ?? "—")
  return (
    <div className="min-w-[12rem] max-w-[18rem] space-y-1">
      <p className="truncate text-sm" title={label}>
        {label}
      </p>
      <div className="flex items-center gap-2">
        <Progress
          value={percent(academy.completed, academy.total)}
          className="flex-1"
          aria-label={`Tiến độ Học viện: ${academy.completed}/${academy.total} bài`}
        />
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatNumber(academy.completed)}/{formatNumber(academy.total)} bài
        </span>
      </div>
    </div>
  )
}
