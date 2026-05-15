/**
 * "Mô hình dự báo" right-sidebar panel.
 *
 * Reads the AI model leaderboard from `GET /api/v1/ai/forecast/ranking?horizon={3|5|10}`
 * (data lives in the project's MODEL_AI Google Sheet) and renders a ranked
 * table of stocks by expected return for the selected horizon.
 *
 * Behaviour
 * ─────────
 * - Three horizon buttons (T+3 / T+5 / T+10) toggle the ranking.
 * - The leaderboard is sorted by `expectedReturn` desc, with rank #1
 *   highlighted.
 * - Switching horizon shows the AI-Analyzing overlay briefly so the
 *   ranking change feels like a fresh model run.
 * - Click a row to navigate to that stock's detail page.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { ChevronRight, Info, Loader2, Sparkles, AlertTriangle } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StockLogo } from "@/components/stock/stock-logo"
import { api } from "@/lib/api"
import { AIAnalyzingOverlay } from "@/components/patterns/ai-analyzing-overlay"

type Horizon = "3" | "5" | "10"

interface ForecastItem {
  rank: number
  symbol: string
  /** Fractional return (0.04 = +4%). */
  expectedReturn: number
  /** Probability of an upward move (0..1) — may be null if missing. */
  upProbability: number | null
}

interface ForecastResponse {
  horizon: string
  horizonDays: number
  count: number
  items: ForecastItem[]
}

const HORIZONS: { id: Horizon; label: string }[] = [
  { id: "3", label: "T+3" },
  { id: "5", label: "T+5" },
  { id: "10", label: "T+10" },
]

const fmtPct = (v: number | null | undefined, signed = false) => {
  if (v == null || !Number.isFinite(v)) return "—"
  const pct = v * 100
  const sign = signed && pct > 0 ? "+" : ""
  return `${sign}${pct.toFixed(1)}%`
}

const returnColor = (v: number) => (v >= 0 ? "text-emerald-400" : "text-red-400")
const probColor = (v: number | null) => {
  if (v == null) return "text-muted-foreground"
  if (v >= 0.6) return "text-emerald-400"
  if (v >= 0.5) return "text-amber-400"
  return "text-red-400"
}

const RANK_BADGE: Record<number, string> = {
  1: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  2: "bg-slate-400/15 text-slate-300 border-slate-400/30",
  3: "bg-orange-500/15 text-orange-400 border-orange-500/30",
}

export function ForecastPanel() {
  const navigate = useNavigate()
  const [horizon, setHorizon] = useState<Horizon>("5")
  const [items, setItems] = useState<ForecastItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const analyzeTimerRef = useRef<number | null>(null)

  const triggerAnalyzing = (durationMs = 700) => {
    if (analyzeTimerRef.current) window.clearTimeout(analyzeTimerRef.current)
    setAnalyzing(true)
    analyzeTimerRef.current = window.setTimeout(() => {
      setAnalyzing(false)
      analyzeTimerRef.current = null
    }, durationMs)
  }

  useEffect(() => {
    return () => {
      if (analyzeTimerRef.current) window.clearTimeout(analyzeTimerRef.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await api
          .get("ai/forecast/ranking", { searchParams: { horizon, limit: 30 } })
          .json<ForecastResponse>()
        if (!cancelled) setItems(res.items || [])
      } catch (e) {
        if (!cancelled) {
          setItems([])
          setError("Không thể tải bảng xếp hạng mô hình AI")
          // eslint-disable-next-line no-console
          console.error(e)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => {
      cancelled = true
    }
  }, [horizon])

  const handleHorizonChange = (h: Horizon) => {
    if (h === horizon) return
    setHorizon(h)
    triggerAnalyzing(750)
  }

  const top1 = useMemo(() => items[0], [items])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-2.5 py-2 border-b border-border/50 bg-card">
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles className="size-3.5 text-primary" />
          <span className="text-xs font-bold text-foreground">Mô hình dự báo</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            xếp hạng theo Return kỳ vọng
          </span>
        </div>

        {/* Horizon segmented buttons */}
        <div className="grid grid-cols-3 gap-1.5">
          {HORIZONS.map(({ id, label }) => {
            const active = id === horizon
            return (
              <button
                key={id}
                onClick={() => handleHorizonChange(id)}
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
        {loading || analyzing ? (
          <div className="p-3">
            <AIAnalyzingOverlay label={loading ? "Đang chạy mô hình AI" : undefined} />
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
            {/* Column header */}
            <div className="grid grid-cols-[24px_1fr_70px_70px_16px] items-center gap-2 px-2.5 pt-2 pb-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
              <span>#</span>
              <span>Mã cổ phiếu</span>
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
                return (
                  <button
                    key={it.symbol}
                    onClick={() => navigate(`/co-phieu/${it.symbol}`)}
                    className={`group w-full grid grid-cols-[24px_1fr_70px_70px_16px] items-center gap-2 px-2.5 py-3 text-left hover:bg-muted/30 transition-colors ${
                      it.rank === 1 ? "bg-emerald-500/5" : ""
                    }`}
                  >
                    {/* Rank */}
                    <span
                      className={`inline-flex items-center justify-center size-5 rounded-full border text-[10px] font-bold tabular-nums ${rankCls}`}
                    >
                      {it.rank}
                    </span>
                    {/* Symbol */}
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <StockLogo symbol={it.symbol} size={28} />
                      <span className="text-sm font-extrabold text-foreground group-hover:text-primary truncate">
                        {it.symbol}
                      </span>
                    </span>
                    {/* Return */}
                    <span className={`text-right text-xs font-bold tabular-nums ${returnColor(it.expectedReturn)}`}>
                      {fmtPct(it.expectedReturn, true)}
                    </span>
                    {/* Probability */}
                    <span className={`text-right text-xs font-bold tabular-nums ${probColor(it.upProbability)}`}>
                      {fmtPct(it.upProbability)}
                    </span>
                    <ChevronRight className="size-3 text-muted-foreground/50 group-hover:text-muted-foreground" />
                  </button>
                )
              })}
            </div>

            {/* Footer hint */}
            <div className="px-2.5 py-2 text-[9px] text-muted-foreground text-center border-t border-border/30">
              Top {items.length} mã theo khung dự báo
              {top1 ? (
                <>
                  {" · #1 "}
                  <span className="text-foreground font-semibold">{top1.symbol}</span>
                </>
              ) : null}
            </div>
          </>
        )}
      </ScrollArea>
    </div>
  )
}

// Small loader fallback that nginx-served instances can swap in if framer-motion is heavy
export function ForecastPanelFallbackLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="size-4 animate-spin mb-2" />
      <span className="text-[10px]">Đang chạy mô hình...</span>
    </div>
  )
}
