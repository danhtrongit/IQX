/**
 * Rich-text fragment renderer for the AI Insight briefing (narrative, diffs,
 * observations, layer field values). The backend sends structured fragments so
 * emphasis keeps its market meaning: bull/bear tint with the OHLC tokens, warn
 * with the reference (gold) token, numbers tabular.
 */
import { cn } from "@/lib/utils"

import type { NarrativeFragment } from "../types"
import { normalizeFragments } from "./normalize-insight"

type EmphasisVariant = Extract<NarrativeFragment, { type: "emphasis" }>["variant"]

const EMPHASIS_TONE: Record<EmphasisVariant, string> = {
  bull: "text-price-up",
  bear: "text-price-down",
  warn: "text-price-ref",
  info: "text-primary",
}

export function NarrativeText({ fragments }: { fragments?: NarrativeFragment[] }) {
  // Injected analyses can bypass the API adapter. Keep their rendering safe.
  let safeFragments: NarrativeFragment[] = []
  try {
    safeFragments = normalizeFragments(fragments)
  } catch {
    // The API boundary reports malformed server data; injected data stays blank.
  }
  return (
    <span>
      {safeFragments.map((fragment, index) => {
        switch (fragment.type) {
          case "text":
            return <span key={index}>{fragment.content}</span>
          case "emphasis":
            return (
              <span
                key={index}
                className={cn("font-medium italic", EMPHASIS_TONE[fragment.variant] ?? "text-foreground")}
              >
                {fragment.content}
              </span>
            )
          case "number":
            return (
              <span key={index} className="font-semibold tabular-nums">
                {fragment.content}
              </span>
            )
          case "highlight":
            return (
              <b key={index} className="bg-muted px-1 font-medium">
                {fragment.content}
              </b>
            )
          default:
            return null
        }
      })}
    </span>
  )
}
