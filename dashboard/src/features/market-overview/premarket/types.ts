// ─── Pre-market analysis types ───────────────────────────

// ─── Resolved news item (full object from backend) ───────

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

// ─── Resolved event item ──────────────────────────────────

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

// ─── World overview cell ──────────────────────────────────

export interface WorldCell {
  id: string
  label: string
  value: number | null
  change_pct: number | null
  sentiment: "up" | "down" | "flat"
  stale: boolean
  source?: "vcb"
}

// ─── Main pre-market analysis shape ──────────────────────

export interface PreMarketAnalysis {
  id: string
  session_date: string
  report_type: "premarket"
  headline: string
  tagline: { text: string }
  paragraphs: {
    world_paragraph?: string
  }
  watchlist: {
    level: "normal" | "alert" | "warn"
    content: string
  }[]
  meta: {
    world_overview?: {
      cells: WorldCell[]
      context?: Record<string, unknown>
    }
    hot_news?: ResolvedNews[]
    events_filtered?: ResolvedEvent[]
  }
}
