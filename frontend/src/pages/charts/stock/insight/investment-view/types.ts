/** Hand-written contract for `GET /ai/investment-view/{symbol}` (+ `/status`). */
export type InvestmentThesis = {
  id: string
  order: number
  title: string
  summary: string
}

export type InvestmentValuation =
  | {
      mode: "range"
      targetMedian: number
      targetMin: number
      targetMax: number
      currentPrice: number | null
      upsidePercent: number | null
    }
  | {
      mode: "single"
      targetMedian: number
      currentPrice: number | null
      upsidePercent: number | null
    }

export type InvestmentViewReady = {
  status: "ready"
  version: number
  theses: InvestmentThesis[]
  valuation: InvestmentValuation | null
}

export type InvestmentView =
  | { status: "processing"; jobId: string }
  | { status: "empty" }
  | InvestmentViewReady
