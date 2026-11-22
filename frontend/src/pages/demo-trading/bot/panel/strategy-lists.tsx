/**
 * CHIẾN LƯỢC IQX and CHIẾN LƯỢC CỦA TÔI (spec Bot và Chiến lược v2.0 §5.4): each row has the name,
 * Chi tiết (opens the Backtest on it), Dùng (hidden once it is the next session's strategy, and for a
 * hidden IQX strategy) and the Đang chạy / Từ phiên tags. The Bot never edits a condition here (Q1).
 */
import { useState } from "react"
import { ArrowRight, Play, Plus } from "lucide-react"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { backtestLink, putScheduleNext, sessionLabel, useBotSchedule, type ScheduleTarget } from "@/pages/strategy/shared/bot-schedule"
import { ScheduleChangeDialog } from "@/pages/strategy/shared/due-confirm"
import { IQX_DISCLAIMER } from "@/pages/strategy/shared/iqx"

import { messageOf } from "../api"
import { useStrategyOptions } from "../api-v2"
import { IqxBadge } from "../main/schedule-card"

type Row = {
  key: string
  target: ScheduleTarget
  name: string
  /** Name in the dialog and toast. */
  label: string
  iqx: boolean
  hidden: boolean
  onBot: { last: boolean; next: boolean }
}

function StrategyRow({ row, nextLabel, onUse }: { row: Row; nextLabel: string | null; onUse: (row: Row) => void }) {
  const running = row.onBot.last
  return (
    <li data-testid="strategy-row" className={cn("space-y-1.5 px-3 py-2.5", running && "bg-primary/10")}>
      <div className="flex min-w-0 items-center gap-1.5">
        {row.iqx && <IqxBadge />}
        <span className="min-w-0 flex-1 truncate text-xs font-semibold" title={row.name}>{row.name}</span>
        <Button asChild size="xs" variant="outline">
          <Link to={backtestLink(row.target)}>Chi tiết<span className="sr-only"> {row.name}</span></Link>
        </Button>
        {!row.onBot.next && !row.hidden && (
          <Button type="button" size="xs" onClick={() => onUse(row)}>Dùng<span className="sr-only"> {row.name}</span></Button>
        )}
      </div>
      {(running || (row.onBot.next && !running) || row.hidden) && (
        <div className="flex flex-wrap gap-1">
          {running && (
            <span className="inline-flex items-center gap-1 rounded-sm border border-price-up/40 bg-price-up/10 px-1.5 py-0.5 text-[10px] font-medium text-price-up">
              <Play aria-hidden="true" className="size-2.5 fill-current" />Đang chạy
            </span>
          )}
          {row.onBot.next && !running && nextLabel && (
            <span className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              <ArrowRight aria-hidden="true" className="size-2.5" />Từ phiên {nextLabel}
            </span>
          )}
          {row.hidden && (
            <span className="rounded-sm border border-status-warning/50 bg-status-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-status-warning">IQX đã ngừng cung cấp</span>
          )}
        </div>
      )}
    </li>
  )
}

function Frame({ title, children, footer }: { title: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <section aria-label={title} className="overflow-hidden rounded-lg border border-border bg-card">
      <h3 className="border-b border-border px-3 py-2 text-[11px] font-bold tracking-wide uppercase">{title}</h3>
      {children}
      <div className="border-t border-border px-3 py-2 text-[11px] leading-4 text-foreground">{footer}</div>
    </section>
  )
}

export function StrategyLists() {
  const options = useStrategyOptions()
  const schedule = useBotSchedule()
  const [using, setUsing] = useState<Row | null>(null)
  const nextLabel = schedule.data ? sessionLabel(schedule.data.next.session_date) : null

  if (options.isPending) return <div className="space-y-2" aria-label="Đang tải chiến lược"><Skeleton className="h-28 w-full" /><Skeleton className="h-20 w-full" /></div>
  if (options.isError) {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs text-foreground">
        <p role="alert">Không tải được danh sách chiến lược. {messageOf(options.error)}</p>
        <Button type="button" size="xs" variant="outline" onClick={() => void options.refetch()}>Thử lại</Button>
      </div>
    )
  }

  const iqxRows: Row[] = options.data.iqx
    .filter((item) => !item.hidden || item.on_bot.last || item.on_bot.next)
    .map((item) => ({
      key: `iqx:${item.id}`,
      target: { source: "iqx", id: item.id, version: item.version },
      name: item.name,
      label: `Chiến lược IQX · ${item.name}`,
      iqx: true,
      hidden: item.hidden,
      onBot: item.on_bot,
    }))
  const mineRows: Row[] = options.data.mine.map((item) => ({
    key: `user:${item.id}`,
    target: { source: "user", id: item.id },
    name: item.name,
    label: item.name,
    iqx: false,
    hidden: false,
    onBot: item.on_bot,
  }))

  return (
    <div className="space-y-3">
      <Frame title="Chiến lược IQX" footer={IQX_DISCLAIMER}>
        {iqxRows.length === 0 ? (
          <p className="px-3 py-3 text-xs text-foreground">Chưa có chiến lược IQX.</p>
        ) : (
          <ul className="divide-y divide-border">{iqxRows.map((row) => <StrategyRow key={row.key} row={row} nextLabel={nextLabel} onUse={setUsing} />)}</ul>
        )}
      </Frame>
      <Frame
        title="Chiến lược của tôi"
        footer={
          <Link to={backtestLink({ source: "new" })} className="inline-flex items-center gap-1 rounded-sm font-medium text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <Plus aria-hidden="true" className="size-3.5" />Tạo chiến lược trong Backtest
          </Link>
        }
      >
        {mineRows.length === 0 ? (
          <p className="px-3 py-3 text-xs text-foreground">Chưa có chiến lược nào.</p>
        ) : (
          <ul className="divide-y divide-border">{mineRows.map((row) => <StrategyRow key={row.key} row={row} nextLabel={nextLabel} onUse={setUsing} />)}</ul>
        )}
      </Frame>

      {using && (
        <ScheduleChangeDialog
          title="Đổi chiến lược của Bot?"
          body={(session) => (
            <>
              <p>Từ phiên {session}, Bot dùng <strong>{using.label}</strong>.</p>
              <p>Mã đang giữ bán theo điều kiện Bán và Giữ tối đa của chiến lược mới.</p>
            </>
          )}
          confirmLabel="Dùng cho Bot"
          impactTarget={using.target}
          submit={(guard) => putScheduleNext(using.target, guard)}
          successText={(session) => `Bot dùng ${using.label} từ phiên ${session}.`}
          onClose={() => setUsing(null)}
        />
      )}
    </div>
  )
}
