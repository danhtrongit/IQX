import { TradingPanel } from "@/features/trading"
import { WatchlistPanel } from "@/features/watchlist"
import { NewsFeedPanel } from "@/features/news"
import { AIPatternPanel } from "@/features/patterns"
import { PremiumGate } from "@/features/premium"
import { isIndexSymbol } from "@/features/stock"
import { useSymbol } from "@/shared/contexts/symbol-context"
import { SymbolContextHeader } from "./SymbolContextHeader"
import { BctcLauncher, PhanTichLauncher, SelectStockEmptyState } from "./PhanTichLauncher"
import type { HomeTab } from "./types"

function TabBody({ active }: { active: HomeTab }) {
  const { symbol, setSymbol } = useSymbol()
  switch (active) {
    case "order":
      return <TradingPanel hideHeader />
    case "watchlist":
      return <WatchlistPanel onRowSelect={setSymbol} />
    case "news":
      return <NewsFeedPanel />
    case "phan-tich":
      return <PhanTichLauncher />
    case "bctc":
      return <BctcLauncher />
    case "patterns":
      if (isIndexSymbol(symbol)) return <SelectStockEmptyState what="nhận diện mẫu nến" />
      return (
        <PremiumGate
          featureName="AI Mẫu nến"
          description="Nhận diện mẫu nến tự động bằng AI cho mã đang xem."
        >
          <AIPatternPanel />
        </PremiumGate>
      )
  }
}

export function HomeSidePanel({ active }: { active: HomeTab }) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-l border-[var(--color-border-2)] bg-[var(--color-bg-2)]">
      <SymbolContextHeader />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TabBody active={active} />
      </div>
    </div>
  )
}
