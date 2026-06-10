import { Outlet } from "react-router"
import { Footer, Header, MarketBar, TrialBanner } from "@/features/navigation"

/**
 * Shared content-page chrome: trial banner + 44px header + 32px market bar,
 * scrollable content, 24px footer. (The full trading-terminal layout with
 * drawing/news/watchlist rails is the dashboard feature; the marketing landing
 * uses its own chrome.)
 */
export function AppShell() {
  return (
    <div className="flex h-svh flex-col bg-[var(--color-bg-1)] text-[var(--color-text-1)]">
      <TrialBanner />
      <header className="shrink-0 border-b border-[var(--color-border-2)] bg-[var(--color-bg-2)]">
        <Header />
      </header>
      <div className="shrink-0 border-b border-[var(--color-border-2)] bg-[var(--color-bg-2)]">
        <MarketBar />
      </div>
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
      <footer className="shrink-0 border-t border-[var(--color-border-2)] bg-[var(--color-bg-2)]">
        <Footer />
      </footer>
    </div>
  )
}
