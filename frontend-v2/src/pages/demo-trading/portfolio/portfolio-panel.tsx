/**
 * Panel "Danh mục" của /demo-trading — ba tab Theo dõi / Nắm giữ / Lịch sử,
 * port từ `features/watchlist` của dashboard cũ sang shadcn + IQX DESIGN.
 *
 * Hợp đồng với shell (`demo-trading-page`):
 * - `symbol` / `onSymbolChange` — chọn mã nằm ở shell (URL `?symbol=`), panel chỉ
 *   báo lên; hàng nào trùng mã đang chọn thì được tô sáng.
 * - `onNavigate(panel, symbol?)` — chuyển panel khác trong rail; khi hành động
 *   vừa chọn mã vừa đổi panel thì truyền mã kèm theo MỘT lần gọi (shell ghi cả
 *   `?view=` lẫn `?symbol=` trong cùng một lần cập nhật search param).
 *
 * Tab đang mở nhớ qua localStorage; mọi dữ liệu khác đều là server state của
 * React Query nên tải lại trang là khôi phục đúng từ backend.
 */
import { useState } from "react"
import { Briefcase, Eye, History, LogIn } from "lucide-react"

import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/use-auth"
import { HoldingsTab, HoldingsToolbar, useHoldingsFilter } from "./holdings-tab"
import { HistoryTab, HistoryToolbar, useHistoryQuery } from "./history-tab"
import { WatchlistAddBar, WatchlistTab } from "./watchlist-tab"

export type PortfolioTab = "watchlist" | "holdings" | "history"

const TAB_STORAGE_KEY = "iqx.demo.portfolio.tab"

const TAB_META: Record<PortfolioTab, { label: string; description: string }> = {
  watchlist: { label: "Theo dõi", description: "Mã đang theo dõi" },
  holdings: { label: "Nắm giữ", description: "Vị thế đang nắm giữ" },
  history: { label: "Lịch sử", description: "Toàn bộ lệnh đã đặt" },
}

function readStoredTab(): PortfolioTab {
  if (typeof window === "undefined") return "watchlist"
  const stored = window.localStorage.getItem(TAB_STORAGE_KEY)
  return stored === "holdings" || stored === "history" ? stored : "watchlist"
}

export function PortfolioPanel({
  symbol,
  onSymbolChange,
  onNavigate,
}: {
  symbol: string
  onSymbolChange: (symbol: string) => void
  onNavigate: (panel: string, symbol?: string) => void
}) {
  const { isAuthenticated, isLoading, openAuth } = useAuth()
  const [tab, setTab] = useState<PortfolioTab>(readStoredTab)
  const holdings = useHoldingsFilter()
  const history = useHistoryQuery()

  function changeTab(next: string) {
    const value: PortfolioTab = next === "holdings" || next === "history" ? next : "watchlist"
    setTab(value)
    window.localStorage.setItem(TAB_STORAGE_KEY, value)
  }

  if (isLoading) {
    return (
      <SidebarPanel title="Danh mục" description={TAB_META.watchlist.description}>
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((key) => (
            <Skeleton key={key} className="h-9 w-full" />
          ))}
        </div>
      </SidebarPanel>
    )
  }

  if (!isAuthenticated) {
    return (
      <SidebarPanel title="Danh mục" description="Theo dõi · Nắm giữ · Lịch sử">
        <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
          <Eye className="size-6 text-muted-foreground/60" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            Đăng nhập để dùng danh mục theo dõi, vị thế nắm giữ và lịch sử lệnh.
          </p>
          <Button type="button" size="sm" onClick={() => openAuth()}>
            <LogIn />
            Đăng nhập
          </Button>
        </div>
      </SidebarPanel>
    )
  }

  return (
    <Tabs
      value={tab}
      onValueChange={changeTab}
      className="h-full min-h-0 flex-col gap-0"
    >
      <SidebarPanel
        title="Danh mục"
        description={TAB_META[tab].description}
        actions={
          <TabsList variant="line" className="h-7 shrink-0">
            <TabsTrigger value="watchlist" className="gap-1 px-1.5 text-[11px]">
              <Eye />
              {TAB_META.watchlist.label}
            </TabsTrigger>
            <TabsTrigger value="holdings" className="gap-1 px-1.5 text-[11px]">
              <Briefcase />
              {TAB_META.holdings.label}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1 px-1.5 text-[11px]">
              <History />
              {TAB_META.history.label}
            </TabsTrigger>
          </TabsList>
        }
        footer={
          tab === "watchlist" ? (
            <WatchlistAddBar />
          ) : tab === "holdings" ? (
            <HoldingsToolbar filter={holdings.filter} setFilter={holdings.setFilter} />
          ) : (
            <HistoryToolbar
              status={history.status}
              setStatus={history.setStatus}
              page={history.page}
              setPage={history.setPage}
            />
          )
        }
      >
        <TabsContent value="watchlist" className="space-y-1">
          <WatchlistTab symbol={symbol} onSymbolChange={onSymbolChange} />
        </TabsContent>
        <TabsContent value="holdings" className="space-y-3">
          <HoldingsTab
            filter={holdings.filter}
            symbol={symbol}
            onSymbolChange={onSymbolChange}
            onNavigate={onNavigate}
          />
        </TabsContent>
        <TabsContent value="history" className="space-y-1">
          <HistoryTab
            status={history.status}
            page={history.page}
            symbol={symbol}
            onSymbolChange={onSymbolChange}
            onNavigate={onNavigate}
          />
        </TabsContent>
      </SidebarPanel>
    </Tabs>
  )
}
