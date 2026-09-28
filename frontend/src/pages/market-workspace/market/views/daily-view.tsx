import type { ReactNode } from "react"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

import { useDailyMarketAnalysis } from "../hooks"
import { BreadthChart } from "./charts/breadth-chart"
import { ChartCard } from "./charts/chart-card"
import { ContributionChart } from "./charts/contribution-chart"
import { ForeignFlowCard } from "./charts/foreign-flow-card"
import { HealthLineChart } from "./charts/health-line-chart"
import { PropFlowCard } from "./charts/prop-flow-card"
import { RotationChart } from "./charts/rotation-chart"
import { TierLabel } from "./charts/tier-label"
import { MarketAnalysisArticle } from "./daily/market-analysis-article"
import { MarketPulseBar } from "./daily/market-pulse-bar"
import { MarketTakeaway } from "./daily/market-takeaway"

function ChartTier({
  tourId,
  label,
  children,
}: {
  tourId: string
  label: string
  children: ReactNode
}) {
  return (
    <div data-tour-id={tourId}>
      <TierLabel label={label} />
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">{children}</div>
    </div>
  )
}

/** Card standing in for a chart the brief has not published yet (tour only). */
function PendingChartCard({ title }: { title: string }) {
  return (
    <ChartCard title={title}>
      <div className="py-6 text-center text-sm text-muted-foreground">Đang tải dữ liệu…</div>
    </ChartCard>
  )
}

function UnavailableChartCard({ title }: { title: string }) {
  return (
    <ChartCard title={title}>
      <div className="flex min-h-[120px] items-center justify-center px-4 py-6 text-center text-sm text-muted-foreground">
        Chưa có dữ liệu cho phiên này.
      </div>
    </ChartCard>
  )
}

/**
 * What the tour walks when the brief itself is unavailable: the five end-of-day
 * targets still exist so the tour can finish, and each one says it is loading
 * rather than showing invented numbers.
 */
function TourScaffold(): ReactNode {
  return (
    <div className="space-y-3.5">
      <article className="relative overflow-hidden rounded-lg bg-card p-4">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary via-primary/40 to-primary"
        />
        <div data-tour-id="tour-bantin-end-header" className="text-sm font-semibold text-foreground">
          Bản Cuối phiên · đang tải dữ liệu…
        </div>
        <div
          data-tour-id="tour-bantin-end-unexplained"
          className="mt-5 rounded-sm border-l-[3px] border-l-destructive bg-destructive/10 px-4 py-3 text-xs text-muted-foreground"
        >
          Điểm chú ý · đang tải dữ liệu…
        </div>
      </article>

      <ChartTier tourId="tour-bantin-end-structure" label="Cấu trúc phiên">
        <PendingChartCard title="Độ rộng thị trường HOSE" />
        <PendingChartCard title="Top mã đóng góp ±" />
      </ChartTier>

      <ChartTier tourId="tour-bantin-end-flow" label="Dòng tiền">
        <PendingChartCard title="Khối ngoại" />
        <PendingChartCard title="Tự doanh CTCK" />
      </ChartTier>

      <ChartTier tourId="tour-bantin-end-health" label="Sức khỏe thị trường">
        <PendingChartCard title="Sức khỏe thị trường" />
        <PendingChartCard title="Dòng tiền chuyển nhóm" />
      </ChartTier>
    </div>
  )
}

/**
 * End-of-day session view (Cuối phiên · 16:30): the AI brief, the live pulse
 * strip, the takeaway block and the three chart tiers in the legacy order.
 *
 * The three tiers only render when the brief actually carries the matching
 * chart block — a brief without charts never borrows another session's numbers.
 * Under `tourMode` the missing tiers are still rendered (with placeholder cards)
 * so the tour has its five end-of-day targets.
 */
export function DailyMarketView({ tourMode = false }: { tourMode?: boolean }): ReactNode {
  const { data, isLoading, isError, refetch, isFetching } = useDailyMarketAnalysis()

  if (!data || isError) {
    if (tourMode) return <TourScaffold />

    if (isLoading) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground">
          <LoaderCircle aria-hidden className="size-5 animate-spin" />
          <span className="text-sm">Đang tải nhận định thị trường…</span>
        </div>
      )
    }

    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[520px] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-muted-foreground">
          {isError
            ? "Không thể tải nhận định thị trường. Vui lòng thử lại sau."
            : "Chưa có nhận định thị trường — vui lòng quay lại sau."}
        </p>
        <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
          Thử lại
        </Button>
      </div>
    )
  }

  const charts = data.charts
  const foreignDetail = charts?.foreign_detail
  const propDetail = charts?.prop_detail
  const healthDetail = charts?.market_health_detail
  const rotation = charts?.sector_rotation
  const classification = charts?.breadth?.classification ?? ""

  return (
    <div className="space-y-3.5">
      <MarketAnalysisArticle data={data} tourMode={tourMode} />

      <MarketPulseBar />

      <MarketTakeaway data={data} />

      <ChartTier tourId="tour-bantin-end-structure" label="Cấu trúc phiên">
          {charts?.breadth ? <BreadthChart data={charts.breadth} /> : <UnavailableChartCard title="Độ rộng thị trường HOSE" />}
          {charts?.contribution ? <ContributionChart data={charts.contribution} /> : <UnavailableChartCard title="Top mã đóng góp ±" />}
      </ChartTier>

      <ChartTier tourId="tour-bantin-end-flow" label="Dòng tiền">
          {foreignDetail ? <ForeignFlowCard data={foreignDetail} /> : <UnavailableChartCard title="Khối ngoại" />}
          {propDetail ? <PropFlowCard data={propDetail} foreignNet={foreignDetail ? foreignDetail.total_buy_vnd_billion - foreignDetail.total_sell_vnd_billion : undefined} /> : <UnavailableChartCard title="Tự doanh CTCK" />}
      </ChartTier>

      <ChartTier tourId="tour-bantin-end-health" label="Sức khỏe thị trường">
          {healthDetail && (healthDetail.indicator_basis === "EMA"
            ? (healthDetail.pct_above_ema20 != null || (healthDetail.trend_ema20_20d?.length ?? 0) > 0)
            : (healthDetail.pct_above_ma20 != null || healthDetail.trend_20d.length > 0))
            ? <HealthLineChart data={healthDetail} classification={classification} />
            : <UnavailableChartCard title="Sức khỏe thị trường" />}
          {rotation && rotation.sectors_today.length > 0 ? <RotationChart data={rotation} /> : <UnavailableChartCard title="Dòng tiền chuyển nhóm" />}
      </ChartTier>
    </div>
  )
}
