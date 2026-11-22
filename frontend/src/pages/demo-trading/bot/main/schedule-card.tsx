/**
 * Lịch phiên (spec Bot và Chiến lược v2.0 §5.3): the last and the next session, the strategy and
 * version of each, `không đổi` / `có thay đổi` with Xem khác biệt and Giữ như phiên gần nhất, and the
 * "IQX có bản mới" box. Only labels and states: the rules live in the Nguyên tắc Bot modal.
 */
import { useState } from "react"
import { CalendarClock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  hasStrategy,
  keepLastSchedule,
  putScheduleNext,
  sameScheduled,
  scheduledName,
  sessionLabel,
  useBotSchedule,
  type ScheduleEntry,
  type ScheduleStrategy,
} from "@/pages/strategy/shared/bot-schedule"
import { ScheduleChangeDialog } from "@/pages/strategy/shared/due-confirm"
import type { StrategyContent } from "@/pages/strategy/shared/strategy-diff"

import { messageOf } from "../api"
import { DiffDialog } from "./diff-dialog"

export function IqxBadge() {
  return <Badge variant="outline" className="h-4 shrink-0 border-primary/50 px-1 text-[10px] font-bold text-primary">IQX</Badge>
}

function EntryName({ entry }: { entry: ScheduleEntry | null | undefined }) {
  if (!hasStrategy(entry)) return <span className="text-foreground">Chưa chọn chiến lược</span>
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {entry.source === "iqx" && <IqxBadge />}
      <strong className="min-w-0 break-words">{entry.name}</strong>
      <span className="text-academy-subtle">· {entry.version_label}</span>
    </span>
  )
}

type Diff = { from: StrategyContent; to: StrategyContent; fromLabel: string; toLabel: string }

export function ScheduleCard() {
  const schedule = useBotSchedule()
  const [diff, setDiff] = useState<Diff | null>(null)
  const [dialog, setDialog] = useState<"keep" | "iqx" | null>(null)

  if (schedule.isPending) return <Skeleton className="h-28 w-full rounded-lg" aria-label="Đang tải lịch phiên" />
  if (schedule.isError) {
    return (
      <section aria-label="Lịch phiên" className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3.5 text-xs text-foreground">
        <span role="alert">Không tải được lịch phiên. {messageOf(schedule.error)}</span>
        <Button type="button" size="xs" variant="outline" onClick={() => void schedule.refetch()}>Thử lại</Button>
      </section>
    )
  }

  const { last, next, iqx_update: iqxUpdate } = schedule.data
  const same = sameScheduled(last, next)
  const lastStrategy: ScheduleStrategy | null = hasStrategy(last) ? last : null
  const nextStrategy: ScheduleStrategy | null = hasStrategy(next) ? next : null
  const nextLabel = sessionLabel(next.session_date)

  return (
    <section aria-label="Lịch phiên" data-testid="bot-schedule" className="rounded-lg border border-border bg-card p-3.5">
      <h2 className="flex items-center gap-1.5 font-heading text-sm font-bold">
        <CalendarClock aria-hidden="true" className="size-4 text-primary" />
        Lịch phiên
      </h2>
      <dl className="mt-2 divide-y divide-border text-xs">
        <div data-testid="schedule-last" className="grid gap-1 py-2 min-[480px]:grid-cols-[9.5rem_minmax(0,1fr)] min-[480px]:gap-3">
          <dt>
            <span className="block text-[10px] tracking-wide text-academy-subtle uppercase">Phiên gần nhất</span>
            <strong>{last ? sessionLabel(last.session_date) : "—"}</strong>
          </dt>
          <dd className="min-w-0 self-center"><EntryName entry={last} /></dd>
        </div>
        <div data-testid="schedule-next" className="grid gap-1 py-2 min-[480px]:grid-cols-[9.5rem_minmax(0,1fr)] min-[480px]:gap-3">
          <dt>
            <span className="block text-[10px] tracking-wide text-academy-subtle uppercase">Phiên tới</span>
            <strong>{nextLabel}</strong>
          </dt>
          <dd className="min-w-0 space-y-1.5 self-center">
            {!nextStrategy ? (
              <span className="text-foreground">Chưa chọn chiến lược · chọn ở danh sách bên phải</span>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <EntryName entry={nextStrategy} />
                {same ? (
                  <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium">không đổi</span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                    có thay đổi
                  </span>
                )}
              </div>
            )}
            {nextStrategy && !same && lastStrategy && (
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => setDiff({ from: lastStrategy.content, to: nextStrategy.content, fromLabel: scheduledName(lastStrategy), toLabel: scheduledName(nextStrategy) })}
                >
                  Xem khác biệt
                </Button>
                <Button type="button" size="xs" variant="outline" onClick={() => setDialog("keep")}>Giữ như phiên gần nhất</Button>
              </div>
            )}
          </dd>
        </div>
      </dl>

      {nextStrategy?.source === "iqx" && iqxUpdate && iqxUpdate.latest_version > nextStrategy.version && (
        <div role="status" data-testid="iqx-update" className="mt-1 space-y-2 rounded-md border border-primary/40 bg-primary/10 p-2.5 text-xs leading-5 text-foreground">
          <p>Chiến lược IQX · <strong>{nextStrategy.name}</strong> có bản <strong>v{iqxUpdate.latest_version}</strong>.</p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => setDiff({ from: nextStrategy.content, to: iqxUpdate.content, fromLabel: `v${nextStrategy.version}`, toLabel: `v${iqxUpdate.latest_version}` })}
            >
              Xem khác biệt
            </Button>
            <Button type="button" size="xs" onClick={() => setDialog("iqx")}>Cập nhật từ phiên {nextLabel}</Button>
          </div>
        </div>
      )}

      {diff && <DiffDialog {...diff} onClose={() => setDiff(null)} />}

      {dialog === "keep" && lastStrategy && (
        <ScheduleChangeDialog
          title="Giữ như phiên gần nhất?"
          body={(session) => <p>Phiên {session} dùng <strong>{scheduledName(lastStrategy)}</strong>.</p>}
          confirmLabel="Giữ như phiên gần nhất"
          impactTarget={{ source: lastStrategy.source, id: lastStrategy.id, version: lastStrategy.version }}
          submit={(guard) => keepLastSchedule(guard)}
          successText={() => "Phiên tới giữ như phiên gần nhất."}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "iqx" && nextStrategy && iqxUpdate && (
        <ScheduleChangeDialog
          title={`Cập nhật Chiến lược IQX · ${nextStrategy.name} lên v${iqxUpdate.latest_version}?`}
          body={(session) => <p>Từ phiên {session}, Bot dùng v{iqxUpdate.latest_version}.</p>}
          confirmLabel="Cập nhật"
          impactTarget={{ source: "iqx", id: nextStrategy.id, version: iqxUpdate.latest_version }}
          submit={(guard) => putScheduleNext({ source: "iqx", id: nextStrategy.id, version: iqxUpdate.latest_version }, guard)}
          successText={(session) => `Bot dùng v${iqxUpdate.latest_version} từ phiên ${session}.`}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  )
}
