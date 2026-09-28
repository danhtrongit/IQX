// ─── Ticker pill ──────────────────────────────────────────────────────────────
// The legacy `.pm-ticker-pill`: a compact chip carrying one affected symbol,
// tinted with the pre-market accent. Shared by the news cards and the event rows.

export function TickerPill({ ticker }: { ticker: string }) {
  return (
    <span className="rounded-sm bg-primary/12 px-1.5 py-0.5 text-xs font-bold tracking-[0.02em] text-primary">
      {ticker}
    </span>
  )
}
