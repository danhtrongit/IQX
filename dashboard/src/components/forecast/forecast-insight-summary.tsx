import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import {
  ArrowLeftRight,
  Brain,
  Droplets,
  Newspaper,
  Sparkles,
  TrendingUp,
  Users,
  AlertTriangle,
  ChevronRight,
} from "lucide-react"
import { AIAnalyzingOverlay } from "@/components/patterns/ai-analyzing-overlay"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

type LayerKey = "trend" | "liquidity" | "moneyFlow" | "insider" | "news"

interface InsightLayer {
  label: string
  output: Record<string, unknown> | { text?: string } | null
  status?: string
  score?: number
}

interface InsightSummary {
  trend?: string
  state?: string
  action?: string
  confidence?: number
  reversalProbability?: number
  totalPower?: number
}

interface InsightResponse {
  symbol: string
  layers: Record<string, InsightLayer>
  summary?: InsightSummary
}

const LAYER_ORDER: { key: LayerKey; label: string; icon: typeof TrendingUp; color: string }[] = [
  { key: "trend", label: "Xu hướng", icon: TrendingUp, color: "#3b82f6" },
  { key: "liquidity", label: "Thanh khoản", icon: Droplets, color: "#06b6d4" },
  { key: "moneyFlow", label: "Dòng tiền", icon: ArrowLeftRight, color: "#10b981" },
  { key: "insider", label: "Nội bộ", icon: Users, color: "#f59e0b" },
  { key: "news", label: "Tin tức", icon: Newspaper, color: "#ec4899" },
]

/** Map deterministic layer score (−1..1) to a 3-state pill. */
function pillFromScore(score: number | undefined): {
  label: string
  cls: string
} {
  if (score == null) return { label: "—", cls: "bg-muted/40 text-muted-foreground border-border/40" }
  if (score > 0.15)
    return {
      label: "TÍCH CỰC",
      cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    }
  if (score < -0.15)
    return {
      label: "TIÊU CỰC",
      cls: "bg-red-500/15 text-red-400 border-red-500/30",
    }
  return {
    label: "TRUNG TÍNH",
    cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  }
}

/** Best-effort 1-line description from the layer's structured output. */
function describeLayer(layer: InsightLayer | undefined): string {
  if (!layer) return "—"
  const out = layer.output
  if (!out || typeof out !== "object") return "—"
  // Prefer status field if AI returned one
  if (layer.status) return layer.status
  // Heuristic: first non-empty string value
  for (const v of Object.values(out as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim().length > 0) return v
  }
  return "—"
}

export function ForecastInsightSummary({ symbol }: { symbol: string | null }) {
  const navigate = useNavigate()
  const [insight, setInsight] = useState<InsightResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!symbol) {
      setInsight(null)
      setLoading(false)
      setError(null)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch(`${API_BASE}/ai/insight/${symbol.toUpperCase()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((res) => {
        if (controller.signal.aborted) return
        if (res?.data) {
          setInsight(res.data)
        } else {
          setInsight(null)
          setError(res?.message || "Không có dữ liệu AI Insight")
        }
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        setInsight(null)
        setError("Lỗi kết nối tới AI Insight")
        console.error(e)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [symbol])

  if (!symbol) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6">
        <Sparkles className="size-5 opacity-30 mb-2" />
        <span className="text-xs">Chọn 1 mã để xem phân tích</span>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-4">
        <AIAnalyzingOverlay label={`Đang phân tích ${symbol}`} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6">
        <AlertTriangle className="size-5 mb-2 text-amber-500" />
        <span className="text-xs">{error}</span>
      </div>
    )
  }

  if (!insight) return null

  const summary = insight.summary
  const decisionLayer = insight.layers?.decision
  const decisionDesc = decisionLayer
    ? describeLayer(decisionLayer)
    : (summary?.action ?? "—")

  return (
    <div className="p-3 md:p-4 space-y-3">
      {/* Title */}
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="size-4 text-primary" />
        <h2 className="text-sm font-bold text-foreground">
          TÓM TẮT 5 LỚP DỮ LIỆU
        </h2>
        <button
          onClick={() => navigate(`/co-phieu/${insight.symbol}`)}
          className="ml-auto text-[10px] text-primary hover:underline inline-flex items-center gap-0.5"
        >
          Xem chi tiết
          <ChevronRight className="size-3" />
        </button>
      </div>

      {/* 5 layer cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {LAYER_ORDER.map(({ key, label, icon: Icon, color }, idx) => {
          const layer = insight.layers?.[key]
          const pill = pillFromScore(layer?.score)
          const desc = describeLayer(layer)
          return (
            <button
              key={key}
              onClick={() => navigate(`/co-phieu/${insight.symbol}`)}
              className="text-left rounded-xl border border-border/30 bg-card/40 hover:bg-card/60 transition-colors p-3"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  className="size-6 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${color}15` }}
                >
                  <Icon className="size-3.5" style={{ color }} />
                </div>
                <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                  {idx + 1}.
                </span>
                <span className="text-xs font-bold text-foreground">{label}</span>
                <span
                  className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${pill.cls}`}
                >
                  {pill.label}
                </span>
              </div>
              <p className="text-[11px] text-foreground/80 line-clamp-2 leading-snug">
                {desc}
              </p>
            </button>
          )
        })}
      </div>

      {/* Layer 6 — AI summary */}
      <button
        onClick={() => navigate(`/co-phieu/${insight.symbol}`)}
        className="w-full text-left rounded-xl border-2 border-primary/25 bg-gradient-to-br from-primary/5 via-card/40 to-card/80 hover:from-primary/10 transition-colors p-3"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <div className="size-6 rounded-lg flex items-center justify-center shrink-0 bg-primary/15">
            <Brain className="size-3.5 text-primary" />
          </div>
          <span className="text-[10px] font-bold text-muted-foreground tabular-nums">6.</span>
          <span className="text-xs font-bold text-foreground">AI Tổng hợp</span>
          {summary?.totalPower != null && (
            <span
              className={`ml-auto text-[10px] font-bold tabular-nums ${
                summary.totalPower >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {summary.totalPower > 0 ? "+" : ""}
              {summary.totalPower.toFixed(1)}%
            </span>
          )}
        </div>
        <p className="text-[11px] text-foreground/80 line-clamp-3 leading-snug">{decisionDesc}</p>
        {summary && (
          <div className="flex items-center gap-3 mt-2 text-[9px] text-muted-foreground">
            {summary.confidence != null && (
              <span>
                Tin cậy:{" "}
                <span className="text-emerald-400 font-bold">{summary.confidence.toFixed(1)}%</span>
              </span>
            )}
            {summary.reversalProbability != null && (
              <span>
                Đảo chiều:{" "}
                <span className="text-amber-400 font-bold">
                  {summary.reversalProbability.toFixed(1)}%
                </span>
              </span>
            )}
          </div>
        )}
      </button>
    </div>
  )
}
