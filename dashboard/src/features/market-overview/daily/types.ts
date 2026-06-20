// ─── Daily market analysis types (v1.4 contract) ────────

export type Direction = "up" | "down" | "flat" | "anomaly"

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
}
