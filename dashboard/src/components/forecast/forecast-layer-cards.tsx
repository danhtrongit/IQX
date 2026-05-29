import { useEffect, useState } from "react"
import {
  AlertTriangle,
  ArrowLeftRight,
  Droplets,
  Newspaper,
  Settings2,
  Shield,
  Sparkles,
  TrendingUp,
} from "lucide-react"
import { AIAnalyzingOverlay } from "@/components/patterns/ai-analyzing-overlay"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

// ─── Types ─────────────────────────────────────────────

interface LayerData {
  label: string
  output: Record<string, unknown> | null
  status?: string
  score?: number
}

interface InsightResponse {
  symbol: string
  layers: Record<string, LayerData>
}

interface LayerSpec {
  key: string
  index: number
  title: string
  icon: typeof TrendingUp
  color: string
  iconBg: string
  /** Output keys rendered as label/value rows (in display order). */
  rows: string[]
}

const LAYERS: LayerSpec[] = [
  {
    key: "trend",
    index: 1,
    title: "Xu hướng",
    icon: TrendingUp,
    color: "#3b82f6",
    iconBg: "bg-blue-500/15",
    rows: ["Xu hướng", "Trạng thái"],
  },
  {
    key: "liquidity",
    index: 2,
    title: "Thanh khoản",
    icon: Droplets,
    color: "#06b6d4",
    iconBg: "bg-cyan-500/15",
    rows: ["Cung - Cầu"],
  },
  {
    key: "moneyFlow",
    index: 3,
    title: "Dòng tiền",
    icon: ArrowLeftRight,
    color: "#10b981",
    iconBg: "bg-emerald-500/15",
    rows: ["Khối ngoại", "Tự doanh"],
  },
  {
    key: "insider",
    index: 4,
    title: "Nội bộ",
    icon: Shield,
    color: "#f59e0b",
    iconBg: "bg-amber-500/15",
    rows: ["Nội bộ", "Mức cảnh báo"],
  },
  {
    key: "news",
    index: 5,
    title: "Tin tức",
    icon: Newspaper,
    color: "#ec4899",
    iconBg: "bg-pink-500/15",
    rows: ["Tổng quan", "Tác động"],
  },
]

/** Color a free-form Vietnamese status value (positive/negative/neutral). */
function statusValueColor(value: string): string {
  const v = value.toLowerCase()
  if (
    v.includes("tăng") || v.includes("mua") || v.includes("tích cực") ||
    v.includes("hỗ trợ") || v.includes("thuận lợi") || v.includes("cải thiện") ||
    v.includes("ủng hộ")
  )
    return "text-emerald-400"
  if (
    v.includes("giảm") || v.includes("bán") || v.includes("suy yếu") ||
    v.includes("tiêu cực") || v.includes("yếu") || v.includes("áp lực") ||
    v.includes("cảnh báo") || v.includes("kẹt")
  )
    return "text-red-400"
  if (v.includes("thận trọng") || v.includes("trung tính") || v.includes("ngang"))
    return "text-amber-400"
  return "text-foreground/90"
}

function readString(output: LayerData["output"], key: string): string {
  if (!output) return ""
  const v = (output as Record<string, unknown>)[key]
  if (v == null) return ""
  return String(v)
}

// ─── Main component ────────────────────────────────────

export function ForecastLayerCards({ symbol }: { symbol: string | null }) {
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
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (!r.ok) {
          throw new Error(
            (body?.detail as string) || (body?.message as string) ||
            `AI Insight lỗi (HTTP ${r.status})`,
          )
        }
        return body
      })
      .then((res) => {
        if (controller.signal.aborted) return
        if (res?.data) {
          setInsight(res.data)
        } else {
          setInsight(null)
          setError(res?.message || "Không có dữ liệu AI Insight")
        }
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return
        setInsight(null)
        setError(e instanceof Error ? e.message : "Lỗi kết nối tới AI Insight")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [symbol])

  if (!symbol) {
    return (
      <Frame>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Sparkles className="size-5 opacity-30 mb-2" />
          <span className="text-xs">Chọn 1 mã để xem phân tích</span>
        </div>
      </Frame>
    )
  }

  if (loading) {
    return (
      <Frame>
        <div className="py-6">
          <AIAnalyzingOverlay label={`Đang phân tích ${symbol}`} />
        </div>
      </Frame>
    )
  }

  if (error) {
    return (
      <Frame>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <AlertTriangle className="size-5 mb-2 text-amber-500" />
          <span className="text-xs text-center px-4">{error}</span>
        </div>
      </Frame>
    )
  }

  if (!insight) return null

  return (
    <Frame>
      <div className="space-y-2">
        {LAYERS.map((spec) => (
          <LayerCard key={spec.key} spec={spec} layer={insight.layers?.[spec.key]} />
        ))}
      </div>
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/30 bg-card/30 p-3">
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
          Tóm tắt 5 lớp dữ liệu
        </span>
        <Settings2 className="size-3 text-muted-foreground/60" />
      </div>
      {children}
    </div>
  )
}

function LayerCard({ spec, layer }: { spec: LayerSpec; layer: LayerData | undefined }) {
  const Icon = spec.icon
  const output = layer?.output ?? null
  const rows = spec.rows
    .map((key) => ({ label: key, value: readString(output, key) }))
    .filter((r) => r.value)

  return (
    <div
      className="flex rounded-lg border border-border/30 bg-background/40 overflow-hidden"
      style={{ borderLeft: `3px solid ${spec.color}` }}
    >
      {/* L# badge column */}
      <div className="flex items-center justify-center px-2 shrink-0">
        <span
          className="text-[10px] font-black tabular-nums"
          style={{ color: spec.color }}
        >
          L{spec.index}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 py-2 pr-3">
        <div className="flex items-center gap-2 mb-1">
          <div className={`size-6 rounded-md flex items-center justify-center shrink-0 ${spec.iconBg}`}>
            <Icon className="size-3.5" style={{ color: spec.color }} />
          </div>
          <span className="text-sm font-bold text-foreground">{spec.title}</span>
        </div>
        {rows.length > 0 ? (
          <div className="space-y-0.5">
            {rows.map((row) => (
              <div key={row.label} className="flex items-start justify-between gap-3">
                <span className="text-[11px] text-muted-foreground shrink-0">{row.label}</span>
                <span
                  className={`text-[11px] font-semibold text-right line-clamp-1 ${statusValueColor(row.value)}`}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground italic">Chưa có dữ liệu</span>
        )}
      </div>
    </div>
  )
}
