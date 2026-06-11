import { useMemo, useState } from "react"
import { useNavigate } from "react-router"
import {
  Button,
  Empty,
  Input,
  Message,
  Radio,
  Spin,
  Tabs,
  Tag,
} from "@arco-design/web-react"
import {
  IconArrowFall,
  IconArrowRise,
  IconClockCircle,
  IconEye,
  IconHistory,
  IconMinus,
  IconPlus,
  IconSearch,
  IconStarFill,
  IconUser,
} from "@arco-design/web-react/icon"
import { usePrices } from "@/features/market-data"
import { useAuth } from "@/features/auth"
import { getErrorMessage } from "@/shared/http/client"
import { cn } from "@/shared/lib/cn"
import { StockLogo } from "@/features/navigation/StockLogo"
import { IconActivity, IconBriefcase, IconWallet } from "./icons"
import {
  useAddToWatchlist,
  useRemoveFromWatchlist,
  useSparkline,
  useSymbolInfo,
  useWatchlist,
} from "./hooks"
import { watchlistApi } from "./api"
import { usePortfolio, useOrders } from "@/features/trading"
import {
  FlashingPrice,
  Sparkline,
  fmtVnd,
  priceColorClass,
  priceColorHex,
} from "./ui"

const TAB_STORAGE_KEY = "iqx.watchlist.activeTab"
type WatchlistTab = "watchlist" | "holdings" | "history"

function getInitialTab(): WatchlistTab {
  if (typeof window === "undefined") return "watchlist"
  const stored = window.localStorage.getItem(TAB_STORAGE_KEY)
  return stored === "holdings" || stored === "history" ? stored : "watchlist"
}

/* ─────────────────────────── Tab: Theo dõi ─────────────────────────── */

function WatchlistTab() {
  const navigate = useNavigate()
  const { data: items, isLoading } = useWatchlist()
  const add = useAddToWatchlist()
  const remove = useRemoveFromWatchlist()
  const [newSymbol, setNewSymbol] = useState("")

  const symbols = useMemo(() => (items ?? []).map((i) => i.symbol), [items])
  const { priceMap } = usePrices(symbols)

  const stats = useMemo(() => {
    let up = 0
    let down = 0
    let flat = 0
    for (const sym of symbols) {
      const chg = priceMap[sym.toUpperCase()]?.priceChange || 0
      if (chg > 0) up++
      else if (chg < 0) down++
      else flat++
    }
    const total = symbols.length
    return {
      total,
      up,
      down,
      flat,
      upPct: total ? Math.round((up / total) * 100) : 0,
      downPct: total ? Math.round((down / total) * 100) : 0,
    }
  }, [symbols, priceMap])

  const handleAdd = async () => {
    const sym = newSymbol.trim().toUpperCase()
    if (!sym) return
    const validationError = await watchlistApi.validateStock(sym)
    if (validationError) {
      Message.warning(validationError)
      return
    }
    try {
      await add.mutateAsync(sym)
      setNewSymbol("")
      Message.success(`Đã thêm ${sym} vào danh mục theo dõi`)
    } catch (err) {
      Message.error(await getErrorMessage(err, `Không thể thêm ${sym}`))
    }
  }

  const handleRemove = async (sym: string) => {
    try {
      await remove.mutateAsync(sym)
    } catch (err) {
      Message.error(await getErrorMessage(err, `Không thể xóa ${sym}`))
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Spin />
        <span className="mt-2 text-xs text-[var(--color-text-3)]">Đang tải...</span>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Stats bar */}
      {symbols.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-border-2)] px-2 py-1.5">
          <Tag size="small" icon={<IconEye />}>
            Tổng {stats.total}
          </Tag>
          <Tag size="small" color="green" icon={<IconArrowRise />}>
            {stats.up} ({stats.upPct}%)
          </Tag>
          <Tag size="small" color="red" icon={<IconArrowFall />}>
            {stats.down} ({stats.downPct}%)
          </Tag>
          <Tag size="small" color="orange" icon={<IconMinus />}>
            {stats.flat}
          </Tag>
        </div>
      )}

      {/* Add */}
      <div className="flex gap-1 border-b border-[var(--color-border-2)] px-2 py-1.5">
        <Input
          size="small"
          allowClear
          prefix={<IconSearch />}
          placeholder="Thêm mã cổ phiếu..."
          value={newSymbol}
          onChange={(v) => setNewSymbol(v.toUpperCase())}
          onPressEnter={handleAdd}
        />
        <Button
          type="primary"
          size="small"
          shape="circle"
          icon={<IconPlus />}
          loading={add.isPending}
          disabled={!newSymbol.trim()}
          onClick={handleAdd}
        />
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {symbols.length === 0 ? (
          <Empty
            className="py-12"
            icon={<IconStarFill style={{ fontSize: 28, opacity: 0.3 }} />}
            description={
              <div className="text-xs text-[var(--color-text-3)]">
                <p>Chưa có mã theo dõi</p>
                <p className="mt-1 text-[var(--color-text-4)]">
                  Thêm mã cổ phiếu để bắt đầu theo dõi
                </p>
              </div>
            }
          />
        ) : (
          symbols.map((sym) => {
            const d = priceMap[sym.toUpperCase()]
            const price = d?.closePrice || 0
            const pct = d?.percentChange || 0
            const ref = d?.referencePrice || 0
            const ceil = d?.ceilingPrice || 0
            const floor = d?.floorPrice || 0
            const isUp = (d?.priceChange || 0) > 0
            const isDown = (d?.priceChange || 0) < 0
            const colorClass = priceColorClass(price, ref, ceil, floor)
            const sparkColor = priceColorHex(price, ref, ceil, floor)
            return (
              <WatchlistItemRow
                key={sym}
                symbol={sym}
                price={price}
                pct={pct}
                isUp={isUp}
                isDown={isDown}
                colorClass={colorClass}
                sparkColor={sparkColor}
                onOpen={() => navigate(`/co-phieu/${sym}`)}
                onRemove={() => handleRemove(sym)}
              />
            )
          })
        )}
      </div>
    </div>
  )
}

function WatchlistItemRow({
  symbol,
  price,
  pct,
  isUp,
  isDown,
  colorClass,
  sparkColor,
  onOpen,
  onRemove,
}: {
  symbol: string
  price: number
  pct: number
  isUp: boolean
  isDown: boolean
  colorClass: string
  sparkColor: string
  onOpen: () => void
  onRemove: () => void
}) {
  const { data: info } = useSymbolInfo(symbol)
  const { data: spark } = useSparkline(symbol)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      className="group cursor-pointer border-b border-[var(--color-border-1)] px-2 py-2.5 transition-colors hover:bg-[var(--color-fill-1)]"
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="shrink-0 text-[rgb(var(--orange-6))] hover:opacity-70"
          aria-label={`Bỏ theo dõi ${symbol}`}
        >
          <IconStarFill />
        </button>
        <StockLogo symbol={symbol} size={32} />
        <div className="w-[68px] min-w-0 shrink-0">
          <span className="text-sm font-bold text-[var(--color-text-1)] group-hover:text-[rgb(var(--primary-6))]">
            {symbol}
          </span>
          {info && (
            <p className="mt-0.5 truncate text-[10px] leading-tight text-[var(--color-text-3)]">
              {info.shortName || info.name}
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <Sparkline data={spark || []} color={sparkColor} width={60} height={22} />
        </div>
        <div className="flex w-[66px] shrink-0 flex-col items-end">
          <FlashingPrice price={price} className={colorClass} />
          {price > 0 ? (
            <span className={cn("text-[10px] font-semibold tabular-nums", colorClass)}>
              {isUp ? "+" : ""}
              {pct.toFixed(2)}%{isUp ? " ↑" : isDown ? " ↓" : ""}
            </span>
          ) : (
            <span className="text-[10px] text-[var(--color-text-4)]">---</span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────── Tab: Nắm giữ ─────────────────────────── */

function HoldingsTab() {
  const navigate = useNavigate()
  const { data: portfolio, isLoading } = usePortfolio()
  const [filter, setFilter] = useState<"all" | "profit" | "loss">("all")

  const positions = portfolio?.positions ?? []
  const symbols = useMemo(() => positions.map((p) => p.symbol), [positions])
  const { priceMap } = usePrices(symbols)

  // Re-derive a per-position P&L (% of cost) for filtering / display.
  const rows = useMemo(
    () =>
      positions.map((p) => {
        const cost = p.avgBuyPrice * p.quantity
        const pnlPercent = cost > 0 ? (p.unrealizedPnl / cost) * 100 : 0
        return { ...p, pnlPercent }
      }),
    [positions],
  )

  const filtered = useMemo(() => {
    if (filter === "profit") return rows.filter((r) => r.unrealizedPnl > 0)
    if (filter === "loss") return rows.filter((r) => r.unrealizedPnl < 0)
    return rows
  }, [rows, filter])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Spin />
        <span className="mt-2 text-xs text-[var(--color-text-3)]">Đang tải...</span>
      </div>
    )
  }

  const totalPnl = portfolio?.pnl ?? 0
  const totalPnlPct = portfolio?.pnlPercent ?? 0
  const isProfit = totalPnl >= 0
  const pnlColor = isProfit ? "text-up" : "text-down"

  return (
    <div className="flex h-full flex-col">
      {/* Account summary 2×2 */}
      {portfolio && (
        <div className="grid grid-cols-2 gap-1.5 border-b border-[var(--color-border-2)] px-2 py-2">
          <SummaryCard icon={<IconActivity />} label="Tổng tài sản">
            <span className="font-bold tabular-nums text-[var(--color-text-1)]">
              {fmtVnd(portfolio.totalAssets)}
            </span>
            <span className="ml-0.5 text-[8px] text-[var(--color-text-3)]">VND</span>
          </SummaryCard>
          <SummaryCard icon={<IconWallet />} label="Tiền mặt">
            <span className="font-bold tabular-nums text-[var(--color-text-1)]">
              {fmtVnd(portfolio.balance)}
            </span>
            <span className="ml-0.5 text-[8px] text-[var(--color-text-3)]">VND</span>
          </SummaryCard>
          <SummaryCard icon={<IconActivity />} label="Lãi/Lỗ tạm tính">
            <span className={cn("font-bold tabular-nums", pnlColor)}>
              {isProfit ? "+" : ""}
              {fmtVnd(totalPnl)}
            </span>
            <span className="ml-0.5 text-[8px] text-[var(--color-text-3)]">VND</span>
          </SummaryCard>
          <SummaryCard icon={<IconArrowRise />} label="Hiệu suất">
            <span className={cn("font-bold tabular-nums", pnlColor)}>
              {isProfit ? "+" : ""}
              {totalPnlPct.toFixed(2)}%
            </span>
          </SummaryCard>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border-2)] px-2 py-1">
        <Radio.Group
          type="button"
          size="mini"
          value={filter}
          onChange={(v) => setFilter(v)}
          options={[
            { label: "Tất cả", value: "all" },
            { label: "Có lãi", value: "profit" },
            { label: "Lỗ", value: "loss" },
          ]}
        />
        <span className="ml-auto text-[9px] tabular-nums text-[var(--color-text-3)]">
          {filtered.length} mã
        </span>
      </div>

      {/* Header */}
      {filtered.length > 0 && (
        <div className="flex items-center border-b border-[var(--color-border-1)] bg-[var(--color-fill-1)] px-2 py-1 text-[9px] font-medium text-[var(--color-text-3)]">
          <span className="w-[72px]">Mã CK</span>
          <span className="w-[32px] text-right">SL</span>
          <span className="flex-1 text-right">Giá vốn</span>
          <span className="flex-1 text-right">Giá TT</span>
          <span className="w-[70px] text-right">Lãi/Lỗ</span>
        </div>
      )}

      {/* Rows */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <Empty
            className="py-12"
            icon={<IconBriefcase style={{ fontSize: 28, opacity: 0.3 }} />}
            description={
              <span className="text-xs text-[var(--color-text-3)]">
                {filter === "all" ? "Chưa nắm giữ cổ phiếu nào" : "Không có mã phù hợp"}
              </span>
            }
          />
        ) : (
          filtered.map((item) => {
            const live = priceMap[item.symbol.toUpperCase()]
            const livePriceVnd = live?.closePrice ? live.closePrice * 1000 : 0
            const currentPrice = livePriceVnd || item.currentPrice || 0
            const isP = item.unrealizedPnl >= 0
            const color = isP ? "text-up" : "text-down"
            return (
              <button
                key={item.symbol}
                type="button"
                onClick={() => navigate(`/co-phieu/${item.symbol}`)}
                className="group w-full px-2 py-2 text-left transition-colors hover:bg-[var(--color-fill-1)]"
              >
                <div className="flex items-center">
                  <div className="flex w-[72px] shrink-0 items-center gap-1.5">
                    <StockLogo symbol={item.symbol} size={24} />
                    <span className="text-xs font-bold text-[var(--color-text-1)] group-hover:text-[rgb(var(--primary-6))]">
                      {item.symbol}
                    </span>
                  </div>
                  <span className="w-[32px] text-right text-[10px] tabular-nums text-[var(--color-text-3)]">
                    {item.quantity.toLocaleString("vi-VN")}
                  </span>
                  <span className="flex-1 text-right text-[10px] tabular-nums text-[var(--color-text-3)]">
                    {fmtVnd(item.avgBuyPrice)}
                  </span>
                  <span className="flex-1 text-right text-[10px] font-medium tabular-nums text-[var(--color-text-1)]">
                    {fmtVnd(currentPrice)}
                  </span>
                  <div className="flex w-[70px] flex-col items-end">
                    <span className={cn("text-[10px] font-semibold tabular-nums", color)}>
                      {isP ? "+" : ""}
                      {fmtVnd(item.unrealizedPnl)}
                    </span>
                    <span className={cn("text-[8px] font-semibold tabular-nums", color)}>
                      {isP ? "+" : ""}
                      {item.pnlPercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Footer total */}
      {filtered.length > 0 && (
        <div className="flex items-center border-t border-[var(--color-border-2)] bg-[var(--color-fill-1)] px-2 py-1.5 text-[10px]">
          <span className="font-medium text-[var(--color-text-3)]">Tổng cộng</span>
          <span className="ml-1 text-[var(--color-text-3)]">{filtered.length} mã</span>
          <span className="ml-auto font-bold tabular-nums text-[var(--color-text-1)]">
            {fmtVnd(filtered.reduce((s, i) => s + i.marketValue, 0))}
          </span>
          <span className={cn("ml-2 font-bold tabular-nums", pnlColor)}>
            {isProfit ? "+" : ""}
            {fmtVnd(totalPnl)}
          </span>
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-md border border-[var(--color-border-2)] bg-[var(--color-fill-1)] px-2 py-1.5">
      <div className="mb-0.5 flex items-center gap-1 text-[9px] text-[var(--color-text-3)]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-[11px]">{children}</div>
    </div>
  )
}

/* ─────────────────────────── Tab: Lịch sử ─────────────────────────── */

const STATUS_LABEL: Record<string, string> = {
  FILLED: "Khớp",
  PENDING: "Chờ",
  CANCELLED: "Huỷ",
  REJECTED: "Từ chối",
}
const STATUS_COLOR: Record<string, string> = {
  FILLED: "green",
  PENDING: "orange",
  CANCELLED: "gray",
  REJECTED: "red",
}

function HistoryTab() {
  const [status, setStatus] = useState<string>("all")
  const { data: orders, isLoading } = useOrders(status)

  const fmtDate = (d: string) =>
    d
      ? new Date(d).toLocaleDateString("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : ""

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-border-2)] px-1.5 py-1">
        <Radio.Group
          type="button"
          size="mini"
          value={status}
          onChange={(v) => setStatus(v)}
          options={[
            { label: "Tất cả", value: "all" },
            { label: "Khớp", value: "FILLED" },
            { label: "Chờ", value: "PENDING" },
            { label: "Huỷ", value: "CANCELLED" },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Spin />
          </div>
        ) : !orders || orders.length === 0 ? (
          <Empty
            className="py-12"
            icon={<IconHistory style={{ fontSize: 28, opacity: 0.3 }} />}
            description={
              <span className="text-xs text-[var(--color-text-3)]">
                Chưa có lịch sử giao dịch
              </span>
            }
          />
        ) : (
          orders.map((order) => {
            const isBuy = order.side === "BUY"
            return (
              <div
                key={order.id}
                className="flex items-center gap-1.5 border-b border-[var(--color-border-1)] px-2 py-1.5 transition-colors hover:bg-[var(--color-fill-1)]"
              >
                <div
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded text-[8px] font-black",
                    isBuy
                      ? "bg-up/15 text-up"
                      : "bg-down/15 text-down",
                  )}
                >
                  {isBuy ? "M" : "B"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <StockLogo symbol={order.symbol} size={14} />
                      <span className="text-[11px] font-bold text-[var(--color-text-1)]">
                        {order.symbol}
                      </span>
                      <Tag size="small" color={STATUS_COLOR[order.status] || "gray"}>
                        {STATUS_LABEL[order.status] || order.status}
                      </Tag>
                    </div>
                    <span className="text-[10px] font-medium tabular-nums text-[var(--color-text-1)]">
                      {fmtVnd(order.price)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="flex items-center gap-0.5 text-[9px] text-[var(--color-text-4)]">
                      <IconClockCircle />
                      {fmtDate(order.createdAt)}
                    </span>
                    <span className="text-[9px] tabular-nums text-[var(--color-text-3)]">
                      {order.quantity} cp
                    </span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────── Panel shell ─────────────────────────── */

export function WatchlistPanel() {
  const { isAuthenticated, setShowAuthModal } = useAuth()
  const [activeTab, setActiveTab] = useState<WatchlistTab>(getInitialTab)

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as WatchlistTab)
    window.localStorage.setItem(TAB_STORAGE_KEY, tab)
  }

  if (!isAuthenticated) {
    return (
      <aside className="flex h-full w-full shrink-0 flex-col items-center justify-center bg-[var(--color-bg-2)]">
        <IconEye style={{ fontSize: 32, opacity: 0.2 }} />
        <p className="mb-2 mt-2 text-xs text-[var(--color-text-3)]">Đăng nhập để sử dụng</p>
        <Button type="primary" size="small" icon={<IconUser />} onClick={() => setShowAuthModal(true)}>
          Đăng nhập
        </Button>
      </aside>
    )
  }

  return (
    <aside className="flex h-full w-full shrink-0 flex-col bg-[var(--color-bg-2)]">
      <Tabs
        activeTab={activeTab}
        onChange={handleTabChange}
        size="small"
        className="flex h-full flex-col [&_.arco-tabs-content]:flex [&_.arco-tabs-content]:flex-1 [&_.arco-tabs-content]:flex-col [&_.arco-tabs-content]:min-h-0 [&_.arco-tabs-content-inner]:flex-1 [&_.arco-tabs-content-inner]:min-h-0 [&_.arco-tabs-content-item-active]:flex [&_.arco-tabs-content-item-active]:h-full [&_.arco-tabs-content-item-active]:flex-col [&_.arco-tabs-content-item-active]:min-h-0 [&_.arco-tabs-pane]:flex-1 [&_.arco-tabs-pane]:min-h-0"
      >
        <Tabs.TabPane key="watchlist" title={<TabTitle icon={<IconEye />} label="Theo dõi" />}>
          <WatchlistTab />
        </Tabs.TabPane>
        <Tabs.TabPane key="holdings" title={<TabTitle icon={<IconBriefcase />} label="Nắm giữ" />}>
          <HoldingsTab />
        </Tabs.TabPane>
        <Tabs.TabPane key="history" title={<TabTitle icon={<IconHistory />} label="Lịch sử" />}>
          <HistoryTab />
        </Tabs.TabPane>
      </Tabs>
    </aside>
  )
}

function TabTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[11px]">
      {icon}
      {label}
    </span>
  )
}
