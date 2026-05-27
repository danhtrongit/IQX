import { useEffect, useState } from "react"
import {
  AlertTriangle,
  ArrowLeftRight,
  Droplets,
  Newspaper,
  Sparkles,
  TrendingUp,
  Users,
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
  key: keyof InsightResponse["layers"] | string
  index: number
  title: string
  icon: typeof TrendingUp
  iconColor: string
  iconBg: string
  /** Which output keys to render as label/value rows (in display order). */
  rows: string[]
  /** Output key to use for the status pill in the card header. */
  statusKey?: string
}

const LAYERS: LayerSpec[] = [
  {
    key: "trend",
    index: 1,
    title: "XU HƯỚNG",
    icon: TrendingUp,
    iconColor: "#f87171",
    iconBg: "bg-red-500/15",
    rows: ["Xu hướng", "Trạng thái"],
  },
  {
    key: "liquidity",
    index: 2,
    title: "THANH KHOẢN",
    icon: Droplets,
    iconColor: "#06b6d4",
    iconBg: "bg-cyan-500/15",
    statusKey: "Thanh khoản",
    rows: ["Cung - Cầu"],
  },
  {
    key: "moneyFlow",
    index: 3,
    title: "DÒNG TIỀN",
    icon: ArrowLeftRight,
    iconColor: "#10b981",
    iconBg: "bg-emerald-500/15",
    rows: ["Khối ngoại", "Tự doanh"],
  },
  {
    key: "insider",
    index: 4,
    title: "NỘI BỘ",
    icon: Users,
    iconColor: "#f59e0b",
    iconBg: "bg-amber-500/15",
    rows: ["Mức cảnh báo"],
  },
  {
    key: "news",
    index: 5,
    title: "TIN TỨC",
    icon: Newspaper,
    iconColor: "#ec4899",
    iconBg: "bg-pink-500/15",
    rows: ["Tác động"],
  },
]

/** Color a free-form Vietnamese status value (positive/negative/neutral). */
function statusValueColor(value: string): string {
  const v = value.toLowerCase()
  if (
    v.includes("tăng") || v.includes("mua") || v.includes("tích cực") ||
    v.includes("hỗ trợ") || v.includes("thuận lợi") || v.includes("cải thiện")
  )
    return "text-emerald-400"
  if (
    v.includes("giảm") || v.includes("bán") || v.includes("suy yếu") ||
    v.includes("tiêu cực") || v.includes("yếu") || v.includes("áp lực")
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
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
        <Sparkles className="size-3 text-muted-foreground/60" />
      </div>
      {children}
    </div>
  )
}

function LayerCard({ spec, layer }: { spec: LayerSpec; layer: LayerData | undefined }) {
  const Icon = spec.icon
  const output = layer?.output ?? null
  const status = spec.statusKey ? readString(output, spec.statusKey) : ""

  return (
    <div className="rounded-lg border border-border/30 bg-background/40 p-2.5">
      <div className="flex items-center gap-2 mb-2">
        <div className={`size-7 rounded-md flex items-center justify-center shrink-0 ${spec.iconBg}`}>
          <Icon className="size-3.5" style={{ color: spec.iconColor }} />
        </div>
        <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
          {spec.index}.
        </span>
        <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">
          {spec.title}
        </span>
        {status && (
          <span className={`ml-auto text-[10px] font-semibold ${statusValueColor(status)}`}>
            {status}
          </span>
        )}
      </div>
      <div className="space-y-1">
        {spec.rows.map((rowKey) => {
          const value = readString(output, rowKey)
          if (!value) return null
          return (
            <div key={rowKey} className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground shrink-0">{rowKey}</span>
              <span className={`text-[11px] font-semibold text-right truncate ${statusValueColor(value)}`}>
                {value}
              </span>
            </div>
          )
        })}
        {!output && (
          <span className="text-[10px] text-muted-foreground italic">Chưa có dữ liệu</span>
        )}
      </div>
    </div>
  )
}
