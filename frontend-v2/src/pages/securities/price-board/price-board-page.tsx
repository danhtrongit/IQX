import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import {
  useAddToWatchlist,
  useRemoveFromWatchlist,
  useWatchlist,
} from "@/pages/demo-trading/portfolio/hooks"
import { TourOverlay } from "@/pages/market-workspace/tour"

import { usePrices } from "../market/hooks"
import { MarketDataProvider } from "../market/provider"
import { useGroups } from "../stock-directory/hooks"
import { bangGiaTour } from "../tours/bang-gia-tour"
import { useFeatureTour } from "../tours/use-feature-tour"
import { BoardTable } from "./components/board-table"
import { BoardToolbar, type BoardTab } from "./components/board-toolbar"
import { IndexStrip } from "./components/index-strip"
import { IndexSummaryTable } from "./components/index-summary-table"

function BoardView({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const { isAuthenticated, openAuth } = useAuth()
  const [tab, setTab] = useState<BoardTab>("VN30")
  const [search, setSearch] = useState("")

  const watchlist = useWatchlist()
  const addToWatchlist = useAddToWatchlist()
  const removeFromWatchlist = useRemoveFromWatchlist()
  const { mutate: addSymbol } = addToWatchlist
  const { mutate: removeSymbol } = removeFromWatchlist

  const {
    tickers: groupTickers,
    isLoading: isGroupLoading,
    error: groupError,
  } = useGroups(tab === "WATCHLIST" ? null : tab)

  // "Danh mục" = mã trong watchlist của user; các tab còn lại là nhóm chỉ số/sàn.
  const tickers = useMemo(() => {
    if (tab !== "WATCHLIST") return groupTickers
    return (watchlist.data ?? []).map((item) => item.symbol)
  }, [tab, groupTickers, watchlist.data])

  const { priceMap, isLoading: isPriceLoading, error: priceError } = usePrices(tickers)

  // Subscribe live prices for every ticker in the tab; the search box only filters rows.
  const rows = useMemo(() => {
    const query = search.trim().toUpperCase()
    const filtered = query
      ? tickers
          .filter((symbol) => symbol.includes(query))
          .sort((a, b) => Number(b.startsWith(query)) - Number(a.startsWith(query)))
      : tickers
    return filtered.flatMap((symbol) => {
      const row = priceMap[symbol]
      return row ? [row] : []
    })
  }, [tickers, priceMap, search])

  const emptyHint = useMemo(() => {
    if (tab === "WATCHLIST") {
      if (!isAuthenticated) return "Đăng nhập để xem danh mục theo dõi của bạn."
      if (watchlist.isLoading) return "Đang tải danh mục theo dõi…"
      if ((watchlist.data ?? []).length === 0) {
        return "Danh mục trống — thêm mã từ trang cổ phiếu hoặc menu thao tác trên bảng giá."
      }
      return "Đang chờ dữ liệu giá…"
    }
    if (isGroupLoading) return "Đang tải danh sách mã…"
    if (groupError) return `Không tải được nhóm ${tab}: ${groupError.message}`
    if (search.trim()) return "Không có mã khớp với từ khóa."
    return "Đang chờ dữ liệu giá…"
  }, [tab, isAuthenticated, watchlist.isLoading, watchlist.data, isGroupLoading, groupError, search])

  const watchedSymbols = useMemo(
    () => new Set((watchlist.data ?? []).map((item) => item.symbol.toUpperCase())),
    [watchlist.data],
  )

  const toggleWatch = useCallback(
    (symbol: string) => {
      if (!isAuthenticated) {
        openAuth("login")
        return
      }
      const code = symbol.toUpperCase()
      const onError = (cause: unknown) => toast.error(errorMessage(cause))
      if (watchedSymbols.has(code)) {
        removeSymbol(code, {
          onSuccess: () => toast.success(`Đã bỏ ${code} khỏi danh mục theo dõi`),
          onError,
        })
      } else {
        addSymbol(code, {
          onSuccess: () => toast.success(`Đã thêm ${code} vào danh mục theo dõi`),
          onError,
        })
      }
    },
    [isAuthenticated, openAuth, watchedSymbols, addSymbol, removeSymbol],
  )

  const openSymbol = useCallback(
    (symbol: string) => navigate(`/co-phieu/${symbol}`),
    [navigate],
  )

  const tour = useFeatureTour(bangGiaTour, "iqx_tour_banggia")

  const content = (
    <>
      <div className="flex items-stretch gap-3">
        <IndexStrip />
        <IndexSummaryTable />
      </div>
      <BoardToolbar
        search={search}
        onSearchChange={setSearch}
        tab={tab}
        onTabChange={setTab}
        rowCount={rows.length}
        onLaunchTour={tour.start}
      />
      <BoardTable
        rows={rows}
        isLoading={isPriceLoading}
        error={priceError}
        emptyHint={emptyHint}
        emptyAction={tab === "WATCHLIST" && !isAuthenticated ? { label: "Đăng nhập", onClick: () => openAuth("login") } : undefined}
        onOpen={openSymbol}
        watchedSymbols={watchedSymbols}
        onToggleWatch={toggleWatch}
      />
    </>
  )

  return (
    <>
      {embedded ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-(--page-padding)">{content}</div>
      ) : (
        <WorkspacePage
        title="Bảng giá"
        description="Bảng giá trực tuyến theo nhóm chỉ số · Trần/Sàn/TC, độ sâu bên mua – bên bán, khớp lệnh, khối ngoại"
        scroll={false}
        contentClassName="gap-3 p-(--page-padding)"
        >{content}</WorkspacePage>
      )}
      <TourOverlay config={bangGiaTour} controller={tour.controller} />
    </>
  )
}

/**
 * `/bang-gia` — SSI iBoard-style live price board.
 *
 * Index strip + index summary, then the dense board grid: Trần/Sàn/TC, bid depth
 * (3), khớp lệnh (Giá/KL/+-/%), ask depth (3), tổng KL, GT, cao/thấp, ĐTNN. Live
 * data comes from the feature-owned transport (tick + order-book + index
 * WebSocket overlays with a REST polling fallback); cells flash on change and
 * rows are memoized. Public — only the "Danh mục" tab needs an account.
 */
export function PriceBoardPage({ embedded = false }: { embedded?: boolean }) {
  useEffect(() => {
    if (!embedded) document.title = "Bảng giá | IQX"
  }, [embedded])

  return (
    <MarketDataProvider>
      <BoardView embedded={embedded} />
    </MarketDataProvider>
  )
}
