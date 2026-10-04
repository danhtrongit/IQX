/**
 * Bảng kết quả của Bộ lọc. Mỗi ô chỉ tiêu hiển thị theo đơn vị hiển thị; giá
 * trị thiếu/không áp dụng/không đủ cơ sở hiển thị "—" kèm nhãn, không bao giờ 0.
 */
import { useMemo, useState } from "react"
import { ListPlus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import type { ScreenerMetric, ScreenerRunResult } from "./types"
import { metricCell } from "./units"

/** Cột chỉ tiêu: chỉ tiêu trong điều kiện trước, rồi mọi chỉ tiêu khác server trả (theo thứ tự registry). */
function metricColumns(result: ScreenerRunResult, ruleMetricIds: string[], metrics: ScreenerMetric[]): string[] {
  const present = new Set<string>()
  for (const row of result.results) for (const id of Object.keys(row.metrics ?? {})) present.add(id)
  const ordered = [...ruleMetricIds]
  for (const metric of metrics) if (present.has(metric.id) && !ordered.includes(metric.id)) ordered.push(metric.id)
  for (const id of present) if (!ordered.includes(id)) ordered.push(id)
  return ordered
}

export function ResultsTable({
  result,
  ruleMetricIds,
  metrics,
  onSaveList,
}: {
  result: ScreenerRunResult
  ruleMetricIds: string[]
  metrics: ScreenerMetric[]
  onSaveList: () => void
}) {
  const [passedOnly, setPassedOnly] = useState(true)
  const metricsById = useMemo(() => new Map(metrics.map((metric) => [metric.id, metric])), [metrics])
  const columns = useMemo(() => metricColumns(result, ruleMetricIds, metrics), [result, ruleMetricIds, metrics])
  const rows = passedOnly ? result.results.filter((row) => row.passed) : result.results
  const { universe, passed, missing } = result.counts

  return (
    <section className="rounded-lg border border-border bg-card" aria-label="Kết quả lọc">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Kết quả</h2>
        <span className="text-xs text-muted-foreground" data-testid="filter-counts">
          {passed}/{universe} mã đạt · {missing} mã thiếu dữ liệu · dữ liệu tại {result.as_of}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="filter-passed-only" checked={passedOnly} onCheckedChange={setPassedOnly} />
            <Label htmlFor="filter-passed-only" className="text-xs">
              Chỉ hiện mã đạt
            </Label>
          </div>
          <Button type="button" size="sm" onClick={onSaveList} disabled={passed === 0} className="gap-1.5">
            <ListPlus className="size-4" />
            Lưu danh sách
          </Button>
        </div>
      </header>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã</TableHead>
            <TableHead>Doanh nghiệp</TableHead>
            <TableHead>Ngành</TableHead>
            <TableHead>Kết quả</TableHead>
            {columns.map((id) => {
              const metric = metricsById.get(id)
              return (
                <TableHead key={id} className="text-right">
                  {metric ? `${metric.name} (${metric.unit})` : id}
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + 4} className="py-6 text-center text-muted-foreground">
                {passedOnly ? "Không có mã nào đạt mọi điều kiện." : "Không có mã trong phạm vi."}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.symbol} data-testid={`result-${row.symbol}`}>
                <TableCell className="font-semibold">{row.symbol}</TableCell>
                <TableCell>{row.name ?? "—"}</TableCell>
                <TableCell>{row.sector ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={row.passed ? "default" : "outline"}>{row.passed ? "Đạt" : "Không đạt"}</Badge>
                </TableCell>
                {columns.map((id) => {
                  const metric = metricsById.get(id)
                  const raw = row.metrics?.[id]
                  const cell = metricCell(raw, metric?.api_unit ?? raw?.unit ?? "")
                  return (
                    <TableCell key={id} className="text-right" title={cell.title ?? undefined} data-testid={`cell-${row.symbol}-${id}`}>
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <span>{cell.text}</span>
                        {cell.badge && (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
                            {cell.badge}
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                  )
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  )
}
