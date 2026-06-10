import { useMemo, useState } from "react"
import { useNavigate } from "react-router"
import {
  Button,
  Divider,
  InputNumber,
  Message,
  Radio,
  Select,
  Spin,
  Tabs,
  Tag,
} from "@arco-design/web-react"
import {
  IconArrowFall,
  IconArrowRise,
  IconLoading,
  IconMinus,
  IconStar,
  IconStarFill,
  IconThunderbolt,
  IconTrophy,
} from "@arco-design/web-react/icon"
import { usePrice, type PriceBoardData } from "@/features/market-data"
import { useSymbol } from "@/shared/contexts/symbol-context"
import { useAuth } from "@/features/auth"
import { usePremiumStatus } from "@/features/premium"
import { getErrorMessage } from "@/shared/http/client"
import { cn } from "@/shared/lib/cn"
import { StockLogo } from "@/features/navigation/StockLogo"
import { IconWallet } from "@/features/watchlist/icons"
import {
  useWatchlistToggle,
  useSymbolInfo,
} from "@/features/watchlist"
import { useAccount, usePortfolio, usePlaceOrder, useActivateAccount } from "./hooks"

/* ── formatting helpers ── */
function fmtPrice(price: number): string {
  if (!price || price <= 0) return "—"
  return (price * 1000).toLocaleString("vi-VN", { maximumFractionDigits: 0 })
}
function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("vi-VN")
}
function fmtVolume(v: number): string {
  return v ? v.toLocaleString("vi-VN") : "—"
}
function fmtCompact(v: number): string {
  if (!v) return "—"
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B"
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M"
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K"
  return String(v)
}

function priceColorClass(price: number, ref: number, ceil: number, floor: number): string {
  if (!price || !ref) return "text-[var(--color-text-1)]"
  if (price >= ceil) return "text-ceiling"
  if (price <= floor) return "text-floor"
  if (price > ref) return "text-up"
  if (price < ref) return "text-down"
  return "text-reference"
}

/* ── Order book (depth) ── */
function OrderBookView({ data }: { data: PriceBoardData }) {
  const bids = data.bid || []
  const asks = data.ask || []
  const maxBidVol = Math.max(...bids.map((b) => b.volume || 0), 1)
  const maxAskVol = Math.max(...asks.map((a) => a.volume || 0), 1)

  return (
    <div className="px-1.5">
      <div className="flex items-center px-1.5 py-1 text-[10px] font-medium text-[var(--color-text-3)]">
        <span className="w-16">Giá</span>
        <span className="flex-1 text-right">KL</span>
      </div>
      <div className="space-y-px">
        {[...asks].reverse().map((entry, i) => (
          <DepthRow
            key={`ask-${i}`}
            entry={entry}
            data={data}
            ratio={(entry.volume / maxAskVol) * 100}
            side="ask"
          />
        ))}
      </div>
      <div className="flex items-center justify-center py-1">
        <span className="text-[10px] text-[var(--color-text-3)]">
          Spread:{" "}
          <span className="font-medium tabular-nums text-[var(--color-text-1)]">
            {asks.length > 0 && bids.length > 0
              ? fmtPrice(asks[0].price - bids[0].price)
              : "—"}
          </span>
        </span>
      </div>
      <div className="space-y-px">
        {bids.map((entry, i) => (
          <DepthRow
            key={`bid-${i}`}
            entry={entry}
            data={data}
            ratio={(entry.volume / maxBidVol) * 100}
            side="bid"
          />
        ))}
      </div>
    </div>
  )
}

function DepthRow({
  entry,
  data,
  ratio,
  side,
}: {
  entry: { price: number; volume: number }
  data: PriceBoardData
  ratio: number
  side: "bid" | "ask"
}) {
  return (
    <div className="group relative flex items-center rounded-sm px-1.5 py-0.5 text-[11px]">
      <div
        className={cn(
          "absolute top-0 bottom-0 rounded-sm",
          side === "ask" ? "right-0 bg-down/10" : "left-0 bg-up/10",
        )}
        style={{ width: `${ratio}%` }}
      />
      <span
        className={cn(
          "relative w-16 font-medium tabular-nums",
          priceColorClass(entry.price, data.referencePrice, data.ceilingPrice, data.floorPrice),
        )}
      >
        {fmtPrice(entry.price)}
      </span>
      <span className="relative flex-1 text-right tabular-nums text-[var(--color-text-3)] group-hover:text-[var(--color-text-1)]">
        {fmtVolume(entry.volume)}
      </span>
    </div>
  )
}

/* ── Order entry (premium-gated portion) ── */
function OrderEntry({
  symbol,
  data,
  balance,
  positionQty,
}: {
  symbol: string
  data: PriceBoardData | null
  balance: number
  positionQty: number
}) {
  const navigate = useNavigate()
  const placeOrder = usePlaceOrder()
  const [side, setSide] = useState<"buy" | "sell">("buy")
  const [method, setMethod] = useState<"market" | "limit">("market")
  const [price, setPrice] = useState<number | undefined>(undefined)
  const [volume, setVolume] = useState<number>(100)

  const currentPrice = data?.closePrice ? data.closePrice * 1000 : 0
  const numPrice = price ?? currentPrice
  const numVolume = volume || 0
  const orderValue = numPrice * numVolume
  const fee = Math.round(orderValue * 0.0015)

  const handlePct = (pct: number) => {
    if (side === "buy" && numPrice > 0) {
      const maxShares = Math.floor(balance / (numPrice * 1.0015) / 100) * 100
      const qty = Math.floor((maxShares * pct) / 100 / 100) * 100
      setVolume(Math.max(100, qty))
    } else if (side === "sell" && positionQty > 0) {
      const qty = Math.floor((positionQty * pct) / 100 / 100) * 100
      setVolume(Math.max(100, qty))
    }
  }

  const handleSubmit = async () => {
    if (!data) {
      Message.error("Không có dữ liệu mã CK")
      return
    }
    if (numVolume < 100) {
      Message.warning("Khối lượng tối thiểu là 100 CP")
      return
    }
    if (numVolume % 100 !== 0) {
      Message.warning("Khối lượng phải là bội số của 100")
      return
    }
    if (method === "limit" && numPrice <= 0) {
      Message.warning("Vui lòng nhập giá hợp lệ cho lệnh giới hạn")
      return
    }

    const label = side === "buy" ? "MUA" : "BÁN"
    try {
      const order = await placeOrder.mutateAsync({
        symbol,
        side,
        method,
        quantity: numVolume,
        price: numPrice,
      })
      const totalStr = (order.total || order.price * order.quantity).toLocaleString("vi-VN")
      Message.success(
        `Đặt lệnh ${label} ${symbol} thành công — ${order.quantity} CP × ${order.price.toLocaleString("vi-VN")} = ${totalStr} VND${order.status === "PENDING" ? " (chờ khớp)" : ""}`,
      )
    } catch (err) {
      const msg = await getErrorMessage(err, `Đặt lệnh ${label} ${symbol} thất bại`)
      if (/premium|gói premium/i.test(msg)) {
        Message.error({
          content: msg,
          duration: 6000,
        })
        navigate("/nang-cap")
      } else {
        Message.error(msg)
      }
    }
  }

  return (
    <div className="space-y-2 px-2 pb-3">
      {/* Buy / Sell */}
      <Tabs
        activeTab={side}
        onChange={(v) => setSide(v as "buy" | "sell")}
        className="mt-2 [&_.arco-tabs-content]:hidden"
      >
        <Tabs.TabPane key="buy" title={<span className="font-semibold">MUA</span>} />
        <Tabs.TabPane key="sell" title={<span className="font-semibold">BÁN</span>} />
      </Tabs>

      {/* Order method */}
      <Select value={method} onChange={(v) => setMethod(v)} size="small">
        <Select.Option value="market">Lệnh thị trường (MP)</Select.Option>
        <Select.Option value="limit">Lệnh giới hạn (LO)</Select.Option>
      </Select>

      {/* Price */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-3)]">Giá</label>
        <InputNumber
          mode="button"
          step={100}
          min={0}
          value={numPrice}
          onChange={(v) => setPrice(v ?? 0)}
          disabled={method === "market"}
          className="w-full"
        />
      </div>

      {/* Volume */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[var(--color-text-3)]">Khối lượng</label>
          {side === "sell" && positionQty > 0 && (
            <span className="text-xs text-[var(--color-text-3)]">
              Tối đa: {positionQty.toLocaleString("vi-VN")}
            </span>
          )}
        </div>
        <InputNumber
          mode="button"
          step={100}
          min={0}
          value={volume}
          onChange={(v) => setVolume(v ?? 0)}
          className="w-full"
        />
        <Radio.Group
          type="button"
          size="mini"
          className="w-full pt-1"
          onChange={(v) => handlePct(v)}
          options={[10, 25, 50, 100].map((p) => ({ label: `${p}%`, value: p }))}
        />
      </div>

      {/* Summary */}
      <div className="mt-2 space-y-1 rounded-md bg-[var(--color-fill-2)] p-2 text-xs">
        <div className="flex justify-between">
          <span className="text-[var(--color-text-3)]">Giá trị</span>
          <span className="font-medium tabular-nums text-[var(--color-text-1)]">
            {orderValue > 0 ? fmtVnd(orderValue) : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--color-text-3)]">Phí GD (0.15%)</span>
          <span className="font-medium tabular-nums text-[var(--color-text-1)]">
            {fee > 0 ? fmtVnd(fee) : "—"}
          </span>
        </div>
        <Divider className="my-1" />
        <div className="flex justify-between text-sm font-semibold">
          <span>Tổng</span>
          <span className="tabular-nums text-[rgb(var(--primary-6))]">
            {orderValue > 0 ? fmtVnd(orderValue + fee) : "—"}
          </span>
        </div>
      </div>

      {/* Submit */}
      <Button
        long
        loading={placeOrder.isPending}
        onClick={handleSubmit}
        className={cn(
          "mt-2 font-bold text-white",
          side === "buy"
            ? "!border-up !bg-up hover:!opacity-90"
            : "!border-down !bg-down hover:!opacity-90",
        )}
      >
        {side === "buy" ? "ĐẶT LỆNH MUA" : "ĐẶT LỆNH BÁN"}
      </Button>
    </div>
  )
}

/* ── Account strip / activation ── */
function AccountStrip({
  positionQty,
  symbol,
}: {
  positionQty: number
  symbol: string
}) {
  const { data: account, isLoading, isError } = useAccount()
  const activate = useActivateAccount()
  const navigate = useNavigate()

  const handleActivate = async () => {
    try {
      await activate.mutateAsync()
      Message.success("Kích hoạt Đấu trường ảo thành công! Bạn nhận 1 tỷ VND ảo.")
    } catch (err) {
      const msg = await getErrorMessage(err, "Kích hoạt thất bại")
      if (/premium|gói premium/i.test(msg)) {
        Message.error(msg)
        navigate("/nang-cap")
      } else {
        Message.error(msg)
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-2">
        <IconLoading spin />
      </div>
    )
  }

  // No account yet (404 / error) → offer activation.
  if (isError || !account) {
    return (
      <div className="border-b border-[var(--color-border-2)] px-2 py-2">
        <Button
          long
          type="primary"
          size="small"
          icon={<IconThunderbolt />}
          loading={activate.isPending}
          onClick={handleActivate}
        >
          Kích hoạt Đấu trường ảo
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-1 border-b border-[var(--color-border-2)] px-2 py-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-3)]">
          <IconWallet />
          Số dư
        </span>
        <span className="text-xs font-bold tabular-nums text-[var(--color-text-1)]">
          {fmtVnd(account.balance)}đ
        </span>
      </div>
      <div className="flex gap-2">
        <span
          className={cn(
            "flex items-center gap-1 text-[10px] font-medium",
            account.pnl >= 0 ? "text-up" : "text-down",
          )}
        >
          {account.pnl >= 0 ? <IconArrowRise /> : <IconArrowFall />}
          {account.pnl >= 0 ? "+" : ""}
          {fmtVnd(account.pnl)}đ ({account.pnlPercent >= 0 ? "+" : ""}
          {account.pnlPercent}%)
        </span>
        <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-3)]">
          <IconTrophy />
          WR: {account.winRate}%
        </span>
      </div>
      {positionQty > 0 && (
        <div className="flex items-center justify-between rounded bg-[var(--color-fill-2)] px-1.5 py-0.5 text-[10px]">
          <span className="text-[var(--color-text-3)]">Đang giữ {symbol}</span>
          <span className="font-semibold text-[var(--color-text-1)]">
            {positionQty.toLocaleString("vi-VN")} CP
          </span>
        </div>
      )}
    </div>
  )
}

/* ── Stock header (search + price info) ── */
function StockHeader({
  symbol,
  data,
  isLoading,
}: {
  symbol: string
  data: PriceBoardData | null
  isLoading: boolean
}) {
  const navigate = useNavigate()
  const { isAuthenticated, setShowAuthModal } = useAuth()
  const { isWatched, toggle, isPending } = useWatchlistToggle()
  const { data: info } = useSymbolInfo(symbol)

  const handleToggle = async () => {
    if (!isAuthenticated) {
      Message.warning("Đăng nhập để theo dõi mã CK")
      setShowAuthModal(true)
      return
    }
    const wasWatched = isWatched(symbol)
    try {
      await toggle(symbol)
      Message.success(
        wasWatched ? `Đã bỏ theo dõi ${symbol}` : `Đã thêm ${symbol} vào danh sách`,
      )
    } catch (err) {
      Message.error(await getErrorMessage(err, `Không thể cập nhật ${symbol}`))
    }
  }

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center border-b border-[var(--color-border-2)] py-4">
        <Spin />
      </div>
    )
  }

  const watched = isWatched(data.symbol)

  return (
    <div className="space-y-1 border-b border-[var(--color-border-2)] px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StockLogo symbol={data.symbol} size={28} />
          <button
            type="button"
            className="text-sm font-bold text-[var(--color-text-1)] hover:text-[rgb(var(--primary-6))]"
            onClick={() => navigate(`/co-phieu/${data.symbol}`)}
          >
            {data.symbol}
          </button>
          <button
            type="button"
            onClick={handleToggle}
            disabled={isPending}
            className={cn(
              watched ? "text-[rgb(var(--orange-6))]" : "text-[var(--color-text-3)]",
              "hover:opacity-70",
            )}
            aria-label={watched ? "Bỏ theo dõi" : "Theo dõi"}
          >
            {watched ? <IconStarFill /> : <IconStar />}
          </button>
        </div>
        <Tag size="small">{data.exchange}</Tag>
      </div>

      {info?.shortName && (
        <p className="truncate text-[10px] text-[var(--color-text-3)]">{info.shortName}</p>
      )}

      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-2xl font-black tabular-nums tracking-tight",
            priceColorClass(data.closePrice, data.referencePrice, data.ceilingPrice, data.floorPrice),
          )}
        >
          {fmtPrice(data.closePrice)}
        </span>
        <span
          className={cn(
            "flex items-center gap-1 text-xs font-semibold",
            data.priceChange >= 0 ? "text-up" : "text-down",
          )}
        >
          {data.priceChange > 0 ? (
            <IconArrowRise />
          ) : data.priceChange < 0 ? (
            <IconArrowFall />
          ) : (
            <IconMinus />
          )}
          {data.priceChange >= 0 ? "+" : ""}
          {fmtPrice(data.priceChange)} ({data.percentChange >= 0 ? "+" : ""}
          {data.percentChange?.toFixed(2)}%)
        </span>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[10px]">
        <Stat label="Trần" value={fmtPrice(data.ceilingPrice)} className="text-ceiling" />
        <Stat label="TC" value={fmtPrice(data.referencePrice)} className="text-reference" />
        <Stat label="Sàn" value={fmtPrice(data.floorPrice)} className="text-floor" />
        <Stat label="KL" value={fmtCompact(data.totalVolume)} />
        <Stat
          label="NN"
          value={`${data.foreignBuy - data.foreignSell >= 0 ? "+" : ""}${fmtCompact(data.foreignBuy - data.foreignSell)}`}
          className={data.foreignBuy - data.foreignSell >= 0 ? "text-up" : "text-down"}
        />
        <Stat label="GTGD" value={fmtCompact(data.totalValue)} />
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--color-text-3)]">{label}</span>
      <span className={cn("font-medium tabular-nums text-[var(--color-text-1)]", className)}>
        {value}
      </span>
    </div>
  )
}

/* ── Premium-only order entry wrapper ── */
function GatedOrderEntry(props: {
  symbol: string
  data: PriceBoardData | null
  balance: number
  positionQty: number
}) {
  const { isPremium, isLoading } = usePremiumStatus()
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spin />
      </div>
    )
  }

  if (!isPremium) {
    return (
      <div className="space-y-2 px-2 py-4 text-center">
        <p className="text-xs text-[var(--color-text-3)]">
          Đặt lệnh Đấu trường ảo yêu cầu gói Premium.
        </p>
        <Button type="primary" size="small" icon={<IconThunderbolt />} onClick={() => navigate("/nang-cap")}>
          Nâng cấp Premium
        </Button>
      </div>
    )
  }

  return <OrderEntry {...props} />
}

/* ── Main panel ── */
export function TradingPanel() {
  const { symbol } = useSymbol()
  const { data, isLoading } = usePrice(symbol)
  const { data: account } = useAccount()
  const { data: portfolio } = usePortfolio()

  const positionQty = useMemo(() => {
    const pos = portfolio?.positions.find(
      (p) => p.symbol === symbol.toUpperCase(),
    )
    return pos?.quantity ?? 0
  }, [portfolio, symbol])

  return (
    <aside className="flex h-full w-full shrink-0 flex-col bg-[var(--color-bg-2)]">
      <StockHeader symbol={symbol} data={data} isLoading={isLoading} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {data && <OrderBookView data={data} />}
        <Divider className="my-1" />
        <AccountStrip positionQty={positionQty} symbol={symbol} />
        <GatedOrderEntry
          symbol={symbol}
          data={data}
          balance={account?.balance ?? 0}
          positionQty={positionQty}
        />
      </div>
    </aside>
  )
}
