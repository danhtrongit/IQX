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
    pct_above_ma20: number
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
      last_5d_cumulative: number
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
    pct_above_ma20_today: number         // e.g. 36.5
    classification: string               // e.g. "Phân hóa tiêu cực"
    trend_20d: number[]                  // length ~20, oldest→newest; last = today
    peak: { value: number; index: number } | null   // peak within trend_20d
    callout: { level: "warning" | "info" | "good" | string; text: string } | null
  }
  sector_rotation: { sector: string; net: number }[]   // ~7 rows, net tỷ VND signed
}

// ─── Main analysis shape ─────────────────────────────────

export interface DailyAnalysis {
  id: string
  session_date: string
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
