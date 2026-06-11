import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { useAuth } from "@/features/auth"
import { usePrices } from "@/features/market-data"
import { useGroups } from "@/features/stock-directory/hooks"
import { useWatchlist } from "@/features/watchlist"
import { BoardTable } from "./components/BoardTable"
import { BoardToolbar, type BoardTab } from "./components/BoardToolbar"
import { IndexStrip } from "./components/IndexStrip"
import { IndexSummaryTable } from "./components/IndexSummaryTable"
import type { PriceBoardData } from "@/features/market-data"

/**
 * /bang-gia — SSI iBoard-style live price board.
 *
 * Layout: index strip (4 intraday charts) + index summary table (≥xl),
 * toolbar (search + group/watchlist tabs), then the dense board grid:
 * Trần/Sàn/TC, bid depth (3), khớp lệnh (Giá/KL/+-/%), ask depth (3),
 * tổng KL, cao/thấp, ĐTNN. Live data comes from the shared
 * MarketDataProvider (tick + orderbook + index WebSocket overlays with REST
 * polling fallback); cells flash on change, rows are memoized.
 *
 * Color convention follows Vietnamese trading boards (domain standard, not
 * decorative): ceiling = tím, floor = xanh lơ, reference = vàng, tăng = xanh,
 * giảm = đỏ.
 */
export default function BangGiaPage() {
  useEffect(() => {
    document.title = "Bảng giá | IQX"
  }, [])

  const navigate = useNavigate()
  const [tab, setTab] = useState<BoardTab>("VN30")
  const [search, setSearch] = useState("")

  // "Danh mục" = watchlist của user (cần đăng nhập); các tab còn lại là nhóm chỉ số.
  const { isAuthenticated } = useAuth()
  const watchlist = useWatchlist()
  const { tickers: groupTickers, isLoading: isGroupLoading } = useGroups(
    tab === "WATCHLIST" ? null : tab,
  )

  const tickers = useMemo(() => {
    if (tab !== "WATCHLIST") return groupTickers
    return (watchlist.data ?? []).map((item) => item.symbol)
  }, [tab, groupTickers, watchlist.data])

  // Subscribe live prices for every ticker in the tab (search only filters rows).
  const { priceMap } = usePrices(tickers)

  const rows = useMemo(() => {
    const q = search.trim().toUpperCase()
    const filtered = q
      ? tickers
          .filter((sym) => sym.includes(q))
          .sort((a, b) => Number(b.startsWith(q)) - Number(a.startsWith(q)))
      : tickers
    return filtered
      .map((sym) => priceMap[sym])
      .filter((p): p is PriceBoardData => !!p)
  }, [tickers, priceMap, search])

  const emptyHint = useMemo(() => {
    if (tab === "WATCHLIST") {
      if (!isAuthenticated) return "Đăng nhập để xem danh mục theo dõi của bạn"
      if ((watchlist.data ?? []).length === 0)
        return "Danh mục trống — thêm mã từ trang cổ phiếu hoặc ô tìm kiếm"
      return "Đang chờ dữ liệu giá…"
    }
    if (isGroupLoading) return "Đang tải danh sách mã…"
    if (search.trim()) return "Không có mã khớp với từ khóa"
    return "Đang chờ dữ liệu giá…"
  }, [tab, isAuthenticated, watchlist.data, isGroupLoading, search])

  const onOpen = useCallback(
    (symbol: string) => navigate(`/co-phieu/${symbol}`),
    [navigate],
  )

  return (
    <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-3 px-3 py-3">
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
      />
      <BoardTable rows={rows} emptyHint={emptyHint} onOpen={onOpen} />
    </div>
  )
}
