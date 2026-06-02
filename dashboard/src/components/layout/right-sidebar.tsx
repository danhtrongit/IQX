import { useSidebar } from "@/contexts/sidebar-context"
import { NewsFeedPanel } from "@/components/news/news-feed-panel"
import { PremiumGate } from "@/components/premium/premium-gate"

import { WatchlistPanel } from "@/components/watchlist/watchlist-panel"
import { AIPatternPanel } from "@/components/patterns/ai-pattern-panel"
import { RightPanel as TradingPanel } from "./right-panel"
import { X } from "lucide-react"

/**
 * Dynamic right sidebar that switches between panels:
 * - news: Market news feed with filters
 * - patterns: AI candle / chart pattern recognition
 * - trading: Stock trading form (order book + order placement)
 * - watchlist: Watchlist, holdings, and trade history
 *
 * "Mô hình dự báo" is no longer a panel — it lives at /du-bao (see ISSUE-015).
 */
export function RightSidebar() {
  const { activePanel, isOpen, setIsOpen } = useSidebar()

  const getPanelContent = () => {
    switch (activePanel) {
      case "news":
        return <NewsFeedPanel />
      case "patterns":
        return (
          <PremiumGate
            featureName="AI Mẫu nến"
            description="Nhận diện mẫu nến tự động bằng AI cho mã đang xem."
          >
            <AIPatternPanel />
          </PremiumGate>
        )
      case "trading":
        return (
          <PremiumGate
            featureName="Giao dịch ảo"
            description="Đặt lệnh ảo trên tài khoản demo 1 tỷ VND."
          >
            <TradingPanel />
          </PremiumGate>
        )
      case "watchlist":
        return <WatchlistPanel />
      default:
        return <NewsFeedPanel />
    }
  }

  const panelNames: Record<string, string> = {
    news: "Tin tức",
    patterns: "AI Mẫu nến",
    trading: "Đặt lệnh",
    watchlist: "Danh mục",
  }

  return (
    <aside
      className={`fixed inset-x-0 bottom-[52px] top-[76px] z-40 bg-background border-t shadow-2xl transition-transform duration-300 md:static md:w-[320px] lg:w-[360px] md:shrink-0 md:z-auto md:translate-y-0 md:border-l md:border-t-0 md:shadow-none flex flex-col overflow-hidden ${
        isOpen ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="md:hidden flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <span className="text-xs font-bold uppercase text-foreground">{panelNames[activePanel] || activePanel}</span>
        <button onClick={() => setIsOpen(false)} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {getPanelContent()}
      </div>
    </aside>
  )
}
