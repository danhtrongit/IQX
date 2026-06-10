import { memo, useEffect, useRef } from "react"
import { useNavigate } from "react-router"
import { Divider, Spin } from "@arco-design/web-react"
import { IconMinus } from "@arco-design/web-react/icon"
import { useIndices, usePrice, type IndexData } from "@/features/market-data"
import { useSymbol } from "@/shared/contexts/symbol-context"
import { isKnownIndexSymbol } from "@/shared/lib/market-symbols"
import { StockLogo } from "./StockLogo"
import { IconTrendingDown, IconTrendingUp } from "./icons"

function formatNumber(n: number | undefined | null, decimals = 2): string {
  if (n == null || isNaN(n)) return "—"
  return n.toLocaleString("vi-VN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatVolume(v: number | undefined | null): string {
  if (v == null || isNaN(v)) return "—"
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B"
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M"
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K"
  return String(v)
}

function formatValue(v: number | undefined | null): string {
  if (v == null || isNaN(v)) return "—"
  if (v >= 1e12) return (v / 1e12).toFixed(1) + "T"
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B"
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M"
  return String(v)
}

function trendClass(trend: "up" | "down" | "flat") {
  return trend === "up" ? "text-up" : trend === "down" ? "text-down" : "text-reference"
}

/** Vietnamese board price color: ceiling → floor → up/down vs reference. */
function priceColorClass(
  price: number,
  ref: number,
  ceil: number,
  floor: number,
): string {
  if (!price || !ref) return "text-[var(--color-text-1)]"
  if (price >= ceil) return "text-ceiling"
  if (price <= floor) return "text-floor"
  if (price > ref) return "text-up"
  if (price < ref) return "text-down"
  return "text-reference"
}

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") return <IconTrendingUp className="size-3" />
  if (trend === "down") return <IconTrendingDown className="size-3" />
  return <IconMinus className="size-3" />
}

const IndexItem = memo(function IndexItem({ index }: { index: IndexData }) {
  return (
    <div className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--color-fill-2)]">
      <span className="text-[10px] font-medium text-[var(--color-text-3)]">{index.name}</span>
      <span className="text-xs font-semibold tabular-nums">{formatNumber(index.value)}</span>
      <span
        className={`flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${trendClass(index.trend)}`}
      >
        <TrendIcon trend={index.trend} />
        {index.change >= 0 ? "+" : ""}
        {formatNumber(index.change)} ({index.changePercent >= 0 ? "+" : ""}
        {formatNumber(index.changePercent)}%)
      </span>
    </div>
  )
})

/** Auto-scrolling marquee of index tickers (pauses on hover, in place). */
const MarketTicker = memo(function MarketTicker({ indices }: { indices: IndexData[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  // Ref (not state) so toggling pause doesn't restart the rAF loop / reset offset.
  const pausedRef = useRef(false)

  useEffect(() => {
    const inner = innerRef.current
    if (!inner || indices.length === 0) return

    let animationId: number
    let offset = 0
    const halfWidth = inner.scrollWidth / 2
    const speed = 0.4

    const tick = () => {
      if (!pausedRef.current) {
        offset -= speed
        if (Math.abs(offset) >= halfWidth) offset = 0
        inner.style.transform = `translateX(${offset}px)`
      }
      animationId = requestAnimationFrame(tick)
    }

    animationId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationId)
  }, [indices])

  if (indices.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spin size={12} />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden"
      onMouseEnter={() => { pausedRef.current = true }}
      onMouseLeave={() => { pausedRef.current = false }}
    >
      <div ref={innerRef} className="flex w-max items-center gap-4 will-change-transform">
        {indices.map((index) => (
          <IndexItem key={`a-${index.name}`} index={index} />
        ))}
        {indices.map((index) => (
          <IndexItem key={`b-${index.name}`} index={index} />
        ))}
      </div>
    </div>
  )
})

export function MarketBar() {
  const navigate = useNavigate()
  const { symbol } = useSymbol()
  const { indices } = useIndices()
  const isIndex = isKnownIndexSymbol(symbol)
  const { data: stockData } = usePrice(isIndex ? "" : symbol)

  const pctClass =
    stockData && stockData.percentChange > 0
      ? "bg-up/15 text-up"
      : stockData && stockData.percentChange < 0
        ? "bg-down/15 text-down"
        : "bg-reference/15 text-reference"

  return (
    <div className="flex h-8 items-center gap-2 px-2">
      {/* Active stock summary */}
      {stockData && (
        <button
          type="button"
          onClick={() => navigate(`/co-phieu/${stockData.symbol}`)}
          className="flex shrink-0 items-center gap-2"
        >
          <StockLogo symbol={stockData.symbol} size={20} />
          <span className="text-xs font-bold" style={{ color: "rgb(var(--primary-6))" }}>
            {stockData.symbol}
          </span>
          <span
            className={`text-xs font-semibold tabular-nums ${priceColorClass(
              stockData.closePrice,
              stockData.referencePrice,
              stockData.ceilingPrice,
              stockData.floorPrice,
            )}`}
          >
            {formatNumber(stockData.closePrice * 1000, 0)}
          </span>
          <span className={`rounded px-1.5 text-[10px] font-semibold tabular-nums ${pctClass}`}>
            {stockData.percentChange >= 0 ? "+" : ""}
            {formatNumber(stockData.percentChange)}%
          </span>
        </button>
      )}

      {/* Quick stats */}
      {stockData && (
        <div className="flex shrink-0 items-center gap-3 text-[10px] text-[var(--color-text-3)]">
          <div className="flex items-center gap-1">
            <span>KL:</span>
            <span className="font-medium tabular-nums text-[var(--color-text-1)]">
              {formatVolume(stockData.totalVolume)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span>GT:</span>
            <span className="font-medium tabular-nums text-[var(--color-text-1)]">
              {formatValue(stockData.totalValue)}
            </span>
          </div>
          <div className="hidden items-center gap-1 md:flex">
            <span>Mở:</span>
            <span className="font-medium tabular-nums text-[var(--color-text-1)]">
              {formatNumber(stockData.openPrice * 1000, 0)}
            </span>
          </div>
          <div className="hidden items-center gap-1 md:flex">
            <span>Cao:</span>
            <span className="font-medium tabular-nums text-up">
              {formatNumber(stockData.highestPrice * 1000, 0)}
            </span>
          </div>
          <div className="hidden items-center gap-1 md:flex">
            <span>Thấp:</span>
            <span className="font-medium tabular-nums text-down">
              {formatNumber(stockData.lowestPrice * 1000, 0)}
            </span>
          </div>
        </div>
      )}

      {stockData && <Divider type="vertical" className="!mx-1 !hidden !h-4 md:!block" />}

      {/* Indices marquee */}
      <MarketTicker indices={indices} />
    </div>
  )
}
