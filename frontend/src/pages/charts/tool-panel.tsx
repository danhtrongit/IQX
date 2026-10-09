/**
 * Panel content behind the chart's tool rail.
 *
 * The panels themselves are the demo shell's real, backend-backed tool panels
 * (watchlist/holdings/history, order ticket, AI news, AI patterns) imported
 * read-only.
 */
import { NewsPanel } from "@/pages/demo-trading/market/news-panel"
import { PatternsPanel } from "@/pages/demo-trading/market/patterns-panel"
import { PortfolioPanel } from "@/pages/demo-trading/portfolio/portfolio-panel"
import { OrderPanel } from "@/pages/demo-trading/trading/order-panel"
import { ForecastPanel } from "./forecast/forecast-panel"

import type { InvestTool } from "./tool-rail"

export function ToolPanel({
  tool,
  symbol,
  onSymbolChange,
  onNavigate,
}: {
  tool: InvestTool
  symbol: string
  onSymbolChange: (symbol: string) => void
  onNavigate: (panel: string, symbol?: string) => void
}) {
  if (tool === "watchlist") {
    return (
      <PortfolioPanel
        symbol={symbol}
        onSymbolChange={onSymbolChange}
        onNavigate={onNavigate}
      />
    )
  }
  if (tool === "order") return <OrderPanel symbol={symbol} onSymbolChange={onSymbolChange} />
  if (tool === "patterns") return <PatternsPanel symbol={symbol} />
  if (tool === "forecast") return <ForecastPanel symbol={symbol} onSymbolChange={onSymbolChange} />
  return <NewsPanel symbol={symbol} />
}
