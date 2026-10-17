import { cn } from "@/lib/utils"
import { wrapText, type MilestonesModel } from "./chart-math"
import { TONE_BG, TONE_FILL, TONE_STROKE, textColor, textFill, titleColor, titleFill } from "./chart-theme"
import { useChartWidth } from "./use-chart-width"

/** Below this width the milestones go vertical (design §7.3). */
const VERTICAL_BELOW = 560
const percent = (value: number) => `${Math.round(value * 100)}%`

/** K6b: milestones on a 0..1 line with spans and a brace; a vertical list on a phone. */
export function MilestonesChart({ model, label }: { model: MilestonesModel; label: string }) {
  const [measure, width] = useChartWidth()
  return (
    <div ref={measure} className="w-full min-w-0">
      {width < VERTICAL_BELOW ? <VerticalMilestones model={model} label={label} /> : <HorizontalMilestones model={model} label={label} width={width} />}
    </div>
  )
}

function VerticalMilestones({ model, label }: { model: MilestonesModel; label: string }) {
  const points = [...model.points].sort((a, b) => a.at - b.at)
  const spanFor = (at: number) => (model.spans ?? []).filter((span) => at >= span.from && at < span.to)
  return (
    <div role="img" aria-label={label} className="space-y-3">
      <ol aria-hidden="true" className="relative m-0 list-none space-y-3 border-l-2 border-border p-0 pl-5">
        {points.map((point, index) => (
          <li key={index} className="relative">
            <span className={cn("absolute top-1 -left-[1.6rem] size-3 rounded-full ring-2 ring-card", TONE_BG[point.tone])} />
            <p className={cn("text-sm font-semibold", titleColor(point.tone))}>
              {point.title}
            </p>
            {point.detail?.map((line, lineIndex) => (
              <p key={lineIndex} className="text-xs text-academy-subtle">
                {line}
              </p>
            ))}
            {spanFor(point.at).map((span, spanIndex) => (
              <p key={spanIndex} className={cn("mt-1 border-l-2 pl-2 text-xs font-semibold", textColor(span.tone))} style={{ borderColor: "currentColor" }}>
                {span.label}
              </p>
            ))}
          </li>
        ))}
      </ol>
      {model.brace && (
        <p aria-hidden="true" className="text-xs font-semibold text-foreground">
          {points.find((point) => point.at === model.brace?.from)?.title ?? percent(model.brace.from)}
          {" đến "}
          {points.find((point) => point.at === model.brace?.to)?.title ?? percent(model.brace.to)}
          {": "}
          {model.brace.label}
        </p>
      )}
    </div>
  )
}

function HorizontalMilestones({ model, label, width }: { model: MilestonesModel; label: string; width: number }) {
  const left = 40
  const right = width - 40
  const x = (at: number) => left + at * (right - left)
  const spansAbove = (model.spans ?? []).filter((span) => span.side === "above")
  const spansBelow = (model.spans ?? []).filter((span) => span.side === "below")
  const spanLines = (span: { from: number; to: number; label: string }) => wrapText(span.label, Math.max(60, (span.to - span.from) * (right - left) - 8), 11, 2)
  const aboveHeight = spansAbove.length ? Math.max(...spansAbove.map((span) => spanLines(span).length)) * 13 + 18 : 4
  const lineY = aboveHeight + 14
  const pointLines = model.points.map((point) => 1 + (point.detail?.length ?? 0))
  const labelsBottom = lineY + 16 + Math.max(...pointLines) * 14
  const belowTop = labelsBottom + 8
  const belowHeight = spansBelow.length ? Math.max(...spansBelow.map((span) => spanLines(span).length)) * 13 + 14 : 0
  const braceTop = belowTop + belowHeight + (model.brace ? 6 : 0)
  const height = braceTop + (model.brace ? 34 : 4)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={label}>
      <title>{label}</title>
      {spansAbove.map((span, index) => (
        <g key={index}>
          <rect x={x(span.from) + 2} y={lineY - 12} width={Math.max(2, x(span.to) - x(span.from) - 4)} height={5} rx="2" className={TONE_FILL[span.tone]} />
          <text x={(x(span.from) + x(span.to)) / 2} y={lineY - 18 - (spanLines(span).length - 1) * 13} textAnchor="middle" className={cn(textFill(span.tone), "text-[11px] font-semibold")}>
            {spanLines(span).map((line, lineIndex) => (
              <tspan key={lineIndex} x={(x(span.from) + x(span.to)) / 2} dy={lineIndex === 0 ? 0 : 13}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      ))}
      <line x1={left} x2={right} y1={lineY} y2={lineY} strokeWidth="2" className="stroke-chart-5" />
      {model.points.map((point, index) => {
        const px = x(point.at)
        const anchor = point.at <= 0.02 ? "start" : point.at >= 0.98 ? "end" : "middle"
        const tx = anchor === "start" ? px - 12 : anchor === "end" ? px + 12 : px
        return (
          <g key={index}>
            <circle cx={px} cy={lineY} r="6" strokeWidth="2" className={cn(TONE_FILL[point.tone], "stroke-card")} />
            <text x={tx} y={lineY + 22} textAnchor={anchor} className="text-[11px]">
              <tspan x={tx} className={cn(titleFill(point.tone), "font-semibold")}>
                {point.title}
              </tspan>
              {point.detail?.map((line, lineIndex) => (
                <tspan key={lineIndex} x={tx} dy={14} className="fill-academy-label">
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        )
      })}
      {spansBelow.map((span, index) => (
        <g key={index}>
          <rect x={x(span.from) + 2} y={belowTop} width={Math.max(2, x(span.to) - x(span.from) - 4)} height={5} rx="2" className={TONE_FILL[span.tone]} />
          <text x={(x(span.from) + x(span.to)) / 2} y={belowTop + 18} textAnchor="middle" className={cn(textFill(span.tone), "text-[11px] font-semibold")}>
            {spanLines(span).map((line, lineIndex) => (
              <tspan key={lineIndex} x={(x(span.from) + x(span.to)) / 2} dy={lineIndex === 0 ? 0 : 13}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      ))}
      {model.brace && (
        <g>
          <path
            d={`M${x(model.brace.from)},${braceTop} q0,8 8,8 L${(x(model.brace.from) + x(model.brace.to)) / 2 - 6},${braceTop + 8} q6,0 6,6 q0,-6 6,-6 L${x(model.brace.to) - 8},${braceTop + 8} q8,0 8,-8`}
            fill="none"
            strokeWidth="1.4"
            className={TONE_STROKE.p1}
          />
          <text x={(x(model.brace.from) + x(model.brace.to)) / 2} y={braceTop + 28} textAnchor="middle" className="fill-chart-1 text-[11px] font-semibold">
            {model.brace.label}
          </text>
        </g>
      )}
    </svg>
  )
}
