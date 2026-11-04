/**
 * Results of one stored run. Every page comes from the stored result (same `as_of` and the same session
 * T on all pages), so paging, sorting, saving and applying all refer to the same figures. Sorting is done
 * by the server on the WHOLE result before it is cut into pages. Selecting symbols is optional: with no
 * individual selection, the actions cover every company that passed, on every page.
 */
import { useId } from "react"
import { Link } from "react-router"
import { ChevronLeft, ChevronRight, Info } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import { ErrorLine } from "../shared/controls"
import { errorMessage } from "../shared/errors"
import { fmtDate, fmtDateTime, toneClass } from "../shared/format"
import { RESULT_PAGE_SIZE } from "./api"
import { periodLabel } from "./definition"
import { BASKET_OPTIONS, GROUP_LABEL } from "./market"
import { metricName } from "./metric-names"
import { sessionCaption, technicalCellView } from "./technical-cell"
import type { MetricId, ResultHeader, ResultPage, ResultRow, ScreenerMetric, SortState, TechnicalQuality } from "./types"
import { cellView, formatFixed, formatSigned } from "./units"

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
  const technicalException = Object.values(row.technical ?? {}).some((cell) => cell.status !== "ok")
  // A company that failed Thị trường or Kỹ thuật never reached the fundamental step: that is not a data gap.
  const reachedFundamentals = Object.keys(row.metrics).length > 0
  const fundamentalException = reachedFundamentals && required.some((id) => (row.metrics[id]?.status ?? "missing") !== "ok")
  return technicalException || fundamentalException ? { label: "Thiếu dữ liệu", tone: "text-price-ref" } : { label: "Không đạt", tone: "text-muted-foreground" }
}

function SortHead({
  id,
  sort,
  onSort,
  className,
  testId,
  children,
}: {
  id: string
  sort: SortState
  onSort: (key: string) => void
  className?: string
  testId?: string
  children: React.ReactNode
}) {
  const active = sort.key === id
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.order === "asc" ? "ascending" : "descending") : "none"}
      className={cn(TH, className)}
      data-testid={testId}
    >
      <button
        type="button"
        className={cn(
          "inline-flex max-w-full flex-col rounded-sm px-1 py-0.5 uppercase hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          className?.includes("text-right") ? "items-end text-right" : "items-start text-left",
          active && "text-foreground",
        )}
        onClick={() => onSort(id)}
      >
        {children}
      </button>
    </th>
  )
}

const Title = ({ children, active, order }: { children: React.ReactNode; active: boolean; order: "asc" | "desc" }) => (
  <span>
    {children}
    {active && <span aria-hidden="true" className="ml-1 text-primary">{order === "asc" ? "▲" : "▼"}</span>}
  </span>
)

const SubLine = ({ children }: { children: React.ReactNode }) => (
  <span className="mt-0.5 block font-normal tracking-normal normal-case">{children}</span>
)

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
  sort,
  onSort,
  stale,
  busy,
  onSaveList,
  onSaveResult,
  onApply,
  onCell,
  onTechnicalCell,
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
  sort: SortState
  /** Called with a column key; the caller decides the direction (see `nextSort`) and goes back to page 1. */
  onSort: (key: string) => void
  /** The conditions on screen differ from the ones this result was run with. */
  stale: boolean
  busy: boolean
  onSaveList: () => void
  onSaveResult: () => void
  onApply: () => void
  onCell: (row: ResultRow, metric: ScreenerMetric) => void
  onTechnicalCell: (row: ResultRow, column: TechnicalQuality) => void
  onQuality: () => void
}) {
  const baseId = useId()
  const columns = columnsOf(header, metrics)
  const technical = header.data_quality.technical
  const required = header.definition.rules.map((rule) => rule.metric_id)
  const rows = page?.results ?? []
  const total = page?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / RESULT_PAGE_SIZE))
  const passed = header.counts.passed
  const allOnPage = rows.length > 0 && rows.every((row) => selection.has(row.symbol))
  const selectable = rows.filter((row) => row.passed)
  const averageSessions = header.definition.market.avg_value.sessions
  const session = sessionCaption(header.session_date)
  const colCount = 9 + columns.length + technical.length + (showAll ? 1 : 0)
  const unavailableBaskets = header.data_quality.market.baskets_unavailable
  const basketLabels = unavailableBaskets.map((code) => BASKET_OPTIONS.find((option) => option.value === code)?.label ?? code).join(", ")

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
  const head = (key: string) => ({ id: key, sort, onSort })
  const title = (key: string, text: React.ReactNode) => <Title active={sort.key === key} order={sort.order}>{text}</Title>

  return (
    <section className="rounded-lg border border-border bg-card" aria-label="Kết quả sàng lọc">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 font-heading text-base font-bold">
            Kết quả sàng lọc
            <Badge variant="secondary" data-testid="passed-count">{passed} doanh nghiệp</Badge>
            {stale && <Badge variant="outline" className="border-price-ref/50 text-price-ref">Điều kiện đã đổi · cần lọc lại</Badge>}
          </h2>
          <p className="mt-1.5 text-xs text-muted-foreground" data-testid="result-fundamental-line">
            Cơ bản: báo cáo mới nhất đã công bố <span aria-hidden="true">·</span> Mốc dữ liệu: {fmtDateTime(header.as_of)} <span aria-hidden="true">·</span> Nguồn {header.data_source}
          </p>
          {header.session_date && (
            <p className="mt-1 text-xs text-muted-foreground" data-testid="result-session-line">
              Thị trường và kỹ thuật: phiên đã đóng cửa {fmtDate(header.session_date)}
            </p>
          )}
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
        <p role="status" className="mx-4 mb-3 rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground" data-testid="truncated-note">
          Sau lọc thị trường và kỹ thuật còn {header.fundamental_candidates ?? "nhiều"} doanh nghiệp, nhiều hơn giới hạn tính chỉ tiêu cơ bản của một lần lọc. Thu hẹp điều kiện để xét đủ.
        </p>
      )}
      {unavailableBaskets.length > 0 && (
        <p role="status" className="mx-4 mb-3 rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground" data-testid="baskets-note">
          Chưa có dữ liệu thành phần của rổ {basketLabels}{header.session_date ? ` tại phiên ${fmtDate(header.session_date)}` : ""}, nên chưa có mã nào được tính theo rổ này. Hãy thử lại sau khi dữ liệu rổ được cập nhật.
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
        <table className="w-full min-w-[1080px] border-collapse text-sm" aria-label="Kết quả sàng lọc doanh nghiệp">
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
              <SortHead {...head("symbol")} className="text-left" testId="head-symbol">{title("symbol", "Mã")}</SortHead>
              <SortHead {...head("name")} className="text-left" testId="head-name">{title("name", "Doanh nghiệp")}</SortHead>
              <SortHead {...head("exchange")} className="text-left" testId="head-exchange">{title("exchange", "Sàn")}</SortHead>
              <SortHead {...head("group")} className="text-left" testId="head-group">{title("group", "Ngành")}</SortHead>
              <SortHead {...head("price")} className="text-right" testId="head-price">{title("price", "Giá")}<SubLine>(nghìn đ)</SubLine></SortHead>
              <SortHead {...head("change_pct")} className="text-right" testId="head-change_pct">{title("change_pct", "+/− %")}</SortHead>
              <SortHead {...head("market_cap")} className="text-right" testId="head-market_cap">{title("market_cap", "Vốn hóa")}<SubLine>(tỷ đ)</SubLine></SortHead>
              <SortHead {...head("avg_value")} className="text-right" testId="head-avg_value">{title("avg_value", `GTGD TB${averageSessions}`)}<SubLine>(tỷ đ)</SubLine></SortHead>
              {columns.map(({ metric, period, role }) => (
                <SortHead
                  key={metric.id}
                  {...head(`metric:${metric.id}`)}
                  className={`text-right ${role === "condition" ? "bg-primary/5 text-primary" : ""}`}
                  testId={`head-${metric.id}`}
                >
                  {title(`metric:${metric.id}`, `${metricName(metric)} ${metric.unit ? `(${metric.unit})` : ""}`)}
                  <SubLine>{periodLabel(metric, period)}</SubLine>
                </SortHead>
              ))}
              {technical.map((column) => (
                <SortHead key={column.key} {...head(`tech:${column.key}`)} className="text-right bg-primary/5 text-primary" testId={`head-tech-${column.key}`}>
                  {title(`tech:${column.key}`, column.label)}
                  {session && <SubLine>{session}</SubLine>}
                </SortHead>
              ))}
              {showAll && <th scope="col" className={`${TH} text-left`}>Điều kiện</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              [0, 1, 2].map((row) => <tr key={row}><td colSpan={colCount} className="p-3"><Skeleton className="h-8 w-full" /></td></tr>)
            ) : error ? (
              <tr><td colSpan={colCount} className="space-y-2 p-4">
                <ErrorLine>{errorMessage(error)}</ErrorLine>
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>Thử lại</Button>
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={colCount} className="px-4 py-8 text-center text-xs leading-5 text-muted-foreground">
                {header.counts.with_required_exceptions > 0 && passed === 0
                  ? "Không có doanh nghiệp nào đạt. Một số doanh nghiệp chưa đủ dữ liệu cho điều kiện đang chọn, xem chi tiết bên dưới."
                  : "Không có doanh nghiệp nào đạt tất cả điều kiện."}
                {technical.length > 0 && <span className="mt-1 block">Điều kiện dạng cắt lên, cắt xuống, vượt, phá chỉ đúng tại đúng phiên xảy ra.</span>}
              </td></tr>
            ) : (
              rows.map((row) => {
                const state = rowState(row, required)
                const market = row.market
                const reachedFundamentals = Object.keys(row.metrics).length > 0
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
                    <td className="px-3 py-2.5 text-muted-foreground">{row.exchange ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{GROUP_LABEL[row.group] ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" data-testid={`price-${row.symbol}`}>{formatFixed(market?.price, 2)}</td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", toneClass(market?.change_pct))}>{formatSigned(market?.change_pct, 2)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatFixed(market?.market_cap, 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatFixed(market?.avg_value, 1)}</td>
                    {columns.map(({ metric, role }) => {
                      if (!reachedFundamentals) {
                        return (
                          <td key={metric.id} className={`px-3 py-2 text-right ${role === "condition" ? "bg-primary/5" : ""}`}>
                            <span className="inline-flex flex-col items-end px-1 py-0.5 text-muted-foreground" title="Chưa đạt điều kiện thị trường hoặc kỹ thuật nên chưa tính chỉ tiêu cơ bản.">
                              <span className="font-semibold">—</span>
                              <span className="text-[11px] font-normal">Chưa xét</span>
                            </span>
                          </td>
                        )
                      }
                      const view = cellView(row.metrics[metric.id], metric.api_unit)
                      const name = metricName(metric)
                      return (
                        <td key={metric.id} className={`px-3 py-2 text-right ${role === "condition" ? "bg-primary/5" : ""}`}>
                          <button
                            type="button"
                            title={view.title ?? undefined}
                            aria-label={`${row.symbol} · ${name}: ${view.ok ? view.text : view.caption}. Xem nguồn và kỳ tính`}
                            className="inline-flex flex-col items-end rounded-sm px-1 py-0.5 text-right hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                            onClick={() => onCell(row, metric)}
                          >
                            <span className={`font-semibold tabular-nums ${view.ok ? "" : "text-muted-foreground"}`}>{view.text}</span>
                            <span className="text-[11px] font-normal text-muted-foreground">{view.caption}</span>
                          </button>
                        </td>
                      )
                    })}
                    {technical.map((column) => {
                      const view = technicalCellView(row.technical?.[column.key])
                      return (
                        <td key={column.key} className="bg-primary/5 px-3 py-2 text-right">
                          <button
                            type="button"
                            title={view.title ?? undefined}
                            aria-label={`${row.symbol} · ${column.label}: ${view.ok ? view.text : (view.caption ?? "")}${view.verdict === "pass" ? ", đạt" : view.verdict === "fail" ? ", không đạt" : ""}. Xem chi tiết`}
                            className="inline-flex flex-col items-end rounded-sm px-1 py-0.5 text-right hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                            onClick={() => onTechnicalCell(row, column)}
                          >
                            <span className={`font-semibold tabular-nums ${view.ok ? "" : "text-muted-foreground"}`}>{view.text}</span>
                            {view.caption && <span className="text-[11px] font-normal text-muted-foreground">{view.caption}</span>}
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
          Bấm tiêu đề cột để sắp xếp toàn bộ kết quả. Bấm số liệu để xem kỳ báo cáo, nguồn và chi tiết. Đơn vị theo tiêu đề cột.
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

