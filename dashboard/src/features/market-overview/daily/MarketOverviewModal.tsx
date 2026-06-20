// ─── MarketOverviewModal ───────────────────────────────────────────────────────
// Market modal (v1.6 layout):
//   MarketAnalysisArticle + MarketPulseBar + MarketTakeaway
//   + Cấu trúc phiên charts + Dòng tiền flow cards.
// Gate: the body is mounted only when isOpen.

import { Modal } from "@arco-design/web-react"
import { useMarketModal } from "@/shared/contexts/market-modal-context"
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

// ─── Modal body (mounted only when open) ─────────────────────────────────────

function ModalBody() {
  const { data } = useDailyMarketAnalysis()
  const charts = data?.charts

  return (
    <div
      style={{ maxHeight: "82vh", overflowY: "auto" }}
      className="px-1 py-2"
    >
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
          <div className="grid grid-cols-2 gap-3.5">
            <BreadthChart data={charts.breadth} />
            <ContributionChart data={charts.contribution} />
          </div>
        </div>
      )}

      {/* ── Dòng tiền (Foreign + Prop flow cards) ── */}
      {charts && charts.foreign_detail && charts.prop_detail && (
        <div>
          <TierLabel label="Dòng tiền" />
          <div className="grid grid-cols-2 gap-3.5">
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
          <div className="grid grid-cols-2 gap-3.5">
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

// ─── Public component ─────────────────────────────────────────────────────────

export function MarketOverviewModal() {
  const { isOpen, closeMarketModal } = useMarketModal()

  return (
    <Modal
      visible={isOpen}
      onCancel={closeMarketModal}
      footer={null}
      title={null}
      style={{ width: "92vw", maxWidth: 1280 }}
      autoFocus={false}
    >
      {isOpen && <ModalBody />}
    </Modal>
  )
}
