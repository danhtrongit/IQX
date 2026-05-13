import { useState } from "react"
import {
  Search,
  Star,
  ArrowUpCircle,
  ArrowDownCircle,
  Minus,
  Loader2,
  Wallet,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react"
import { StockLogo } from "@/components/stock/stock-logo"
import { useWatchlist } from "@/hooks/use-watchlist"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useArenaAccount, type PriceBoardData } from "@/hooks/use-market-data"
import { usePrice } from "@/contexts/market-data-context"
import { useSymbol } from "@/contexts/symbol-context"
import { useAuth } from "@/contexts/auth-context"
import { arenaApi } from "@/lib/api"
import { useNavigate } from "react-router"
import { toast } from "sonner"

function formatPrice(price: number): string {
  if (!price || price <= 0) return "—"
  return (price * 1000).toLocaleString("vi-VN", { maximumFractionDigits: 0 })
}

function formatVolume(v: number): string {
  if (!v) return "—"
  return v.toLocaleString("vi-VN")
}

function formatVnd(n: number): string {
  return Math.round(n).toLocaleString("vi-VN")
}

function formatCompact(v: number): string {
  if (!v) return "—"
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B"
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M"
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K"
  return String(v)
}

async function getErrorMessage(err: unknown, fallback: string): Promise<string> {
  try {
    const body = await (err as { response?: Response })?.response?.json()
    const detail = body?.detail || body?.message
    if (typeof detail === "string") return detail
  } catch {
    // ignore parse error
  }
  return fallback
}

function getPriceColor(price: number, ref: number, ceil: number, floor: number): string {
  if (!price || !ref) return "text-foreground"
  if (price >= ceil) return "text-fuchsia-500"
  if (price <= floor) return "text-cyan-500"
  if (price > ref) return "text-emerald-500"
  if (price < ref) return "text-red-500"
  return "text-amber-500"
}

function OrderBookView({ data }: { data: PriceBoardData }) {
  const bids = data.bid || []
  const asks = data.ask || []

  const maxBidVol = Math.max(...bids.map((b) => b.volume || 0), 1)
  const maxAskVol = Math.max(...asks.map((a) => a.volume || 0), 1)

  return (
    <div id="order-book" className="px-1.5">
      {/* Headers */}
      <div className="flex items-center px-1.5 py-1 text-[10px] font-medium text-muted-foreground">
        <span className="w-16">Giá</span>
        <span className="flex-1 text-right">KL</span>
      </div>

      {/* Ask (Sell) Side - reversed so highest is on top */}
      <div className="space-y-px">
        {[...asks].reverse().map((entry, i) => (
          <div
            key={`ask-${i}`}
            className="relative flex items-center px-1.5 py-0.5 text-[11px] cursor-pointer hover:bg-red-500/5 rounded-sm group"
          >
            <div
              className="absolute right-0 top-0 bottom-0 bg-red-500/8 rounded-sm transition-all"
              style={{ width: `${(entry.volume / maxAskVol) * 100}%` }}
            />
            <span className={`relative w-16 font-medium tabular-nums ${getPriceColor(entry.price, data.referencePrice, data.ceilingPrice, data.floorPrice)}`}>
              {formatPrice(entry.price)}
            </span>
            <span className="relative flex-1 text-right text-muted-foreground tabular-nums group-hover:text-foreground">
              {formatVolume(entry.volume)}
            </span>
          </div>
        ))}
      </div>

      {/* Spread */}
      <div className="flex items-center justify-center py-1 my-0.5">
        <span className="text-[10px] text-muted-foreground">
          Spread:{" "}
          <span className="text-foreground font-medium tabular-nums">
            {asks.length > 0 && bids.length > 0
              ? formatPrice(asks[0].price - bids[0].price)
              : "—"}
          </span>
        </span>
      </div>

      {/* Bid (Buy) Side */}
      <div className="space-y-px">
        {bids.map((entry, i) => (
          <div
            key={`bid-${i}`}
            className="relative flex items-center px-1.5 py-0.5 text-[11px] cursor-pointer hover:bg-emerald-500/5 rounded-sm group"
          >
            <div
              className="absolute left-0 top-0 bottom-0 bg-emerald-500/8 rounded-sm transition-all"
              style={{ width: `${(entry.volume / maxBidVol) * 100}%` }}
            />
            <span className={`relative w-16 font-medium tabular-nums ${getPriceColor(entry.price, data.referencePrice, data.ceilingPrice, data.floorPrice)}`}>
              {formatPrice(entry.price)}
            </span>
            <span className="relative flex-1 text-right text-muted-foreground tabular-nums group-hover:text-foreground">
              {formatVolume(entry.volume)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function RightPanel() {
  const [orderType, setOrderType] = useState<"buy" | "sell">("buy")
  const [orderMethod, setOrderMethod] = useState("market")
  const { symbol, setSymbol } = useSymbol()
  const [searchInput, setSearchInput] = useState("")
  const [price, setPrice] = useState("")
  const [volume, setVolume] = useState("100")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()
  const { isAuthenticated, setShowAuthModal } = useAuth()

  const { data, isLoading } = usePrice(symbol)
  const { account, refresh: refreshAccount } = useArenaAccount(isAuthenticated, 15000)
  const { isSymbolWatched, toggleSymbol } = useWatchlist()

  // Portfolio position for current symbol
  const position = account?.portfolio?.find((p) => p.symbol === symbol.toUpperCase())

  const handleSearch = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchInput.trim()) {
      const newSymbol = searchInput.trim().toUpperCase()
      setSymbol(newSymbol)
      setSearchInput("")
      setPrice("")
      navigate(`/co-phieu/${newSymbol}`)
      toast.info(`Đang tải dữ liệu ${newSymbol}...`)
    }
  }

  const handlePlaceOrder = async () => {
    if (!isAuthenticated) {
      toast.warning("Vui lòng đăng nhập để đặt lệnh", {
        action: {
          label: "Đăng nhập",
          onClick: () => setShowAuthModal(true),
        },
      })
      return
    }
    if (!data) {
      toast.error("Không có dữ liệu mã CK")
      return
    }
    if (numVolume < 100) {
      toast.warning("Khối lượng tối thiểu là 100 CP")
      return
    }
    if (numVolume % 100 !== 0) {
      toast.warning("Khối lượng phải là bội số của 100")
      return
    }

    setIsSubmitting(true)
    const label = orderType === "buy" ? "MUA" : "BÁN"

    try {
      let result

      if (orderMethod === "market") {
        // Market order - price determined by server
        result = orderType === "buy"
          ? await arenaApi.buyMarket(symbol, numVolume)
          : await arenaApi.sellMarket(symbol, numVolume)
      } else {
        // Limit order - send price in VND (backend expects limit_price_vnd)
        if (numPrice <= 0) {
          toast.warning("Vui lòng nhập giá hợp lệ cho lệnh giới hạn")
          setIsSubmitting(false)
          return
        }
        result = orderType === "buy"
          ? await arenaApi.buyLimit(symbol, numVolume, numPrice)
          : await arenaApi.sellLimit(symbol, numVolume, numPrice)
      }

      const order = result.data
      const totalStr = (order.total || (order.price * order.quantity)).toLocaleString("vi-VN")

      toast.success(`Đặt lệnh ${label} ${symbol} thành công`, {
        description: `${order.quantity} CP × ${order.price.toLocaleString("vi-VN")} = ${totalStr} VND${order.status === "PENDING" ? " (chờ khớp)" : ""}`,
      })
      refreshAccount()
    } catch (err: any) {
      let msg = `Đặt lệnh ${label} ${symbol} thất bại`
      let needActivation = false
      let needPremium = false
      try {
        const body = await err?.response?.json()
        const detail = body?.detail || body?.message
        if (detail) {
          msg = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((e: any) => e.msg || e).join(", ") : msg
          needActivation = /kích hoạt|activate/i.test(msg)
          needPremium = /premium|gói premium/i.test(msg)
        }
      } catch { /* ignore parse error */ }

      if (needActivation) {
        toast.warning(msg, {
          duration: 8000,
          action: {
            label: "Kích hoạt ngay",
            onClick: async () => {
              try {
                await arenaApi.activate()
                toast.success("Kích hoạt đấu trường ảo thành công! Bạn nhận 1 tỷ VND ảo.", {
                  description: "Hãy đặt lệnh lại nhé.",
                })
                refreshAccount()
              } catch (activateErr: any) {
                let activateMsg = "Kích hoạt thất bại"
                let isPremiumErr = false
                try {
                  const b = await activateErr?.response?.json()
                  const d = b?.detail || b?.message
                  if (d) {
                    activateMsg = typeof d === "string" ? d : activateMsg
                    isPremiumErr = /premium|gói premium/i.test(activateMsg)
                  }
                } catch { /* ignore */ }
                if (isPremiumErr) {
                  toast.error(activateMsg, {
                    duration: 8000,
                    action: { label: "Nâng cấp Premium", onClick: () => navigate("/nang-cap") },
                  })
                } else {
                  toast.error(activateMsg)
                }
              }
            },
          },
        })
      } else if (needPremium) {
        toast.error(msg, {
          duration: 8000,
          action: { label: "Nâng cấp Premium", onClick: () => navigate("/nang-cap") },
        })
      } else {
        toast.error(msg)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Set default price when data loads
  const currentPrice = data?.closePrice ? data.closePrice * 1000 : 0
  const displayPrice = price || (currentPrice ? currentPrice.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) : "")

  const numPrice = Number(displayPrice.replace(/\./g, "").replace(",", ".")) || 0
  const numVolume = Number(volume.replace(/\./g, "")) || 0
  const orderValue = numPrice * numVolume
  const fee = Math.round(orderValue * 0.0015)

  return (
    <aside
      id="right-panel"
      className="flex w-full shrink-0 flex-col bg-card h-full"
    >
      {/* Stock Search */}
      <div id="stock-search" className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
            onKeyDown={handleSearch}
            placeholder="Nhập mã CK..."
            className="h-7 pl-7 text-xs bg-muted/50 border-transparent"
          />
        </div>
      </div>

      {/* Current Price Display */}
      <div id="stock-price-info" className="px-3 py-2 border-b border-border space-y-1">
        {isLoading || !data ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StockLogo symbol={data.symbol} size={28} />
                <button
                  className="text-sm font-bold text-foreground hover:text-primary transition-colors"
                  onClick={() => navigate(`/co-phieu/${data.symbol}`)}
                >
                  {data.symbol}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`size-5 transition-colors ${
                    isSymbolWatched(data.symbol)
                      ? "text-amber-500 hover:text-amber-400"
                      : "text-muted-foreground hover:text-amber-500"
                  }`}
	                  onClick={async () => {
	                    if (!isAuthenticated) {
	                      toast.warning("Đăng nhập để theo dõi mã CK", {
                        action: {
                          label: "Đăng nhập",
                          onClick: () => setShowAuthModal(true),
                        },
	                      })
	                      return
	                    }
	                    const wasWatched = isSymbolWatched(data.symbol)
	                    try {
	                      await toggleSymbol(data.symbol)
	                      toast.success(
	                        wasWatched
	                          ? `Đã bỏ theo dõi ${data.symbol}`
	                          : `Đã thêm ${data.symbol} vào danh sách`,
	                      )
	                    } catch (err) {
	                      toast.error(await getErrorMessage(err, `Không thể cập nhật ${data.symbol}`))
	                    }
	                  }}
                >
                  <Star
                    className={`size-3 ${
                      isSymbolWatched(data.symbol) ? "fill-current" : ""
                    }`}
                  />
                </Button>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {data.exchange}
              </Badge>
            </div>

            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-black tabular-nums tracking-tight ${getPriceColor(data.closePrice, data.referencePrice, data.ceilingPrice, data.floorPrice)}`}>
                {formatPrice(data.closePrice)}
              </span>
              <div className="flex items-center gap-1">
                {data.priceChange > 0 ? (
                  <ArrowUpCircle className="size-3 text-emerald-500" />
                ) : data.priceChange < 0 ? (
                  <ArrowDownCircle className="size-3 text-red-500" />
                ) : (
                  <Minus className="size-3 text-amber-500" />
                )}
                <span className={`text-xs font-semibold ${data.priceChange >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {data.priceChange >= 0 ? "+" : ""}{formatPrice(data.priceChange)} ({data.percentChange >= 0 ? "+" : ""}{data.percentChange?.toFixed(2)}%)
                </span>
              </div>
            </div>

            {/* Mini Stats */}
            <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[10px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trần</span>
                <span className="text-fuchsia-500 font-medium tabular-nums">{formatPrice(data.ceilingPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">TC</span>
                <span className="text-amber-500 font-medium tabular-nums">{formatPrice(data.referencePrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sàn</span>
                <span className="text-cyan-500 font-medium tabular-nums">{formatPrice(data.floorPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">KL</span>
                <span className="text-foreground font-medium tabular-nums">{formatCompact(data.totalVolume)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">NN</span>
                <span className={`font-medium tabular-nums ${(data.foreignBuy - data.foreignSell) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {(data.foreignBuy - data.foreignSell) >= 0 ? "+" : ""}{formatCompact(data.foreignBuy - data.foreignSell)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">KLGD</span>
                <span className="text-foreground font-medium tabular-nums">{formatCompact(data.totalValue)}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Order Book + Order Placement */}
      <ScrollArea className="flex-1 min-h-0">
        {data && <OrderBookView data={data} />}

        <Separator className="my-1" />

        {/* Arena Account Info */}
        {isAuthenticated && account && (
          <div className="px-2 py-1.5 border-b border-border space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Wallet className="size-3" />
                <span>Số dư</span>
              </div>
              <span className="text-xs font-bold text-foreground tabular-nums">
                {formatVnd(account.balance)}đ
              </span>
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-1 text-[10px]">
                <TrendingUp className="size-2.5" />
                <span className={account.pnl >= 0 ? "text-emerald-500 font-medium" : "text-red-500 font-medium"}>
                  {account.pnl >= 0 ? "+" : ""}{formatVnd(account.pnl)}đ ({account.pnlPercent >= 0 ? "+" : ""}{account.pnlPercent}%)
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Trophy className="size-2.5" />
                <span>WR: {account.winRate}%</span>
              </div>
            </div>
            {position && (
              <div className="flex items-center justify-between text-[10px] bg-muted/50 rounded px-1.5 py-0.5">
                <span className="text-muted-foreground">Đang giữ {symbol}</span>
                <span className="font-semibold text-foreground">{position.quantity.toLocaleString("vi-VN")} CP</span>
              </div>
            )}
          </div>
        )}

        {isAuthenticated && !account && (
          <div className="px-2 py-2 border-b border-border">
            <Button
              size="sm"
              className="w-full h-7 text-xs gap-1.5"
              onClick={async () => {
                try {
                  await arenaApi.activate()
                  toast.success("Kích hoạt thành công! Bạn nhận 1 tỷ VND ảo.")
                  refreshAccount()
                } catch (err: any) {
                  let msg = "Kích hoạt thất bại"
                  let isPremiumErr = false
                  try {
                    const b = await err?.response?.json()
                    const d = b?.detail || b?.message
                    if (d) {
                      msg = typeof d === "string" ? d : msg
                      isPremiumErr = /premium|gói premium/i.test(msg)
                    }
                  } catch {}
                  if (isPremiumErr) {
                    toast.error(msg, {
                      duration: 8000,
                      action: { label: "Nâng cấp Premium", onClick: () => navigate("/nang-cap") },
                    })
                  } else {
                    toast.error(msg)
                  }
                }
              }}
            >
              <Zap className="size-3" />
              Kích hoạt Đấu trường ảo
            </Button>
          </div>
        )}

        {/* Order Placement */}
        <div id="order-placement" className="px-2 pb-3 space-y-2">
          <Tabs
            value={orderType}
            onValueChange={(v) => setOrderType(v as "buy" | "sell")}
          >
            <TabsList className="w-full h-9 p-0.5 mt-2">
              <TabsTrigger
                value="buy"
                className="flex-1 h-full text-xs font-semibold data-[state=active]:bg-emerald-500 data-[state=active]:text-white"
              >
                MUA
              </TabsTrigger>
              <TabsTrigger
                value="sell"
                className="flex-1 h-full text-xs font-semibold data-[state=active]:bg-red-500 data-[state=active]:text-white"
              >
                BÁN
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Order Type Select */}
          <Select value={orderMethod} onValueChange={setOrderMethod}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="market" className="text-xs">Lệnh thị trường (MP)</SelectItem>
              <SelectItem value="limit" className="text-xs">Lệnh giới hạn (LO)</SelectItem>
              <SelectItem value="ato" className="text-xs">ATO</SelectItem>
              <SelectItem value="atc" className="text-xs">ATC</SelectItem>
            </SelectContent>
          </Select>

          {/* Price Input */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">
              Giá
            </label>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="size-9 shrink-0 text-sm"
                onClick={() => setPrice(String(Math.max(0, numPrice - 100)))}
              >−</Button>
              <Input
                value={displayPrice}
                onChange={(e) => setPrice(e.target.value)}
                className="h-9 text-center text-sm font-semibold tabular-nums"
              />
              <Button variant="outline" size="icon" className="size-9 shrink-0 text-sm"
                onClick={() => setPrice(String(numPrice + 100))}
              >+</Button>
            </div>
          </div>

          {/* Volume Input */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground font-medium">
                Khối lượng
              </label>
              {orderType === "sell" && position && (
                <span className="text-xs text-muted-foreground">Tối đa: {position.quantity.toLocaleString("vi-VN")}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="size-9 shrink-0 text-sm"
                onClick={() => setVolume(String(Math.max(100, numVolume - 100)))}
              >−</Button>
              <Input
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                className="h-9 text-center text-sm font-semibold tabular-nums"
              />
              <Button variant="outline" size="icon" className="size-9 shrink-0 text-sm"
                onClick={() => setVolume(String(numVolume + 100))}
              >+</Button>
            </div>
            <div className="flex gap-1 pt-1">
              {[10, 25, 50, 100].map((pct) => {
                const handlePct = () => {
                  if (orderType === "buy" && account && numPrice > 0) {
                    const maxShares = Math.floor(account.balance / (numPrice * 1.0015) / 100) * 100
                    const qty = Math.floor(maxShares * pct / 100 / 100) * 100
                    setVolume(String(Math.max(100, qty)))
                  } else if (orderType === "sell" && position) {
                    const qty = Math.floor(position.quantity * pct / 100 / 100) * 100
                    setVolume(String(Math.max(100, qty)))
                  }
                }
                return (
                  <Button key={pct} variant="outline" size="sm" className="flex-1 h-5 text-[10px] px-0" onClick={handlePct}>
                    {pct}%
                  </Button>
                )
              })}
            </div>
          </div>

          {/* Order Summary */}
          <div className="bg-muted/50 rounded-md p-2 space-y-1 text-xs mt-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Giá trị</span>
              <span className="font-medium text-foreground tabular-nums">
                {orderValue > 0 ? formatVnd(orderValue) : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phí GD (0.15%)</span>
              <span className="font-medium text-foreground tabular-nums">
                {fee > 0 ? formatVnd(fee) : "—"}
              </span>
            </div>
            <Separator className="my-1" />
            <div className="flex justify-between font-semibold text-sm">
              <span>Tổng</span>
              <span className="tabular-nums text-primary">
                {orderValue > 0 ? formatVnd(orderValue + fee) : "—"}
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <Button
            onClick={handlePlaceOrder}
            disabled={isSubmitting}
            className={`w-full mt-2 h-10 text-xs font-bold shadow-md ${
              orderType === "buy"
                ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                : "bg-red-500 hover:bg-red-600 text-white"
            }`}
          >
            {isSubmitting
              ? "Đang xử lý..."
              : orderType === "buy" ? "ĐẶT LỆNH MUA" : "ĐẶT LỆNH BÁN"}
          </Button>
        </div>
      </ScrollArea>
    </aside>
  )
}
