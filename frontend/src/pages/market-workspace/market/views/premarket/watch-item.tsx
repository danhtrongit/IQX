// ─── Watch item ───────────────────────────────────────────────────────────────
// One line of the pre-session watch list. The level drives the left accent and
// the row wash: warn = destructive/red, alert = accent/gold, normal = the
// pre-market (primary) accent. The content is AI-written inline HTML.

import { cn } from "@/lib/utils"

import { RichText } from "../../rich-text"
import type { PreMarketAnalysis } from "../../types"

type WatchLevel = PreMarketAnalysis["watchlist"][number]["level"]

const LEVEL_ROW: Record<WatchLevel, string> = {
  warn: "border-l-destructive bg-destructive/8",
  alert: "border-l-accent bg-accent/8",
  normal: "border-l-primary",
}

const LEVEL_DOT: Record<WatchLevel, string> = {
  warn: "bg-destructive",
  alert: "bg-accent",
  normal: "bg-primary",
}

export function WatchItem({ level, content }: { level: WatchLevel; content: string }) {
  return (
    <li
      className={cn(
        "flex items-start gap-2.5 rounded-md border-l-2 px-3 py-1.5 text-sm leading-6",
        LEVEL_ROW[level],
      )}
    >
      <span aria-hidden="true" className={cn("mt-2 size-1.5 shrink-0 rounded-full", LEVEL_DOT[level])} />
      <RichText html={content} className="min-w-0 text-muted-foreground" />
    </li>
  )
}
