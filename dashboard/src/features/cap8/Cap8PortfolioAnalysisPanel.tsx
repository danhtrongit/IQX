import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Cap7PortfolioAnalysisPanel } from "@/features/cap7/Cap7PortfolioAnalysisPanel"
import { useCap8Events } from "./Cap8Context"

/**
 * Until Level 8's exit journey owns its own analysis, its sidebar reuses the
 * neutral, live Level 7 allocation snapshot rather than retired order-book data.
 */
export function Cap8PortfolioAnalysisPanel() {
  const { isCap8Active } = useCap8Events()
  const { setActivePanel } = useSidebar()
  if (!isCap8Active) return null
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-1)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border-2)] p-3">
        <button type="button" onClick={() => setActivePanel("journey")} className="text-xs text-[var(--color-text-3)] hover:text-[var(--color-text-1)]">← Hành trình</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3"><Cap7PortfolioAnalysisPanel /></div>
    </div>
  )
}
