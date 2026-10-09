import { periodLabel } from "./definition"
import type { FilterDefinition, ResultRow, ScreenerMetric } from "./types"
import { cellView } from "./units"

const TH = "px-3 py-2 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase"

/**
 * Evidence frozen when a result or list was saved: the values, statuses and real periods of that
 * moment. It is read from the stored snapshot, never recomputed from today's data or the form.
 */
export function SnapshotTable({
  definition,
  rows,
  metrics,
}: {
  definition: Pick<FilterDefinition, "rules" | "columns">
  rows: readonly ResultRow[]
  metrics: readonly ScreenerMetric[]
}) {
  const byId = new Map(metrics.map((metric) => [metric.id, metric]))
  const columns = [
    ...definition.rules.map((rule) => ({ id: rule.metric_id, period: rule.period })),
    ...(definition.columns ?? []).map((column) => ({ id: column.metric_id, period: column.period })),
  ].flatMap((column) => {
    const metric = byId.get(column.id)
    return metric ? [{ metric, period: column.period }] : []
  })
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[480px] border-collapse text-xs" aria-label="Số liệu đã lưu">
        <thead className="bg-muted/30">
          <tr>
            <th scope="col" className={`${TH} text-left`}>Mã</th>
            {columns.map(({ metric, period }) => (
              <th key={metric.id} scope="col" className={`${TH} text-right`}>
                {metric.name}
                <span className="block font-normal tracking-normal normal-case">{periodLabel(metric, period)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.symbol}>
              <td className="px-3 py-2 font-bold text-primary">{row.symbol}</td>
              {columns.map(({ metric }) => {
                const view = cellView(row.metrics[metric.id], metric.api_unit)
                return (
                  <td key={metric.id} className="px-3 py-2 text-right">
                    <span className={`font-semibold tabular-nums ${view.ok ? "" : "text-muted-foreground"}`}>{view.text}</span>
                    <span className="block text-[11px] text-muted-foreground">{view.caption}</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
