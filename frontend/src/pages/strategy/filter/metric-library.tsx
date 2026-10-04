/**
 * Thư viện chỉ tiêu của Bộ lọc. Chỉ chỉ tiêu đã học và có nguồn dữ liệu mới
 * thêm được; chỉ tiêu chưa học hiện khoá kèm liên kết tới bài học, chỉ tiêu
 * chưa hỗ trợ hiện mờ kèm lý do.
 */
import { useMemo, useState } from "react"
import { Link } from "react-router"
import { Check, Lock, Plus, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"

import { isMetricAddable } from "./definition"
import type { ScreenerMetric } from "./types"

function MetricItem({
  metric,
  added,
  onAdd,
}: {
  metric: ScreenerMetric
  added: boolean
  onAdd: (metric: ScreenerMetric) => void
}) {
  const addable = isMetricAddable(metric)
  return (
    <li
      data-testid={`metric-${metric.id}`}
      className="rounded-md border border-border bg-background px-3 py-2"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-foreground">{metric.name}</div>
          <div className="mt-0.5 text-[10.5px] text-muted-foreground">
            {metric.unit} · {metric.period}
            {metric.applicability === "non_financial" ? " · phi tài chính" : ""}
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1 px-2 text-xs"
          disabled={!addable || added}
          onClick={addable && !added ? () => onAdd(metric) : undefined}
          aria-label={
            !addable ? `Thêm ${metric.name} (không khả dụng)` : added ? `${metric.name} (đã thêm)` : `Thêm ${metric.name}`
          }
        >
          {!addable ? <Lock className="size-3.5" /> : added ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
          {addable && added ? "Đã thêm" : "Thêm"}
        </Button>
      </div>
      {!metric.learned && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
            Chưa học
          </Badge>
          <Link to={`/hoc-vien/${encodeURIComponent(metric.lesson_id)}`} className="text-primary hover:underline">
            Học bài {metric.lesson_id} để mở khoá
          </Link>
        </div>
      )}
      {!metric.supported && (
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          <Badge variant="secondary" className="mr-1.5 h-4 px-1.5 text-[10px]">
            Chưa hỗ trợ
          </Badge>
          {metric.unsupported_reason ?? "Chưa có nguồn dữ liệu cho chỉ tiêu này."}
        </div>
      )}
    </li>
  )
}

export function MetricLibrary({
  metrics,
  addedIds,
  onAdd,
}: {
  metrics: ScreenerMetric[]
  addedIds: ReadonlySet<string>
  onAdd: (metric: ScreenerMetric) => void
}) {
  const [query, setQuery] = useState("")
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("vi-VN")
    const matched = needle
      ? metrics.filter(
          (metric) =>
            metric.name.toLocaleLowerCase("vi-VN").includes(needle) || metric.id.toLowerCase().includes(needle),
        )
      : metrics
    // Chỉ tiêu dùng được lên trước, giữ thứ tự registry trong từng nhóm.
    return [...matched.filter(isMetricAddable), ...matched.filter((metric) => !isMetricAddable(metric))]
  }, [metrics, query])
  const openCount = metrics.filter(isMetricAddable).length

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col overflow-hidden border-r border-border bg-card">
      <div className="shrink-0 border-b border-border p-3">
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Chỉ tiêu đã mở · {openCount}/{metrics.length}
        </div>
        <div className="relative mt-2">
          <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm chỉ tiêu…"
            aria-label="Tìm chỉ tiêu"
            className="pl-7 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {visible.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">Chưa có chỉ tiêu phù hợp.</div>
        ) : (
          <ul className="space-y-2 p-3" aria-label="Thư viện chỉ tiêu">
            {visible.map((metric) => (
              <MetricItem key={metric.id} metric={metric} added={addedIds.has(metric.id)} onAdd={onAdd} />
            ))}
          </ul>
        )}
      </ScrollArea>
    </aside>
  )
}
