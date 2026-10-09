/**
 * Results of one stored run. Every page comes from the stored result (same `as_of` on all pages), so
 * paging, saving and applying all refer to the same figures. Selecting symbols is optional: with no
 * individual selection, the actions cover every company that passed, on every page.
 */
import { useId } from "react"
import { Link } from "react-router"
import { ChevronLeft, ChevronRight, Info } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"

import { ErrorLine } from "../shared/controls"
import { errorMessage } from "../shared/errors"
import { fmtDateTime } from "../shared/format"
import { RESULT_PAGE_SIZE } from "./api"
import { periodLabel } from "./definition"
import type { MetricId, ResultHeader, ResultPage, ResultRow, ScreenerMetric } from "./types"
import { cellView } from "./units"

const TH = "px-3 py-2.5 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase"

type Column = { metric: ScreenerMetric; period: ScreenerMetric["default_period"]; role: "condition" | "reference" }

function columnsOf(header: ResultHeader, metrics: readonly ScreenerMetric[]): Column[] {
  const byId = new Map(metrics.map((metric) => [metric.id, metric]))
  const conditions = header.definition.rules.flatMap((rule) => {
    const metric = byId.get(rule.metric_id)
    return metric ? [{ metric, period: rule.period, role: "condition" as const }] : []
  })
  const references = (header.definition.columns ?? []).flatMap((column) => {
    const metric = byId.get(column.metric_id)
    return metric ? [{ metric, period: column.period, role: "reference" as const }] : []
  })
  return [...conditions, ...references]
}

function rowState(row: ResultRow, required: readonly MetricId[]): { label: string; tone: string } {
  if (row.passed) return { label: "Đạt", tone: "text-price-up" }
  const exception = required.some((id) => (row.metrics[id]?.status ?? "missing") !== "ok")
  return exception ? { label: "Thiếu dữ liệu", tone: "text-price-ref" } : { label: "Không đạt", tone: "text-muted-foreground" }
}

export function ResultsPanel({
  header,
  page,
  loading,
  error,
  onRetry,
  metrics,
  pageIndex,
  onPage,
  showAll,
  onShowAll,
  selection,
  onSelection,
  stale,
  busy,
  onSaveList,
  onSaveResult,
  onApply,
  onCell,
  onQuality,
}: {
  header: ResultHeader
  page: ResultPage | undefined
  loading: boolean
  error: unknown
  onRetry: () => void
  metrics: readonly ScreenerMetric[]
  pageIndex: number
  onPage: (page: number) => void
  showAll: boolean
  onShowAll: (value: boolean) => void
  selection: ReadonlySet<string>
  onSelection: (selection: Set<string>) => void
  /** The conditions on screen differ from the ones this result was run with. */
  stale: boolean
  busy: boolean
  onSaveList: () => void
  onSaveResult: () => void
  onApply: () => void
  onCell: (row: ResultRow, metric: ScreenerMetric) => void
  onQuality: () => void
}) {
  const baseId = useId()
  const columns = columnsOf(header, metrics)
  const required = header.definition.rules.map((rule) => rule.metric_id)
  const rows = page?.results ?? []
  const total = page?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / RESULT_PAGE_SIZE))
  const passed = header.counts.passed
  const allOnPage = rows.length > 0 && rows.every((row) => selection.has(row.symbol))
  const selectable = rows.filter((row) => row.passed)

  function toggle(symbol: string, checked: boolean) {
    const next = new Set(selection)
    if (checked) next.add(symbol)
    else next.delete(symbol)
    onSelection(next)
  }

  function togglePage(checked: boolean) {
    const next = new Set(selection)
    for (const row of selectable) {
      if (checked) next.add(row.symbol)
      else next.delete(row.symbol)
    }
    onSelection(next)
  }

  const selectedCount = selection.size
  const scopeText =
    selectedCount > 0
      ? `Đã chọn ${selectedCount} mã. Lưu và áp dụng dùng đúng các mã này.`
      : passed > 0
        ? `Chưa chọn riêng: Lưu và áp dụng dùng toàn bộ ${passed} mã đạt, kể cả các trang khác.`
        : "Chưa có mã nào đạt điều kiện để lưu hoặc áp dụng."
  const noneToSave = passed === 0

  return (
    <section className="rounded-lg border border-border bg-card" aria-label="Kết quả sàng lọc">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 font-heading text-base font-bold">
            Kết quả sàng lọc
            <Badge variant="secondary" data-testid="passed-count">{passed} doanh nghiệp</Badge>
            {stale && <Badge variant="outline" className="border-price-ref/50 text-price-ref">Điều kiện đã đổi · cần lọc lại</Badge>}
          </h2>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Báo cáo mới nhất đã công bố <span aria-hidden="true">·</span> Mốc dữ liệu: {fmtDateTime(header.as_of)} <span aria-hidden="true">·</span> Nguồn {header.data_source}
          </p>
          <p className="mt-1 text-xs text-muted-foreground" data-testid="result-counts">
            {header.counts.universe} doanh nghiệp trong phạm vi · {header.counts.passed} đạt · {header.counts.failed_threshold} không đạt ngưỡng · {header.counts.with_required_exceptions} có điều kiện không tính được
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={busy || noneToSave} onClick={onSaveList}>Lưu danh mục</Button>
          <Button type="button" variant="outline" disabled={busy || noneToSave} onClick={onSaveResult}>Lưu kết quả</Button>
          <Button type="button" disabled={busy || noneToSave} onClick={onApply}>Áp dụng cho Bot</Button>
        </div>
      </div>

      {header.universe_truncated && (
        <p role="status" className="mx-4 mb-3 rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          Phạm vi có nhiều doanh nghiệp hơn giới hạn của một lần lọc, chỉ phần đầu danh sách được xét. Thu hẹp thị trường hoặc ngành để xét đủ.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border px-4 py-2 text-xs">
        <label className="flex items-center gap-2 text-muted-foreground">
          <Checkbox checked={showAll} onCheckedChange={(checked) => onShowAll(checked === true)} aria-label="Hiện cả doanh nghiệp không đạt" />
          Hiện cả doanh nghiệp không đạt
        </label>
        <span className="text-muted-foreground" data-testid="selection-line">{scopeText}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm" aria-label="Kết quả sàng lọc doanh nghiệp">
          <thead className="border-b border-border bg-muted/30">
            <tr>
              <th scope="col" className="w-9 px-3 py-2.5">
                <Checkbox
                  checked={allOnPage && selectable.length > 0}
                  disabled={selectable.length === 0}
                  onCheckedChange={(checked) => togglePage(checked === true)}
                  aria-label="Chọn tất cả mã đạt trong trang này"
                />
              </th>
              <th scope="col" className={`${TH} text-left`}>Mã</th>
              <th scope="col" className={`${TH} text-left`}>Doanh nghiệp</th>
              <th scope="col" className={`${TH} text-left`}>Ngành</th>
              {columns.map(({ metric, period, role }) => (
                <th
                  key={metric.id}
                  scope="col"
                  className={`${TH} text-right ${role === "condition" ? "bg-primary/5 text-primary" : ""}`}
                  data-testid={`head-${metric.id}`}
                >
                  {metric.name} {metric.unit ? `(${metric.unit})` : ""}
                  <span className="mt-0.5 block font-normal tracking-normal normal-case">{periodLabel(metric, period)}</span>
                </th>
              ))}
              {showAll && <th scope="col" className={`${TH} text-left`}>Điều kiện</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              [0, 1, 2].map((row) => <tr key={row}><td colSpan={5 + columns.length} className="p-3"><Skeleton className="h-8 w-full" /></td></tr>)
            ) : error ? (
              <tr><td colSpan={5 + columns.length} className="space-y-2 p-4">
                <ErrorLine>{errorMessage(error)}</ErrorLine>
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>Thử lại</Button>
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5 + columns.length} className="px-4 py-8 text-center text-xs leading-5 text-muted-foreground">
                {header.counts.with_required_exceptions > 0 && passed === 0
                  ? "Không có doanh nghiệp nào đạt. Một số doanh nghiệp chưa đủ dữ liệu cho điều kiện đang chọn, xem chi tiết bên dưới."
                  : "Không có doanh nghiệp nào đạt tất cả điều kiện."}
              </td></tr>
            ) : (
              rows.map((row) => {
                const state = rowState(row, required)
                return (
                  <tr key={row.symbol} data-testid={`row-${row.symbol}`}>
                    <td className="px-3 py-2.5">
                      <Checkbox
                        id={`${baseId}-${row.symbol}`}
                        checked={selection.has(row.symbol)}
                        disabled={!row.passed}
                        onCheckedChange={(checked) => toggle(row.symbol, checked === true)}
                        aria-label={`Chọn ${row.symbol}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-bold">
                      <Link
                        to={`/chien-luoc?tab=backtest&symbol=${encodeURIComponent(row.symbol)}`}
                        className="text-primary hover:underline"
                        aria-label={`Backtest ${row.symbol}`}
                      >
                        {row.symbol}
                      </Link>
                    </td>
                    <td className="max-w-[220px] px-3 py-2.5 break-words">{row.name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.sector ?? "—"}</td>
                    {columns.map(({ metric, role }) => {
                      const view = cellView(row.metrics[metric.id], metric.api_unit)
                      return (
                        <td key={metric.id} className={`px-3 py-2 text-right ${role === "condition" ? "bg-primary/5" : ""}`}>
                          <button
                            type="button"
                            title={view.title ?? undefined}
                            aria-label={`${row.symbol} · ${metric.name}: ${view.ok ? view.text : view.caption}. Xem nguồn và kỳ tính`}
                            className="inline-flex flex-col items-end rounded-sm px-1 py-0.5 text-right hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                            onClick={() => onCell(row, metric)}
                          >
                            <span className={`font-semibold tabular-nums ${view.ok ? "" : "text-muted-foreground"}`}>{view.text}</span>
                            <span className="text-[11px] font-normal text-muted-foreground">{view.caption}</span>
                          </button>
                        </td>
                      )
                    })}
                    {showAll && <td className={`px-3 py-2.5 text-xs font-medium ${state.tone}`}>{state.label}</td>}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {header.counts.with_required_exceptions > 0 && (
        <p className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <Info aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
          {header.counts.with_required_exceptions} doanh nghiệp thiếu dữ liệu hoặc có chỉ tiêu không áp dụng ở điều kiện đang chọn.
          <Button type="button" variant="link" size="xs" className="ml-auto h-auto p-0" onClick={onQuality}>Xem chi tiết</Button>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span>
          {total > 0 ? `Hiển thị từ ${pageIndex * RESULT_PAGE_SIZE + 1} đến ${Math.min(total, (pageIndex + 1) * RESULT_PAGE_SIZE)} trên ${total} doanh nghiệp. ` : ""}
          Bấm số liệu để xem kỳ báo cáo và nguồn. Đơn vị theo tiêu đề cột.
        </span>
        {pages > 1 && (
          <span className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon-sm" aria-label="Trang trước" disabled={pageIndex === 0} onClick={() => onPage(pageIndex - 1)}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <span className="px-1 tabular-nums">Trang {pageIndex + 1}/{pages}</span>
            <Button type="button" variant="outline" size="icon-sm" aria-label="Trang sau" disabled={pageIndex + 1 >= pages} onClick={() => onPage(pageIndex + 1)}>
              <ChevronRight aria-hidden="true" />
            </Button>
          </span>
        )}
      </div>
    </section>
  )
}
