// ─── MarketOverviewModal ───────────────────────────────────────────────────────
// Full market-overview modal (v1.4 layout).
// Gate: the heavy body (panels + their data hooks) is mounted only when isOpen,
//       using the `{isOpen && <Body/>}` pattern inside <Modal visible={isOpen}>.
// Sectors need SectorProvider — wrap the panel grid accordingly.

import { Modal } from "@arco-design/web-react"
import { Grid } from "@arco-design/web-react"
import { useMarketModal } from "@/shared/contexts/market-modal-context"
import { MarketAnalysisArticle } from "./MarketAnalysisArticle"
import { MarketPulseBar } from "./MarketPulseBar"
import { MarketTakeaway } from "./MarketTakeaway"

// Panel imports — exact paths from MarketOverviewPage
import { SectorProvider } from "../components/SectorContext"
import { VNIndexChart } from "../components/VNIndexChart"
import { MarketSentiment } from "../components/MarketSentiment"
import { LeadingStocksPanel } from "../components/LeadingStocksPanel"
import { ForeignFlowPanel } from "../components/ForeignFlowPanel"
import { ProprietaryPanel } from "../components/ProprietaryPanel"
import { SectorChartPanel } from "../components/SectorChartPanel"
import { SectorDataPanel } from "../components/SectorDataPanel"
import { InterbankRatesPanel } from "../components/InterbankRatesPanel"
import { BondYieldsPanel } from "../components/BondYieldsPanel"
import { FXRatesPanel } from "../components/FXRatesPanel"

const { Row, Col } = Grid

// ─── Responsive panel column (mirrors MarketOverviewPage's PanelCol) ──────────

function PanelCol({ children }: { children: React.ReactNode }) {
  return (
    <Col xs={24} md={12} lg={8} className="flex">
      <div className="w-full h-full">{children}</div>
    </Col>
  )
}

// ─── Modal body (mounted only when open) ─────────────────────────────────────

function ModalBody() {
  return (
    <div
      style={{ maxHeight: "82vh", overflowY: "auto" }}
      className="px-1 py-2"
    >
      {/* ── AI article ── */}
      <MarketAnalysisArticle />

      {/* ── Pulse summary bar ── */}
      <div className="mt-3.5">
        <MarketPulseBar />
      </div>

      {/* ── Takeaway (scenarios + watchlist) ── */}
      <MarketTakeaway />

      {/* ── Panel grid ── */}
      <SectorProvider>
        <Row gutter={[12, 12]} align="stretch" className="mt-1">
          <PanelCol>
            <VNIndexChart />
          </PanelCol>
          <PanelCol>
            <MarketSentiment />
          </PanelCol>
          <PanelCol>
            <LeadingStocksPanel />
          </PanelCol>
          <PanelCol>
            <ForeignFlowPanel />
          </PanelCol>
          <PanelCol>
            <ProprietaryPanel />
          </PanelCol>
          <PanelCol>
            <SectorDataPanel />
          </PanelCol>
          <PanelCol>
            <SectorChartPanel />
          </PanelCol>
          <PanelCol>
            <InterbankRatesPanel />
          </PanelCol>
          <PanelCol>
            <BondYieldsPanel />
          </PanelCol>
          <PanelCol>
            <FXRatesPanel />
          </PanelCol>
        </Row>
      </SectorProvider>
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
