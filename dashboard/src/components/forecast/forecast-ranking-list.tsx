import { useMemo, useState } from "react"
import { AlertTriangle, ChevronDown, Sparkles, Star } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StockLogo } from "@/components/stock/stock-logo"
import { AIAnalyzingOverlay } from "@/components/patterns/ai-analyzing-overlay"
import { usePrices } from "@/contexts/market-data-context"
import { useWatchlist } from "@/hooks/use-watchlist"
import type { ForecastItem } from "@/hooks/use-forecast-ranking"

const PAGE_SIZE = 5

type SortMode = "return" | "probability"

const SORT_LABELS: Record<SortMode, string> = {
  return: "Lợi nhuận dự kiến",
  probability: "Xác suất tăng",
}

function fmtPct(v: number | null | undefined, signed = false): string {
  if (v == null || !Number.isFinite(v)) return "—"
  const pct = v * 100
  const sign = signed && pct > 0 ? "+" : ""
  return `${sign}${pct.toFixed(1)}%`
}

/** Returns a stable accent color for the rounded logo badge by symbol. */
function logoTint(symbol: string): { bg: string; ring: string } {
  const palettes = [
    { bg: "rgba(56,189,248,0.18)", ring: "rgba(56,189,248,0.55)" }, // cyan
    { bg: "rgba(248,113,113,0.18)", ring: "rgba(248,113,113,0.55)" }, // red
    { bg: "rgba(168,85,247,0.18)", ring: "rgba(168,85,247,0.55)" }, // purple
    { bg: "rgba(245,158,11,0.18)", ring: "rgba(245,158,11,0.55)" }, // amber
    { bg: "rgba(16,185,129,0.18)", ring: "rgba(16,185,129,0.55)" }, // emerald
  ]
  let hash = 0
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0
  return palettes[hash % palettes.length]
}

export function ForecastRankingList({
  items,
  loading,
  error,
  selectedSymbol,
  onSelect,
}: {
  items: ForecastItem[]
  loading: boolean
  error: string | null
  selectedSymbol: string | null
  onSelect: (symbol: string) => void
}) {
  const [sortMode, setSortMode] = useState<SortMode>("return")
  const [sortOpen, setSortOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const { isSymbolWatched, toggleSymbol, isUnavailable: watchlistUnavailable } = useWatchlist()

  // Live prices for the visible symbols (subscribes via context).
  const symbols = useMemo(() => items.map((it) => it.symbol), [items])
  const { priceMap } = usePrices(symbols)

  const sorted = useMemo(() => {
    const copy = [...items]
    if (sortMode === "probability") {
      copy.sort((a, b) => (b.upProbability ?? 0) - (a.upProbability ?? 0))
    } else {
      copy.sort((a, b) => b.expectedReturn - a.expectedReturn)
    }
    return copy
  }, [items, sortMode])

  const visible = showAll ? sorted : sorted.slice(0, PAGE_SIZE)

  return (
    <div className="flex flex-col h-full">
      {/* Header — title + sort dropdown */}
      <div className="px-3 py-2.5 border-b border-border/40 bg-card/40 shrink-0 flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
          Mã đề xuất
        </span>
        <Sparkles className="size-3 text-muted-foreground/60" />
        <div className="ml-auto relative">
          <button
            onClick={() => setSortOpen((s) => !s)}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            Sắp xếp
            <ChevronDown className={`size-3 transition-transform ${sortOpen ? "rotate-180" : ""}`} />
          </button>
          {sortOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 rounded-md border border-border/60 bg-popover shadow-xl py-1 w-40">
              {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setSortMode(m)
                    setSortOpen(false)
                  }}
                  className={`block w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-muted/50 ${
                    sortMode === m ? "text-primary font-semibold" : "text-foreground/80"
                  }`}
                >
                  {SORT_LABELS[m]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        {loading ? (
          <div className="p-3">
            <AIAnalyzingOverlay label="Đang chạy mô hình AI" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <AlertTriangle className="size-4 mb-2 text-amber-500" />
            <span className="text-[10px] text-center px-4">{error}</span>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Sparkles className="size-4 mb-2 opacity-30" />
            <span className="text-[10px]">Chưa có dữ liệu mô hình</span>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {visible.map((it) => {
              const isSelected = selectedSymbol === it.symbol
              const price = priceMap[it.symbol]?.closePrice ?? priceMap[it.symbol]?.referencePrice
              const tint = logoTint(it.symbol)
              const watched = isSymbolWatched(it.symbol)
              return (
                <div
                  key={it.symbol}
                  onClick={() => onSelect(it.symbol)}
                  className={`relative rounded-xl border bg-card/40 hover:bg-card/70 cursor-pointer transition-colors ${
                    isSelected
                      ? "border-primary/60 ring-1 ring-primary/30"
                      : "border-border/30"
                  }`}
                >
                  <div className="flex items-start gap-3 p-3">
                    {/* Logo badge */}
                    <div
                      className="size-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                      style={{ backgroundColor: tint.bg, boxShadow: `inset 0 0 0 1px ${tint.ring}` }}
                    >
                      <StockLogo symbol={it.symbol} size={36} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-extrabold text-foreground">{it.symbol}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <div>
                          <p className="text-[9px] text-muted-foreground">Giá dự phóng</p>
                          <p className="text-sm font-bold tabular-nums text-foreground">
                            {price != null && price > 0 ? price.toFixed(2) : "—"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] text-muted-foreground">Lợi nhuận dự kiến</p>
                          <p
                            className={`text-sm font-bold tabular-nums ${
                              it.expectedReturn >= 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {fmtPct(it.expectedReturn, true)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Watchlist star */}
                    {!watchlistUnavailable && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleSymbol(it.symbol)
                        }}
                        className="shrink-0 p-1 -m-1 text-muted-foreground hover:text-amber-400 transition-colors"
                        aria-label={watched ? "Bỏ theo dõi" : "Theo dõi"}
                      >
                        <Star
                          className={`size-4 ${watched ? "fill-amber-400 text-amber-400" : ""}`}
                        />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Show-more / show-less */}
            {sorted.length > PAGE_SIZE && (
              <button
                onClick={() => setShowAll((s) => !s)}
                className="w-full mt-1 py-2 text-[11px] font-semibold text-primary hover:bg-primary/5 rounded-md inline-flex items-center justify-center gap-1"
              >
                {showAll ? "Thu gọn" : `Xem thêm mã đề xuất`}
                <ChevronDown
                  className={`size-3 transition-transform ${showAll ? "rotate-180" : ""}`}
                />
              </button>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
