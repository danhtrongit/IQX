import type { ReactNode } from "react"
import { IconExclamationCircle } from "@arco-design/web-react/icon"
import type { InsightLayer } from "../api"
import { useForecastInsight } from "../hooks"
import { netFlowLabel } from "../format"
import { AIAnalyzingOverlay } from "./AIAnalyzingOverlay"
import {
  IconArrowLeftRight,
  IconDroplets,
  IconNewspaper,
  IconShield,
  IconSliders,
  IconSparkles,
  IconTrendingUp,
} from "../icons"

interface LayerSpec {
  key: string
  index: number
  title: string
  icon: typeof IconTrendingUp
  color: string
  iconBg: string
  rows: string[]
  transform?: (value: string) => string
}

const LAYERS: LayerSpec[] = [
  {
    key: "trend",
    index: 1,
    title: "Xu hướng",
    icon: IconTrendingUp,
    color: "#3b82f6",
    iconBg: "bg-blue-500/15",
    rows: ["Xu hướng", "Trạng thái"],
  },
  {
    key: "liquidity",
    index: 2,
    title: "Thanh khoản",
    icon: IconDroplets,
    color: "#06b6d4",
    iconBg: "bg-cyan-500/15",
    rows: ["Cung - Cầu"],
  },
  {
    key: "moneyFlow",
    index: 3,
    title: "Dòng tiền",
    icon: IconArrowLeftRight,
    color: "#10b981",
    iconBg: "bg-emerald-500/15",
    rows: ["Khối ngoại", "Tự doanh"],
    transform: netFlowLabel,
  },
  {
    key: "insider",
    index: 4,
    title: "Nội bộ",
    icon: IconShield,
    color: "#f59e0b",
    iconBg: "bg-amber-500/15",
    rows: ["Mức cảnh báo"],
  },
  {
    key: "news",
    index: 5,
    title: "Tin tức",
    icon: IconNewspaper,
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
    return "text-up"
  if (
    v.includes("giảm") || v.includes("bán") || v.includes("suy yếu") ||
    v.includes("tiêu cực") || v.includes("yếu") || v.includes("áp lực") ||
    v.includes("cảnh báo") || v.includes("kẹt")
  )
    return "text-down"
  if (v.includes("thận trọng") || v.includes("trung tính") || v.includes("ngang"))
    return "text-reference"
  return "text-[var(--color-text-1)]"
}

function readString(output: InsightLayer["output"], key: string): string {
  if (!output) return ""
  const v = output[key]
  if (v == null) return ""
  return String(v)
}

export function ForecastLayerCards({ symbol }: { symbol: string | null }) {
  const { data: insight, isFetching, error } = useForecastInsight(symbol)

  if (!symbol) {
    return (
      <Frame>
        <div className="flex flex-col items-center justify-center py-12 text-[var(--color-text-3)]">
          <IconSparkles className="mb-2 opacity-30" style={{ fontSize: 20 }} />
          <span className="text-xs">Chọn 1 mã để xem phân tích</span>
        </div>
      </Frame>
    )
  }

  if (isFetching && !insight) {
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
        <div className="flex flex-col items-center justify-center py-12 text-[var(--color-text-3)]">
          <IconExclamationCircle className="mb-2 text-[rgb(var(--warning-6))]" style={{ fontSize: 20 }} />
          <span className="px-4 text-center text-xs">
            {error instanceof Error ? error.message : "Lỗi kết nối tới AI Insight"}
          </span>
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

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-3">
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-1)]">
          Tóm tắt 5 lớp dữ liệu
        </span>
        <IconSliders className="text-[var(--color-text-4)]" style={{ fontSize: 12 }} />
      </div>
      {children}
    </div>
  )
}

function LayerCard({ spec, layer }: { spec: LayerSpec; layer: InsightLayer | undefined }) {
  const Icon = spec.icon
  const output = layer?.output ?? null
  const rows = spec.rows
    .map((key) => {
      const raw = readString(output, key)
      return { label: key, value: spec.transform && raw ? spec.transform(raw) : raw }
    })
    .filter((r) => r.value)

  return (
    <div
      className="flex overflow-hidden rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-1)]"
      style={{ borderLeft: `3px solid ${spec.color}` }}
    >
      {/* L# badge column */}
      <div className="flex shrink-0 items-center justify-center px-2">
        <span className="text-[10px] font-black tabular-nums" style={{ color: spec.color }}>
          L{spec.index}
        </span>
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1 py-2 pr-3">
        <div className="mb-1 flex items-center gap-2">
          <div className={`flex size-6 shrink-0 items-center justify-center rounded-md ${spec.iconBg}`}>
            <Icon style={{ color: spec.color, fontSize: 14 }} />
          </div>
          <span className="text-sm font-bold text-[var(--color-text-1)]">{spec.title}</span>
        </div>
        {rows.length > 0 ? (
          <div className="space-y-0.5">
            {rows.map((row) => (
              <div key={row.label} className="flex items-start justify-between gap-3">
                <span className="shrink-0 text-[11px] text-[var(--color-text-3)]">{row.label}</span>
                <span
                  className={`line-clamp-1 text-right text-[11px] font-semibold ${statusValueColor(row.value)}`}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-[10px] italic text-[var(--color-text-3)]">Chưa có dữ liệu</span>
        )}
      </div>
    </div>
  )
}
