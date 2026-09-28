/**
 * Contracts for the three market-analysis briefs (pre-market / mid-day /
 * end-of-day). Shapes mirror the backend `AnalysisOut` payloads
 * (`/market-analysis/{premarket|midday|daily}/latest`) — the tables store the
 * per-report body in `meta`, so `charts` / `pulse` / `meta` are optional and
 * every consumer must degrade when they are absent.
 */

export type SessionPeriod = "premarket" | "midday" | "eod"

/** Vietnamese session labels (tabs, tour copy, stale notices). */
export const SESSION_LABEL: Record<SessionPeriod, string> = {
  premarket: "Trước phiên",
  midday: "Giữa phiên",
  eod: "Cuối phiên",
}

/** Publication time of each brief, as shown in the session tabs. */
export const SESSION_TIME: Record<SessionPeriod, string> = {
  premarket: "07:15",
  midday: "11:30",
  eod: "16:30",
}

export type AnalysisReport = "premarket" | "midday" | "daily"

export type Direction = "up" | "down" | "flat" | "anomaly"

/* ── Daily (end-of-day) chart blocks ─────────────────────────────────────── */

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
    top_negative: TickerPoints[] // points already signed (negative)
    top_positive: TickerPoints[] // points already signed (positive)
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
    pct_above_ma20: number | null
    pct_above_ma20_change: number | null
    pct_above_ma50: number | null
    pct_above_ma200: number | null
    trend_20d: number[]
    indicator_basis?: "EMA"
    pct_above_ema20?: number | null
    pct_above_ema20_change?: number | null
    pct_above_ema50?: number | null
    trend_ema20_20d?: number[]
    callout: { type: "warning" | "positive" | "neutral"; text: string } | null
  }
  sector_rotation: {
    sectors_today: { name: string; pct: number }[]
  }
}

/* ── Daily analysis ──────────────────────────────────────────────────────── */

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
  charts?: Partial<MarketCharts>
}

/* ── Mid-day analysis ────────────────────────────────────────────────────── */

export interface MidPara {
  status: "published"
  content: string
}

export interface PendingPara {
  status: "pending"
  pending_message: string
  pending_until: string
}

/**
 * Mid-day charts carry a `data_state`: `am_session` = measured this morning,
 * `eod_previous` = yesterday's close reused, `unavailable` = not computable
 * before the close (market health). The badge must always show which one it is.
 */
export type MidDayCharts = {
  [K in keyof MarketCharts]?: MarketCharts[K] & {
    data_state?: "am_session" | "eod_previous" | "unavailable"
  }
}

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

export interface MidDayAnalysis {
  id: string
  session_date: string
  generated_at: string
  session_type: string
  session_type_display: string | null
  /** Absent at runtime (rows are filtered by report server-side); kept optional. */
  report_type?: "midday"
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

/* ── Pre-market analysis ─────────────────────────────────────────────────── */

export interface ResolvedNews {
  id: string
  title: string
  summary: string
  source: string
  published_at: string
  tickers: string[]
  sentiment: string
  url: string
  insight: string
  rank_order: number
}

export interface ResolvedEvent {
  id: string
  type: string
  time: string
  time_label: string
  title: string
  tickers: string[]
  note: string
  impact: "high" | "medium" | "low"
}

export interface WorldCell {
  id: string
  label: string
  value: number | null
  change_pct: number | null
  sentiment: "up" | "down" | "flat"
  stale: boolean
  source?: "vcb"
}

export interface PreMarketAnalysis {
  id: string
  session_date: string
  generated_at: string
  /** Absent at runtime — rows are filtered by report server-side; kept optional. */
  report_type?: "premarket"
  headline: string
  tagline: { text: string }
  paragraphs: {
    world_paragraph?: string
  }
  /** The backend allows `null` here — consumers must default to `[]`. */
  watchlist: {
    level: "normal" | "alert" | "warn"
    content: string
  }[]
  /** `null` when the brief carries no extra blocks — use optional chaining. */
  meta: {
    world_overview?: {
      cells: WorldCell[]
      context?: Record<string, unknown>
    }
    hot_news?: ResolvedNews[]
    events_filtered?: ResolvedEvent[]
  } | null
}

/** Any of the three session brief bodies. */
export type MarketAnalysis = PreMarketAnalysis | MidDayAnalysis | DailyAnalysis
