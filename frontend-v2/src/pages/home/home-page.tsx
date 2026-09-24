import { useRail } from "@/context/rail"

import { Financials } from "./views/financials"
import { MarketAnalysis } from "./views/market-analysis"
import { StockAnalysis } from "./views/stock-analysis"

export function HomePage() {
  const { activeId } = useRail()

  if (activeId === "co-phieu") return <StockAnalysis />
  if (activeId === "bctc") return <Financials />
  return <MarketAnalysis />
}
