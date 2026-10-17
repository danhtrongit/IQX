import { Lock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { itemLabel, rowAction } from "../catalog-model"
import type { CatalogItem, ItemState } from "../content-types"

/**
 * One item of a chapter: its name, "Tự chọn" for the practice room, and exactly one control. A
 * locked item has no button at all (Lock icon + "Chưa mở"). The state always comes from the server;
 * while it is unknown the row shows no control rather than a guess.
 */
export function ItemRow({
  item,
  state,
  current,
  onSelect,
}: {
  item: CatalogItem
  state: ItemState | undefined
  current: boolean
  onSelect: (itemId: string) => void
}) {
  const label = itemLabel(item)
  const action = state ? rowAction(item, state) : null
  return (
    <li
      data-academy-row={item.id}
      data-state={state ?? "unknown"}
      className={cn(
        "flex items-center gap-2 border-t border-border py-2.5",
        current && "-mx-2 rounded-sm border-t-transparent bg-primary/10 px-2",
      )}
    >
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <span className={cn("block text-xs leading-snug font-medium", state === "locked" ? "text-academy-label" : "text-foreground")}>
          {label}
        </span>
        {item.optional && (
          <Badge variant="outline" className="mt-1">
            Tự chọn
          </Badge>
        )}
      </div>
      {state === "locked" ? (
        <div aria-disabled="true" className="inline-flex shrink-0 items-center gap-1 text-[11px] text-academy-label">
          <Lock className="size-3" aria-hidden="true" />
          Chưa mở
        </div>
      ) : action ? (
        <Button
          type="button"
          variant={state === "passed" ? "outline" : "default"}
          size="sm"
          className="shrink-0"
          aria-label={`${action} ${label}`}
          aria-current={current ? "true" : undefined}
          onClick={() => onSelect(item.id)}
        >
          {action}
        </Button>
      ) : null}
    </li>
  )
}
