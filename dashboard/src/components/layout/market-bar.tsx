import { useRef, useEffect, useState } from "react"
import { TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { type IndexData } from "@/hooks/use-market-data"
import { useIndices, usePrice } from "@/contexts/market-data-context"
import { useSymbol } from "@/contexts/symbol-context"
import { StockLogo } from "@/components/stock/stock-logo"

function formatNumber(n: number | undefined | null, decimals = 2): string {
  if (n == null || isNaN(n)) return "—"
  return n.toLocaleString("vi-VN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
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

function getTrendColor(trend: "up" | "down" | "flat") {
  switch (trend) {
    case "up": return "text-emerald-500"
    case "down": return "text-red-500"
    case "flat": return "text-amber-500"
  }
}

function getTrendIcon(trend: "up" | "down" | "flat") {
  switch (trend) {
    case "up": return <TrendingUp className="size-3" />
    case "down": return <TrendingDown className="size-3" />
    case "flat": return <Minus className="size-3" />
  }
}

function IndexItem({ index }: { index: IndexData }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0 cursor-pointer hover:bg-accent/50 rounded px-1.5 py-0.5 transition-colors">
      <span className="text-[10px] font-medium text-muted-foreground">
        {index.name}
      </span>
      <span className="text-xs font-semibold text-foreground tabular-nums">
        {formatNumber(index.value)}
      </span>
      <span
        className={`flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${getTrendColor(index.trend)}`}
      >
        {getTrendIcon(index.trend)}
        {index.change >= 0 ? "+" : ""}{formatNumber(index.change)} ({index.changePercent >= 0 ? "+" : ""}{formatNumber(index.changePercent)}%)
      </span>
    </div>
  )
}

function MarketTicker({ indices }: { indices: IndexData[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    const inner = innerRef.current
    if (!container || !inner || indices.length === 0) return

    let animationId: number
    let offset = 0
    const halfWidth = inner.scrollWidth / 2
    const speed = 0.4

    function tick() {
      if (!paused) {
        offset -= speed
        if (Math.abs(offset) >= halfWidth) offset = 0
        inner!.style.transform = `translateX(${offset}px)`
      }
      animationId = requestAnimationFrame(tick)
    }

    animationId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationId)
  }, [paused, indices])

  if (indices.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="size-3 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div ref={innerRef} className="flex items-center gap-4 w-max will-change-transform">
        {indices.map((index) => (
          <IndexItem key={`a-${index.name}`} index={index} />
        ))}
        {indices.map((index) => (
          <IndexItem key={`b-${index.name}`} index={index} />
        ))}
      </div>
    </div>
  )
}
const INDEX_SYMBOLS = new Set(["VNINDEX", "VN30", "HNX", "HNX30", "UPCOM", "VN100", "VNMID", "VNSMALL", "VNALL"])

export function MarketBar() {
  const { symbol } = useSymbol()
  const { indices } = useIndices()
  const isIndex = INDEX_SYMBOLS.has(symbol.toUpperCase())
  const { data: stockData } = usePrice(isIndex ? "" : symbol)

  return (
    <div
      id="market-bar"
      className="flex h-8 shrink-0 items-center border-b border-border bg-card/50 px-2 gap-2"
    >
      {/* Current Stock Info */}
      {stockData && (
        <div id="market-bar-stock" className="flex items-center gap-2 shrink-0">
          <StockLogo symbol={stockData.symbol} size={20} />
          <span className="text-xs font-bold text-primary">{stockData.symbol}</span>
          <span className="text-xs font-semibold text-foreground tabular-nums">
            {formatNumber(stockData.closePrice * 1000, 0)}
          </span>
          <span
            className={`text-[10px] font-semibold px-1.5 py-0 rounded tabular-nums ${
              stockData.percentChange > 0
                ? "bg-emerald-500/15 text-emerald-500"
                : stockData.percentChange < 0
                  ? "bg-red-500/15 text-red-500"
                  : "bg-amber-500/15 text-amber-500"
            }`}
          >
            {stockData.percentChange >= 0 ? "+" : ""}{formatNumber(stockData.percentChange)}%
          </span>
        </div>
      )}

      {/* Quick Stats */}
      {stockData && (
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
          <div className="flex items-center gap-1">
            <span>KL:</span>
            <span className="text-foreground font-medium tabular-nums">{formatVolume(stockData.totalVolume)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span>GT:</span>
            <span className="text-foreground font-medium tabular-nums">{formatValue(stockData.totalValue)}</span>
          </div>
          <div className="hidden md:flex items-center gap-1">
            <span>Mở:</span>
            <span className="text-foreground font-medium tabular-nums">{formatNumber(stockData.openPrice * 1000, 0)}</span>
          </div>
          <div className="hidden md:flex items-center gap-1">
            <span>Cao:</span>
            <span className="text-emerald-500 font-medium tabular-nums">{formatNumber(stockData.highestPrice * 1000, 0)}</span>
          </div>
          <div className="hidden md:flex items-center gap-1">
            <span>Thấp:</span>
            <span className="text-red-500 font-medium tabular-nums">{formatNumber(stockData.lowestPrice * 1000, 0)}</span>
          </div>
        </div>
      )}

      <Separator orientation="vertical" className="hidden md:block h-4 mx-1" />

      {/* Market Indices - Auto scrolling ticker */}
      <MarketTicker indices={indices} />
    </div>
  )
}
