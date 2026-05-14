import { useEffect, useMemo, useState } from "react"
import {
  Sparkles,
  ChevronDown,
  Loader2,
  CheckCircle2,
  Info,
  AlertTriangle,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSymbol } from "@/contexts/symbol-context"
import { api } from "@/lib/api"

type PatternKind = "candles" | "charts"

type Signal = "bullish" | "bearish" | "neutral"

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
  kind: PatternKind
  items: PatternItem[]
  count: number
}

const KIND_LABEL: Record<PatternKind, string> = {
  candles: "AI Mẫu nến",
  charts: "AI Mẫu hình giá",
}

const SIGNAL_TEXT: Record<Signal, string> = {
  bullish: "Bullish",
  bearish: "Bearish",
  neutral: "Trung tính",
}

const SIGNAL_CLS: Record<Signal, string> = {
  bullish: "text-emerald-400",
  bearish: "text-red-400",
  neutral: "text-amber-400",
}

// "Trung bình" / "Cao" / "Thấp" for candles, breakout state for charts.
function stateColor(kind: PatternKind, state: string | null): string {
  if (!state) return "text-muted-foreground"
  const s = state.toLowerCase()
  if (kind === "candles") {
    if (s.includes("cao")) return "text-emerald-400"
    if (s.includes("thấp")) return "text-amber-400"
    return "text-amber-300"
  }
  // charts
  if (s.includes("breakout") && !s.includes("fail")) return "text-emerald-400"
  if (s.includes("fail")) return "text-red-400"
  if (s.includes("sẵn sàng")) return "text-cyan-400"
  return "text-amber-300"
}

export function AIPatternPanel() {
  const { symbol } = useSymbol()
  const [kind, setKind] = useState<PatternKind>("candles")
  const [items, setItems] = useState<PatternItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [detailsOpen, setDetailsOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchData = async () => {
      if (!symbol) return
      setLoading(true)
      setError(null)
      setActiveIdx(0)
      try {
        const res = await api
          .get(`ai/patterns/${kind}`, { searchParams: { symbol } })
          .json<PatternResponse>()
        if (!cancelled) setItems(res.items || [])
      } catch (e) {
        if (!cancelled) {
          setItems([])
          setError("Không thể tải dữ liệu pattern")
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
  }, [symbol, kind])

  const active = useMemo(
    () => (items.length > 0 ? items[Math.min(activeIdx, items.length - 1)] : null),
    [items, activeIdx],
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header — kind selector */}
      <div className="flex items-center gap-2 px-2.5 py-2 border-b border-border/50 bg-card">
        <Sparkles className="size-3.5 text-primary shrink-0" />
        <Select value={kind} onValueChange={(v) => setKind(v as PatternKind)}>
          <SelectTrigger className="h-7 w-full text-xs border-transparent bg-transparent px-1.5 hover:bg-muted/40 focus:ring-0 [&>svg]:opacity-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" className="min-w-[180px]">
            <SelectItem value="candles" className="text-xs">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="size-3 text-primary" />
                AI Mẫu nến
              </span>
            </SelectItem>
            <SelectItem value="charts" className="text-xs">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="size-3 text-primary" />
                AI Mẫu hình giá
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {symbol}
        </span>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="size-4 animate-spin mb-2" />
              <span className="text-[10px]">Đang phân tích {KIND_LABEL[kind]}...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <AlertTriangle className="size-4 mb-2 text-amber-500" />
              <span className="text-[10px]">{error}</span>
            </div>
          ) : !active ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Sparkles className="size-4 mb-2 opacity-30" />
              <span className="text-[10px]">Chưa có pattern cho {symbol}</span>
            </div>
          ) : (
            <>
              {/* Hero header — pattern name + signal/state badges */}
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-2xl font-extrabold text-foreground leading-tight tracking-tight">
                  {active.name}
                </h2>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <div className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/10">
                    <span className="text-muted-foreground">Tín hiệu:</span>
                    <span className={`font-bold ${SIGNAL_CLS[active.signal]}`}>
                      {SIGNAL_TEXT[active.signal]}
                    </span>
                  </div>
                  {active.state && (
                    <div className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-md border border-amber-500/30 bg-amber-500/10">
                      <span className="text-muted-foreground">
                        {kind === "candles" ? "Mức độ:" : "Trạng thái:"}
                      </span>
                      <span className={`font-bold ${stateColor(kind, active.state)}`}>
                        {active.state}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Illustration */}
              <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-2">
                  <span>
                    {kind === "candles" ? `Minh họa nến ${active.name}` : "Minh họa mô hình giá"}
                  </span>
                  <Info className="size-3 opacity-60" />
                </div>
                {active.illustration ? (
                  <div className="aspect-[4/3] w-full flex items-center justify-center">
                    <img
                      src={active.illustration}
                      alt={active.name}
                      className="max-h-full max-w-full object-contain"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="aspect-[4/3] w-full flex items-center justify-center text-[10px] text-muted-foreground">
                    Chưa có hình minh họa
                  </div>
                )}
              </div>

              {/* Meaning card */}
              {active.meaning && (
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                    <Info className="size-3.5 text-primary" />
                    <span>Ý nghĩa</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {active.meaning}
                  </p>
                </div>
              )}

              {/* Action card */}
              {active.action && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                    <CheckCircle2 className="size-3.5" />
                    <span>Hành động đề xuất</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {active.action}
                  </p>
                </div>
              )}

              {/* Detail accordion — list of all patterns when there are multiple */}
              <button
                onClick={() => setDetailsOpen((s) => !s)}
                className="w-full rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5 flex items-center justify-between hover:bg-muted/20 transition-colors"
              >
                <span className="text-[11px] font-bold text-foreground inline-flex items-center gap-1.5">
                  <Info className="size-3.5 text-primary" />
                  Chi tiết nhận diện
                  {items.length > 1 && (
                    <span className="text-[9px] text-muted-foreground font-normal">
                      ({items.length} pattern)
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={`size-3.5 text-muted-foreground transition-transform ${detailsOpen ? "rotate-180" : ""}`}
                />
              </button>
              {detailsOpen && items.length > 0 && (
                <div className="space-y-1">
                  {items.map((p, idx) => {
                    const isActive = idx === activeIdx
                    return (
                      <button
                        key={`${p.name}-${idx}`}
                        onClick={() => setActiveIdx(idx)}
                        className={`w-full text-left rounded-md border px-2.5 py-1.5 transition-colors ${
                          isActive
                            ? "border-primary/50 bg-primary/10"
                            : "border-border/40 bg-muted/5 hover:bg-muted/20"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-foreground truncate">
                            {p.name}
                          </span>
                          <span className={`text-[9px] font-bold shrink-0 ${SIGNAL_CLS[p.signal]}`}>
                            {SIGNAL_TEXT[p.signal]}
                          </span>
                        </div>
                        {p.state && (
                          <span className={`text-[9px] ${stateColor(kind, p.state)}`}>
                            {p.state}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
