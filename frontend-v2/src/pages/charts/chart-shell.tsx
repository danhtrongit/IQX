/**
 * Chart page shell: [ chart / detail canvas | tool panel | tool rail ].
 *
 * The tool panel is opened through the URL (`?tool=`), so a reload or a shared
 * link lands on the same tool; on small screens the panel becomes a slide-up
 * drawer over the chart instead of squeezing the canvas.
 */
import { useState, type ReactNode } from "react"
import { useSearchParams } from "react-router"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { ToolPanel } from "./tool-panel"
import { isInvestTool, ToolRail, type InvestTool } from "./tool-rail"

export function ChartShell({
  symbol,
  onSymbolChange,
  onAiInsight,
  children,
}: {
  symbol: string
  onSymbolChange: (symbol: string) => void
  onAiInsight: () => void
  children: ReactNode
}) {
  const [params, setParams] = useSearchParams()
  const rawTool = params.get("tool")
  const tool: InvestTool = isInvestTool(rawTool) ? rawTool : "news"
  const [drawerOpen, setDrawerOpen] = useState(false)

  function selectTool(next: InvestTool) {
    const nextParams = new URLSearchParams(params)
    nextParams.set("tool", next)
    setParams(nextParams, { replace: true })
    setDrawerOpen(true)
  }

  // The demo panels speak in rail ids ("trading" for the order ticket); map
  // them onto this shell's tool ids so their buttons stay working in place.
  function navigate(panel: string, nextSymbol?: string) {
    const nextParams = new URLSearchParams(params)
    const target = isInvestTool(panel) ? panel : panel === "trading" ? "order" : null
    if (target) nextParams.set("tool", target)
    setParams(nextParams, { replace: true })
    if (nextSymbol) onSymbolChange(nextSymbol.toUpperCase())
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <section
        aria-label="Khu vực biểu đồ"
        className="flex min-h-0 min-w-0 flex-1 flex-col pb-14 lg:pb-0"
      >
        {children}
      </section>

      <aside
        aria-label="Công cụ đầu tư"
        className={cn(
          "fixed inset-x-0 top-(--header-top) bottom-14 z-30 flex min-h-0 flex-col overflow-hidden border-t border-border bg-sidebar shadow-lg transition-transform duration-200 lg:static lg:inset-auto lg:z-auto lg:w-(--sidebar-width) lg:shrink-0 lg:border-t-0 lg:border-l lg:shadow-none lg:transition-none lg:translate-y-0",
          drawerOpen ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ToolPanel
            tool={tool}
            symbol={symbol}
            onSymbolChange={(next) => onSymbolChange(next.toUpperCase())}
            onNavigate={navigate}
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Đóng bảng công cụ"
            onClick={() => setDrawerOpen(false)}
            className="absolute top-3 right-3 lg:hidden"
          >
            <ChevronDown aria-hidden="true" />
          </Button>
        </div>
      </aside>

      <ToolRail tool={tool} onSelect={selectTool} onAiInsight={onAiInsight} />
    </div>
  )
}
