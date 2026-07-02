// ─── Mid-day market analysis types ───────────────────────

import type { MarketCharts } from "../daily/types"

// ─── Paragraph shapes ────────────────────────────────────

export interface MidPara {
  status: "published"
  content: string
}

export interface PendingPara {
  status: "pending"
  pending_message: string
  pending_until: string
}

// ─── Charts with data_state extension ────────────────────

export type MidDayCharts = {
  [K in keyof MarketCharts]: MarketCharts[K] & { data_state?: "am_session" | "eod_previous" | "unavailable" }
}

// ─── Pulse block ──────────────────────────────────────────

export interface MidDayPulse {
  vn_index: {
    value: number
    change: number
    change_pct: number
    sparkline: number[]
  }
  breadth: {
    up: number
    down: number
  }
  foreign_net_billion: number
  liquidity: {
    am_value_billion: number
    ma20_billion: number | null
    vs_ma20_pct: number | null
  }
}

// ─── Main mid-day analysis shape ─────────────────────────

export interface MidDayAnalysis {
  id: string
  session_date: string
  session_type: string
  session_type_display: string | null
  report_type: "midday"
  headline: string
  tagline: {
    text: string
    color: "up" | "down" | "neutral"
  }
  paragraphs: {
    session_structure: MidPara
    money_flow: MidPara
    market_health: PendingPara
  }
  scenarios: {
    type: "up" | "down"
    condition: string
    outcome: string
    scope: "afternoon_session"
  }[]
  watchlist: {
    key: string
    alert_level: "normal" | "alert" | "warn"
    reason: string
  }[]
  unexplained: { title: string; content: string } | null
  charts?: MidDayCharts
  pulse?: MidDayPulse
}
