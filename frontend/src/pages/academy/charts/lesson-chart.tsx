import type { ChartModel } from "../api"
import { CategoryChart } from "./category-chart"
import { chartTables, type DataTable } from "./chart-math"
import { SeriesPanelsChart } from "./series-panels-chart"
import { TimelineChart, WaterfallChart } from "./step-charts"

/**
 * Draws one chart model of a lesson or of a question figure. Every `kind` the content packages
 * carry has a renderer: `series_panels` (chapter 1), `grouped`, `line`, `stacked`, `timeline`,
 * `waterfall` and `panels` (chapter 3). Colours come from theme tokens.
 */
export function LessonChart({ model, label }: { model: ChartModel; label: string }) {
  switch (model.kind) {
    case "series_panels":
      return <SeriesPanelsChart model={model} label={label} />
    case "grouped":
    case "line":
    case "stacked":
      return <CategoryChart model={model} label={label} />
    case "timeline":
      return <TimelineChart model={model} label={label} />
    case "waterfall":
      return <WaterfallChart model={model} label={label} />
    case "panels":
      return (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4">
          {model.panels.map((panel, index) => (
            <figure key={`${panel.title}-${index}`} className="m-0 min-w-0 space-y-1">
              <figcaption className="text-xs font-semibold text-foreground">{panel.title}</figcaption>
              <CategoryChart model={panel} label={`${label}: ${panel.title}`} />
            </figure>
          ))}
        </div>
      )
  }
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
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** "Xem bảng số liệu của biểu đồ": the numbers behind the drawing, from the same model. */
export function ChartDataTable({ model, label }: { model: ChartModel; label: string }) {
  const tables = chartTables(model)
  return (
    <details className="academy-details">
      <summary>Xem bảng số liệu của biểu đồ</summary>
      <div className="space-y-3 pt-2">
        {tables.map((table, index) => (
          <div key={index} className="space-y-1">
            {tables.length > 1 && table.caption && <p className="text-xs font-semibold">{table.caption}</p>}
            <TableView table={table} regionLabel={`Bảng số liệu: ${table.caption ?? label}`} />
          </div>
        ))}
      </div>
    </details>
  )
}
