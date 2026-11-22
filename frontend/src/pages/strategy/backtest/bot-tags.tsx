import { ArrowRight, Play } from "lucide-react"

import type { StrategySource } from "./api"
import { sessionLabel, type BotSchedule } from "../shared/bot-schedule"
import { botTags } from "./schedule"

/** `▶ Đang chạy trên Bot` / `→ Phiên tới (Thứ 2 09/11)` of one strategy, or one version of it. */
export function BotTags({
  schedule,
  source,
  id,
  version,
  fallback,
}: {
  schedule: BotSchedule | undefined
  source: StrategySource
  id: string
  version?: number
  /** `on_bot` of a list row, used while the schedule is not loaded. */
  fallback?: { last: boolean; next: boolean }
}) {
  const tags = schedule ? botTags(schedule, { source, id, version }) : { running: !!fallback?.last, next: !!fallback?.next && !fallback?.last }
  if (!tags.running && !tags.next) return null
  return (
    <span className="flex flex-wrap gap-1 text-[11px] leading-4" data-testid={`bot-tags-${id}${version !== undefined ? `-${version}` : ""}`}>
      {tags.running && (
        <span className="inline-flex items-center gap-1 rounded-sm border border-price-up/50 bg-price-up/10 px-1.5 py-0.5 font-semibold text-price-up">
          <Play aria-hidden="true" className="size-3" />
          Đang chạy trên Bot
        </span>
      )}
      {tags.next && (
        <span className="inline-flex items-center gap-1 rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
          <ArrowRight aria-hidden="true" className="size-3" />
          Phiên tới{schedule?.next.session_date ? ` (${sessionLabel(schedule.next.session_date)})` : ""}
        </span>
      )}
    </span>
  )
}

/** `Bot đang chạy: [IQX] {tên} · {bản}` or `Bot: chưa chọn chiến lược` (top bar, §4.2 / §4.3). */
export function BotRunningText({ schedule }: { schedule: BotSchedule | undefined }) {
  const last = schedule?.last
  if (!schedule) return null
  if (!last || !last.source) return <span className="text-xs" data-testid="bot-running">Bot: chưa chọn chiến lược</span>
  return (
    <span className="min-w-0 text-xs break-words" data-testid="bot-running">
      Bot đang chạy: {last.source === "iqx" && <span className="mr-1 inline-flex rounded-sm bg-primary px-1 text-[9.5px] font-bold text-primary-foreground">IQX</span>}
      <b>{last.name ?? "—"}</b>
      {last.version_label ? ` · ${last.version_label}` : ""}
    </span>
  )
}
