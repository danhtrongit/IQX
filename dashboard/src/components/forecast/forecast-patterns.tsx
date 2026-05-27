import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react"
import {
  CandlePatternIllustration,
  ChartPatternIllustration,
} from "@/components/patterns/pattern-illustration"
import { api } from "@/lib/api"

type Signal = "bullish" | "bearish" | "neutral"
type Kind = "candles" | "charts"

interface PatternItem {
  symbol: string
  name: string
  signal: Signal
  signalLabel: string | null
  state: string | null
  meaning: string | null
  action: string | null
  illustration: string | null
}

interface PatternResponse {
  symbol: string
  kind: Kind
  items: PatternItem[]
  count: number
}

const SIGNAL_LABEL: Record<Signal, string> = {
  bullish: "Bullish",
  bearish: "Bearish",
  neutral: "Trung tính",
}

const SIGNAL_PILL: Record<Signal, string> = {
  bullish: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  bearish: "bg-red-500/15 text-red-400 border-red-500/40",
  neutral: "bg-amber-500/15 text-amber-400 border-amber-500/40",
}

function stateColor(kind: Kind, state: string | null): string {
  if (!state) return "bg-muted/40 text-muted-foreground border-border/40"
  const s = state.toLowerCase()
  if (kind === "candles") {
    if (s.includes("cao") || s.includes("mạnh"))
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
    if (s.includes("thấp") || s.includes("yếu"))
      return "bg-red-500/15 text-red-400 border-red-500/40"
    return "bg-amber-500/15 text-amber-400 border-amber-500/40"
  }
  if (s.includes("breakout") && !s.includes("fail"))
    return "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
  if (s.includes("fail"))
    return "bg-red-500/15 text-red-400 border-red-500/40"
  return "bg-amber-500/15 text-amber-400 border-amber-500/40"
}

export function ForecastPatterns({ symbol }: { symbol: string | null }) {
  const [candles, setCandles] = useState<PatternItem | null>(null)
  const [charts, setCharts] = useState<PatternItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!symbol) {
      setCandles(null)
      setCharts(null)
      setLoading(false)
      setError(null)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setCandles(null)
    setCharts(null)

    Promise.all([
      api
        .get("ai/patterns/candles", { searchParams: { symbol }, signal: controller.signal })
        .json<PatternResponse>()
        .catch(() => null),
      api
        .get("ai/patterns/charts", { searchParams: { symbol }, signal: controller.signal })
        .json<PatternResponse>()
        .catch(() => null),
    ])
      .then(([candlesRes, chartsRes]) => {
        if (controller.signal.aborted) return
        setCandles(candlesRes?.items?.[0] ?? null)
        setCharts(chartsRes?.items?.[0] ?? null)
        if (!candlesRes?.items?.length && !chartsRes?.items?.length) {
          setError(`Chưa có pattern cho ${symbol}`)
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setError("Lỗi tải pattern")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [symbol])

  if (!symbol) return null

  if (loading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/30 p-3 text-[11px] text-muted-foreground text-center py-6">
        Đang phân tích mẫu hình...
      </div>
    )
  }

  if (error && !candles && !charts) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/30 p-3 text-[11px] text-muted-foreground py-6 inline-flex items-center justify-center gap-1 w-full">
        <AlertTriangle className="size-3 text-amber-500" />
        {error}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {candles && <PatternCard kind="candles" item={candles} kindLabel="AI Mẫu nến" />}
      {charts && <PatternCard kind="charts" item={charts} kindLabel="AI Mẫu giá" />}
    </div>
  )
}

function PatternCard({
  kind,
  item,
  kindLabel,
}: {
  kind: Kind
  item: PatternItem
  kindLabel: string
}) {
  return (
    <div className="rounded-xl border border-border/30 bg-card/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/15">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {kindLabel}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${SIGNAL_PILL[item.signal]}`}
          >
            Tín hiệu: {SIGNAL_LABEL[item.signal]}
          </span>
          {item.state && (
            <span
              className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${stateColor(kind, item.state)}`}
            >
              Mức độ: {item.state}
            </span>
          )}
        </div>
      </div>
      <div className="p-3 flex gap-3">
        {/* Illustration */}
        <div className="shrink-0 flex flex-col items-center gap-1">
          <h4 className="text-base font-extrabold text-foreground leading-none">{item.name}</h4>
          <div className="w-[160px] h-[120px] rounded-md border border-border/40 bg-muted/10 p-1">
            {kind === "candles" ? (
              <CandlePatternIllustration name={item.name} signal={item.signal} />
            ) : (
              <ChartPatternIllustration name={item.name} />
            )}
          </div>
          <p className="text-[9px] text-muted-foreground italic">
            {kind === "candles" ? "Nến lớn bao trùm nến nhỏ" : "Cốc + tay cầm"}
          </p>
        </div>

        {/* Side info */}
        <div className="flex-1 min-w-0 space-y-2">
          {item.meaning && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5">
              <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 mb-0.5">
                <CheckCircle2 className="size-3" />
                Ý nghĩa
              </div>
              <p className="text-[10px] text-foreground/80 leading-snug">{item.meaning}</p>
            </div>
          )}
          {item.action && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5">
              <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary mb-0.5">
                <TrendingUp className="size-3" />
                Hành động đề xuất
              </div>
              <p className="text-[10px] text-foreground/80 leading-snug">{item.action}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
