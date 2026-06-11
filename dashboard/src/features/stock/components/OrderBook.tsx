import { useMemo } from "react"
import { useOrderBook } from "@/features/market-data"
import { cn } from "@/shared/lib/cn"

/** Format absolute VND price with locale separators. */
function fmtVnd(n: number): string {
  if (!n || n <= 0) return "—"
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 0 })
}

/** Compact share volume (e.g. 11,410 → "11.4K"). */
function fmtVol(n: number): string {
  if (!n) return "0"
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M"
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"
  return String(Math.round(n))
}

interface DepthRowProps {
  price: number
  volume: number
  maxVolume: number
  side: "bid" | "ask"
}

function DepthRow({ price, volume, maxVolume, side }: DepthRowProps) {
  const pct = maxVolume > 0 ? (volume / maxVolume) * 100 : 0
  const isBid = side === "bid"
  return (
    <div className="relative flex items-center justify-between px-3 py-1 text-xs tabular-nums">
      {/* depth bar */}
      <div
        className={cn(
          "absolute inset-y-0",
          isBid ? "right-0 bg-up/10" : "right-0 bg-down/10",
        )}
        style={{ width: `${pct}%` }}
      />
      <span className={cn("relative font-medium", isBid ? "text-up" : "text-down")}>
        {fmtVnd(price)}
      </span>
      <span className="relative text-[var(--color-text-2)]">{fmtVol(volume)}</span>
    </div>
  )
}

/**
 * Live order book (bid/ask depth) for a symbol, fed by the realtime WS stream
 * (DNSE KRX top-of-book). Shows up to 3 price steps each side with proportional
 * depth bars. Prices are absolute VND.
 */
export function OrderBook({ symbol }: { symbol: string }) {
  const book = useOrderBook(symbol)

  const maxVolume = useMemo(() => {
    if (!book) return 0
    const vols = [...book.bids, ...book.asks].map((l) => l.volume)
    return vols.length ? Math.max(...vols) : 0
  }, [book])

  if (!book) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--color-text-3)]">
        Đang chờ dữ liệu sổ lệnh…
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border-2)] px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-1)]">
          Sổ lệnh — {symbol}
        </span>
        <span className="text-[10px] text-[var(--color-text-3)]">
          Realtime · {book.time ? new Date(book.time).toLocaleTimeString("vi-VN") : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-y-auto">
        {/* Bid side (descending price) */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase text-[var(--color-text-3)]">
            <span>Giá mua</span>
            <span>KL</span>
          </div>
          {book.bids.slice(0, 3).map((lvl, i) => (
            <DepthRow
              key={`bid-${i}`}
              price={lvl.price}
              volume={lvl.volume}
              maxVolume={maxVolume}
              side="bid"
            />
          ))}
        </div>

        {/* Ask side (ascending price) */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase text-[var(--color-text-3)]">
            <span>Giá bán</span>
            <span>KL</span>
          </div>
          {book.asks.slice(0, 3).map((lvl, i) => (
            <DepthRow
              key={`ask-${i}`}
              price={lvl.price}
              volume={lvl.volume}
              maxVolume={maxVolume}
              side="ask"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default OrderBook
