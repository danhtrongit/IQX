import { useSEO } from "@/hooks/use-seo"
import { Header, MarketBar, Footer } from "@/components/layout"
import { MarketDataProvider } from "@/contexts/market-data-context"
import { SymbolProvider } from "@/contexts/symbol-context"
import { terminalThemeVars } from "@/features/market/theme"
import { VNIndexChart } from "@/features/market/VNIndexChart"
import { MarketSentiment } from "@/features/market/MarketSentiment"
import { AIAnalysisPanel } from "@/features/market/AIAnalysisPanel"
import { NewsPanel } from "@/features/market/NewsPanel"
import { MacroPanel } from "@/features/market/MacroPanel"
import { CommodityPanel } from "@/features/market/CommodityPanel"
import { SectorDataPanel } from "@/features/market/SectorDataPanel"
import { SectorChartPanel } from "@/features/market/SectorChartPanel"
import { LeadingStocksPanel } from "@/features/market/LeadingStocksPanel"
import { ProprietaryPanel } from "@/features/market/ProprietaryPanel"
import { ForeignFlowPanel } from "@/features/market/ForeignFlowPanel"
import { InterbankRatesPanel } from "@/features/market/InterbankRatesPanel"
import { BondYieldsPanel } from "@/features/market/BondYieldsPanel"
import { FXRatesPanel } from "@/features/market/FXRatesPanel"
import { SectorProvider } from "@/features/market/SectorProvider"

export default function ThiTruongPage() {
  useSEO({
    title: "Thị trường | IQX",
    description: "Tổng quan thị trường chứng khoán Việt Nam",
    url: "https://beta.iqx.vn/thi-truong",
  })

  return (
    <MarketDataProvider>
      <SymbolProvider symbol="VNINDEX">
        <div className="flex h-svh flex-col overflow-hidden bg-background">
          <Header />
          <MarketBar />
          <div
            className="flex-1 min-h-0 overflow-y-auto bg-slate-950"
            style={{ ...terminalThemeVars, fontFeatureSettings: "'tnum' 1, 'ss01' 1" }}
          >
            <SectorProvider>
              <main className="grid grid-cols-12 gap-1.5 p-1.5">
                <VNIndexChart />
                <MarketSentiment />
                <AIAnalysisPanel type="market" />
                <SectorDataPanel />
                <SectorChartPanel />
                <AIAnalysisPanel type="sector" />
                <NewsPanel />
                <MacroPanel />
                <CommodityPanel />
                <LeadingStocksPanel />
                <ProprietaryPanel />
                <ForeignFlowPanel />
                <InterbankRatesPanel />
                <BondYieldsPanel />
                <FXRatesPanel />
              </main>
            </SectorProvider>
          </div>
          <Footer />
        </div>
      </SymbolProvider>
    </MarketDataProvider>
  )
}
