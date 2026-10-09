import { Button } from "@/components/ui/button"

import { DialogShell } from "../shared/dialog-shell"
import { isMetricUsable, metricChapter } from "./definition"
import type { ScreenerMetric } from "./types"

function stateOf(metric: ScreenerMetric): { text: string; tone: string; reason: string | null } {
  if (!metric.learned) return { text: `Chưa mở · học bài ${metric.lesson_id}`, tone: "text-muted-foreground", reason: null }
  if (!isMetricUsable(metric)) {
    return {
      text: metric.readiness === "data_unavailable" ? "Chưa có nguồn dữ liệu" : "Chờ định nghĩa",
      tone: "text-price-ref",
      reason: metric.unsupported_reason,
    }
  }
  return { text: "Dùng được", tone: "text-price-up", reason: null }
}

/**
 * "Danh mục 42 chỉ tiêu": the names of all 42 lessons with what is missing for each. A metric is
 * usable only when its lesson is passed and the repo can compute it; nothing is filled in from the name.
 */
export function CatalogDialog({ metrics, onClose }: { metrics: readonly ScreenerMetric[]; onClose: () => void }) {
  const usable = metrics.filter(isMetricUsable).length
  return (
    <DialogShell
      title={`Danh mục ${metrics.length} chỉ tiêu`}
      description={`${usable} chỉ tiêu dùng được. Chỉ tiêu chỉ dùng khi đã hoàn thành bài học và đã có định nghĩa, nguồn dữ liệu thật; không tự điền công thức từ tên bài.`}
      onClose={onClose}
      footer={<Button type="button" variant="outline" onClick={onClose}>Đóng</Button>}
    >
      <ul className="divide-y divide-border rounded-md border border-border" aria-label="Danh mục chỉ tiêu">
        {metrics.map((metric) => {
          const state = stateOf(metric)
          return (
            <li key={metric.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 py-2.5" data-testid={`catalog-${metric.id}`}>
              <div className="min-w-0">
                <div className="text-sm font-medium break-words">{metric.name}</div>
                <div className="text-[11px] text-muted-foreground">Chương {metricChapter(metric)} · {metric.lesson_id}</div>
                {state.reason && <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{state.reason}</div>}
              </div>
              <span className={`text-xs font-medium ${state.tone}`}>{state.text}</span>
            </li>
          )
        })}
      </ul>
    </DialogShell>
  )
}
