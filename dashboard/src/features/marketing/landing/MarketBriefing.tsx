// Landing market section — renders the REAL daily market analysis (the same
// components as the in-app "Thị trường" modal) off the public
// `market-analysis/daily/latest` endpoint, so it shows live data, not a mock.
import { MarketAnalysisArticle } from "@/features/market-overview/daily/MarketAnalysisArticle"
import { MarketPulseBar } from "@/features/market-overview/daily/MarketPulseBar"
import { MarketTakeaway } from "@/features/market-overview/daily/MarketTakeaway"
import { useDailyMarketAnalysis } from "@/features/market-overview/daily/useDailyMarketAnalysis"
import { TierLabel } from "@/features/market-overview/daily/charts/TierLabel"
import { BreadthChart } from "@/features/market-overview/daily/charts/BreadthChart"
import { ContributionChart } from "@/features/market-overview/daily/charts/ContributionChart"
import { ForeignFlowCard } from "@/features/market-overview/daily/charts/ForeignFlowCard"
import { PropFlowCard } from "@/features/market-overview/daily/charts/PropFlowCard"
import { HealthLineChart } from "@/features/market-overview/daily/charts/HealthLineChart"
import { RotationChart } from "@/features/market-overview/daily/charts/RotationChart"

export function MarketBriefing() {
  const { data } = useDailyMarketAnalysis()
  const charts = data?.charts

  return (
    <section className="lp-section lp-section--tint" id="thi-truong">
      <div className="lp-wrap">
        <span className="lp-eyebrow">Toàn cảnh thị trường · Miễn phí mỗi phiên</span>
        <h2 className="lp-h2" style={{ marginTop: 14, marginBottom: 12 }}>
          Mỗi chiều, IQX đọc xong cả thị trường.
        </h2>
        <p className="lp-lead" style={{ marginBottom: 24 }}>
          Bản nhận định VN-Index dưới đây được tạo tự động sau phiên và cập nhật trực tiếp — đúng
          những gì bạn thấy trong ứng dụng.
        </p>

        <div className="lp-market lp-card">
          <MarketAnalysisArticle />

          <div style={{ marginTop: 14 }}>
            <MarketPulseBar />
          </div>

          <MarketTakeaway />

          {charts && (
            <div>
              <TierLabel label="Cấu trúc phiên" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <BreadthChart data={charts.breadth} />
                <ContributionChart data={charts.contribution} />
              </div>
            </div>
          )}

          {charts && charts.foreign_detail && charts.prop_detail && (
            <div>
              <TierLabel label="Dòng tiền" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
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

          {charts && charts.market_health_detail && charts.sector_rotation && (
            <div>
              <TierLabel label="Sức khỏe thị trường" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <HealthLineChart
                  data={charts.market_health_detail}
                  classification={charts.breadth.classification}
                />
                <RotationChart data={charts.sector_rotation} />
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .lp-market { padding: 18px 20px; }
      `}</style>
    </section>
  )
}
