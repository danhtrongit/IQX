import { useMemo, useState } from "react"
import { Check, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"

import { LibraryHead, LibraryShell } from "../shared/library-shell"
import { matchesQuery } from "../shared/library-utils"
import { isMetricUsable, metricChapter } from "./definition"
import type { MetricId, ScreenerMetric } from "./types"

/**
 * Left library of the Bộ lọc: only the metrics whose lesson is passed. Usable ones can be added;
 * a learned metric the repo cannot compute yet is listed as unavailable with the server's reason.
 * The full list of 42 is in "Danh mục 42 chỉ tiêu".
 */
export function MetricLibrary({
  metrics,
  addedIds,
  open,
  onOpenChange,
  onAdd,
  onOpenCatalog,
}: {
  metrics: readonly ScreenerMetric[]
  addedIds: ReadonlySet<MetricId>
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (metric: ScreenerMetric) => void
  onOpenCatalog: () => void
}) {
  const [query, setQuery] = useState("")
  const learned = useMemo(() => metrics.filter((metric) => metric.learned), [metrics])
  const usableCount = learned.filter(isMetricUsable).length
  const groups = useMemo(() => {
    const visible = learned.filter((metric) => matchesQuery(metric.name, query))
    const byChapter = new Map<number, ScreenerMetric[]>()
    for (const metric of visible) byChapter.set(metricChapter(metric), [...(byChapter.get(metricChapter(metric)) ?? []), metric])
    return [...byChapter.entries()].sort(([a], [b]) => a - b)
  }, [learned, query])

  return (
    <LibraryShell label="Thư viện chỉ tiêu" open={open} onOpenChange={onOpenChange}>
      <LibraryHead title="Chỉ tiêu đã mở" count={usableCount} searchLabel="Tìm chỉ tiêu" placeholder="Tìm chỉ tiêu…" query={query} onQuery={setQuery} />

      {learned.length === 0 ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Chưa có chỉ tiêu nào được mở. Hoàn thành bài học chỉ tiêu cơ bản trong Học viện để dùng trong Bộ lọc.
        </p>
      ) : groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">Không có chỉ tiêu phù hợp.</p>
      ) : (
        groups.map(([chapter, items]) => (
          <section key={chapter} aria-label={`Chương ${chapter}`} className="space-y-1.5">
            <h3 className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Chương {chapter}</h3>
            <ul className="space-y-1.5">
              {items.map((metric) => {
                const usable = isMetricUsable(metric)
                const added = addedIds.has(metric.id)
                return (
                  <li
                    key={metric.id}
                    data-testid={`metric-${metric.id}`}
                    className={`flex items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-3 py-2.5 ${usable ? "" : "opacity-70"}`}
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold break-words">{metric.name}</div>
                      {!usable && (
                        <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                          Chưa dùng được: {metric.unsupported_reason ?? "chưa có định nghĩa hoặc nguồn dữ liệu"}
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant={added ? "secondary" : "outline"}
                      size="icon-sm"
                      disabled={!usable || added}
                      aria-label={added ? `${metric.name} đã có trong điều kiện` : `Thêm ${metric.name} vào điều kiện lọc`}
                      onClick={() => { onAdd(metric); onOpenChange(false) }}
                    >
                      {added ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                    </Button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}

      <Button type="button" variant="ghost" className="mt-auto w-full" onClick={onOpenCatalog}>
        Danh mục 42 chỉ tiêu
      </Button>
    </LibraryShell>
  )
}
