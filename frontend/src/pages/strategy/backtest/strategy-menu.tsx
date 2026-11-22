import { useState } from "react"
import { ChevronDown, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import { ErrorLine } from "../shared/controls"
import { errorMessage } from "../shared/errors"
import { STRATEGY_LIMIT, type StrategyItem } from "./api"
import type { BotSchedule } from "../shared/bot-schedule"
import { botTags } from "./schedule"
import { BotTags } from "./bot-tags"
import { stampLabel } from "./draft"
import { useStrategies } from "./hooks"
import { IN_USE_TEXT, LIMIT_TEXT } from "./save-errors"
import { LABEL, SUB_TEXT } from "./ui"

function inUse(item: StrategyItem, schedule: BotSchedule | undefined): boolean {
  if (!schedule) return item.on_bot.last || item.on_bot.next
  const matches = (entry: BotSchedule["last"]) => !!entry && entry.source === "user" && entry.id === item.id
  return matches(schedule.last) || matches(schedule.next) || item.on_bot.last || item.on_bot.next
}

/**
 * Nút tên chiến lược ▾ (§4.3): only the name (or `Chiến lược mới`). The menu lists the saved strategies
 * (n/20) with their Bot labels and a delete button (locked while the Bot runs it last or next), then
 * `＋ Tạo chiến lược mới` (locked at 20).
 */
export function StrategyMenu({
  title,
  activeId,
  schedule,
  onOpen,
  onNew,
  onDelete,
}: {
  title: string
  activeId: string | null
  schedule: BotSchedule | undefined
  onOpen: (item: StrategyItem) => void
  onNew: () => void
  onDelete: (item: StrategyItem) => void
}) {
  const [open, setOpen] = useState(false)
  const strategies = useStrategies()
  const items = strategies.data?.items ?? []
  const limit = strategies.data?.limit ?? STRATEGY_LIMIT
  const full = items.length >= limit
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-9 max-w-full min-w-0 justify-between gap-2" aria-label={`Chiến lược: ${title}. Chọn chiến lược đã lưu hoặc tạo mới`} data-testid="strategy-picker">
          <b className="min-w-0 truncate">{title}</b>
          <ChevronDown aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(380px,calc(100vw-2rem))] gap-1.5 p-2" data-testid="strategy-menu">
        <h3 className={`px-2 pt-1 ${LABEL}`}>Chiến lược đã lưu ({items.length}/{limit})</h3>
        {strategies.isPending ? (
          <Skeleton className="h-12 w-full" aria-label="Đang tải chiến lược" />
        ) : strategies.isError ? (
          <div className="space-y-2 px-2">
            <ErrorLine>{errorMessage(strategies.error)}</ErrorLine>
            <Button type="button" size="sm" variant="outline" onClick={() => void strategies.refetch()}>Thử lại</Button>
          </div>
        ) : items.length === 0 ? (
          <p className={`px-2 py-1.5 text-xs ${SUB_TEXT}`}>Chưa có chiến lược nào.</p>
        ) : (
          <ul className="max-h-[50vh] space-y-0.5 overflow-y-auto">
            {items.map((item) => {
              const locked = inUse(item, schedule)
              const tags = botTags(schedule, { source: "user", id: item.id })
              return (
                <li key={item.id} className={cn("flex items-stretch gap-1 rounded-md", activeId === item.id && "bg-muted")} data-testid={`strategy-row-${item.id}`}>
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                    onClick={() => { setOpen(false); onOpen(item) }}
                  >
                    <span className="block text-sm font-semibold break-words">{item.name}</span>
                    {(tags.running || tags.next || item.on_bot.last || item.on_bot.next) && <BotTags schedule={schedule} source="user" id={item.id} fallback={item.on_bot} />}
                    <span className={`block text-[11px] ${SUB_TEXT}`}>
                      Bản mới nhất {stampLabel(item.latest_saved_at)} · {item.universe_label}
                    </span>
                  </button>
                  <span className="flex items-center" title={locked ? IN_USE_TEXT : undefined}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={locked}
                      aria-label={locked ? `Không xóa được ${item.name}: ${IN_USE_TEXT}` : `Xóa ${item.name}`}
                      className="text-price-down hover:text-price-down"
                      onClick={() => { setOpen(false); onDelete(item) }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <div className="border-t border-border pt-1.5">
          <Button type="button" variant="ghost" className="h-auto w-full justify-start px-2 py-1.5 text-primary" disabled={full} onClick={() => { setOpen(false); onNew() }}>
            <Plus aria-hidden="true" />
            Tạo chiến lược mới
          </Button>
          {full && <p className={`px-2 text-[11px] ${SUB_TEXT}`}>{LIMIT_TEXT}</p>}
        </div>
        <p className={`px-2 pb-1 text-[11px] leading-4 ${SUB_TEXT}`}>Không xóa được chiến lược Bot đang chạy hoặc sẽ chạy phiên tới.</p>
      </PopoverContent>
    </Popover>
  )
}
