import { cn } from "@/lib/utils"
import { ChartLegendList } from "../charts/chart-legend"
import { chartLabel, hasDataTable, isThumbnailChart } from "../charts/chart-math"
import { ChartDataTable, LessonChart } from "../charts/lesson-chart"
import type { ChartModel } from "../content-types"
import type { BlockOf } from "./block-types"
import { InlineText } from "./inline-text"

type Charts = Readonly<Record<string, ChartModel>>

/** Grids reach their own column count from 560px; below it thumbnails keep two columns, axis charts one. */
const GRID_COLUMNS = {
  2: "@min-[560px]:grid-cols-2",
  3: "@min-[560px]:grid-cols-3",
  4: "@min-[560px]:grid-cols-4",
  5: "@min-[560px]:grid-cols-3 @min-[720px]:grid-cols-5",
} as const

function MissingChart() {
  return <p className="rounded-md border border-dashed border-border p-3 text-sm text-academy-subtle">Biểu đồ này chưa có dữ liệu.</p>
}

/** Chart title chrome (DESIGN.md §2.5): 3 × 16px primary marker and a heading-font title. */
function ChartTitle({ title }: { title: string }) {
  return (
    <figcaption className="flex items-start gap-2">
      <span aria-hidden="true" className="mt-0.5 h-4 w-[3px] shrink-0 rounded-[1px] bg-primary" />
      <span className="font-heading text-sm font-bold tracking-[-0.01em] text-foreground">{title}</span>
    </figcaption>
  )
}

/** A figure: title, legend, the drawing, the disclaimer note and the optional data table. */
export function ChartBlock({ block, charts }: { block: BlockOf<"chart">; charts: Charts }) {
  const model = charts[block.chart_id]
  if (!model) return <MissingChart />
  const label = chartLabel(model, block.title ?? "Biểu đồ minh họa")
  return (
    <figure data-chart-id={block.chart_id} className="m-0 min-w-0 space-y-2.5 rounded-md border border-border p-3">
      {block.title && <ChartTitle title={block.title} />}
      {block.legend && <ChartLegendList entries={block.legend} />}
      <LessonChart model={model} label={label} autoLegend={!block.legend} />
      {block.note && <p className="text-xs text-academy-subtle">{block.note}</p>}
      {block.table_toggle && hasDataTable(model) && <ChartDataTable model={model} label={label} />}
    </figure>
  )
}

/**
 * `grid`: `.pat`/`.st4` figures, two columns on a phone only when every item is a thumbnail (the mockup's `.st4`
 * of C5L2 axis charts drops to one column). `rows`: `.adv` icon rows, text beside the chart, stacked under it
 * below 560px.
 */
export function ChartGridBlock({ block, charts }: { block: BlockOf<"chart_grid">; charts: Charts }) {
  if (block.layout === "rows") {
    return (
      <div className="divide-y divide-border rounded-md border border-border">
        {block.items.map((item) => {
          const model = charts[item.chart_id]
          return (
            <div key={item.chart_id} data-chart-id={item.chart_id} className="flex flex-col gap-3 p-3 @min-[560px]:flex-row @min-[560px]:items-center">
              <div className="w-full min-w-0 @min-[560px]:w-56 @min-[560px]:shrink-0">
                {model ? <LessonChart model={model} label={chartLabel(model, item.title)} /> : <MissingChart />}
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                {item.text && <InlineText as="p" html={item.text} className="text-sm leading-6 text-foreground" />}
              </div>
            </div>
          )
        })}
      </div>
    )
  }
  const thumbnails = block.items.every((item) => isThumbnailChart(charts[item.chart_id]))
  return (
    <div className={cn("grid gap-3", thumbnails ? "grid-cols-2" : "grid-cols-1", GRID_COLUMNS[block.columns])}>
      {block.items.map((item) => {
        const model = charts[item.chart_id]
        return (
          <figure key={item.chart_id} data-chart-id={item.chart_id} className="m-0 flex min-w-0 flex-col gap-1.5 rounded-md border border-border p-2">
            <div className={cn("mx-auto w-full min-w-0", thumbnails && "max-w-[180px] @min-[560px]:max-w-none")}>
              {model ? <LessonChart model={model} label={chartLabel(model, item.title)} /> : <MissingChart />}
            </div>
            <figcaption className="space-y-0.5">
              <span className="block text-xs font-semibold text-foreground">{item.title}</span>
              {item.text && <InlineText html={item.text} className="block text-xs leading-5 text-foreground" />}
            </figcaption>
          </figure>
        )
      })}
    </div>
  )
}
