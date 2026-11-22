import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"
import { cn } from "@/lib/utils"

import { ErrorLine } from "../shared/controls"
import { errorMessage } from "../shared/errors"
import type { IqxStrategyItem } from "../shared/iqx"
import { IqxBadge } from "../shared/iqx-ui"
import { BotTags } from "./bot-tags"
import type { BotSchedule } from "../shared/bot-schedule"
import { contentFromDefinition, strategySummary } from "./draft"
import { SUB_TEXT } from "./ui"

/**
 * Tab IQX of the Backtest (§4.2): the shown Chiến lược IQX in the admin's order. A click on the whole card
 * selects it (accent border); there is no "Dùng" (choosing for the Bot happens on the Bot page).
 */
export function IqxStrategyLibrary({
  items,
  loading,
  error,
  onRetry,
  registry,
  activeId,
  schedule,
  onSelect,
}: {
  items: IqxStrategyItem[]
  loading: boolean
  error: unknown
  onRetry: () => void
  registry: readonly TechnicalIndicator[]
  activeId: string | null
  schedule: BotSchedule | undefined
  onSelect: (item: IqxStrategyItem) => void
}) {
  if (error) {
    return (
      <div className="space-y-2">
        <ErrorLine>{errorMessage(error)}</ErrorLine>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>Thử lại</Button>
      </div>
    )
  }
  if (loading) return <Skeleton className="h-28 w-full" aria-label="Đang tải chiến lược IQX" />
  if (items.length === 0) return <p className={`text-xs ${SUB_TEXT}`}>Chưa có chiến lược IQX nào.</p>
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const summary = strategySummary(contentFromDefinition(item.content.definition), registry)
        const active = activeId === item.id
        return (
          <li key={item.id}>
            <button
              type="button"
              data-testid={`iqx-strategy-${item.slug}`}
              data-active={active || undefined}
              aria-pressed={active}
              onClick={() => onSelect(item)}
              className={cn(
                "w-full space-y-1.5 rounded-md border bg-background/40 px-3 py-2.5 text-left transition-colors hover:bg-muted",
                active ? "border-primary ring-1 ring-primary" : "border-border",
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold break-words">
                <IqxBadge />
                <span className="min-w-0">{item.content.name}</span>
              </span>
              <span className={`block text-[11.5px] leading-4 ${SUB_TEXT}`}>{item.content.idea}</span>
              <span className="block text-[11px] leading-4">
                <span className="block text-price-up">{summary.buy}</span>
                <span className="block text-price-down">{summary.sell}</span>
                <span className="block">{summary.universe}</span>
              </span>
              <BotTags schedule={schedule} source="iqx" id={item.id} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
