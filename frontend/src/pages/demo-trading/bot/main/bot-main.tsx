/**
 * «Bot» main view (left), spec Bot và Chiến lược v2.0 §5.2–§5.5: the Bot account, the mascot with
 * the strategy chips, Lịch phiên and the Danh mục Bot block (Đang giữ / Lịch sử / Nhật ký).
 *
 * Read-only apart from the schedule changes of Lịch phiên: it never starts a run, places an order or
 * moves a session forward. No on/off switch (Q16).
 */
import { TriangleAlert } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { hasStrategy, useBotSchedule } from "@/pages/strategy/shared/bot-schedule"

import type { MascotId } from "../../journey/types"
import { messageOf } from "../api"
import { formatDate } from "../format"
import { useBotOverview } from "../queries"
import { KpiStrip } from "./kpi-strip"
import { MascotCard } from "./mascot-card"
import { PortfolioBlock } from "./portfolio-block"
import { IqxBadge, ScheduleCard } from "./schedule-card"

export function BotMain({ mascotId }: { mascotId: MascotId }) {
  const { isAuthenticated, openAuth } = useAuth()
  const overview = useBotOverview()
  const schedule = useBotSchedule()
  const data = overview.data

  if (!isAuthenticated) {
    return <PanelState title="Đăng nhập để xem Bot" description="Tài khoản Bot gắn với tài khoản của bạn." action={{ label: "Đăng nhập", onClick: () => openAuth("login") }} />
  }
  if (overview.isError) {
    return <PanelState title="Không tải được Bot của bạn" description={messageOf(overview.error)} action={{ label: "Thử lại", onClick: () => void overview.refetch() }} />
  }

  const last = schedule.data?.last
  const heldCount = data?.conditions?.open_positions
  const chips = [
    ...(schedule.data
      ? [{
          key: "strategy",
          label: hasStrategy(last)
            ? <>Chiến lược: {last.source === "iqx" && <IqxBadge />}<span className="min-w-0 truncate">{last.name}</span></>
            : "Chiến lược: chưa chọn",
        }]
      : []),
    ...(heldCount !== undefined ? [{ key: "held", label: `${heldCount} mã đang giữ` }] : []),
  ]
  const run = data?.bot_run
  const runIssues = run?.issues ?? []

  return (
    <>
      {overview.isPending ? <Skeleton className="h-[4.25rem] w-full rounded-lg" aria-label="Đang tải tài khoản Bot" /> : <KpiStrip overview={data} />}
      {data && !data.bot && (
        <p role="status" className="rounded-md border border-border bg-card p-3 text-xs leading-5 text-foreground">
          Tài khoản Bot chưa sẵn sàng. Hãy làm mới sau ít phút.
        </p>
      )}

      <MascotCard mascotId={mascotId} chips={chips} />
      <ScheduleCard />

      {run && (run.status === "failed" || runIssues.length > 0) && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-price-ref/40 bg-price-ref/10 p-3 text-xs leading-5 text-price-ref">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">
              Lần xử lý gần nhất {run.status === "failed" ? "cần kiểm tra" : "có ghi chú"}
              {run.last_updated_at ? ` · ${formatDate(run.last_updated_at)}` : ""}
            </p>
            {runIssues.length > 0 && (
              <ul className="mt-0.5 list-disc pl-4">
                {runIssues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.symbol ? `${issue.symbol}: ` : ""}{issue.detail ?? issue.code}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      <PortfolioBlock disclosure={data?.disclosure ?? null} />
    </>
  )
}
