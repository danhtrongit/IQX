export interface PortfolioItem {
  symbol: string
  quantity: number
  avgPrice: number
  currentPrice: number
  totalValue: number
  pnl: number
  pnlPercent: number
}

export interface PortfolioApiItem {
  symbol?: string | null
  quantity?: number | string | null
  quantity_total?: number | string | null
  avgPrice?: number | string | null
  avgBuyPrice?: number | string | null
  avg_cost_vnd?: number | string | null
  currentPrice?: number | string | null
  current_price_vnd?: number | string | null
  totalValue?: number | string | null
  market_value_vnd?: number | string | null
  pnl?: number | string | null
  unrealized_pnl_vnd?: number | string | null
  pnlPercent?: number | string | null
}

function toFiniteNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function normalizePortfolioItem(item: PortfolioApiItem): PortfolioItem {
  const qty = toFiniteNumber(item.quantity ?? item.quantity_total)
  const avgPrice = toFiniteNumber(item.avgPrice ?? item.avgBuyPrice ?? item.avg_cost_vnd)
  const currentPrice = toFiniteNumber(item.currentPrice ?? item.current_price_vnd)
  const totalValue = toFiniteNumber(item.totalValue ?? item.market_value_vnd)
  const pnl = toFiniteNumber(item.pnl ?? item.unrealized_pnl_vnd)
  const cost = avgPrice * qty
  const pnlPercent = toFiniteNumber(item.pnlPercent) || (cost > 0 ? (pnl / cost) * 100 : 0)

  return {
    symbol: String(item.symbol ?? "").toUpperCase(),
    quantity: qty,
    avgPrice,
    currentPrice,
    totalValue,
    pnl,
    pnlPercent,
  }
}
