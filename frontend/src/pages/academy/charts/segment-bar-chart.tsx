import { Banknote } from "lucide-react"

import { cn } from "@/lib/utils"
import type { SegmentBarModel } from "./chart-math"
import { ChartLegendList } from "./chart-legend"
import { TONE_BG, TONE_BORDER, textColor } from "./chart-theme"

type Row = SegmentBarModel["rows"][number]

const pct = (value: number, max: number) => `${Math.max(0, Math.min(100, (value / max) * 100))}%`

/**
 * K3: horizontal proportion rows drawn in HTML so labels wrap on a phone. A ghost segment is the
 * missing part (dashed outline). With a pictogram each unit is one icon and a fraction is clipped.
 */
export function SegmentBarChart({ model, label }: { model: SegmentBarModel; label: string }) {
  return (
    <div role="img" aria-label={label} className="w-full min-w-0 space-y-3">
      {model.legend && <ChartLegendList entries={model.legend} />}
      {model.rows.map((row, rowIndex) => (
        <SegmentRow
          key={`${row.label}-${rowIndex}`}
          row={row}
          model={model}
          brackets={(model.brackets ?? []).filter((bracket) => bracket.row === rowIndex)}
        />
      ))}
    </div>
  )
}

function SegmentRow({ row, model, brackets }: { row: Row; model: SegmentBarModel; brackets: NonNullable<SegmentBarModel["brackets"]> }) {
  const labelled = row.segments.filter((segment) => !segment.ghost && (segment.label || segment.sub))
  return (
    <div className="space-y-1.5" aria-hidden="true">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-sm font-semibold text-foreground">
          {row.label}
          {row.sub && <span className="ml-2 text-xs font-normal text-academy-subtle">{row.sub}</span>}
        </p>
        {row.total && <p className={cn("text-sm font-semibold tabular-nums", row.total.tone ? textColor(row.total.tone) : "text-foreground")}>{row.total.text}</p>}
      </div>
      {model.pictogram ? (
        <Pictogram row={row} perUnit={model.pictogram.per_unit} max={model.max} />
      ) : (
        <div className="flex h-5 w-full overflow-hidden rounded-sm bg-muted/60">
          {row.segments.map((segment, index) => (
              <span
                key={index}
                className={cn(
                  "block h-full shrink-0 first:rounded-l-sm last:rounded-r-sm",
                  segment.ghost ? cn("border border-dashed bg-transparent", TONE_BORDER[segment.tone]) : TONE_BG[segment.tone],
                )}
                style={{ width: pct(segment.value, model.max) }}
              />
          ))}
        </div>
      )}
      {brackets.map((bracket, index) => (
        <div key={index} className="relative h-5">
          <span
            className={cn("absolute top-0 h-2 border-x-2 border-b-2", TONE_BORDER[bracket.tone])}
            style={{ left: pct(bracket.from, model.max), width: pct(bracket.to - bracket.from, model.max) }}
          />
          <span
            className={cn("absolute top-2.5 text-xs font-semibold whitespace-nowrap", textColor(bracket.tone))}
            style={
              bracket.from / model.max > 0.5
                ? { right: `calc(100% - ${pct(bracket.to, model.max)})` }
                : { left: pct(bracket.from, model.max) }
            }
          >
            {bracket.label}
          </span>
        </div>
      ))}
      {labelled.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
          {labelled.map((segment, index) => (
            <li key={index} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-[1px]", TONE_BG[segment.tone])} />
              <span className={textColor(segment.tone)}>{segment.label}</span>
              {segment.sub && <span className="text-academy-subtle">{segment.sub}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Pictogram({ row, perUnit, max }: { row: Row; perUnit: number; max: number }) {
  const slots = Math.ceil(max / perUnit)
  const icons: { tone: Row["segments"][number]["tone"]; ghost: boolean; fill: number }[] = []
  for (const segment of row.segments) {
    let remaining = segment.value / perUnit
    while (remaining > 1e-6 && icons.length < slots) {
      const last = icons[icons.length - 1]
      if (last && last.fill < 1 && !segment.ghost) {
        const add = Math.min(1 - last.fill, remaining)
        last.fill += add
        remaining -= add
        continue
      }
      const fill = Math.min(1, remaining)
      icons.push({ tone: segment.tone, ghost: segment.ghost === true, fill })
      remaining -= fill
    }
  }
  return (
    <div className="flex flex-wrap gap-1">
      {icons.map((icon, index) =>
        icon.ghost ? (
          <Banknote key={index} aria-hidden="true" className="size-6 shrink-0 text-border" strokeWidth={1.5} />
        ) : (
          <span key={index} className="relative inline-block size-6 shrink-0">
            <Banknote aria-hidden="true" className="absolute inset-0 size-6 text-border" strokeWidth={1.5} />
            <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${icon.fill * 100}%` }}>
              <Banknote aria-hidden="true" className={cn("size-6", textColor(icon.tone))} strokeWidth={1.8} />
            </span>
          </span>
        ),
      )}
    </div>
  )
}
