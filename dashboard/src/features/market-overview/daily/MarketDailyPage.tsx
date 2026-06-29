import { Spin } from "@arco-design/web-react"
import { MarketAnalysisArticle } from "./MarketAnalysisArticle"
import { MarketPulseBar } from "./MarketPulseBar"
import { MarketTakeaway } from "./MarketTakeaway"
import { useDailyMarketAnalysis } from "./useDailyMarketAnalysis"
import { TierLabel } from "./charts/TierLabel"
import { BreadthChart } from "./charts/BreadthChart"
import { ContributionChart } from "./charts/ContributionChart"
import { ForeignFlowCard } from "./charts/ForeignFlowCard"
import { PropFlowCard } from "./charts/PropFlowCard"
import { HealthLineChart } from "./charts/HealthLineChart"
import { RotationChart } from "./charts/RotationChart"

export function MarketDailyPage() {
  const { data, isLoading, isError } = useDailyMarketAnalysis()
  const charts = data?.charts

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spin tip="Đang tải nhận định thị trường…" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 text-center text-[var(--color-text-3)]">
        Chưa có nhận định thị trường — vui lòng quay lại sau.
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] px-2 py-3 md:px-4">
      {/* ── AI nhận định ── */}
      <MarketAnalysisArticle />

      {/* ── Pulse summary bar ── */}
      <div className="mt-3.5">
        <MarketPulseBar />
      </div>

      {/* ── Takeaway (kịch bản + đáng quan sát) ── */}
      <MarketTakeaway />

      {/* ── Cấu trúc phiên (Breadth + Contribution charts) ── */}
      {charts && (
        <div>
          <TierLabel label="Cấu trúc phiên" />
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <BreadthChart data={charts.breadth} />
            <ContributionChart data={charts.contribution} />
          </div>
        </div>
      )}

      {/* ── Dòng tiền (Foreign + Prop flow cards) ── */}
      {charts && charts.foreign_detail && charts.prop_detail && (
        <div>
          <TierLabel label="Dòng tiền" />
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <ForeignFlowCard data={charts.foreign_detail} />
            <PropFlowCard
              data={charts.prop_detail}
              foreignNet={
                charts.foreign_detail.total_buy_vnd_billion -
                charts.foreign_detail.total_sell_vnd_billion
              }
            />
          </div>
        </div>
      )}

      {/* ── Sức khỏe thị trường (health line + rotation) ── */}
      {charts && charts.market_health_detail && charts.sector_rotation && (
        <div>
          <TierLabel label="Sức khỏe thị trường" />
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <HealthLineChart
              data={charts.market_health_detail}
              classification={charts.breadth.classification}
            />
            <RotationChart data={charts.sector_rotation} />
          </div>
        </div>
      )}
    </div>
  )
}
