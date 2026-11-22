import { FundamentalChart } from "@/components/fundamental-charts"

import type { ChartModel } from "../content-types"
import { chartTables, type DataTable } from "./chart-math"
import { CompareChart } from "./compare-chart"
import { FigureChart } from "./figure-chart"
import { LeafChart } from "./leaf-chart"

/**
 * Draws one precomputed chart model of a lesson. Every `kind` of the content schema has a renderer;
 * colours come from theme tokens (chart-theme.ts) and every chart lays out at the measured width.
 * `fundamental` (the representative charts of chapters 8-17) uses the shared Dashboard renderer;
 * `figure` (v5) draws the mockup's `FIG` illustrations (figure-chart.tsx).
 */
export function LessonChart({ model, label, autoLegend = true }: { model: ChartModel; label: string; autoLegend?: boolean }) {
  if (model.kind === "compare") return <CompareChart model={model} label={label} />
  if (model.kind === "figure") return <FigureChart model={model} label={label} />
  // Biểu đồ đại diện: cùng bộ khuôn với Dashboard phân tích (spec cập nhật 22-10 DB-02, spec Học viện v4 §2.1),
  // bỏ nút "Bảng số" (spec Học viện v5 §2.4); bộ khuôn tự có chú giải.
  if (model.kind === "fundamental") {
    return (
      <div role="group" aria-label={label} className="min-w-0">
        <FundamentalChart chart={model.chart} showTable={false} />
      </div>
    )
  }
  return <LeafChart model={model} label={label} autoLegend={autoLegend} />
}

function TableView({ table, regionLabel }: { table: DataTable; regionLabel: string }) {
  return (
    <div role="region" tabIndex={0} aria-label={regionLabel} className="academy-table-scroll">
      <table>
        {table.caption && <caption className="sr-only">{table.caption}</caption>}
        <thead>
          <tr>
            {table.head.map((cell, index) => (
              <th key={index} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) =>
                cellIndex === 0 ? (
                  <th key={cellIndex} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={cellIndex} className="align-r">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** "Xem bảng số liệu": the numbers behind the drawing, from the same model. */
export function ChartDataTable({ model, label }: { model: ChartModel; label: string }) {
  const tables = chartTables(model)
  if (tables.length === 0) return null
  return (
    <details className="academy-details">
      <summary>Xem bảng số liệu</summary>
      <div className="space-y-3 pt-2">
        {tables.map((table, index) => (
          <div key={index} className="space-y-1">
            {tables.length > 1 && table.caption && <p className="text-xs font-semibold text-foreground">{table.caption}</p>}
            <TableView table={table} regionLabel={`Bảng số liệu: ${table.caption ?? label}`} />
          </div>
        ))}
      </div>
    </details>
  )
}
