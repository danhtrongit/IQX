import { ArrowLeft, ArrowRight, Lock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { itemLabel } from "../catalog-model"
import type { CatalogItem, ItemState } from "../content-types"

/**
 * Previous and next item of the flat learning chain (across chapters). An item the server reports
 * as locked cannot be opened from here: its button stays disabled with a lock.
 */
export function ItemPager({
  prev,
  next,
  states,
  onOpen,
}: {
  prev: CatalogItem | null
  next: CatalogItem | null
  states: ReadonlyMap<string, ItemState>
  onOpen: (itemId: string) => void
}) {
  if (!prev && !next) return null
  const locked = (item: CatalogItem) => states.get(item.id) === "locked"
  return (
    <nav aria-label="Bài trước và bài sau" className="mt-3 flex flex-wrap items-center justify-between gap-2">
      {prev ? (
        <Button
          type="button"
          variant="outline"
          disabled={locked(prev)}
          onClick={() => onOpen(prev.id)}
          className="h-auto min-h-8 max-w-full py-1.5 text-left whitespace-normal disabled:text-academy-label disabled:opacity-100"
        >
          {locked(prev) ? <Lock aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />}
          <span className="sr-only">Bài trước: </span>
          {itemLabel(prev)}
        </Button>
      ) : (
        <span />
      )}
      {next && (
        <Button
          type="button"
          variant="outline"
          disabled={locked(next)}
          onClick={() => onOpen(next.id)}
          className="ml-auto h-auto min-h-8 max-w-full py-1.5 text-left whitespace-normal disabled:text-academy-label disabled:opacity-100"
        >
          <span className="sr-only">Bài sau: </span>
          {itemLabel(next)}
          {locked(next) ? <Lock aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
        </Button>
      )}
    </nav>
  )
}
