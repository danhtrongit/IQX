import { Button } from "@arco-design/web-react"
import { IconClose } from "@arco-design/web-react/icon"
import { useSidebar, type SidebarPanel } from "@/shared/contexts/sidebar-context"
import { NewsFeedPanel } from "@/features/news"
import { TradingPanel } from "@/features/trading"
import { WatchlistPanel } from "@/features/watchlist"
import { PremiumGate } from "@/features/premium"
import { AIPatternPanel } from "@/features/patterns"

/**
 * Dynamic right sidebar that switches between panels:
 * - news: Market news feed with filters
 * - patterns: AI candle / chart pattern recognition (premium)
 * - trading: Virtual-trading order form + order book (premium)
 * - watchlist: Watchlist, holdings, and trade history
 *
 * "Mô hình dự báo" is no longer a panel — it lives at /du-bao.
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
        return <TradingPanel />
      case "watchlist":
        return <WatchlistPanel />
      default:
        return <NewsFeedPanel />
    }
  }

  const panelNames: Record<SidebarPanel, string> = {
    news: "Tin tức",
    patterns: "AI Mẫu nến",
    trading: "Đặt lệnh",
    watchlist: "Danh mục",
  }

  return (
    <aside
      className={`fixed inset-x-0 bottom-[52px] top-[76px] z-40 bg-[var(--color-bg-1)] border-t border-[var(--color-border-2)] shadow-2xl transition-transform duration-300 md:static md:w-[280px] md:shrink-0 md:z-auto md:translate-y-0 md:border-l md:border-t-0 md:shadow-none flex flex-col overflow-hidden ${
        isOpen ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="md:hidden flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-2)] bg-[var(--color-fill-1)]">
        <span className="text-xs font-bold uppercase text-[var(--color-text-1)]">
          {panelNames[activePanel] || activePanel}
        </span>
        <Button
          type="text"
          size="mini"
          icon={<IconClose />}
          onClick={() => setIsOpen(false)}
        />
      </div>
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {getPanelContent()}
      </div>
    </aside>
  )
}
