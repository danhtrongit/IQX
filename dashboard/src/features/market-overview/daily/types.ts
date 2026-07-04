// ─── Daily market analysis types (v1.4 contract) ────────

export type Direction = "up" | "down" | "flat" | "anomaly"

// ─── Chart data shapes (v1.5 addition) ──────────────────

export interface TickerValue {
  ticker: string
  value: number
}

export interface TickerPoints {
  ticker: string
  points: number
}

export interface MarketCharts {
  breadth: {
    ceiling: number
    up: number
    flat: number
    down: number
    floor: number
    ratio_up_down: string
    classification: string
    pct_above_ma20: number | null
  }
  contribution: {
    top_negative: TickerPoints[]   // points already signed (negative)
    top_positive: TickerPoints[]   // points already signed (positive)
  }
  foreign_detail: {
    total_buy_vnd_billion: number
    total_sell_vnd_billion: number
    streak: {
      count: number
      direction: "buy" | "sell" | "mixed"
      last_5d_cumulative: number | null
    }
    last_12_sessions: number[]
    top_sell: TickerValue[]
    top_buy: TickerValue[]
  }
  prop_detail: {
    total_buy_vnd_billion: number
    total_sell_vnd_billion: number
    net_vnd_billion: number
    last_12_sessions: number[]
    top_buy: (TickerValue & { anomaly?: boolean })[]
    top_sell: TickerValue[]
  }
  market_health_detail: {
    pct_above_ma20: number | null        // today's % of stocks above MA20, e.g. 36.5
    pct_above_ma20_change: number        // change vs prev session, signed
    pct_above_ma50: number | null
    pct_above_ma200: number | null       // always null currently
    trend_20d: number[]                  // length ~20, oldest→newest; last = today
    callout: { type: "warning" | "positive" | "neutral"; text: string } | null
  }
  sector_rotation: {
    sectors_today: { name: string; pct: number }[]   // sector % change, sorted by pct DESC, ~7+ rows
  }
}

// ─── Main analysis shape ─────────────────────────────────

export interface DailyAnalysis {
  id: string
  session_date: string
  generated_at: string
  session_type: string
  session_type_display: string | null
  headline: string
  tagline: {
    direction: Direction
    marker: string
    text: string
  }
  paragraphs: {
    structure: string
    smart_money: string
    market_health: string
    historical_pattern?: string | null
  }
  scenarios: {
    direction: "up" | "down"
    condition_html: string
    outcome_html: string
  }[]
  watchlist: {
    ticker: string
    alert: boolean
    reason_html: string
  }[]
  unexplained: string | null
  charts?: MarketCharts
}
