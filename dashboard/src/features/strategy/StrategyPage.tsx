import { useSearchParams } from "react-router"
import { AlertsInner } from "@/features/alerts"
import { BacktestLab } from "@/features/backtest"
import { PremiumGate } from "@/features/premium"
import { cn } from "@/shared/lib/cn"

/**
 * /chien-luoc — unified Strategy page: Cảnh báo + Backtest tabs.
 *
 * URL sync: ?tab=canh-bao (default) | backtest ; ?symbol=XXX → BacktestLab.
 *
 * Layout: AppShell's <main> is `flex-1 min-h-0 overflow-auto`, so this page is
 * `h-full` and owns its own flex column — a fixed tab bar + a single
 * `flex-1 min-h-0 overflow-auto` content area. We render the active pane
 * ourselves (NOT via Arco Tabs' animated content track) so the content area is
 * a definite-height parent: BacktestLab's `h-full` resolves and its internal
 * factor-library/results panels scroll on their own; the Cảnh báo content
 * scrolls within the content area. One scroll context per tab — no double
 * scrollbar.
 *
 * The whole page is PremiumGate-wrapped (both sub-pages are premium-only).
 */

const TABS = [
  { key: "canh-bao", title: "Cảnh báo" },
  { key: "backtest", title: "Backtest" },
] as const

export function StrategyPage() {
  const [params, setSearchParams] = useSearchParams()
  const tab = params.get("tab") === "backtest" ? "backtest" : "canh-bao"

  function handleTabChange(key: string) {
    setSearchParams(
      (prev) => {
        prev.set("tab", key)
        return prev
      },
      { replace: true },
    )
  }

  return (
    <PremiumGate
      featureName="Chiến lược"
      description="Cảnh báo tín hiệu kỹ thuật và công cụ Backtest chiến lược giao dịch."
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* Tab bar (fixed height) */}
        <div
          role="tablist"
          aria-label="Chiến lược"
          data-tour-id="tour-strategy-tabs"
          className="flex shrink-0 items-center gap-1 border-b border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-3"
        >
          {TABS.map((t) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleTabChange(t.key)}
                className={cn(
                  "relative px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "text-[rgb(var(--primary-6))]"
                    : "text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
                )}
              >
                {t.title}
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[rgb(var(--primary-6))]" />
                )}
              </button>
            )
          })}
        </div>

        {/* Content area (single scroll context) */}
        <div className="min-h-0 flex-1 overflow-auto">
          {tab === "canh-bao" ? (
            <AlertsInner />
          ) : (
            <BacktestLab initialSymbol={params.get("symbol") ?? undefined} />
          )}
        </div>
      </div>
    </PremiumGate>
  )
}
