import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import type { ChartTone, FigureChartModel } from "../content-types"
import { textWidth, wrapText } from "./chart-math"
import { GRID_STROKE, LABEL_FILL, TONE_FILL, TONE_STROKE, textFill, titleFill } from "./chart-theme"
import { useChartWidth } from "./use-chart-width"

/**
 * Hình minh họa của bài chỉ tiêu v5 (spec Học viện v5 §2.5, `FIG` của bản mẫu): `formula`, `hbar`,
 * `stack`, `wf`, `lines`. The mockup draws into a 760-wide view box; here every figure is laid out at
 * the measured width (at most 760) with fixed text sizes, so it reads the same on a 390px phone:
 * formula boxes stack, bar labels move above their bar, report lines wrap. Colours are theme tokens
 * (chart-theme.ts), text never takes a grey tone.
 */

/** Widest layout, as the mockup's `viewBox="0 0 760 h"`. */
export const FIGURE_MAX_WIDTH = 760

type Fig<K extends FigureChartModel["fig"]> = Extract<FigureChartModel, { fig: K }>
type Layout = { width: number; height: number; body: ReactNode }

const pad = (width: number) => (width < 480 ? 10 : 20)
const TITLE_SIZE = 14
const TITLE_LINE = 18

/** `1.234,5` with a real minus sign, as `fv()` of the mockup. */
function formatFigureNumber(value: number, decimals = 0): string {
  const digits = Math.max(0, Math.min(4, Math.round(decimals)))
  const text = Math.abs(value).toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return `${value < 0 ? "−" : ""}${text}`
}

const withUnit = (value: number, decimals: number | null | undefined, unit: string | null | undefined) =>
  `${formatFigureNumber(value, decimals ?? 0)}${unit ?? ""}`

const toneOr = (tone: ChartTone | null | undefined, fallback: ChartTone): ChartTone => tone ?? fallback

/** Title of a figure, wrapped to the width. Returns its height (0 without a title). */
function titleBlock(title: string | null | undefined, width: number): { height: number; node: ReactNode } {
  if (!title) return { height: 0, node: null }
  const p = pad(width)
  const lines = wrapText(title, width - 2 * p, TITLE_SIZE, 3)
  return {
    height: 10 + lines.length * TITLE_LINE + 8,
    node: (
      <text x={p} y={10 + TITLE_SIZE} className={cn(titleFill(), "text-[14px] font-bold")}>
        {lines.map((line, index) => (
          <tspan key={index} x={p} dy={index === 0 ? 0 : TITLE_LINE}>
            {line}
          </tspan>
        ))}
      </text>
    ),
  }
}

// ---------------------------------------------------------------------------------------------- formula

/** `ops` token drawn as an arrow (the mockup's typed arrow glyph; glyphs are banned in chart text). */
const ARROW_OP = "arrow"

/** Arrow between two formula boxes: pointing right when they sit side by side, down when stacked. */
function FormulaArrow({ cx, cy, horizontal }: { cx: number; cy: number; horizontal: boolean }) {
  const half = 10
  const head = 6
  const path = horizontal
    ? `M${cx - half},${cy} H${cx + half} M${cx + half - head},${cy - head} L${cx + half},${cy} L${cx + half - head},${cy + head}`
    : `M${cx},${cy - half} V${cy + half} M${cx - head},${cy + half - head} L${cx},${cy + half} L${cx + head},${cy + half - head}`
  return (
    <path
      d={path}
      data-op="arrow"
      fill="none"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={TONE_STROKE.warn}
    />
  )
}

function formulaLayout(model: Fig<"formula">, width: number): Layout {
  const p = pad(width)
  const items = model.items
  const n = items.length
  const ops = model.ops ?? []
  const opWidth = Math.max(32, ...ops.map((op) => (op === ARROW_OP ? 32 : textWidth(op, 18) + 14)))
  const gap = ops.length ? opWidth : 12
  const inner = width - 2 * p
  const wideBox = (inner - (n - 1) * gap) / n
  const horizontal = wideBox >= 140
  const boxWidth = horizontal ? wideBox : inner
  const TITLE = 13
  const NOTE = 12

  const boxes = items.map((item) => {
    const titleLines = wrapText(item.t, boxWidth - 20, TITLE, 2)
    const valueText = String(item.v)
    const valueSize = Math.max(14, Math.min(item.size ?? 26, Math.floor((boxWidth - 20) / Math.max(1, valueText.length * 0.62))))
    const notes = (item.notes ?? []).flatMap((note) => wrapText(note, boxWidth - 20, NOTE, 3))
    const height = 14 + titleLines.length * 17 + 8 + valueSize + 10 + notes.length * 16 + 10
    return { item, titleLines, valueText, valueSize, notes, height }
  })
  const tallest = Math.max(0, ...boxes.map((box) => box.height))
  const fixed = horizontal && model.height ? model.height - 32 : 0
  const opRow = 34

  let y = 12
  const nodes: ReactNode[] = []
  boxes.forEach((box, index) => {
    const h = horizontal ? Math.max(tallest, fixed) : box.height
    const x = horizontal ? p + index * (boxWidth + gap) : p
    const top = horizontal ? 12 : y
    const cx = x + boxWidth / 2
    const tone = toneOr(box.item.tone, "p1")
    const ty = top + 14 + TITLE
    const valueY = ty + (box.titleLines.length - 1) * 17 + 8 + box.valueSize
    nodes.push(
      <g key={`box-${index}`}>
        <rect
          x={x}
          y={top}
          width={boxWidth}
          height={h}
          rx={10}
          strokeWidth={box.item.hl ? 1.6 : 1}
          className={cn("fill-muted/40", box.item.hl ? TONE_STROKE[tone] : GRID_STROKE)}
        />
        {box.titleLines.map((line, k) => (
          <text key={`t${k}`} x={cx} y={ty + k * 17} textAnchor="middle" className={cn(titleFill(), "text-[13px] font-bold")}>
            {line}
          </text>
        ))}
        <text
          x={cx}
          y={valueY}
          textAnchor="middle"
          className={cn(textFill(tone), "font-extrabold")}
          style={{ fontSize: `${box.valueSize}px` }}
        >
          {box.valueText}
        </text>
        {box.notes.map((line, k) => (
          <text key={`n${k}`} x={cx} y={valueY + 10 + NOTE + k * 16} textAnchor="middle" className={cn(LABEL_FILL, "text-[12px]")}>
            {line}
          </text>
        ))}
      </g>,
    )
    const op = ops[index]
    if (index < n - 1 && op) {
      const ox = horizontal ? x + boxWidth + gap / 2 : width / 2
      const oy = horizontal ? 12 + Math.max(tallest, fixed) / 2 + 7 : top + h + opRow / 2 + 7
      nodes.push(
        op === ARROW_OP ? (
          <FormulaArrow key={`op-${index}`} cx={ox} cy={oy - 7} horizontal={horizontal} />
        ) : (
          <text key={`op-${index}`} x={ox} y={oy} textAnchor="middle" className={cn(textFill("warn"), "text-[18px] font-extrabold")}>
            {op}
          </text>
        ),
      )
    }
    if (!horizontal) y = top + h + (index < n - 1 ? (op ? opRow : 10) : 0)
  })
  const height = horizontal ? 12 + Math.max(tallest, fixed) + 12 : y + 12
  return { width, height, body: nodes }
}

// ------------------------------------------------------------------------------------------------- hbar

function hbarLayout(model: Fig<"hbar">, width: number): Layout {
  const p = pad(width)
  const title = titleBlock(model.title, width)
  const items = model.items
  const valueLabels = items.map((item) => withUnit(item.value, model.decimals, model.unit))
  const valueReserve = Math.max(0, ...valueLabels.map((label) => textWidth(label, 12.5))) + 12
  const values = items.map((item) => item.value)
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values, model.max ?? 0)
  const wide = width >= 520
  const LABEL = 13
  const labelWidth = wide ? Math.min(model.label_width ?? 250, Math.round(width * 0.36)) : width - 2 * p
  const x0 = wide ? p + labelWidth : p
  const x1 = Math.max(x0 + 40, width - p - valueReserve)
  const X = (v: number) => x0 + ((v - lo) / (hi - lo || 1)) * (x1 - x0)
  const barHeight = Math.min(22, (model.row_height ?? 40) * 0.6)

  const nodes: ReactNode[] = []
  let y = title.height + (title.height ? 0 : 12)
  const top = y
  items.forEach((item, index) => {
    const lines = wrapText(item.label, labelWidth - (wide ? 12 : 0), LABEL, wide ? 2 : 3)
    const rowHeight = wide ? Math.max(model.row_height ?? 40, lines.length * 16 + 12) : lines.length * 16 + barHeight + 14
    const barY = wide ? y + (rowHeight - barHeight) / 2 : y + lines.length * 16 + 6
    const barCenter = barY + barHeight / 2
    const labelTop = wide ? barCenter + 4.5 - ((lines.length - 1) * 16) / 2 : y + LABEL
    const from = Math.min(X(0), X(item.value))
    const valueX = item.value >= 0 ? X(item.value) + 8 : X(0) + 8
    nodes.push(
      <g key={index}>
        {lines.map((line, k) => (
          <text
            key={k}
            x={wide ? x0 - 12 : p}
            y={labelTop + k * 16}
            textAnchor={wide ? "end" : "start"}
            className={cn(titleFill(), "text-[13px] font-semibold")}
          >
            {line}
          </text>
        ))}
        <rect
          x={from}
          y={barY}
          width={Math.max(2, Math.abs(X(item.value) - X(0)))}
          height={barHeight}
          rx={3}
          className={TONE_FILL[toneOr(item.tone, "p1")]}
        />
        <text x={valueX} y={barCenter + 4.5} className={cn(titleFill(), "text-[12.5px] font-extrabold tabular-nums")}>
          {valueLabels[index]}
        </text>
      </g>,
    )
    y += rowHeight
  })
  if (lo < 0) nodes.unshift(<line key="zero" x1={X(0)} x2={X(0)} y1={top - 4} y2={y} className={GRID_STROKE} />)
  if (model.note) {
    const noteLines = wrapText(model.note, width - 2 * p, 13, 4)
    nodes.push(<line key="note-rule" x1={p} x2={width - p} y1={y + 10} y2={y + 10} className={GRID_STROKE} />)
    noteLines.forEach((line, k) =>
      nodes.push(
        <text key={`note-${k}`} x={p} y={y + 30 + k * 17} className={cn(titleFill(), "text-[13px] font-semibold")}>
          {line}
        </text>,
      ),
    )
    y += 30 + (noteLines.length - 1) * 17 + 8
  }
  return { width, height: y + 8, body: [title.node, ...nodes] }
}

// ------------------------------------------------------------------------------------------------ stack

function stackLayout(model: Fig<"stack">, width: number): Layout {
  const p = pad(width)
  const title = titleBlock(model.title, width)
  const parts = model.parts
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0) || 1
  const inner = width - 2 * p
  const top = title.height || 12
  const BAR = 32
  const nodes: ReactNode[] = [title.node]
  let x = p
  parts.forEach((part, index) => {
    const w = (Math.max(0, part.value) / total) * inner
    const share = `${formatFigureNumber((Math.max(0, part.value) / total) * 100, 1)}%`
    nodes.push(
      <g key={`seg-${index}`}>
        <rect x={x} y={top} width={Math.max(1, w - 2)} height={BAR} rx={4} className={TONE_FILL[toneOr(part.tone, "p1")]} />
        {w > textWidth(share, 12.5) + 12 && (
          <text x={x + w / 2} y={top + BAR / 2 + 4.5} textAnchor="middle" className="fill-white text-[12.5px] font-extrabold tabular-nums">
            {share}
          </text>
        )}
      </g>,
    )
    x += w
  })
  const columns = width >= 520 ? 2 : 1
  const colWidth = inner / columns
  let y = top + BAR + 16
  for (let row = 0; row * columns < parts.length; row += 1) {
    const cells = parts.slice(row * columns, row * columns + columns)
    const wrapped = cells.map((part) => wrapText(`${part.label}: ${withUnit(part.value, model.decimals, model.unit)}`, colWidth - 28, 13, 3))
    const rowLines = Math.max(...wrapped.map((lines) => lines.length))
    cells.forEach((part, k) => {
      const cx = p + k * colWidth
      nodes.push(
        <g key={`legend-${row}-${k}`}>
          <rect x={cx} y={y} width={12} height={12} rx={3} className={TONE_FILL[toneOr(part.tone, "p1")]} />
          {wrapped[k].map((line, j) => (
            <text key={j} x={cx + 20} y={y + 11 + j * 17} className={cn(titleFill(), "text-[13px] font-semibold")}>
              {line}
            </text>
          ))}
        </g>,
      )
    })
    y += rowLines * 17 + 9
  }
  if (model.note) {
    const noteLines = wrapText(model.note, inner, 13, 4)
    noteLines.forEach((line, k) =>
      nodes.push(
        <text key={`note-${k}`} x={p} y={y + 14 + k * 17} className={cn(titleFill(), "text-[13px] font-semibold")}>
          {line}
        </text>,
      ),
    )
    y += 14 + noteLines.length * 17
  }
  return { width, height: y + 6, body: nodes }
}

// --------------------------------------------------------------------------------------------------- wf

const STEP_TONE: Record<Fig<"wf">["items"][number]["step"], ChartTone> = { base: "p1", plus: "pos", minus: "neg", total: "info" }

function wfLayout(model: Fig<"wf">, width: number): Layout {
  const p = pad(width)
  const title = titleBlock(model.title, width)
  const items = model.items
  const n = Math.max(1, items.length)
  const colWidth = (width - 2 * p) / n
  const barWidth = Math.min(80, colWidth * 0.6)
  const LABEL = width < 480 ? 11 : 12.5
  const segments: [number, number][] = []
  let acc = 0
  for (const item of items) {
    if (item.step === "base" || item.step === "total") {
      segments.push([0, item.value])
      acc = item.value
    } else if (item.step === "plus") {
      segments.push([acc, acc + item.value])
      acc += item.value
    } else {
      segments.push([acc, acc - item.value])
      acc -= item.value
    }
  }
  const all = segments.flat()
  const lo = Math.min(0, ...all)
  const hi = Math.max(0, ...all)
  const labels = items.map((item) => wrapText(item.label, colWidth - 4, LABEL, 3))
  const labelLines = Math.max(1, ...labels.map((lines) => lines.length))
  const valueTexts = items.map(
    (item) => `${item.step === "minus" ? "−" : item.step === "plus" ? "+" : ""}${withUnit(Math.abs(item.value), model.decimals, model.unit)}`,
  )
  // Value labels sit over the bars: shrink them until the widest fits its column.
  const widest = Math.max(1, ...valueTexts.map((text) => text.length))
  const valueSize = Math.max(9, Math.min(12.5, (colWidth - 4) / (widest * 0.56)))
  const top = (title.height || 8) + valueSize + 10
  const plot = Math.max(120, (model.height ?? 270) - 120)
  const bottom = top + plot
  const Y = (v: number) => bottom - ((v - lo) / (hi - lo || 1)) * (bottom - top)
  const nodes: ReactNode[] = [title.node]
  if (lo < 0) nodes.push(<line key="zero" x1={p} x2={width - p} y1={Y(0)} y2={Y(0)} className={GRID_STROKE} />)
  items.forEach((item, index) => {
    const cx = p + colWidth * (index + 0.5)
    const [a, b] = segments[index]
    const y0 = Math.min(Y(a), Y(b))
    nodes.push(
      <g key={index}>
        <rect
          x={cx - barWidth / 2}
          y={y0}
          width={barWidth}
          height={Math.max(2, Math.abs(Y(a) - Y(b)))}
          rx={3}
          className={TONE_FILL[toneOr(item.tone, STEP_TONE[item.step])]}
        />
        <text x={cx} y={y0 - 6} textAnchor="middle" className={cn(titleFill(), "font-extrabold tabular-nums")} style={{ fontSize: `${valueSize}px` }}>
          {valueTexts[index]}
        </text>
        {labels[index].map((line, k) => (
          <text key={k} x={cx} y={bottom + 18 + k * (LABEL + 4)} textAnchor="middle" className={cn(titleFill(), "font-semibold")} style={{ fontSize: `${LABEL}px` }}>
            {line}
          </text>
        ))}
      </g>,
    )
  })
  return { width, height: bottom + 18 + (labelLines - 1) * (LABEL + 4) + 12, body: nodes }
}

// ------------------------------------------------------------------------------------------------ lines

function linesLayout(model: Fig<"lines">, width: number): Layout {
  const p = pad(width)
  const title = titleBlock(model.title, width)
  const wide = width >= 560
  const nodes: ReactNode[] = [title.node]
  let y = title.height || 12
  const inner = width - 2 * p
  model.rows.forEach((row, index) => {
    const tone = toneOr(row.tone, "p1")
    const codeWidth = row.code ? textWidth(row.code, 13) + 16 : 0
    const textLeft = p + 20
    const reportWidth = wide ? Math.round(inner * 0.32) : inner - 28 - codeWidth
    const reportLines = wrapText(row.report, reportWidth - 8, 12.5, 2)
    const lineLeft = wide ? textLeft + reportWidth : textLeft
    const lineWidth = wide ? width - p - 12 - codeWidth - lineLeft : inner - 28
    const lineLines = wrapText(row.line, lineWidth, 13.5, 3)
    const contentLines = wide ? Math.max(reportLines.length, lineLines.length) : reportLines.length + lineLines.length
    const h = Math.max(32, contentLines * 17 + 15)
    const firstBase = y + 21
    nodes.push(
      <g key={index}>
        <rect x={p} y={y} width={inner} height={h} rx={8} className={cn("fill-muted/40", GRID_STROKE)} />
        <rect x={p} y={y} width={6} height={h} rx={3} className={TONE_FILL[tone]} />
        {reportLines.map((line, k) => (
          <text key={`r${k}`} x={textLeft} y={firstBase + k * 17} className={cn(LABEL_FILL, "text-[12.5px] font-semibold")}>
            {line}
          </text>
        ))}
        {lineLines.map((line, k) => (
          <text
            key={`l${k}`}
            x={lineLeft}
            y={firstBase + (wide ? k : reportLines.length + k) * 17}
            className={cn(titleFill(), "text-[13.5px] font-extrabold")}
          >
            {line}
          </text>
        ))}
        {row.code && (
          <text x={width - p - 12} y={firstBase} textAnchor="end" className={cn(textFill(toneOr(row.tone, "warn")), "text-[13px] font-extrabold")}>
            {row.code}
          </text>
        )}
      </g>,
    )
    y += h + 6
  })
  return { width, height: y + 4, body: nodes }
}

// ------------------------------------------------------------------------------------------------ chart

/** Number of drawable entries: a figure without any draws nothing (spec v5 §10.11 "không hình trống"). */
function entryCount(model: FigureChartModel): number {
  switch (model.fig) {
    case "formula":
    case "hbar":
    case "wf":
      return model.items.length
    case "stack":
      return model.parts.length
    case "lines":
      return model.rows.length
    default:
      return 0
  }
}

function figureLayout(model: FigureChartModel, width: number): Layout | null {
  if (entryCount(model) === 0) return null
  const w = Math.round(Math.min(FIGURE_MAX_WIDTH, width))
  switch (model.fig) {
    case "formula":
      return formulaLayout(model, w)
    case "hbar":
      return hbarLayout(model, w)
    case "stack":
      return stackLayout(model, w)
    case "wf":
      return wfLayout(model, w)
    case "lines":
      return linesLayout(model, w)
    default:
      return null
  }
}

export function FigureChart({ model, label }: { model: FigureChartModel; label: string }) {
  const [measure, width] = useChartWidth()
  const layout = figureLayout(model, width)
  return (
    <div ref={measure} className="w-full min-w-0" data-figure={model.fig}>
      {layout ? (
        <svg
          viewBox={`0 0 ${layout.width} ${Math.ceil(layout.height)}`}
          width="100%"
          className="mx-auto block h-auto"
          style={{ maxWidth: `${layout.width}px` }}
          role="img"
          aria-label={label}
        >
          <title>{label}</title>
          {layout.body}
        </svg>
      ) : (
        <p className="rounded-md border border-dashed border-border p-3 text-sm text-academy-subtle">Hình này chưa có dữ liệu.</p>
      )}
    </div>
  )
}
