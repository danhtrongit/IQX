/**
 * Compact "so với phiên trước" footer inside every layer card.
 */
import type { NarrativeFragment } from "../types"

import { NarrativeText } from "./narrative-text"

export function LayerDiff({
  diff,
}: {
  diff: { text?: NarrativeFragment[]; hasChange?: boolean }
}) {
  return (
    <div className="mt-4 flex items-start gap-3 border-l-2 border-l-price-ref bg-price-ref/5 px-3 py-2">
      <span className="shrink-0 pt-px text-xs font-semibold tracking-widest whitespace-nowrap text-price-ref uppercase">
        SO VỚI PHIÊN TRƯỚC
      </span>
      <span className="text-xs leading-5 text-foreground">
        <NarrativeText fragments={diff.text} />
      </span>
    </div>
  )
}
