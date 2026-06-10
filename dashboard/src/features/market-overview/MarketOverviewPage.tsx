import { Grid } from "@arco-design/web-react"
import { SectorProvider } from "./components/SectorContext"
import { VNIndexChart } from "./components/VNIndexChart"
import { MarketSentiment } from "./components/MarketSentiment"
import { AIAnalysisPanel } from "./components/AIAnalysisPanel"
import { NewsPanel } from "./components/NewsPanel"
import { MacroPanel } from "./components/MacroPanel"
import { CommodityPanel } from "./components/CommodityPanel"
import { SectorDataPanel } from "./components/SectorDataPanel"
import { SectorChartPanel } from "./components/SectorChartPanel"
import { LeadingStocksPanel } from "./components/LeadingStocksPanel"
import { ProprietaryPanel } from "./components/ProprietaryPanel"
import { ForeignFlowPanel } from "./components/ForeignFlowPanel"
import { InterbankRatesPanel } from "./components/InterbankRatesPanel"
import { BondYieldsPanel } from "./components/BondYieldsPanel"
import { FXRatesPanel } from "./components/FXRatesPanel"

const { Row, Col } = Grid

/**
 * Market overview page (`/thi-truong`) — Arco-native, theme-aware.
 *
 * Layout uses Arco Grid (24-col): each panel is a `Col` at `lg=8` (3 per row),
 * `md=12` (2 per row), `xs=24` (1 per row). The VNINDEX chart takes a full row.
 * Colors follow the Arco theme tokens (light + dark) — no scoped dark hack.
 *
 * The route is wired into AppShell (which provides MarketDataProvider +
 * SymbolProvider="VNINDEX"); only the SectorProvider is page-local.
 */

/** Responsive column: 3-up on desktop, 2-up on tablet, 1-up on mobile. */
function PanelCol({ children }: { children: React.ReactNode }) {
  return (
    <Col xs={24} md={12} lg={8} className="flex">
      <div className="w-full h-full">{children}</div>
    </Col>
  )
}

export function MarketOverviewPage() {
  return (
    <div
      className="min-h-full bg-[var(--color-bg-1)] p-1.5"
      style={{ fontFeatureSettings: "'tnum' 1, 'ss01' 1" }}
    >
      <SectorProvider>
        <Row gutter={[12, 12]} align="stretch">
          <PanelCol>
            <VNIndexChart />
          </PanelCol>

          <PanelCol>
            <MarketSentiment />
          </PanelCol>
          <PanelCol>
            <AIAnalysisPanel type="market" />
          </PanelCol>
          <PanelCol>
            <SectorDataPanel />
          </PanelCol>
          <PanelCol>
            <SectorChartPanel />
          </PanelCol>
          <PanelCol>
            <AIAnalysisPanel type="sector" />
          </PanelCol>
          <PanelCol>
            <NewsPanel />
          </PanelCol>
          <PanelCol>
            <MacroPanel />
          </PanelCol>
          <PanelCol>
            <CommodityPanel />
          </PanelCol>
          <PanelCol>
            <LeadingStocksPanel />
          </PanelCol>
          <PanelCol>
            <ProprietaryPanel />
          </PanelCol>
          <PanelCol>
            <ForeignFlowPanel />
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
