import { cn } from "@/lib/utils"
import type { ChartTone } from "../content-types"
import { DASH, LABEL_TEXT, TONE_BG, TONE_STROKE } from "./chart-theme"

export type LegendEntry = { label: string; tone: ChartTone; shape?: "dot" | "line" | "bar"; dash?: boolean }

/** Legend row under a chart title: swatch in the series token, label in the academy label colour. */
export function ChartLegendList({ entries, className }: { entries: readonly LegendEntry[]; className?: string }) {
  return (
    <ul className={cn("m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs", LABEL_TEXT, className)} aria-label="Chú giải">
      {entries.map((entry, index) => (
        <li key={`${entry.label}-${index}`} className="inline-flex items-center gap-1.5">
          {entry.shape === "line" ? (
            <svg width="20" height="8" aria-hidden="true" className="shrink-0">
              <line
                x1="0"
                x2="20"
                y1="4"
                y2="4"
                strokeWidth="2"
                strokeDasharray={entry.dash ? DASH : undefined}
                className={TONE_STROKE[entry.tone]}
              />
            </svg>
          ) : (
            <span
              aria-hidden="true"
              className={cn("size-2 shrink-0", entry.shape === "bar" ? "rounded-[1px]" : "rounded-full", TONE_BG[entry.tone])}
            />
          )}
          {entry.label}
        </li>
      ))}
    </ul>
  )
}
