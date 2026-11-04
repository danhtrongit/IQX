import { useMemo, useState } from "react"
import { Check, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { TechnicalRegistry } from "@/pages/demo-trading/bot/config/types"

import { ErrorLine } from "../shared/controls"
import { errorMessage } from "../shared/errors"
import { LibraryHead, LibraryShell } from "../shared/library-shell"
import { matchesQuery } from "../shared/library-utils"
import { isMetricUsable } from "./definition"
import { libraryBlocks, metricName } from "./metric-names"
import { technicalLibrary } from "./technical"
import type { MetricId, ScreenerMetric } from "./types"

type LibraryTab = "basic" | "technical"

const NOTE = "text-[11px] leading-4 text-muted-foreground"

/**
 * Left library of the Bộ lọc, two tabs. Cơ bản lists the metrics the account can use, in the order, groups
 * and names of the Dashboard phân tích cơ bản (first level groups per Học viện v4.1 §6.2, never a chapter name,
 * no "Đã mở" label); Kỹ thuật lists the 16 indicators of the Bot, each added once ("+" becomes ✓). Adding closes
 * the drawer on narrow screens. The full list of 42 metrics, with what each is missing, is in "Danh mục 42 chỉ tiêu".
 */
export function MetricLibrary({
  metrics,
  addedIds,
  technicalIds,
  registry,
  registryLoading,
  registryError,
  onRetryRegistry,
  open,
  onOpenChange,
  onAdd,
  onAddTechnical,
  onOpenCatalog,
}: {
  metrics: readonly ScreenerMetric[]
  addedIds: ReadonlySet<MetricId>
  /** Indicators that already have a card. */
  technicalIds: ReadonlySet<string>
  registry: TechnicalRegistry | undefined
  registryLoading: boolean
  registryError: unknown
  onRetryRegistry: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (metric: ScreenerMetric) => void
  onAddTechnical: (indicatorId: string) => void
  onOpenCatalog: () => void
}) {
  const [tab, setTab] = useState<LibraryTab>("basic")
  const [query, setQuery] = useState("")
  const learned = useMemo(() => metrics.filter((metric) => metric.learned), [metrics])
  const usableCount = learned.filter(isMetricUsable).length
  const blocks = useMemo(() => libraryBlocks(learned, query), [learned, query])
  const groups = useMemo(
    () => technicalLibrary(registry).map((group) => ({ ...group, indicators: group.indicators.filter((indicator) => matchesQuery(indicator.name, query)) })).filter((group) => group.indicators.length > 0),
    [registry, query],
  )
  const technicalCount = technicalLibrary(registry).reduce((sum, group) => sum + group.indicators.length, 0)

  return (
    <LibraryShell label="Thư viện chỉ tiêu" open={open} onOpenChange={onOpenChange}>
      <Tabs value={tab} onValueChange={(value) => setTab(value as LibraryTab)} className="gap-3">
        <TabsList aria-label="Nhóm thư viện" className="w-full">
          <TabsTrigger value="basic">Cơ bản</TabsTrigger>
          <TabsTrigger value="technical">Kỹ thuật</TabsTrigger>
        </TabsList>
        <LibraryHead
          title={tab === "basic" ? "Chỉ tiêu" : "Chỉ báo kỹ thuật"}
          count={tab === "basic" ? usableCount : technicalCount}
          searchLabel="Tìm trong thư viện"
          placeholder={tab === "basic" ? "Tìm chỉ tiêu…" : "Tìm chỉ báo…"}
          query={query}
          onQuery={setQuery}
        />

        <TabsContent value="basic" className="space-y-4">
          {learned.length === 0 ? (
            <p className="text-xs leading-5 text-muted-foreground">Chưa có chỉ tiêu nào để dùng trong Bộ lọc.</p>
          ) : blocks.length === 0 ? (
            <p className="text-xs text-muted-foreground">Không có chỉ tiêu phù hợp.</p>
          ) : (
            blocks.map((block) => (
              <section key={block.title} aria-label={block.title} className="space-y-2">
                <h3 className="border-b border-border pb-1 text-[11px] font-bold tracking-wide text-foreground uppercase">{block.title}</h3>
                {block.groups.map((group) => (
                  <div key={group.title ?? block.title} className="space-y-1.5">
                    {group.title && <h4 className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{group.title}</h4>}
                    <ul className="space-y-1.5">
                      {group.metrics.map((metric) => {
                        const usable = isMetricUsable(metric)
                        const added = addedIds.has(metric.id)
                        const name = metricName(metric)
                        return (
                          <li
                            key={metric.id}
                            data-testid={`metric-${metric.id}`}
                            className={`flex items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-3 py-2.5 ${usable ? "" : "opacity-70"}`}
                          >
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold break-words">{name}</div>
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
                              aria-label={added ? `${name} đã có trong điều kiện` : `Thêm ${name} vào điều kiện lọc`}
                              onClick={() => { onAdd(metric); onOpenChange(false) }}
                            >
                              {added ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                            </Button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </section>
            ))
          )}
          <p className={NOTE}>Thứ tự và nhóm giống Dashboard phân tích cơ bản. Thị trường luôn nằm đầu khối Cơ bản.</p>
          <Button type="button" variant="ghost" className="w-full" onClick={onOpenCatalog}>
            Danh mục 42 chỉ tiêu
          </Button>
        </TabsContent>

        <TabsContent value="technical" className="space-y-4">
          {registryError ? (
            <div className="space-y-2">
              <ErrorLine>{`Không tải được danh mục chỉ báo: ${errorMessage(registryError)}`}</ErrorLine>
              <Button type="button" variant="outline" size="sm" onClick={onRetryRegistry}>Thử lại</Button>
            </div>
          ) : registryLoading || !registry ? (
            <Skeleton className="h-24 w-full" aria-label="Đang tải danh mục chỉ báo" />
          ) : groups.length === 0 ? (
            <p className="text-xs text-muted-foreground">Không có chỉ báo phù hợp.</p>
          ) : (
            groups.map((group) => (
              <section key={group.title} aria-label={group.title} className="space-y-1.5">
                <h4 className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{group.title}</h4>
                <ul className="space-y-1.5">
                  {group.indicators.map((indicator) => {
                    const added = technicalIds.has(indicator.id)
                    return (
                      <li key={indicator.id} data-testid={`indicator-${indicator.id}`} className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-3 py-2.5">
                        <div className="min-w-0 text-[13px] font-semibold break-words">{indicator.name}</div>
                        <Button
                          type="button"
                          variant={added ? "secondary" : "outline"}
                          size="icon-sm"
                          disabled={added}
                          aria-label={added ? `${indicator.name} đã có trong điều kiện kỹ thuật` : `Thêm ${indicator.name} vào điều kiện kỹ thuật`}
                          onClick={() => { onAddTechnical(indicator.id); onOpenChange(false) }}
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
          <p className={NOTE}>Điều kiện giống hệt Bot và Backtest: cùng dòng, cùng cách tính.</p>
        </TabsContent>
      </Tabs>
    </LibraryShell>
  )
}
