import { cn } from "@/lib/utils"

import { toneClass } from "../shared/format"
import { periodLabel } from "./definition"
import { GROUP_LABEL } from "./market"
import { metricName } from "./metric-names"
import { sessionCaption, technicalCellView } from "./technical-cell"
import type { FilterDefinition, ResultRow, ScreenerMetric } from "./types"
import { cellView, formatFixed, formatSigned } from "./units"

const TH = "px-3 py-2 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase"

/** The technical columns a stored result carries, in the order the first row lists them (the server writes them in column order). */
function technicalColumns(rows: readonly ResultRow[]): Array<{ key: string; label: string }> {
  const seen = new Map<string, string>()
  for (const row of rows) {
    for (const [key, cell] of Object.entries(row.technical ?? {})) if (!seen.has(key)) seen.set(key, cell.label)
  }
  return [...seen].map(([key, label]) => ({ key, label }))
}

/**
 * Evidence frozen when a result or list was saved: the market figures, the technical values at the
 * saved session, and the values, statuses and real periods of the fundamental conditions of that moment.
 * It is read from the stored snapshot, never recomputed from today's data or the form. A result saved
 * before Bộ lọc 4.0 has no market or technical figures: those cells show "—".
 */
export function SnapshotTable({
  definition,
  rows,
  metrics,
  sessionDate,
}: {
  definition: Pick<FilterDefinition, "rules" | "columns" | "market">
  rows: readonly ResultRow[]
  metrics: readonly ScreenerMetric[]
  /** The session T of the saved run (`YYYY-MM-DD`), when it has one. */
  sessionDate?: string | null
}) {
  const byId = new Map(metrics.map((metric) => [metric.id, metric]))
  const columns = [
    ...definition.rules.map((rule) => ({ id: rule.metric_id, period: rule.period })),
    ...(definition.columns ?? []).map((column) => ({ id: column.metric_id, period: column.period })),
  ].flatMap((column) => {
    const metric = byId.get(column.id)
    return metric ? [{ metric, period: column.period }] : []
  })
  const technical = technicalColumns(rows)
  const session = sessionCaption(sessionDate)
  const averageSessions = definition.market.avg_value.sessions
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[760px] border-collapse text-xs" aria-label="Số liệu đã lưu">
        <thead className="bg-muted/30">
          <tr>
            <th scope="col" className={`${TH} text-left`}>Mã</th>
            <th scope="col" className={`${TH} text-left`}>Sàn</th>
            <th scope="col" className={`${TH} text-left`}>Ngành</th>
            <th scope="col" className={`${TH} text-right`}>Giá<span className="block font-normal tracking-normal normal-case">(nghìn đ)</span></th>
            <th scope="col" className={`${TH} text-right`}>+/− %</th>
            <th scope="col" className={`${TH} text-right`}>Vốn hóa<span className="block font-normal tracking-normal normal-case">(tỷ đ)</span></th>
            <th scope="col" className={`${TH} text-right`}>{`GTGD TB${averageSessions}`}<span className="block font-normal tracking-normal normal-case">(tỷ đ)</span></th>
            {columns.map(({ metric, period }) => (
              <th key={metric.id} scope="col" className={`${TH} text-right`}>
                {metricName(metric)}
                <span className="block font-normal tracking-normal normal-case">{periodLabel(metric, period)}</span>
              </th>
            ))}
            {technical.map((column) => (
              <th key={column.key} scope="col" className={`${TH} text-right`}>
                {column.label}
                {session && <span className="block font-normal tracking-normal normal-case">{session}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const market = row.market as ResultRow["market"] | undefined
            return (
              <tr key={row.symbol}>
                <td className="px-3 py-2 font-bold text-primary">{row.symbol}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.exchange ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{GROUP_LABEL[row.group] ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatFixed(market?.price, 2)}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", toneClass(market?.change_pct))}>{formatSigned(market?.change_pct, 2)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatFixed(market?.market_cap, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatFixed(market?.avg_value, 1)}</td>
                {columns.map(({ metric }) => {
                  const view = cellView(row.metrics[metric.id], metric.api_unit)
                  return (
                    <td key={metric.id} className="px-3 py-2 text-right">
                      <span className={`font-semibold tabular-nums ${view.ok ? "" : "text-muted-foreground"}`}>{view.text}</span>
                      <span className="block text-[11px] text-muted-foreground">{view.caption}</span>
                    </td>
                  )
                })}
                {technical.map((column) => {
                  const view = technicalCellView((row.technical as ResultRow["technical"] | undefined)?.[column.key])
                  return (
                    <td key={column.key} className="px-3 py-2 text-right">
                      <span className={`font-semibold tabular-nums ${view.ok ? "" : "text-muted-foreground"}`}>{view.text}</span>
                      {view.caption && <span className="block text-[11px] text-muted-foreground">{view.caption}</span>}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
