import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Eye,
  Briefcase,
  History,
  Plus,
  X,
  Loader2,
  Star,
  LogIn,
  Clock,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpDown,
  Wallet,
  BarChart3,
  Activity,
} from "lucide-react"
import { StockLogo } from "@/components/stock/stock-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuth } from "@/contexts/auth-context"
import { api } from "@/lib/api"
import { useNavigate } from "react-router"
import { type PriceBoardData } from "@/hooks/use-market-data"
import { usePrices } from "@/contexts/market-data-context"
import {
  normalizePortfolioItem,
  type PortfolioApiItem,
  type PortfolioItem,
} from "./portfolio-utils"

type WatchlistTab = "watchlist" | "holdings" | "history"

interface WatchlistItemData {
  id: string
  symbol: string
  sort_order: number
  created_at: string
}

interface OrderItem {
  id: string
  symbol: string
  side: "BUY" | "SELL"
  quantity: number
  price: number
  total: number
  status: string
  createdAt: string
}

// ── Utility ──
const fp = (n: number) => (!n || n <= 0 ? "—" : (n * 1000).toLocaleString("vi-VN", { maximumFractionDigits: 0 }))
const fv = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n))

function pc(price: number, ref: number, ceil: number, floor: number): string {
  if (!price || !ref) return "text-foreground"
  if (price >= ceil) return "text-fuchsia-500"
  if (price <= floor) return "text-cyan-400"
  if (price > ref) return "text-emerald-400"
  if (price < ref) return "text-red-400"
  return "text-amber-400"
}

// ── Symbol info cache (company name, industry) ──
interface SymbolInfo { name: string; shortName: string; industry: string; exchange: string }
const _symbolInfoCache = new Map<string, SymbolInfo>()

async function fetchSymbolInfoBatch(symbols: string[]): Promise<Map<string, SymbolInfo>> {
  const missing = symbols.filter(s => !_symbolInfoCache.has(s.toUpperCase()))
  if (missing.length > 0) {
    try {
      // Fetch each symbol's info (batch via individual lookups, cached)
      const results = await Promise.allSettled(
        missing.map(async (sym) => {
          const resp = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/market-data/reference/symbols/search?q=${sym}&page_size=1`)
          if (!resp.ok) return
          const json = await resp.json()
          const items = json.items || json.data || []
          const match = items.find((i: any) => (i.symbol || '').toUpperCase() === sym.toUpperCase()) || items[0]
          if (match) {
            _symbolInfoCache.set(sym.toUpperCase(), {
              name: match.name || match.organ_name || '',
              shortName: match.short_name || '',
              industry: match.icb_lv2 || match.icb_lv1 || '',
              exchange: match.exchange || '',
            })
          }
        })
      )
    } catch { /* ignore */ }
  }
  return _symbolInfoCache
}

// ── Mini Sparkline SVG ──
function Sparkline({ data, color, width = 60, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 2) - 1
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={points} />
    </svg>
  )
}

// ── Compact stock row — dense bảng giá style ──
function StockRow({
  symbol,
  d,
  onClick,
}: {
  symbol: string
  d?: PriceBoardData
  onClick: () => void
}) {
  const price = d?.closePrice || 0
  const chg = d?.priceChange || 0
  const pct = d?.percentChange || 0
  const ref = d?.referencePrice || 0
  const ceil = d?.ceilingPrice || 0
  const floor = d?.floorPrice || 0
  const isUp = chg > 0
  const isDown = chg < 0

  const color = pc(price, ref, ceil, floor)

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-2 py-1.5 hover:bg-muted/40 transition-colors group active:scale-[0.995]"
    >
      <div className="flex items-center gap-2">
        <StockLogo symbol={symbol} size={28} />
        <div className="flex-1 min-w-0 flex justify-between items-center">
          {/* Left: Symbol */}
          <div className="flex flex-col">
            <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
              {symbol}
            </span>
          </div>

          {/* Right: Price & Percent */}
          <div className="flex flex-col items-end">
            <span className={`text-xs font-black tabular-nums tracking-tight ${color}`}>
              {fp(price)}
            </span>
            {price > 0 ? (
              <div className="flex items-center gap-1 mt-0.5">
                <span
                  className={`text-[9px] font-semibold tabular-nums px-1 py-[1px] rounded leading-none ${
                    isUp
                      ? "bg-emerald-500/15 text-emerald-500"
                      : isDown
                        ? "bg-red-500/15 text-red-500"
                        : "bg-muted text-amber-500"
                  }`}
                >
                  {isUp ? "+" : ""}{(pct || 0).toFixed(2)}%
                </span>
              </div>
            ) : (
              <span className="text-[9px] text-muted-foreground/50 mt-0.5">---</span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Pulse dot ──
function PulseDot() {
  return (
    <span className="relative flex size-1.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full size-1.5 bg-emerald-500" />
    </span>
  )
}

/* ─── Tab: Danh sách theo dõi ─── */
function WatchlistTabContent() {
  const [items, setItems] = useState<WatchlistItemData[]>([])
  const [loading, setLoading] = useState(true)
  const [addingSymbol, setAddingSymbol] = useState(false)
  const [newSymbol, setNewSymbol] = useState("")
  const navigate = useNavigate()

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get("watchlist").json<{ items: WatchlistItemData[]; count: number }>()
      setItems(res.items || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchList() }, [fetchList])

  const allSymbols = useMemo(() => items.map((i) => i.symbol), [items])
  const { priceMap } = usePrices(allSymbols)

  // Fetch company names
  const [symbolInfoMap, setSymbolInfoMap] = useState<Map<string, SymbolInfo>>(new Map())
  useEffect(() => {
    if (allSymbols.length > 0) {
      fetchSymbolInfoBatch(allSymbols).then(setSymbolInfoMap)
    }
  }, [allSymbols.join(',')])

  // Fetch sparkline data (intraday prices)
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({})
  useEffect(() => {
    if (allSymbols.length === 0) return
    const API = import.meta.env.VITE_API_URL || '/api/v1'
    Promise.allSettled(
      allSymbols.map(async (sym) => {
        try {
          const resp = await fetch(`${API}/market-data/quotes/${sym}/intraday`)
          if (!resp.ok) return
          const json = await resp.json()
          const points = (json.data || json || []).map((p: any) => Number(p.close ?? p.close_price ?? p.price ?? 0)).filter((v: number) => v > 0)
          if (points.length > 2) setSparklines(prev => ({ ...prev, [sym.toUpperCase()]: points }))
        } catch { /* ignore */ }
      })
    )
  }, [allSymbols.join(',')])

  // Stats: count up / down / unchanged
  const stats = useMemo(() => {
    let up = 0, down = 0, flat = 0
    for (const sym of allSymbols) {
      const d = priceMap[sym.toUpperCase()]
      const chg = d?.priceChange || 0
      if (chg > 0) up++
      else if (chg < 0) down++
      else flat++
    }
    const total = allSymbols.length
    return { total, up, down, flat, upPct: total ? Math.round(up / total * 100) : 0, downPct: total ? Math.round(down / total * 100) : 0, flatPct: total ? Math.round(flat / total * 100) : 0 }
  }, [allSymbols, priceMap])

  const handleAddSymbol = async () => {
    const sym = newSymbol.trim().toUpperCase()
    if (!sym) return
    setAddingSymbol(true)
    try {
      await api.post("watchlist", { json: { symbol: sym } }).json()
      setNewSymbol("")
      fetchList()
    } catch {}
    finally { setAddingSymbol(false) }
  }

  const handleRemoveSymbol = async (sym: string) => {
    try { await api.delete(`watchlist/${sym}`); fetchList() } catch {}
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground mb-2" />
        <span className="text-[10px] text-muted-foreground">Đang tải...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      {allSymbols.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/50 bg-muted/10 overflow-x-auto">
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/30 shrink-0">
            <Eye className="size-2.5 text-muted-foreground" />
            <span className="text-[9px] text-muted-foreground">Tổng</span>
            <span className="text-[10px] font-bold text-foreground">{stats.total}</span>
          </div>
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 shrink-0">
            <TrendingUp className="size-2.5 text-emerald-500" />
            <span className="text-[9px] text-emerald-500 font-semibold">{stats.up}</span>
            <span className="text-[8px] text-emerald-500/70">({stats.upPct}%)</span>
          </div>
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 shrink-0">
            <TrendingDown className="size-2.5 text-red-500" />
            <span className="text-[9px] text-red-500 font-semibold">{stats.down}</span>
            <span className="text-[8px] text-red-500/70">({stats.downPct}%)</span>
          </div>
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/30 shrink-0">
            <Minus className="size-2.5 text-amber-500" />
            <span className="text-[9px] text-amber-500 font-semibold">{stats.flat}</span>
          </div>
        </div>
      )}

      {/* Search / Add */}
      <div className="px-2 py-1.5 border-b border-border/40">
        <div className="flex gap-1">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/50" />
            <Input
              placeholder="Thêm mã cổ phiếu..."
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleAddSymbol()}
              className="h-7 text-[10px] bg-muted/20 border-transparent focus:border-primary/50 pl-7 pr-2"
            />
          </div>
          <Button size="icon" className="size-7 shrink-0 rounded-full" onClick={handleAddSymbol} disabled={!newSymbol.trim() || addingSymbol}>
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="py-0.5">
          {allSymbols.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Star className="size-7 mb-2 opacity-20" />
              <p className="text-[10px]">Chưa có mã theo dõi</p>
              <p className="text-[9px] mt-1 text-center px-4 opacity-50">Thêm mã cổ phiếu để bắt đầu theo dõi</p>
            </div>
          ) : (
            <div className="divide-y divide-border/10">
              {allSymbols.map((sym) => {
                const d = priceMap[sym.toUpperCase()]
                const info = symbolInfoMap.get(sym.toUpperCase())
                const spark = sparklines[sym.toUpperCase()]
                const price = d?.closePrice || 0
                const chg = d?.priceChange || 0
                const pct = d?.percentChange || 0
                const ref = d?.referencePrice || 0
                const ceil = d?.ceilingPrice || 0
                const floor = d?.floorPrice || 0
                const isUp = chg > 0
                const isDown = chg < 0
                const color = pc(price, ref, ceil, floor)
                const sparkColor = isUp ? "#10b981" : isDown ? "#ef4444" : "#f59e0b"

                return (
                  <div key={sym} className="relative group">
                    <button
                      onClick={() => navigate(`/co-phieu/${sym}`)}
                      className="w-full text-left px-2 py-2.5 hover:bg-muted/40 transition-colors active:scale-[0.995]"
                    >
                      <div className="flex items-center gap-2">
                        {/* Star */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveSymbol(sym) }}
                          className="text-amber-500 hover:text-amber-400 shrink-0"
                        >
                          <Star className="size-3.5 fill-current" />
                        </button>
                        <StockLogo symbol={sym} size={36} />
                        {/* Info: Symbol + Company + Industry */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-foreground group-hover:text-primary">{sym}</span>
                          </div>
                          {info && (
                            <p className="text-[9px] text-muted-foreground truncate leading-tight mt-0.5">
                              {info.shortName || info.name}
                            </p>
                          )}
                        </div>
                        {/* Sparkline */}
                        <Sparkline data={spark || []} color={sparkColor} width={56} height={22} />
                        {/* Price */}
                        <div className="flex flex-col items-end shrink-0 min-w-[62px]">
                          <span className={`text-sm font-black tabular-nums ${color}`}>{fp(price)}</span>
                          {price > 0 ? (
                            <span className={`text-[10px] font-semibold tabular-nums ${isUp ? "text-emerald-500" : isDown ? "text-red-500" : "text-amber-500"}`}>
                              {isUp ? "+" : ""}{(pct || 0).toFixed(2)}%{isUp ? " ↑" : isDown ? " ↓" : ""}
                            </span>
                          ) : (
                            <span className="text-[9px] text-muted-foreground/50">---</span>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/* ─── Tab: Danh mục nắm giữ ─── */
function HoldingsTabContent() {
  const [items, setItems] = useState<PortfolioItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "profit" | "loss">("all")
  const [account, setAccount] = useState<{
    balance: number
    totalAssets: number
    pnl: number
    pnlPercent: number
  } | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const raw = await api.get("virtual-trading/portfolio").json<any>()
        const positions = (raw.positions || []).map(normalizePortfolioItem)
        setItems(positions)
        const acct = raw.account || {}
        setAccount({
          balance: acct.cash_available_vnd ?? acct.balance ?? 0,
          totalAssets: raw.nav_vnd ?? 0,
          pnl: raw.total_unrealized_pnl_vnd ?? 0,
          pnlPercent: raw.return_pct ?? 0,
        })
      } catch {
        setItems([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const holdingSymbols = useMemo(() => items.map((i) => i.symbol), [items])
  const { priceMap } = usePrices(holdingSymbols)

  const filtered = useMemo(() => {
    if (filter === "profit") return items.filter((i) => i.pnl > 0)
    if (filter === "loss") return items.filter((i) => i.pnl < 0)
    return items
  }, [items, filter])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground mb-2" />
        <span className="text-[10px] text-muted-foreground">Đang tải...</span>
      </div>
    )
  }

  const totalPnl = account?.pnl ?? 0
  const totalPnlPct = account?.pnlPercent ?? 0
  const isProfit = totalPnl >= 0

  return (
    <div className="flex flex-col h-full">
      {/* 2×2 Account Summary Cards */}
      {account && (
        <div className="grid grid-cols-2 gap-1.5 px-2 py-2 border-b border-border/50">
          <div className="rounded-md border border-border/50 bg-muted/10 px-2 py-1.5">
            <div className="flex items-center gap-1 text-[8px] text-muted-foreground mb-0.5">
              <BarChart3 className="size-2.5" /><span>Tổng tài sản</span>
            </div>
            <span className="text-[11px] font-bold text-foreground tabular-nums">{fv(account.totalAssets)}</span>
            <span className="text-[8px] text-muted-foreground ml-0.5">VND</span>
          </div>
          <div className="rounded-md border border-border/50 bg-muted/10 px-2 py-1.5">
            <div className="flex items-center gap-1 text-[8px] text-muted-foreground mb-0.5">
              <Wallet className="size-2.5" /><span>Tiền mặt</span>
            </div>
            <span className="text-[11px] font-bold text-foreground tabular-nums">{fv(account.balance)}</span>
            <span className="text-[8px] text-muted-foreground ml-0.5">VND</span>
          </div>
          <div className={`rounded-md border px-2 py-1.5 ${isProfit ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
            <div className="flex items-center gap-1 text-[8px] text-muted-foreground mb-0.5">
              <Activity className="size-2.5" /><span>Lãi/Lỗ tạm tính</span>
            </div>
            <span className={`text-[11px] font-bold tabular-nums ${isProfit ? "text-emerald-500" : "text-red-500"}`}>
              {isProfit ? "+" : ""}{fv(totalPnl)}
            </span>
            <span className="text-[8px] text-muted-foreground ml-0.5">VND</span>
          </div>
          <div className={`rounded-md border px-2 py-1.5 ${isProfit ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
            <div className="flex items-center gap-1 text-[8px] text-muted-foreground mb-0.5">
              <TrendingUp className="size-2.5" /><span>Hiệu suất</span>
            </div>
            <span className={`text-[11px] font-bold tabular-nums ${isProfit ? "text-emerald-500" : "text-red-500"}`}>
              {isProfit ? "+" : ""}{totalPnlPct.toFixed(2)}%
            </span>
          </div>
        </div>
      )}

      {/* Filter buttons */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border/40">
        {([["all", "Tất cả"], ["profit", "Có lãi"], ["loss", "Lỗ"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${filter === k ? "bg-primary text-primary-foreground" : "bg-muted/20 text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-[8px] text-muted-foreground tabular-nums">{filtered.length} mã</span>
      </div>

      {/* Table header */}
      {filtered.length > 0 && (
        <div className="flex items-center px-2 py-1 text-[8px] text-muted-foreground font-medium border-b border-border/30 bg-muted/5">
          <span className="w-[72px]">Mã CK</span>
          <span className="w-[32px] text-right">SL</span>
          <span className="flex-1 text-right">Giá vốn</span>
          <span className="flex-1 text-right">Giá HT</span>
          <span className="w-[70px] text-right">Lãi/Lỗ</span>
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0">
        <div className="py-0.5">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Briefcase className="size-7 mb-2 opacity-20" />
              <p className="text-[10px]">{filter === "all" ? "Chưa nắm giữ cổ phiếu nào" : "Không có mã phù hợp"}</p>
            </div>
          ) : (
            <div className="divide-y divide-border/10">
              {filtered.map((item) => {
                const live = priceMap[item.symbol.toUpperCase()]
                const currentPrice = live?.closePrice || item.currentPrice || 0
                const pnlVal = item.pnl
                const pnlPct = item.pnlPercent
                const isP = pnlVal >= 0

                return (
                  <button
                    key={item.symbol}
                    onClick={() => navigate(`/co-phieu/${item.symbol}`)}
                    className="w-full text-left px-2 py-2 hover:bg-muted/40 transition-colors group"
                  >
                    <div className="flex items-center">
                      <div className="w-[72px] flex items-center gap-1.5 shrink-0">
                        <StockLogo symbol={item.symbol} size={24} />
                        <span className="text-xs font-bold text-foreground group-hover:text-primary">{item.symbol}</span>
                      </div>
                      <span className="w-[32px] text-right text-[10px] text-muted-foreground tabular-nums">{item.quantity.toLocaleString("vi-VN")}</span>
                      <span className="flex-1 text-right text-[10px] text-muted-foreground tabular-nums">{fv(item.avgPrice)}</span>
                      <span className="flex-1 text-right text-[10px] text-foreground font-medium tabular-nums">{fv(currentPrice)}</span>
                      <div className="w-[70px] flex flex-col items-end">
                        <span className={`text-[10px] font-semibold tabular-nums ${isP ? "text-emerald-500" : "text-red-500"}`}>
                          {isP ? "+" : ""}{fv(pnlVal)}
                        </span>
                        <span className={`text-[8px] font-semibold tabular-nums ${isP ? "text-emerald-500" : "text-red-500"}`}>
                          {isP ? "+" : ""}{pnlPct.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer total */}
        {filtered.length > 0 && (
          <div className="flex items-center px-2 py-1.5 border-t border-border/50 bg-muted/10 text-[9px]">
            <span className="text-muted-foreground font-medium">Tổng cộng</span>
            <span className="text-muted-foreground ml-1">{filtered.length} mã</span>
            <span className="ml-auto font-bold tabular-nums text-foreground">{fv(filtered.reduce((s, i) => s + i.totalValue, 0))}</span>
            <span className={`ml-2 font-bold tabular-nums ${isProfit ? "text-emerald-500" : "text-red-500"}`}>
              {isProfit ? "+" : ""}{fv(totalPnl)}
            </span>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

/* ─── Tab: Lịch sử ─── */
function HistoryTabContent() {
  const [orders, setOrders] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("all")

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true)
      try {
        const params: Record<string, string | number> = { page: 1, page_size: 30 }
        if (statusFilter && statusFilter !== "all") params.status = statusFilter.toLowerCase()
        const res = await api
          .get("virtual-trading/orders", { searchParams: params })
          .json<any>()
        const rawOrders = res.orders || res.data || []
        setOrders(rawOrders.map((o: any) => ({
          id: o.id,
          symbol: o.symbol,
          side: (o.side || "").toUpperCase(),
          quantity: o.quantity,
          price: o.filled_price_vnd ?? o.limit_price_vnd ?? 0,
          total: o.gross_amount_vnd ?? 0,
          status: (o.status || "").toUpperCase(),
          createdAt: o.created_at ?? o.createdAt ?? "",
        })))
      } catch {
        setOrders([])
      } finally {
        setLoading(false)
      }
    }
    fetchOrders()
  }, [statusFilter])

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("vi-VN", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    })

  const statusCls: Record<string, string> = {
    FILLED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    PENDING: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    CANCELLED: "bg-muted text-muted-foreground border-border",
    REJECTED: "bg-red-500/15 text-red-400 border-red-500/20",
  }
  const statusLbl: Record<string, string> = {
    FILLED: "Khớp", PENDING: "Chờ", CANCELLED: "Huỷ", REJECTED: "Từ chối",
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground mb-2" />
        <span className="text-[10px] text-muted-foreground">Đang tải...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="flex gap-1 px-1.5 py-1 border-b border-border/40 overflow-x-auto">
        {[
          { value: "all", label: "Tất cả" },
          { value: "FILLED", label: "Khớp" },
          { value: "PENDING", label: "Chờ" },
          { value: "CANCELLED", label: "Huỷ" },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-1.5 py-[2px] rounded-full text-[9px] font-medium transition-colors whitespace-nowrap ${
              statusFilter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted/20 text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="py-0.5">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <History className="size-7 mb-2 opacity-20" />
              <p className="text-[10px]">Chưa có lịch sử giao dịch</p>
            </div>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="flex items-center gap-1.5 px-2 py-[5px] hover:bg-muted/30 transition-colors border-b border-border/10 last:border-0"
              >
                {/* Side */}
                <div
                  className={`size-5 rounded flex items-center justify-center shrink-0 ${
                    order.side === "BUY"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-red-500/15 text-red-400"
                  }`}
                >
                  <span className="text-[7px] font-black">{order.side === "BUY" ? "M" : "B"}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <StockLogo symbol={order.symbol} size={14} />
                      <span className="text-[10px] font-bold text-foreground">{order.symbol}</span>
                      <Badge className={`text-[6px] px-[3px] py-0 h-3 ${statusCls[order.status] || ""}`}>
                        {statusLbl[order.status] || order.status}
                      </Badge>
                    </div>
                    <span className="text-[9px] text-foreground tabular-nums font-medium">{fv(order.price)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-[1px]">
                    <span className="text-[8px] text-muted-foreground/60 flex items-center gap-0.5">
                      <Clock className="size-2" />{fmtDate(order.createdAt)}
                    </span>
                    <span className="text-[8px] text-muted-foreground tabular-nums">{order.quantity} cp</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/* ─── Main Panel ─── */
const TABS: { id: WatchlistTab; label: string; icon: React.ElementType }[] = [
  { id: "watchlist", label: "Theo dõi", icon: Eye },
  { id: "holdings", label: "Nắm giữ", icon: Briefcase },
  { id: "history", label: "Lịch sử", icon: History },
]

export function WatchlistPanel() {
  const { isAuthenticated, setShowAuthModal } = useAuth()
  const [activeTab, setActiveTab] = useState<WatchlistTab>("watchlist")

  if (!isAuthenticated) {
    return (
      <aside className="flex w-full shrink-0 flex-col bg-card items-center justify-center h-full">
        <Eye className="size-8 mb-2 text-muted-foreground opacity-20" />
        <p className="text-[10px] text-muted-foreground mb-2">Đăng nhập để sử dụng</p>
        <Button size="sm" className="text-[10px] h-6" onClick={() => setShowAuthModal(true)}>
          <LogIn className="size-3 mr-1" />Đăng nhập
        </Button>
      </aside>
    )
  }

  return (
    <aside className="flex w-full shrink-0 flex-col bg-card h-full">
      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-medium transition-colors relative ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-3" />
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-primary rounded-full" />
              )}
            </button>
          )
        })}
      </div>

      <div className="flex-1 min-h-0">
        {activeTab === "watchlist" && <WatchlistTabContent />}
        {activeTab === "holdings" && <HoldingsTabContent />}
        {activeTab === "history" && <HistoryTabContent />}
      </div>
    </aside>
  )
}
