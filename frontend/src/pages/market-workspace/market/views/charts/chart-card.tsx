import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface ChartCardTag {
  label: string
  tone?: "am" | "frozen"
}

export interface ChartCardProps {
  title: string
  children: ReactNode
  /** Small pill in the header — the midday view labels its data state here. */
  tag?: ChartCardTag
  /** Dims the body and (with `frozenNote`) shows the bottom banner. */
  frozen?: boolean
  frozenNote?: string
}

/**
 * Shell shared by every end-of-day chart: accent bar + title + optional tag
 * pill, a body that dims when `frozen`, and a bottom note banner that names the
 * frozen data's session. Presentational only.
 */
export function ChartCard({ title, children, tag, frozen, frozenNote }: ChartCardProps) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-[1px] bg-primary" />
        <span className="font-heading text-sm font-bold tracking-[-0.01em] text-foreground">
          {title}
        </span>
        {tag && (
          <span
            className={cn(
              "ml-auto rounded-full border border-border px-2 py-0.5 text-xs font-semibold tracking-[0.03em] whitespace-nowrap",
              tag.tone === "frozen"
                ? "bg-muted text-muted-foreground"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            {tag.label}
          </span>
        )}
      </div>

      <div className={cn("flex-1 p-4", frozen && "pointer-events-none opacity-55")}>{children}</div>

      {frozen && frozenNote && (
        <div className="border-t border-border bg-muted/60 px-4 py-1.5 text-center text-xs tracking-[0.01em] text-muted-foreground">
          {frozenNote}
        </div>
      )}
    </div>
  )
}
