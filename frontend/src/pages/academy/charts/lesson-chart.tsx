import { FundamentalChart } from "@/components/fundamental-charts"

import type { ChartModel } from "../content-types"
import { chartTables, type DataTable } from "./chart-math"
import { CompareChart } from "./compare-chart"
import { LeafChart } from "./leaf-chart"

/**
 * Draws one precomputed chart model of a lesson. Every `kind` of the v3.3 schema has a renderer;
 * colours come from theme tokens (chart-theme.ts) and every chart lays out at the measured width.
 * `fundamental` (the 33 representative charts) uses the shared Dashboard renderer.
 */
export function LessonChart({ model, label, autoLegend = true }: { model: ChartModel; label: string; autoLegend?: boolean }) {
  if (model.kind === "compare") return <CompareChart model={model} label={label} />
  // Biểu đồ đại diện Chương 8-13: cùng bộ khuôn với Dashboard phân tích (spec cập nhật 22-10 DB-02).
  // Bộ khuôn tự có chú giải và nút "Bảng số".
  if (model.kind === "fundamental") {
    return (
      <div role="group" aria-label={label} className="min-w-0">
        <FundamentalChart chart={model.chart} />
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
