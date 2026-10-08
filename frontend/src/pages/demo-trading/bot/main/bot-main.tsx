/**
 * «Bot» main view (left): the Bot account, the mascot with the configuration state, the
 * effective Buy/Sell conditions and the Danh mục Bot block (Đang giữ / Lịch sử / Nhật ký).
 *
 * Read-only: it never starts a run, places an order or moves a session forward.
 */
import { useMemo } from "react"
import { TriangleAlert } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"

import type { MascotId } from "../../journey/types"
import { messageOf } from "../api"
import { useBotConfig } from "../config/use-bot-config"
import { formatDate } from "../format"
import { useBotOverview } from "../queries"
import { sourceName } from "../universe/labels"
import { useBotUniverse } from "../universe/use-universe"
import { ConditionCards } from "./condition-cards"
import { KpiStrip } from "./kpi-strip"
import { MascotCard } from "./mascot-card"
import { PortfolioBlock } from "./portfolio-block"
import { configStateChip } from "./state"

export function BotMain({ mascotId }: { mascotId: MascotId }) {
  const { isAuthenticated, openAuth } = useAuth()
  const overview = useBotOverview()
  const config = useBotConfig()
  const universe = useBotUniverse()
  const data = overview.data
  const conditions = data?.conditions ?? null
  const names = useMemo<Record<string, string>>(
    () => Object.fromEntries(config.indicators.map((indicator) => [indicator.id, indicator.name])),
    [config.indicators],
  )

  if (!isAuthenticated) {
    return <PanelState title="Đăng nhập để xem Bot" description="Tài khoản Bot gắn với tài khoản của bạn." action={{ label: "Đăng nhập", onClick: () => openAuth("login") }} />
  }
  if (overview.isError) {
    return <PanelState title="Không tải được Bot của bạn" description={messageOf(overview.error)} action={{ label: "Thử lại", onClick: () => void overview.refetch() }} />
  }

  const effectiveSource = universe.data?.effective
  const heldCount = conditions?.open_positions
  const chips = [
    ...(effectiveSource ? [{ key: "source", label: `Nguồn mua: ${sourceName(effectiveSource)}` }] : []),
    ...(heldCount !== undefined ? [{ key: "held", label: `${heldCount} mã đang giữ` }] : []),
    ...(conditions?.pending ? [{ key: "pending", label: "Cấu hình chờ hiệu lực", tone: "warn" as const }] : []),
  ]
  const run = data?.bot_run
  const runIssues = run?.issues ?? []

  return (
    <>
      {overview.isPending ? <Skeleton className="h-[4.25rem] w-full rounded-lg" aria-label="Đang tải tài khoản Bot" /> : <KpiStrip overview={data} />}
      {data && !data.bot && (
        <p role="status" className="rounded-md border border-border bg-card p-3 text-xs leading-5 text-muted-foreground">
          Tài khoản Bot chưa sẵn sàng. Mở màn này không tạo Bot hoặc cấp vốn; hãy làm mới sau ít phút.
        </p>
      )}

      <MascotCard
        mascotId={mascotId}
        chip={overview.isPending ? { label: "Đang tải điều kiện", tone: "muted", detail: null } : configStateChip(conditions)}
        chips={chips}
      />

      <ConditionCards loading={overview.isPending} conditions={conditions} config={config.state} indicators={config.indicators} />

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

      <PortfolioBlock disclosure={data?.disclosure ?? null} names={names} />
    </>
  )
}
