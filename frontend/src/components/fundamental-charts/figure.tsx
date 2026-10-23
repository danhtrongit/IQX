import { dailyAxis, meanOf, medianOf, stdDevOf, type ChartView } from "../model"

import {
  cagrPath,
  figureTooltip,
  MAIN_COLOR,
  REFERENCE_COLOR,
  streakStart,
  type HoverState,
} from "./figure-data"
import { Panel } from "./panel"

/**
 * Thân của một thẻ biểu đồ: vẽ theo khuôn của chỉ tiêu (spec §9) và hiện
 * hộp số liệu của kỳ đang rê chuột.
 */
export function ChartFigure({
  view,
  width,
  hover,
  onHover,
}: {
  view: ChartView
  width: number
  hover: HoverState | null
  onHover: (hover: HoverState | null) => void
}) {
  const main = view.main[0]
  const unit = view.unit
  const mainUnit = view.mainUnit ?? unit
  const tooltip = hover === null ? null : figureTooltip(view, hover.index)
  const axis = view.kind === "F" ? dailyAxis(view.labels) : undefined

  const panelProps = {
    width,
    labels: view.labels,
    ariaLabel: view.name,
    hoverIndex: hover?.index ?? null,
    onHover: (index: number | null, x: number) => onHover(index === null ? null : { index, x }),
  }

  let drawing
  if (view.kind === "A" || view.kind === "B" || view.kind === "C") {
    const hasNegative = (main?.v ?? []).some((value) => typeof value === "number" && value < 0)
    drawing = (
      <>
        <p className="mb-1 text-[11px] font-semibold text-academy-subtle">{unit}</p>
        <Panel
          {...panelProps}
          height={150}
          axis={false}
          zero={view.kind === "A" && hasNegative}
          lines={main ? [{ name: main.name, values: main.v, color: MAIN_COLOR, markers: true }] : []}
        />
        {view.sub && (
          <>
            <p className="mt-2 mb-1 text-[11px] font-semibold text-academy-subtle">{view.sub.unit}</p>
            <Panel
              {...panelProps}
              height={96}
              bars={{
                type: view.sub.type,
                series: view.sub.series.map((series) => ({ name: series.name, values: series.v })),
              }}
            />
          </>
        )}
      </>
    )
  } else if (view.kind === "D") {
    drawing = (
      <>
        <p className="mb-1 text-[11px] font-semibold text-academy-subtle">{mainUnit}</p>
        <Panel
          {...panelProps}
          height={200}
          bars={main ? { type: "grouped", series: [{ name: main.name, values: main.v }] } : undefined}
          lines={[
            {
              name: "Đường tăng đều theo CAGR",
              values: cagrPath(main?.v ?? [], view.hero),
              color: REFERENCE_COLOR,
              dash: "5 4",
            },
          ]}
        />
      </>
    )
  } else if (view.kind === "E1") {
    const values = (main?.v ?? []).filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    )
    const mean = meanOf(values)
    const deviation = stdDevOf(values)
    drawing = (
      <>
        <p className="mb-1 text-[11px] font-semibold text-academy-subtle">{mainUnit}</p>
        <Panel
          {...panelProps}
          height={200}
          band={[mean - deviation, mean + deviation]}
          reference={mean}
          lines={main ? [{ name: main.name, values: main.v, color: MAIN_COLOR, markers: true }] : []}
        />
      </>
    )
  } else if (view.kind === "E2") {
    const start = streakStart(main?.v ?? [], view.hero)
    drawing = (
      <>
        <p className="mb-1 text-[11px] font-semibold text-academy-subtle">{mainUnit}</p>
        <Panel
          {...panelProps}
          height={200}
          bars={{
            type: "grouped",
            series: main ? [{ name: main.name, values: main.v }] : [],
            signed: true,
            faded: (index) => index < start && (main?.v[index] ?? 0) > 0,
          }}
        />
      </>
    )
  } else if (view.kind === "F2") {
    drawing = (
      <>
        <p className="mb-1 text-[11px] font-semibold text-academy-subtle">{unit}</p>
        <Panel
          {...panelProps}
          height={200}
          zero
          reference={view.reference}
          lines={main ? [{ name: main.name, values: main.v, color: MAIN_COLOR, markers: true }] : []}
        />
      </>
    )
  } else {
    const values = (main?.v ?? []).filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    )
    const median = medianOf(values)
    const deviation = stdDevOf(values)
    drawing = (
      <>
        <p className="mb-1 text-[11px] font-semibold text-academy-subtle">{unit}</p>
        <Panel
          {...panelProps}
          height={200}
          xLine
          band={[median - deviation, median + deviation]}
          reference={median}
          formatLabel={axis?.format}
          labelIndexes={axis?.indexes}
          lines={main ? [{ name: main.name, values: main.v, color: MAIN_COLOR }] : []}
        />
      </>
    )
  }

  return (
    <div className="relative">
      {drawing}
      {tooltip && hover && (
        <div
          className="pointer-events-none absolute top-1 z-10 w-max max-w-64 rounded-sm border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-lg"
          style={{ left: `clamp(0px, ${hover.x + 10}px, calc(100% - 13rem))` }}
          role="status"
        >
          <p className="mb-1 font-semibold">{tooltip.title}</p>
          {tooltip.rows.map(([name, value]) => (
            <div key={name} className="flex items-baseline justify-between gap-3">
              <span className="text-academy-subtle">{name}</span>
              <span className="tabular-nums">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
