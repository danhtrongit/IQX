/**
 * Order book (bid/ask depth) for a symbol.
 *
 * Source is the real price board (`POST /market-data/trading/price-board`, the
 * same contract the demo shell polls) — the upstream realtime socket cannot
 * authenticate, so this is an honest 15s snapshot, labelled as such, instead of
 * a fake "realtime" badge. Prices are nghìn đồng on the board and đồng here.
 */
import { useMemo } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/format"
import { useQuote } from "@/pages/demo-trading/market/use-quote"

function formatVolume(value: number): string {
  if (!value) return "0"
  if (value >= 1e6) return (value / 1e6).toFixed(2) + "M"
  if (value >= 1e3) return (value / 1e3).toFixed(1) + "K"
  return String(Math.round(value))
}

function DepthRow({
  price,
  volume,
  maxVolume,
  side,
}: {
  price: number
  volume: number
  maxVolume: number
  side: "bid" | "ask"
}) {
  const pct = maxVolume > 0 ? (volume / maxVolume) * 100 : 0
  const isBid = side === "bid"
  return (
    <div className="relative flex items-center justify-between px-3 py-1.5 text-xs tabular-nums">
      <div
        className={cn("absolute inset-y-0 right-0", isBid ? "bg-price-up/10" : "bg-price-down/10")}
        style={{ width: `${pct}%` }}
      />
      <span className={cn("relative font-medium", isBid ? "text-price-up" : "text-price-down")}>
        {formatNumber(price)}
      </span>
      <span className="relative text-muted-foreground">{formatVolume(volume)}</span>
    </div>
  )
}

export function OrderBook({ symbol }: { symbol: string }) {
  const quote = useQuote(symbol)
  const book = useMemo(() => {
    const data = quote.data
    if (!data) return null
    const levels = (rows: { price: number; volume: number }[]) =>
      rows.filter((row) => row.price > 0 && row.volume > 0)
    return { bids: levels(data.bids), asks: levels(data.asks) }
  }, [quote.data])

  const maxVolume = useMemo(() => {
    if (!book) return 0
    const volumes = [...book.bids, ...book.asks].map((level) => level.volume)
    return volumes.length ? Math.max(...volumes) : 0
  }, [book])

  if (!book) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
        {quote.isLoading
          ? "Đang tải dữ liệu sổ lệnh…"
          : quote.isError
            ? "Không tải được dữ liệu sổ lệnh"
            : "Chưa có dữ liệu sổ lệnh cho mã này"}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-heading text-sm font-bold">Sổ lệnh — {symbol}</h3>
        <span className="text-[11px] text-muted-foreground">
          Cập nhật định kỳ 15 giây · giá nghìn đồng · KL
        </span>
      </div>

      {book.bids.length === 0 && book.asks.length === 0 && (
        <p className="text-xs text-muted-foreground">Chưa có lệnh mua/bán chờ.</p>
      )}

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-2">
        <div className="bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            <span>Giá mua</span>
            <span>Khối lượng</span>
          </div>
          {book.bids.slice(0, 3).map((level, index) => (
            <DepthRow
              key={`bid-${index}`}
              price={level.price}
              volume={level.volume}
              maxVolume={maxVolume}
              side="bid"
            />
          ))}
          {book.bids.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">Không có bên mua.</p>
          )}
        </div>

        <div className="bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            <span>Giá bán</span>
            <span>Khối lượng</span>
          </div>
          {book.asks.slice(0, 3).map((level, index) => (
            <DepthRow
              key={`ask-${index}`}
              price={level.price}
              volume={level.volume}
              maxVolume={maxVolume}
              side="ask"
            />
          ))}
          {book.asks.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">Không có bên bán.</p>
          )}
        </div>
      </div>

      <ScrollArea className="max-h-40">
        <p className="pr-3 text-[11px] leading-5 text-muted-foreground">
          Độ sâu hiển thị bằng thanh nền theo khối lượng lớn nhất trong sổ. Dữ liệu là ảnh chụp
          bảng giá, không phải luồng realtime.
        </p>
      </ScrollArea>
    </div>
  )
}
