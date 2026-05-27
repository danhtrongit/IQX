import { AlertTriangle, ChevronRight, Info, Sparkles } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StockLogo } from "@/components/stock/stock-logo"
import { AIAnalyzingOverlay } from "@/components/patterns/ai-analyzing-overlay"
import type {
  ForecastHorizon,
  ForecastItem,
} from "@/hooks/use-forecast-ranking"

const HORIZONS: { id: ForecastHorizon; label: string }[] = [
  { id: "3", label: "T+3" },
  { id: "5", label: "T+5" },
  { id: "10", label: "T+10" },
]

const RANK_BADGE: Record<number, string> = {
  1: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  2: "bg-slate-400/15 text-slate-300 border-slate-400/30",
  3: "bg-orange-500/15 text-orange-400 border-orange-500/30",
}

function fmtPct(v: number | null | undefined, signed = false): string {
  if (v == null || !Number.isFinite(v)) return "—"
  const pct = v * 100
  const sign = signed && pct > 0 ? "+" : ""
  return `${sign}${pct.toFixed(1)}%`
}

function returnColor(v: number): string {
  return v >= 0 ? "text-emerald-400" : "text-red-400"
}

function probColor(v: number | null): string {
  if (v == null) return "text-muted-foreground"
  if (v >= 0.6) return "text-emerald-400"
  if (v >= 0.5) return "text-amber-400"
  return "text-red-400"
}

export function ForecastRankingList({
  horizon,
  onHorizonChange,
  items,
  loading,
  error,
  selectedSymbol,
  onSelect,
}: {
  horizon: ForecastHorizon
  onHorizonChange: (h: ForecastHorizon) => void
  items: ForecastItem[]
  loading: boolean
  error: string | null
  selectedSymbol: string | null
  onSelect: (symbol: string) => void
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Header — title + horizon selector */}
      <div className="px-2.5 py-2 border-b border-border/50 bg-card shrink-0">
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles className="size-3.5 text-primary" />
          <span className="text-xs font-bold text-foreground">Mô hình dự báo</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            xếp hạng theo Return kỳ vọng
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {HORIZONS.map(({ id, label }) => {
            const active = id === horizon
            return (
              <button
                key={id}
                onClick={() => onHorizonChange(id)}
                className={`h-8 rounded-md text-xs font-bold transition-colors border ${
                  active
                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/40 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]"
                    : "bg-muted/30 text-muted-foreground border-border/40 hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {label}
              </button>
            )
          })}
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
            <span className="text-[10px]">{error}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Sparkles className="size-4 mb-2 opacity-30" />
            <span className="text-[10px]">Chưa có dữ liệu mô hình</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[24px_1fr_60px_60px_16px] items-center gap-2 px-2.5 pt-2 pb-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
              <span>#</span>
              <span>Mã</span>
              <span className="text-right inline-flex items-center justify-end gap-0.5">
                Return
                <Info className="size-2.5 opacity-60" />
              </span>
              <span className="text-right inline-flex items-center justify-end gap-0.5">
                Xác suất
                <Info className="size-2.5 opacity-60" />
              </span>
              <span />
            </div>

            <div className="divide-y divide-border/15">
              {items.map((it) => {
                const rankCls =
                  RANK_BADGE[it.rank] ?? "bg-muted/40 text-muted-foreground border-border/40"
                const isSelected = selectedSymbol === it.symbol
                return (
                  <button
                    key={it.symbol}
                    onClick={() => onSelect(it.symbol)}
                    className={`group w-full grid grid-cols-[24px_1fr_60px_60px_16px] items-center gap-2 px-2.5 py-3 text-left transition-colors ${
                      isSelected
                        ? "bg-primary/10"
                        : it.rank === 1
                          ? "bg-emerald-500/5 hover:bg-muted/30"
                          : "hover:bg-muted/30"
                    }`}
                  >
                    <span
                      className={`inline-flex items-center justify-center size-5 rounded-full border text-[10px] font-bold tabular-nums ${rankCls}`}
                    >
                      {it.rank}
                    </span>
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <StockLogo symbol={it.symbol} size={26} />
                      <span
                        className={`text-sm font-extrabold truncate ${
                          isSelected ? "text-primary" : "text-foreground group-hover:text-primary"
                        }`}
                      >
                        {it.symbol}
                      </span>
                    </span>
                    <span className={`text-right text-xs font-bold tabular-nums ${returnColor(it.expectedReturn)}`}>
                      {fmtPct(it.expectedReturn, true)}
                    </span>
                    <span className={`text-right text-xs font-bold tabular-nums ${probColor(it.upProbability)}`}>
                      {fmtPct(it.upProbability)}
                    </span>
                    <ChevronRight
                      className={`size-3 ${
                        isSelected
                          ? "text-primary"
                          : "text-muted-foreground/50 group-hover:text-muted-foreground"
                      }`}
                    />
                  </button>
                )
              })}
            </div>
          </>
        )}
      </ScrollArea>
    </div>
  )
}
