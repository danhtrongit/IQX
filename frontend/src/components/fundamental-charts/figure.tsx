import { dailyAxis, finiteValues, meanOf, medianOf, stdDevOf } from "./format"
import {
  cagrPath,
  figureTooltip,
  hasNegativeMain,
  lineColor,
  MAIN_COLOR,
  REFERENCE_COLOR,
  streakStart,
  type HoverState,
} from "./figure-data"
import { Panel } from "./panel"
import type { FundamentalChartData } from "./types"

function PanelLabel({ children, spaced = false }: { children: string; spaced?: boolean }) {
  return (
    <p className={spaced ? "mt-2 mb-1 text-[11px] font-semibold text-text-secondary" : "mb-1 text-[11px] font-semibold text-text-secondary"}>
      {children}
    </p>
  )
}

/**
 * Thân của một biểu đồ chỉ tiêu: vẽ theo khuôn (spec §9) và hiện hộp số liệu
 * của kỳ đang rê chuột hoặc đang chạm.
 */
export function ChartFigure({
  chart,
  width,
  hover,
  onHover,
}: {
  chart: FundamentalChartData
  width: number
  hover: HoverState | null
  onHover: (hover: HoverState | null) => void
}) {
  const main = chart.main[0]
  const unit = chart.unit
  const mainUnit = chart.mainUnit ?? unit
  const tooltip = hover === null ? null : figureTooltip(chart, hover.index)

  const panelProps = {
    width,
    labels: chart.labels,
    ariaLabel: chart.name,
    hoverIndex: hover?.index ?? null,
    onHover: (index: number | null, x: number) => onHover(index === null ? null : { index, x }),
  }

  let drawing
  if (chart.kind === "A" || chart.kind === "B" || chart.kind === "C") {
    drawing = (
      <>
        <PanelLabel>{unit}</PanelLabel>
        <Panel
          {...panelProps}
          height={150}
          axis={false}
          zero={hasNegativeMain(chart)}
          reference={chart.ref}
          lines={chart.main.map((series, index) => ({
            name: series.name,
            values: series.v,
            color: lineColor(index),
            markers: true,
          }))}
        />
        {chart.sub && (
          <>
            <PanelLabel spaced>{chart.sub.unit}</PanelLabel>
            <Panel
              {...panelProps}
              ariaLabel={`${chart.name} · thành phần`}
              height={96}
              bars={{
                type: chart.sub.type,
                series: chart.sub.series.map((series) => ({ name: series.name, values: series.v })),
              }}
            />
          </>
        )}
      </>
    )
  } else if (chart.kind === "D") {
    drawing = (
      <>
        <PanelLabel>{mainUnit}</PanelLabel>
        <Panel
          {...panelProps}
          height={200}
          bars={main ? { type: "grouped", series: [{ name: main.name, values: main.v }] } : undefined}
          lines={[
            {
              name: "Đường tăng đều theo CAGR",
              values: cagrPath(main?.v ?? [], chart.hero),
              color: REFERENCE_COLOR,
              dash: "5 4",
            },
          ]}
        />
      </>
    )
  } else if (chart.kind === "E1") {
    const values = finiteValues(main?.v ?? [])
    const mean = meanOf(values)
    const deviation = stdDevOf(values)
    drawing = (
      <>
        <PanelLabel>{mainUnit}</PanelLabel>
        <Panel
          {...panelProps}
          height={200}
          band={[mean - deviation, mean + deviation]}
          reference={mean}
          lines={main ? [{ name: main.name, values: main.v, color: MAIN_COLOR, markers: true }] : []}
        />
      </>
    )
  } else if (chart.kind === "E2") {
    const start = streakStart(main?.v ?? [], chart.hero)
    drawing = (
      <>
        <PanelLabel>{mainUnit}</PanelLabel>
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
  } else if (chart.kind === "F2") {
    drawing = (
      <>
        <PanelLabel>{unit}</PanelLabel>
        <Panel
          {...panelProps}
          height={200}
          zero
          reference={chart.ref}
          lines={main ? [{ name: main.name, values: main.v, color: MAIN_COLOR, markers: true }] : []}
        />
      </>
    )
  } else {
    const values = finiteValues(main?.v ?? [])
    const median = medianOf(values)
    const deviation = stdDevOf(values)
    const axis = dailyAxis(chart.labels)
    drawing = (
      <>
        <PanelLabel>{unit}</PanelLabel>
        <Panel
          {...panelProps}
          height={200}
          xLine
          band={[median - deviation, median + deviation]}
          reference={median}
          formatLabel={axis.format}
          labelIndexes={axis.indexes}
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
          className="pointer-events-none absolute top-1 z-10 w-max max-w-[min(16rem,100%)] rounded-sm border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-lg"
          // Hộp số liệu nằm bên phải đường dọc ở nửa trái, bên trái ở nửa phải: không bao giờ tràn khỏi thẻ (390px).
          style={
            hover.x > width / 2
              ? { right: `${Math.max(0, width - hover.x + 10)}px` }
              : { left: `${Math.max(0, hover.x + 10)}px` }
          }
          role="status"
        >
          <p className="mb-1 font-semibold">{tooltip.title}</p>
          {tooltip.rows.map(([name, value]) => (
            <div key={name} className="flex items-baseline justify-between gap-3">
              <span className="text-text-secondary">{name}</span>
              <span className="tabular-nums">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
