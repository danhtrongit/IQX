/**
 * `OrderPanel` — the manual order ticket ("Đặt lệnh").
 *
 * A plain order form for the self-trading demo account: symbol, side, order
 * type, price, quantity (with 25/50/75/100% helpers) and a confirm button.
 * Nothing here depends on lessons, the Bot or any level; the server remains the
 * authority on lot size, balances, price bands, sessions, fees and settlement,
 * and the ticket only adds the client-side guards in `checkOrderInput`.
 *
 * Opening it with a symbol (from the URL, Săn mã or the watch list) only fills
 * the form; the order is placed solely by the confirm button.
 */
import { useState } from "react"
import { LoaderCircle, Star } from "lucide-react"
import { toast } from "sonner"

import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/hooks/use-auth"
import { useTradingAccount, useTradingPortfolio } from "@/hooks/use-trading"
import { errorMessage } from "@/lib/api"
import { formatMoney, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { SymbolPicker } from "../market/symbol-picker"
import { useQuote } from "../market/use-quote"
import { useAddToWatchlist, useRemoveFromWatchlist, useWatchlist } from "../portfolio/hooks"
import { BOARD_LOT, FEE_RATE, QUICK_PERCENTS, checkOrderInput, quantityForPercent } from "./order-math"
import { useActivateAccount, usePlaceOrder } from "./use-trading-orders"

export type OrderPanelProps = {
  symbol: string
  /** Switch the panel to another symbol (keeps the shell, unlike a route change). */
  onSymbolChange: (symbol: string) => void
}

export function OrderPanel({ symbol, onSymbolChange }: OrderPanelProps) {
  // A symbol change starts a NEW order: remounting drops the typed quantity and
  // limit price so they cannot be sent for a different stock.
  return <OrderTicket key={symbol} symbol={symbol} onSymbolChange={onSymbolChange} />
}

function OrderTicket({ symbol, onSymbolChange }: OrderPanelProps) {
  const { isAuthenticated, isLoading: authLoading, openAuth } = useAuth()
  const { data: quote, isLoading: quoteLoading } = useQuote(symbol)
  const { data: account } = useTradingAccount()
  const { data: portfolio } = useTradingPortfolio()
  const watchlist = useWatchlist()
  const addToWatchlist = useAddToWatchlist()
  const removeFromWatchlist = useRemoveFromWatchlist()
  const activate = useActivateAccount()
  const placeOrder = usePlaceOrder()

  const [side, setSide] = useState<"buy" | "sell">("buy")
  const [method, setMethod] = useState<"market" | "limit">("market")
  const [limitPrice, setLimitPrice] = useState<number | null>(null)
  const [quantity, setQuantity] = useState<number>(BOARD_LOT)

  const code = symbol.toUpperCase()
  const position = portfolio?.positions?.find((row) => row.symbol === code)
  const sellable = position?.quantity_sellable ?? 0
  const currentPrice = quote?.price ?? 0
  const holdingElsewhere = (portfolio?.positions ?? []).find(
    (row) => row.quantity_total > 0 && row.symbol !== code,
  )
  const watched = (watchlist.data ?? []).some((item) => item.symbol === code)

  const toggleWatch = async () => {
    if (!isAuthenticated) {
      openAuth("login")
      return
    }
    const mutation = watched ? removeFromWatchlist : addToWatchlist
    try {
      await mutation.mutateAsync(code)
      toast.success(watched ? `Đã bỏ ${code} khỏi danh mục theo dõi` : `Đã thêm ${code} vào danh mục theo dõi`)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const effectivePrice = method === "limit" ? (limitPrice ?? 0) : currentPrice
  const orderValue = effectivePrice * quantity
  const fee = Math.round(orderValue * FEE_RATE)

  const applyPercent = (percent: number) => {
    const next = quantityForPercent({
      side,
      percent,
      price: currentPrice,
      cashAvailable: account?.cash_available_vnd ?? null,
      sellable,
    })
    if (next != null) setQuantity(next)
  }

  async function submit() {
    const check = checkOrderInput({ hasQuote: !!quote && currentPrice > 0, quantity, method, limitPrice })
    if (!check.ok) {
      if (check.message === "Không có dữ liệu mã CK") toast.error(check.message)
      else toast.warning(check.message)
      return
    }
    const price = method === "limit" ? (limitPrice ?? 0) : currentPrice
    const label = side === "buy" ? "MUA" : "BÁN"
    try {
      const order = await placeOrder.mutateAsync({ symbol, side, method, quantity, price })
      const filled = order.filled_price_vnd ?? order.limit_price_vnd ?? price
      const total = (order.gross_amount_vnd ?? filled * order.quantity).toLocaleString("vi-VN")
      toast.success(
        `Đặt lệnh ${label} ${symbol} thành công — ${order.quantity.toLocaleString("vi-VN")} CP × ${filled.toLocaleString(
          "vi-VN",
        )} = ${total} VND${order.status.toLowerCase() === "pending" ? " (chờ khớp)" : ""}`,
      )
      setQuantity(BOARD_LOT)
      setLimitPrice(null)
      setMethod("market")
    } catch (error) {
      const message = errorMessage(error)
      if (/premium/i.test(message)) {
        toast.error(message, { duration: 6000 })
        if (!isAuthenticated) openAuth()
      } else {
        toast.error(message)
      }
    }
  }

  if (authLoading) {
    return (
      <SidebarPanel title="Đặt lệnh" description={symbol}>
        <PanelState title="Đang tải tài khoản" loading />
      </SidebarPanel>
    )
  }

  return (
    <SidebarPanel
      title="Đặt lệnh"
      description={`Tài khoản tự giao dịch · ${symbol}${quote?.reference ? ` · TC ${formatNumber(quote.reference)}` : ""}`}
      footer={
        !isAuthenticated ? undefined : (
          <div className="space-y-2">
            <Button
              type="button"
              className={cn("w-full font-bold text-white", side === "buy" ? "bg-price-up hover:bg-price-up/90" : "bg-price-down hover:bg-price-down/90")}
              disabled={placeOrder.isPending || !account}
              onClick={() => void submit()}
            >
              {placeOrder.isPending && <LoaderCircle className="size-4 animate-spin" />}
              {side === "buy" ? "ĐẶT LỆNH MUA" : "ĐẶT LỆNH BÁN"}
            </Button>
            <p className="text-[11px] text-muted-foreground">Lệnh và tiền thuộc tài khoản tự giao dịch.</p>
          </div>
        )
      }
    >
      {/* MUA / BÁN */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Chiều lệnh">
        {(["buy", "sell"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={side === value}
            tabIndex={side === value ? 0 : -1}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return
              event.preventDefault()
              const next = event.key === "Home" || event.key === "ArrowLeft" ? "buy" : "sell"
              setSide(next)
              document.getElementById(`order-side-${next}`)?.focus()
            }}
            id={`order-side-${value}`}
            onClick={() => setSide(value)}
            className={`rounded-md px-2 py-1.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none ${
              side === value
                ? value === "buy"
                  ? "bg-price-up text-white"
                  : "bg-price-down text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {value === "buy" ? "MUA" : "BÁN"}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Mã cổ phiếu</Label>
        <SymbolPicker symbol={code} onSymbolChange={onSymbolChange} className="w-full justify-between" />
      </div>

      <TickerCard
        symbol={symbol}
        quote={quote ?? null}
        loading={quoteLoading}
        watched={watched}
        watchPending={addToWatchlist.isPending || removeFromWatchlist.isPending}
        onToggleWatch={toggleWatch}
        onSwitchSymbol={onSymbolChange}
        otherHoldingSymbol={holdingElsewhere?.symbol ?? null}
      />

      {/* Account + activation */}
      <Card className="gap-2 py-3">
        <CardContent className="space-y-2 px-3">
          {!isAuthenticated ? (
            <>
              <p className="text-xs text-muted-foreground">
                Đăng nhập để dùng tài khoản Demo Trading 100 triệu VND.
              </p>
              <Button type="button" size="sm" className="w-full" onClick={() => openAuth("login")}>
                Đăng nhập
              </Button>
            </>
          ) : account === undefined ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" /> Đang đọc tài khoản Demo Trading…
            </p>
          ) : account === null ? (
            <>
              <p className="text-xs text-muted-foreground">Bạn chưa có tài khoản Demo Trading.</p>
              <Button
                type="button"
                size="sm"
                className="w-full"
                disabled={activate.isPending}
                onClick={() => {
                  activate.mutate(undefined, {
                    onSuccess: (created) =>
                      toast.success(
                        `Đã mở tài khoản Demo Trading — bạn nhận ${created.cash_available_vnd.toLocaleString(
                          "vi-VN",
                        )} VND ảo.`,
                      ),
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }}
              >
                {activate.isPending && <LoaderCircle className="size-4 animate-spin" />}
                Mở tài khoản Demo Trading
              </Button>
            </>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Tiền khả dụng</span>
                <span className="text-sm font-bold tabular-nums">{formatMoney(account.cash_available_vnd)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">CP có thể bán</span>
                <span className="text-xs font-medium tabular-nums">{sellable.toLocaleString("vi-VN")} CP</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <span
                  className={`font-medium tabular-nums ${
                    portfolio?.total_unrealized_pnl_vnd == null
                      ? "text-muted-foreground"
                      : portfolio.total_unrealized_pnl_vnd >= 0
                        ? "text-price-up"
                        : "text-price-down"
                  }`}
                >
                  {portfolio?.total_unrealized_pnl_vnd == null
                    ? "—"
                    : `${formatMoney(portfolio.total_unrealized_pnl_vnd)} (${portfolio.return_pct.toFixed(2)}%)`}
                </span>
                {position && (
                  <span className="tabular-nums text-muted-foreground">
                    Đang giữ {position.quantity_total.toLocaleString("vi-VN")} CP
                    {position.quantity_sellable !== position.quantity_total &&
                      ` · bán được ${position.quantity_sellable.toLocaleString("vi-VN")}`}
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!isAuthenticated ? (
        <Card className="gap-2 py-3">
          <CardContent className="px-3 text-xs text-muted-foreground">
            Phiếu lệnh mở sau khi bạn đăng nhập. Dữ liệu thị trường vẫn xem được.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="order-type" className="text-xs">Loại lệnh</Label>
              <Select value={method} onValueChange={(value) => setMethod(value as "market" | "limit")}>
                <SelectTrigger id="order-type" className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="market">MP — Thị trường</SelectItem>
                  <SelectItem value="limit">LO — Giới hạn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="limit-price" className="text-xs">
                Giá đặt (đồng)
              </Label>
              <Input
                id="limit-price"
                inputMode="numeric"
                disabled={method === "market"}
                value={limitPrice == null ? "" : String(limitPrice)}
                placeholder={currentPrice > 0 ? String(Math.round(currentPrice)) : "0"}
                onChange={(event) => {
                  const raw = event.target.value.replace(/[^\d]/g, "")
                  setLimitPrice(raw === "" ? null : Number(raw))
                }}
                className="tabular-nums"
              />
              <p className="text-[11px] text-muted-foreground">
                MP khớp ngay ở giá bên bán; LO chỉ khớp khi giá về đúng mức bạn nhập.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="quantity" className="text-xs">
                Khối lượng ({BOARD_LOT} CP/lô)
              </Label>
              {side === "sell" && (
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  Tối đa: {sellable.toLocaleString("vi-VN")}
                </span>
              )}
            </div>
            <Input
              id="quantity"
              inputMode="numeric"
              value={String(quantity)}
              onChange={(event) => {
                const raw = event.target.value.replace(/[^\d]/g, "")
                setQuantity(raw === "" ? 0 : Number(raw))
              }}
              className="tabular-nums"
            />
            <div className="flex gap-1.5 pt-0.5" role="group" aria-label="Chọn nhanh khối lượng theo tỷ lệ">
              {QUICK_PERCENTS.map((percent) => (
                <Button
                  key={percent}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 flex-1 text-[11px]"
                  onClick={() => applyPercent(percent)}
                >
                  {percent}%
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1 rounded-lg bg-muted/50 p-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Giá trị đặt</span>
              <span className="font-medium tabular-nums">{orderValue > 0 ? formatMoney(orderValue) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phí dự kiến (0,15%)</span>
              <span className="font-medium tabular-nums">{fee > 0 ? formatMoney(fee) : "—"}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 text-sm font-semibold">
              <span>Tổng</span>
              <span className="tabular-nums text-primary">{orderValue > 0 ? formatMoney(orderValue + fee) : "—"}</span>
            </div>
          </div>

          {quote && <OrderBook bids={quote.bids} asks={quote.asks} />}
        </>
      )}
    </SidebarPanel>
  )
}

/* ── helpers ──────────────────────────────────────────────────────────── */

type QuoteView = {
  price: number | null
  reference: number | null
  ceiling: number | null
  floor: number | null
  high: number | null
  low: number | null
  volume: number | null
}

function TickerCard({
  symbol,
  quote,
  loading,
  watched,
  watchPending,
  onToggleWatch,
  onSwitchSymbol,
  otherHoldingSymbol,
}: {
  symbol: string
  quote: QuoteView | null
  loading: boolean
  watched: boolean
  watchPending: boolean
  onToggleWatch: () => void
  onSwitchSymbol: (symbol: string) => void
  otherHoldingSymbol: string | null
}) {
  if (loading) {
    return (
      <Card className="py-3">
        <CardContent className="flex items-center gap-2 px-3 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" /> Đang tải giá {symbol}…
        </CardContent>
      </Card>
    )
  }
  if (!quote) {
    return (
      <Card className="py-3">
        <CardContent className="space-y-2 px-3">
          <p className="text-xs text-muted-foreground">Chưa có dữ liệu giá cho mã {symbol}.</p>
          {otherHoldingSymbol && (
            <Button type="button" size="sm" variant="outline" onClick={() => onSwitchSymbol(otherHoldingSymbol)}>
              Mở mã đang nắm giữ: {otherHoldingSymbol}
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }
  const { price, reference } = quote
  const tone =
    price == null || reference == null
      ? "text-foreground"
      : quote.ceiling != null && price >= quote.ceiling
        ? "text-price-ceiling"
        : quote.floor != null && price <= quote.floor
          ? "text-price-floor"
          : price > reference
            ? "text-price-up"
            : price < reference
              ? "text-price-down"
              : "text-muted-foreground"
  const changePct =
    price != null && reference != null && reference > 0 ? ((price - reference) / reference) * 100 : null
  const stats: { label: string; value: string }[] = [
    { label: "Trần", value: quote.ceiling == null ? "—" : formatNumber(quote.ceiling) },
    { label: "TC", value: quote.reference == null ? "—" : formatNumber(quote.reference) },
    { label: "Sàn", value: quote.floor == null ? "—" : formatNumber(quote.floor) },
    { label: "Cao", value: quote.high == null ? "—" : formatNumber(quote.high) },
    { label: "Thấp", value: quote.low == null ? "—" : formatNumber(quote.low) },
    { label: "KL", value: quote.volume == null ? "—" : formatNumber(quote.volume) },
  ]

  return (
    <Card className="gap-2 py-3">
      <CardContent className="space-y-2 px-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-1.5 font-heading text-base font-bold">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-5 text-muted-foreground"
              aria-label={watched ? `Bỏ theo dõi ${symbol}` : `Theo dõi ${symbol}`}
              aria-pressed={watched}
              title={watched ? "Bỏ theo dõi" : "Theo dõi"}
              disabled={watchPending}
              onClick={onToggleWatch}
            >
              <Star className={watched ? "fill-accent text-accent" : undefined} />
            </Button>
            {symbol}
          </span>
          <span className={`flex items-baseline gap-2 text-xl font-black tabular-nums ${tone}`}>
            {price == null ? "—" : formatNumber(price)}
            {changePct != null && (
              <span className={`text-xs font-semibold ${changePct >= 0 ? "text-price-up" : "text-price-down"}`}>
                {changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%
              </span>
            )}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[11px]">
          {stats.map((stat) => (
            <div key={stat.label} className="flex justify-between">
              <span className="text-muted-foreground">{stat.label}</span>
              <span className="font-medium tabular-nums">{stat.value}</span>
            </div>
          ))}
        </div>
        {otherHoldingSymbol && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 w-full text-[11px]"
            onClick={() => onSwitchSymbol(otherHoldingSymbol)}
          >
            Đang giữ {otherHoldingSymbol} — mở mã này
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

/** Bid/ask ladder from the real depth: bids descend, asks ascend. */
function OrderBook({
  bids,
  asks,
}: {
  bids: { price: number; volume: number }[]
  asks: { price: number; volume: number }[]
}) {
  const topBids = bids.slice(0, 3)
  const topAsks = [...asks].sort((a, b) => a.price - b.price).slice(0, 3)
  return (
    <Card className="gap-2 py-3">
      <CardContent className="space-y-1.5 px-3">
        <p className="text-xs font-semibold">Sổ lệnh</p>
        <div className="grid grid-cols-2 gap-x-3 text-[11px]">
          <div className="space-y-0.5">
            <p className="text-muted-foreground">Bên mua</p>
            {topBids.length === 0 && <p className="text-muted-foreground">—</p>}
            {topBids.map((level) => (
              <div key={`bid-${level.price}`} className="flex justify-between tabular-nums">
                <span className="text-price-up">{formatNumber(level.price)}</span>
                <span className="text-muted-foreground">{formatNumber(level.volume)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-0.5">
            <p className="text-muted-foreground">Bên bán</p>
            {topAsks.length === 0 && <p className="text-muted-foreground">—</p>}
            {topAsks.map((level) => (
              <div key={`ask-${level.price}`} className="flex justify-between tabular-nums">
                <span className="text-price-down">{formatNumber(level.price)}</span>
                <span className="text-muted-foreground">{formatNumber(level.volume)}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
