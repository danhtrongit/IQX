import { useState, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  TrendingUp,
  Droplets,
  ArrowLeftRight,
  Users,
	  Newspaper,
	  Brain,
	  TrendingDown,
	  CheckCircle2,
	  AlertTriangle,
	  AlertCircle,
	  Target,
	  MinusCircle,
	  X,
	  Database,
	  Sparkles,
  Clock,
  ChevronDown,
  Table,
	} from "lucide-react"
	import { ScrollArea } from "@/components/ui/scroll-area"
	import {
	  formatSupportResistance,
	  getLayerSummary as buildLayerSummary,
	} from "./stock-ai-insight-utils"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

// ── Layer config ──

const LAYERS_ORDER = ["trend", "liquidity", "moneyFlow", "insider", "news"] as const

const LAYER_CONFIG: Record<string, {
  label: string
  shortLabel: string
  icon: typeof TrendingUp
  color: string
  description: string
}> = {
  trend: {
    label: "Xu hướng",
    shortLabel: "L1",
    icon: TrendingUp,
    color: "#3b82f6",
    description: "MA, hỗ trợ/kháng cự",
  },
  liquidity: {
    label: "Thanh khoản",
    shortLabel: "L2",
    icon: Droplets,
    color: "#06b6d4",
    description: "Cung cầu, áp lực vào/ra",
  },
  moneyFlow: {
    label: "Dòng tiền",
    shortLabel: "L3",
    icon: ArrowLeftRight,
    color: "#10b981",
    description: "Nước ngoài, tự doanh",
  },
  insider: {
    label: "Nội bộ",
    shortLabel: "L4",
    icon: Users,
    color: "#f59e0b",
    description: "GD cổ đông, ban lãnh đạo",
  },
  news: {
    label: "Tin tức",
    shortLabel: "L5",
    icon: Newspaper,
    color: "#ec4899",
    description: "AI sentiment, điểm tin",
  },
}

interface InsightResponse {
  symbol: string
  timestamp: string
  layers: Record<string, { label: string; output: any }>
  rawInput: {
    trend: { realtime: any; ohlcv: any[]; computed: { ma10: number; ma20: number; volMa10: number; volMa20: number; latestClose: number } }
    liquidity: { latest: any; avg30: any; history: any[] }
    moneyFlow: { foreign: any[]; proprietary: any[] }
    insider: { transactions: any[] }
    news: { items: any[]; tickerScore: any }
  }
  dataSummary: Record<string, any>
  summary?: {
    trend: string
    state: string
    action: string
    confidence: number
    reversalProbability: number
  }
}

// ── Utility ──

function fmtNum(n: number): string {
  if (n == null) return "—"
  const abs = Math.abs(n)
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B"
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M"
  if (abs >= 1e3) return (n / 1e3).toFixed(0) + "K"
  return n.toLocaleString("vi-VN")
}

const DECISION_OUTPUT_ROWS: Array<{ key: string; icon: typeof Sparkles; color: string }> = [
  { key: "Tổng quan", icon: Sparkles, color: "text-blue-400" },
  { key: "Thanh khoản", icon: Droplets, color: "text-cyan-400" },
  { key: "Dòng tiền", icon: ArrowLeftRight, color: "text-emerald-400" },
  { key: "Giao dịch nội bộ", icon: Users, color: "text-amber-400" },
  { key: "Tin tức", icon: Newspaper, color: "text-pink-400" },
  { key: "Hành động chính", icon: CheckCircle2, color: "text-emerald-400" },
  { key: "Kịch bản thuận lợi", icon: TrendingUp, color: "text-emerald-400" },
  { key: "Kịch bản bất lợi", icon: TrendingDown, color: "text-red-400" },
  { key: "Kịch bản đi ngang", icon: MinusCircle, color: "text-amber-400" },
]

function DecisionOutput({ output }: { output: Record<string, any> }) {
  const rendered = new Set<string>()
  const rows = DECISION_OUTPUT_ROWS
    .filter((row) => output[row.key])
    .map((row) => {
      rendered.add(row.key)
      return row
    })

  const extraRows = Object.keys(output)
    .filter((key) => !rendered.has(key) && output[key] != null && output[key] !== "")
    .map((key) => ({ key, icon: Target, color: "text-primary" }))

  return (
    <div className="space-y-2">
      {[...rows, ...extraRows].map(({ key, icon: Icon, color }) => (
        <div key={key} className="grid grid-cols-[16px_104px_minmax(0,1fr)] items-start gap-x-2">
          <Icon className={`mt-[2px] size-3.5 ${color}`} />
          <span className="text-[10px] font-semibold text-muted-foreground leading-relaxed">{key}:</span>
          <span className="text-[11px] text-foreground/90 leading-relaxed">{String(output[key])}</span>
        </div>
      ))}
    </div>
  )
}

function renderOutput(output: any, layerKey?: string): React.ReactNode {
  if (!output) return null
  if (typeof output === "string") return <span>{output}</span>
  if (output.error) return <span className="text-red-400 text-[10px]"><AlertTriangle className="inline size-3 mr-1" />{output.error}</span>
  if (output.text) return <span className="whitespace-pre-wrap">{output.text}</span>
  if (layerKey === "decision") return <DecisionOutput output={output} />

  // Structured JSON output → render key-value (keys are Vietnamese)
  return (
    <div className="space-y-1">
      {Object.entries(output).map(([key, val]) => {
        if ((key === "items" || key === "Tin tức") && Array.isArray(val)) {
          return (
            <div key={key} className="space-y-0.5">
              <span className="text-[10px] text-muted-foreground font-semibold">{key}:</span>
              {(val as string[]).map((item, i) => (
                <div key={i} className="text-[11px] text-foreground/80 pl-2 border-l-2 border-border/20">
                  {item}
                </div>
              ))}
            </div>
          )
	        }
	        const value = key === "Hỗ trợ" || key === "Kháng cự"
	          ? formatSupportResistance(val)
	          : String(val)
	        const valueColor = key === "Hỗ trợ"
	          ? "text-emerald-400"
	          : key === "Kháng cự"
	            ? "text-red-400"
	            : "text-foreground/90"
	        return (
	          <div key={key} className="flex gap-2">
	            <span className="text-[10px] text-muted-foreground shrink-0 min-w-[80px] font-semibold">
	              {key}:
	            </span>
	            <span className={`text-[11px] ${valueColor}`}>{value}</span>
	          </div>
	        )
      })}
    </div>
  )
}

// ── Custom Nodes ──

function getValueColor(value: string): string {
  const v = value.toLowerCase()
  if (v.includes("tăng") || v.includes("mua") || v.includes("cải thiện") || v.includes("tích cực") || v.includes("hỗ trợ") || v.includes("thuận lợi")) return "text-emerald-400"
  if (v.includes("giảm") || v.includes("bán") || v.includes("suy yếu") || v.includes("tiêu cực") || v.includes("áp lực") || v.includes("thận trọng")) return "text-red-400"
  if (v.includes("ngang") || v.includes("giằng co") || v.includes("thất thường") || v.includes("trái chiều") || v.includes("trung tính") || v.includes("lẫn lộn")) return "text-amber-400"
  if (v.includes("mạnh")) return "text-blue-400"
  if (v.includes("yếu")) return "text-slate-400"
  return "text-foreground"
}

// Derive a warning level for Layer 4 (insider) from its "Tác động" output value.
// Returns null when the value is empty/undefined so the card header stays clean.
type InsiderWarning = {
  label: string
  icon: typeof AlertTriangle
  cls: string
  /** 1 = nhẹ, 2 = vừa, 3 = nghiêm trọng (3-dot meter) */
  severity: 1 | 2 | 3
  /** Tone for the dot meter so it matches the badge color */
  dotColor: string
}

function getInsiderWarning(value: unknown): InsiderWarning | null {
  if (value == null) return null
  const v = String(value).toLowerCase().trim()
  if (!v) return null

  // ── Cảnh báo (đỏ) — chia 3 mức ──
  const isCritical =
    v.includes("nghiêm trọng") || v.includes("rất tiêu cực") ||
    v.includes("nguy cơ cao") || v.includes("rủi ro cao") ||
    v.includes("báo động")
  const isHigh =
    v.includes("đáng lo") || v.includes("cảnh báo") ||
    v.includes("rủi ro") || v.includes("tiêu cực") ||
    v.includes("nguy cơ") || v.includes("áp lực bán")
  const isMild =
    v.includes("lo ngại") || v.includes("áp lực") ||
    v.includes("thận trọng") || v.includes("cần lưu ý")

  if (isCritical || isHigh || isMild) {
    const severity: 1 | 2 | 3 = isCritical ? 3 : isHigh ? 2 : 1
    const label =
      severity === 3 ? "Cảnh báo nghiêm trọng" :
      severity === 2 ? "Cảnh báo cao" : "Cảnh báo nhẹ"
    return {
      label,
      icon: AlertTriangle,
      cls: "bg-red-500/15 text-red-400 border-red-500/30",
      severity,
      dotColor: "#f87171",
    }
  }

  if (
    v.includes("hỗ trợ") || v.includes("tích cực") || v.includes("ủng hộ") ||
    v.includes("thuận lợi") || v.includes("tốt")
  ) {
    return {
      label: "Tích cực",
      icon: CheckCircle2,
      cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      severity: 1,
      dotColor: "#34d399",
    }
  }

  if (
    v.includes("trung tính") || v.includes("ngang") || v.includes("không") ||
    v.includes("chưa rõ") || v.includes("bình thường")
  ) {
    return {
      label: "Trung tính",
      icon: MinusCircle,
      cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      severity: 1,
      dotColor: "#fbbf24",
    }
  }

  // Unknown/uncategorised — still expose with a neutral indicator
  return {
    label: "Chưa rõ",
    icon: AlertCircle,
    cls: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    severity: 1,
    dotColor: "#94a3b8",
  }
}

function WarningBadge({ w }: { w: InsiderWarning }) {
  const Icon = w.icon
  return (
    <span
      className={`ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold leading-none ${w.cls}`}
      title={`${w.label} (mức ${w.severity}/3)`}
    >
      <Icon className="size-2.5" />
      {w.label}
      {/* Dot meter — visualises severity level (1-3) */}
      <span className="inline-flex items-center gap-0.5 ml-0.5" aria-label={`Mức ${w.severity} trên 3`}>
        {[1, 2, 3].map((lvl) => (
          <span
            key={lvl}
            className="rounded-full transition-opacity"
            style={{
              width: 4,
              height: 4,
              backgroundColor: w.dotColor,
              opacity: lvl <= w.severity ? 1 : 0.25,
            }}
          />
        ))}
      </span>
    </span>
  )
}

// ── Detail Panel ──

function DetailPanel({
  layerKey,
  insight,
  onClose,
}: {
  layerKey: string
  insight: InsightResponse
  onClose: () => void
}) {
  const layerData = insight.layers[layerKey]
  const cfg = layerKey === "decision"
    ? { label: "Tổng hợp & Hành động", shortLabel: "L6", icon: Brain, color: "hsl(var(--primary))" }
    : LAYER_CONFIG[layerKey]
  if (!cfg || !layerData) return null
  const Icon = cfg.icon
  const [showRawData, setShowRawData] = useState(false)

  return (
    <motion.div
      initial={{ x: 340, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 340, opacity: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      className="hidden md:flex md:flex-1 md:min-w-[320px] bg-background/95 backdrop-blur-xl md:border-l border-border/30 shadow-2xl flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/20 shrink-0">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${cfg.color}15` }}>
            <Icon className="size-3.5" style={{ color: cfg.color }} />
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-bold uppercase" style={{ color: cfg.color }}>{cfg.shortLabel}</span>
              <h3 className="text-xs font-bold text-foreground">{cfg.label}</h3>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="size-6 rounded-md bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors cursor-pointer">
          <X className="size-3 text-muted-foreground" />
        </button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        {/* AI Analysis Output */}
        <div className="p-3 border-b border-border/10">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="size-3 text-primary" />
            <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Kết quả phân tích</span>
          </div>
          <div className="text-xs leading-relaxed">
	            {renderOutput(layerData.output, layerKey)}
          </div>
        </div>

        {/* Raw Input Data (expandable) */}
        {layerKey !== "decision" && (
          <div className="p-3">
            <button
              onClick={() => setShowRawData(!showRawData)}
              className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors w-full"
            >
              <Database className="size-3" />
              <span className="uppercase tracking-wider">Dữ liệu đầu vào chi tiết</span>
              <ChevronDown className={`size-3 ml-auto transition-transform ${showRawData ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {showRawData && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 space-y-3">
                    <RawInputContent layerKey={layerKey} rawInput={insight.rawInput} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>
    </motion.div>
  )
}

// ── Raw Input Tables per Layer ──

function RawInputContent({ layerKey, rawInput }: { layerKey: string; rawInput: InsightResponse["rawInput"] }) {
  switch (layerKey) {
    case "trend": return <TrendRawInput data={rawInput.trend} />
    case "liquidity": return <LiquidityRawInput data={rawInput.liquidity} />
    case "moneyFlow": return <MoneyFlowRawInput data={rawInput.moneyFlow} />
    case "insider": return <InsiderRawInput data={rawInput.insider} />
    case "news": return <NewsRawInput data={rawInput.news} />
    default: return null
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <Table className="size-3 text-muted-foreground" />
      <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">{children}</span>
    </div>
  )
}

function DataRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex justify-between py-0.5 border-b border-border/5 last:border-0">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-[10px] font-mono font-medium ${color || "text-foreground"}`}>{value}</span>
    </div>
  )
}

function TrendRawInput({ data }: { data: InsightResponse["rawInput"]["trend"] }) {
  const { computed, realtime, ohlcv } = data
  return (
    <>
      {/* Realtime */}
      <div>
        <SectionTitle>Realtime</SectionTitle>
        {realtime ? (
          <>
            <DataRow label="Giá hiện tại (P0)" value={realtime.price} />
            <DataRow label="Volume hiện tại (V0)" value={fmtNum(realtime.volume)} />
            <DataRow label="Cao / Thấp" value={`${realtime.high} / ${realtime.low}`} />
            <DataRow label="Tham chiếu" value={realtime.ref} />
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground italic">Ngoài giờ giao dịch</p>
        )}
      </div>

      {/* Computed MA */}
      <div>
        <SectionTitle>MA & VolMA</SectionTitle>
        <DataRow label="MA10" value={computed.ma10} color="text-blue-400" />
        <DataRow label="MA20" value={computed.ma20} color="text-amber-400" />
        <DataRow label="VolMA10" value={fmtNum(computed.volMa10)} />
        <DataRow label="VolMA20" value={fmtNum(computed.volMa20)} />
        <DataRow label="Giá đóng cửa gần nhất" value={computed.latestClose?.toFixed(2) || "—"} />
      </div>

      {/* OHLCV table (last 10) */}
      <div>
        <SectionTitle>OHLCV ({ohlcv.length} phiên)</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-[9px]">
            <thead>
              <tr className="text-muted-foreground border-b border-border/20">
                <th className="text-left py-1 pr-2">Ngày</th>
                <th className="text-right px-1">O</th>
                <th className="text-right px-1">H</th>
                <th className="text-right px-1">L</th>
                <th className="text-right px-1">C</th>
                <th className="text-right pl-1">Vol</th>
              </tr>
            </thead>
            <tbody>
              {ohlcv.slice(-10).map((r: any, i: number) => (
                <tr key={i} className="border-b border-border/5 hover:bg-muted/10">
                  <td className="py-0.5 pr-2 text-muted-foreground">{r.date?.split("T")[0]}</td>
                  <td className="text-right px-1 tabular-nums">{r.open?.toFixed(1)}</td>
                  <td className="text-right px-1 tabular-nums text-emerald-400">{r.high?.toFixed(1)}</td>
                  <td className="text-right px-1 tabular-nums text-red-400">{r.low?.toFixed(1)}</td>
                  <td className="text-right px-1 tabular-nums font-medium">{r.close?.toFixed(1)}</td>
                  <td className="text-right pl-1 tabular-nums">{fmtNum(r.volume)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function LiquidityRawInput({ data }: { data: InsightResponse["rawInput"]["liquidity"] }) {
  const { latest, avg30, history } = data
  return (
    <>
      <div>
        <SectionTitle>Phiên gần nhất</SectionTitle>
        {latest ? (
          <>
            <DataRow label="KL chưa khớp Mua" value={fmtNum(latest.buyUnmatchedVolume)} />
            <DataRow label="KL chưa khớp Bán" value={fmtNum(latest.sellUnmatchedVolume)} />
            <DataRow label="Số lệnh Mua" value={fmtNum(latest.buyTradeCount)} />
            <DataRow label="Số lệnh Bán" value={fmtNum(latest.sellTradeCount)} />
            <DataRow label="KL đặt Mua" value={fmtNum(latest.buyTradeVolume)} />
            <DataRow label="KL đặt Bán" value={fmtNum(latest.sellTradeVolume)} />
            <DataRow label="Volume khớp" value={fmtNum(latest.totalVolume)} color="text-blue-400" />
          </>
        ) : <p className="text-[10px] text-muted-foreground italic">Không có dữ liệu</p>}
      </div>
      {avg30 && (
        <div>
          <SectionTitle>Trung bình 30 phiên</SectionTitle>
          <DataRow label="KL chưa khớp Mua TB" value={fmtNum(avg30.buyUnmatchedVolume)} />
          <DataRow label="KL chưa khớp Bán TB" value={fmtNum(avg30.sellUnmatchedVolume)} />
          <DataRow label="Volume khớp TB" value={fmtNum(avg30.totalVolume)} color="text-amber-400" />
        </div>
      )}
      {history.length > 0 && (
        <div>
          <SectionTitle>Lịch sử 10 phiên</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-[9px]">
              <thead>
                <tr className="text-muted-foreground border-b border-border/20">
                  <th className="text-left py-1">Ngày</th>
                  <th className="text-right">Mua chưa khớp</th>
                  <th className="text-right">Bán chưa khớp</th>
                  <th className="text-right">Volume</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 10).map((r: any, i: number) => (
                  <tr key={i} className="border-b border-border/5">
                    <td className="py-0.5 text-muted-foreground">{r.date?.split("T")[0]}</td>
                    <td className="text-right tabular-nums">{fmtNum(r.buyUnmatchedVolume)}</td>
                    <td className="text-right tabular-nums">{fmtNum(r.sellUnmatchedVolume)}</td>
                    <td className="text-right tabular-nums">{fmtNum(r.totalVolume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

function MoneyFlowRawInput({ data }: { data: InsightResponse["rawInput"]["moneyFlow"] }) {
  const renderTable = (items: any[], label: string) => (
    <div>
      <SectionTitle>{label} (15 phiên)</SectionTitle>
      <table className="w-full text-[9px]">
        <thead>
          <tr className="text-muted-foreground border-b border-border/20">
            <th className="text-left py-1">Ngày</th>
            <th className="text-right">Ròng khớp</th>
            <th className="text-right">Ròng deal</th>
            <th className="text-right">Tổng ròng</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r: any, i: number) => {
            const net = r.totalNetVolume ?? r.matchNetVolume ?? 0
            return (
              <tr key={i} className="border-b border-border/5">
                <td className="py-0.5 text-muted-foreground">{r.date?.split("T")[0]}</td>
                <td className={`text-right tabular-nums ${(r.matchNetVolume ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmtNum(r.matchNetVolume ?? 0)}
                </td>
                <td className="text-right tabular-nums">{fmtNum(r.dealNetVolume ?? 0)}</td>
                <td className={`text-right tabular-nums font-medium ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmtNum(net)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      {renderTable(data.foreign, "Nước ngoài")}
      {renderTable(data.proprietary, "Tự doanh")}
    </>
  )
}

function InsiderRawInput({ data }: { data: InsightResponse["rawInput"]["insider"] }) {
  return (
    <div>
      <SectionTitle>Giao dịch nội bộ ({data.transactions.length})</SectionTitle>
      <table className="w-full text-[9px]">
        <thead>
          <tr className="text-muted-foreground border-b border-border/20">
            <th className="text-left py-1">Hành động</th>
            <th className="text-right">KL đăng ký</th>
            <th className="text-right">KL thực hiện</th>
            <th className="text-right">Ngày</th>
          </tr>
        </thead>
        <tbody>
          {data.transactions.slice(0, 15).map((r: any, i: number) => (
            <tr key={i} className="border-b border-border/5">
              <td className={`py-0.5 ${r.action?.includes("Bán") || r.action?.includes("bán") ? "text-red-400" : "text-emerald-400"}`}>
                {r.action}
              </td>
              <td className="text-right tabular-nums">{fmtNum(r.shareRegistered)}</td>
              <td className="text-right tabular-nums">{fmtNum(r.shareExecuted)}</td>
              <td className="text-right text-muted-foreground">{r.startDate?.split("T")[0]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NewsRawInput({ data }: { data: InsightResponse["rawInput"]["news"] }) {
  return (
    <>
      {data.tickerScore && (
        <div>
          <SectionTitle>AI Score</SectionTitle>
          <DataRow label="Điểm" value={`${data.tickerScore.score}/10`} color="text-primary" />
          <DataRow label="Sentiment" value={data.tickerScore.sentiment || "—"} />
          <DataRow label="Tích cực" value={data.tickerScore.countPositive || 0} color="text-emerald-400" />
          <DataRow label="Tiêu cực" value={data.tickerScore.countNegative || 0} color="text-red-400" />
          <DataRow label="Trung lập" value={data.tickerScore.countNeutral || 0} />
        </div>
      )}
      <div>
        <SectionTitle>Tin tức ({data.items.length})</SectionTitle>
        <div className="space-y-1.5">
          {data.items.map((n: any, i: number) => (
            <div key={i} className="p-1.5 rounded-md bg-muted/10 border border-border/10">
              <p className="text-[10px] text-foreground/90 font-medium leading-snug">{n.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] text-muted-foreground">{n.sourceName || n.source}</span>
                <span className="text-[9px] text-muted-foreground">{n.updatedAt?.split(" ")[0]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Mobile-only stacked sections ─────────────────────

interface LayerCfg {
  label: string
  shortLabel: string
  icon: typeof TrendingUp
  color: string
  description: string
}

function MobileSummaryCard({
  insight,
  overview,
  actionHint,
  confidence,
  reversal,
  trendTags,
}: {
  insight: InsightResponse
  overview: string
  actionHint: string
  confidence: number
  reversal: number
  trendTags: { label: string; color: string }[]
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 120 }}
      className="rounded-2xl border-2 border-primary/25 bg-gradient-to-br from-primary/5 via-background/95 to-background/85 backdrop-blur-sm p-4 shadow-xl"
    >
      <div className="flex items-center justify-center gap-2 mb-3">
        <Sparkles className="size-5 text-primary" />
        <div className="text-center">
          <p className="text-[14px] font-bold text-foreground">IQX AI Insights</p>
          <p className="text-[9px] text-muted-foreground uppercase tracking-[0.2em] mt-0.5">Tổng hợp phân tích</p>
        </div>
      </div>

      {trendTags.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 mb-3">
          {trendTags[0] && (
            <span className="text-[11px] font-semibold px-3 py-1 rounded-full"
              style={{ backgroundColor: `${trendTags[0].color}20`, color: trendTags[0].color, border: `1px solid ${trendTags[0].color}30` }}>
              Xu hướng {trendTags[0].label}
            </span>
          )}
          {trendTags[1] && (
            <span className="text-[11px] font-semibold px-3 py-1 rounded-full"
              style={{ backgroundColor: `${trendTags[1].color}20`, color: trendTags[1].color, border: `1px solid ${trendTags[1].color}30` }}>
              Sức mạnh {trendTags[1].label}
            </span>
          )}
        </div>
      )}

      {overview && (
        <div className="bg-background/40 rounded-lg p-3 border border-border/15 mb-3">
          <p className="text-[12px] text-foreground/80 leading-relaxed">❝ {overview}</p>
        </div>
      )}

      <p className="text-[9px] text-muted-foreground text-center mb-3">
        Cập nhật lúc {new Date(insight.timestamp).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
      </p>

      <div className="flex items-center justify-around rounded-lg bg-background/50 border border-border/15 py-3 px-2 mb-3">
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground mb-1">Sức mạnh tổng thể</p>
          <svg viewBox="0 0 60 40" className="w-14 h-9 mx-auto">
            <path d="M 5 35 A 25 25 0 0 1 55 35" fill="none" stroke="hsl(var(--border) / 0.2)" strokeWidth="5" strokeLinecap="round" />
            <path d="M 5 35 A 25 25 0 0 1 55 35" fill="none" stroke="#10b981" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={`${(confidence / 100) * 78.5} 78.5`} />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground mb-1">Độ tin cậy</p>
          <p className="text-[18px] font-bold tabular-nums text-emerald-400">{confidence}%</p>
          <div className="h-1 w-12 bg-border/30 rounded-full overflow-hidden mt-1 mx-auto">
            <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${confidence}%` }} />
          </div>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground mb-1">Xác suất đảo chiều</p>
          <p className="text-[18px] font-bold tabular-nums text-blue-400">{reversal}%</p>
          <div className="h-1 w-12 bg-border/30 rounded-full overflow-hidden mt-1 mx-auto">
            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${reversal}%` }} />
          </div>
        </div>
      </div>

      {actionHint && (
        <div className="bg-background/40 rounded-lg p-2.5 border border-border/15">
          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
            <Brain className="size-3 text-primary" /> Gợi ý hành động
          </p>
          <p className="text-[11px] text-foreground/80 leading-relaxed">{actionHint}</p>
        </div>
      )}
    </motion.div>
  )
}

function MobileLayerSection({
  layerKey,
  cfg,
  items,
  layerData,
  headerValue,
  insiderWarning,
  rawInput,
}: {
  layerKey: string
  cfg: LayerCfg
  items: { label: string; value: string; color?: string }[]
  layerData: { label: string; output: any }
  headerValue: string
  insiderWarning: InsiderWarning | null
  rawInput: InsightResponse["rawInput"]
}) {
  const Icon = cfg.icon
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="rounded-xl border bg-card/40"
      style={{
        borderColor: `${cfg.color}30`,
        borderLeftWidth: 3,
        borderLeftColor: cfg.color,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/15">
        <div
          className="size-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${cfg.color}15` }}
        >
          <Icon className="size-3.5" style={{ color: cfg.color }} />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span
            className="text-[9px] font-black uppercase tracking-[0.15em]"
            style={{ color: cfg.color }}
          >
            {cfg.shortLabel}
          </span>
          <span className="text-xs font-bold text-foreground leading-tight">
            {cfg.label}
          </span>
        </div>
        {headerValue && (
          <span className={`text-[10px] font-bold ${getValueColor(headerValue)}`}>
            {String(headerValue)}
          </span>
        )}
        {insiderWarning && <WarningBadge w={insiderWarning} />}
      </div>

      {/* Quick summary rows */}
      {items.length > 0 && (
        <div className="px-3 py-2 space-y-0.5 border-b border-border/10">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground/70">{item.label}</span>
              <span
                className={`text-[11px] font-bold truncate text-right ${
                  item.color || getValueColor(item.value)
                }`}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* AI analysis output */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Sparkles className="size-3 text-primary" />
          <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
            Kết quả phân tích
          </span>
        </div>
        <div className="text-xs leading-relaxed">
          {renderOutput(layerData.output, layerKey)}
        </div>
      </div>

      {/* Raw input toggle */}
      <button
        onClick={() => setExpanded((s) => !s)}
        className="w-full flex items-center gap-1.5 px-3 py-2 border-t border-border/10 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
      >
        <Database className="size-3" />
        <span className="uppercase tracking-wider">Dữ liệu đầu vào</span>
        <ChevronDown
          className={`size-3 ml-auto transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3">
              <RawInputContent layerKey={layerKey} rawInput={rawInput} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main Component ──

export function StockAiInsight({ symbol }: { symbol: string }) {
  const [insight, setInsight] = useState<InsightResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null)

  useEffect(() => {
    setIsLoading(true)
    setError("")
    setSelectedLayer(null)

    fetch(`${API_BASE}/ai/insight/${symbol.toUpperCase()}`)
      .then((r) => r.json())
      .then((res) => {
        if (res?.data) {
          setInsight(res.data)
          setSelectedLayer("decision")
        } else {
          setError(res?.message || "Không có dữ liệu AI Insight")
        }
      })
      .catch(() => setError("Lỗi kết nối tới AI Insight"))
      .finally(() => setIsLoading(false))
  }, [symbol])

  const trendTags = useMemo(() => {
    const trendOut = insight?.layers?.trend?.output
    if (!trendOut || typeof trendOut !== "object") return []
    const result: { label: string; color: string }[] = []
    const trendVal = trendOut["Xu hướng"] || trendOut.trend
    if (trendVal) {
      const t = String(trendVal).toLowerCase()
      if (t.includes("tăng")) result.push({ label: "Tăng", color: "#10b981" })
      else if (t.includes("giảm")) result.push({ label: "Giảm", color: "#ef4444" })
      else result.push({ label: "Đi ngang", color: "#f59e0b" })
    }
    const stateVal = trendOut["Trạng thái"] || trendOut.state
    if (stateVal) {
      const s = String(stateVal).toLowerCase()
      if (s.includes("mạnh")) result.push({ label: "Mạnh", color: "#3b82f6" })
      else if (s.includes("yếu")) result.push({ label: "Yếu", color: "#94a3b8" })
      else result.push({ label: "Giằng co", color: "#f59e0b" })
    }
    return result
  }, [insight])

  // Build summary items for each layer card
  const getLayerSummary = useCallback((key: string) => {
    const out = insight?.layers?.[key]?.output
    return buildLayerSummary(key, out)
  }, [insight])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}>
          <Brain className="size-10 text-primary/40" />
        </motion.div>
        <p className="text-sm font-medium text-foreground/80">Đang phân tích {symbol}</p>
        <p className="text-[11px] text-muted-foreground">AI đang xử lý 6 lớp dữ liệu...</p>
        <div className="flex gap-1 mt-1">
          {["L1", "L2", "L3", "L4", "L5", "L6"].map((l, i) => (
            <motion.span key={l} className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/40 text-muted-foreground"
              animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}>{l}</motion.span>
          ))}
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Brain className="size-10 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    )
  }
  if (!insight) return null

  const overview = insight.layers?.decision?.output?.["Tổng quan"] || insight.layers?.decision?.output?.overview || ""
  const actionHint = insight.layers?.decision?.output?.["Hành động chính"] || ""
  const summary = insight.summary
  const confidence = summary?.confidence || 0
  const reversal = summary?.reversalProbability || 0

  return (
    <div className="relative h-full w-full flex flex-col overflow-hidden">
      {/* ─── Header ─── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20 shrink-0">
        <Sparkles className="size-4 text-primary" />
        <span className="text-xs font-bold text-foreground">{insight.symbol}</span>
        <div className="flex items-center gap-1 ml-auto text-muted-foreground">
          <Clock className="size-3" />
          <span className="text-[10px]">
            {new Date(insight.timestamp).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
          </span>
        </div>
      </div>

      {/* ─── Body: responsive layout
              - Mobile (default): single scroll with summary + all 5 layer sections stacked
              - md+: 3-column (layer cards | summary | detail panel) ─── */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden relative">
        {/* ─── Mobile: vertical scroll with everything stacked ─── */}
        <ScrollArea className="md:hidden flex-1 min-h-0">
          <div className="p-3 space-y-3">
            {/* Summary card */}
            <MobileSummaryCard
              insight={insight}
              overview={overview}
              actionHint={actionHint}
              confidence={confidence}
              reversal={reversal}
              trendTags={trendTags}
            />

            {/* All 5 layer sections, stacked */}
            {LAYERS_ORDER.map((key) => {
              const cfg = LAYER_CONFIG[key]
              const items = getLayerSummary(key)
              const layerData = insight.layers?.[key]
              if (!layerData) return null
              const headerValue = key === "liquidity"
                ? (layerData.output?.["Thanh khoản"] || "")
                : ""
              const insiderWarning = key === "insider"
                ? getInsiderWarning(layerData.output?.["Tác động"])
                : null
              return (
                <MobileLayerSection
                  key={key}
                  layerKey={key}
                  cfg={cfg}
                  items={items}
                  layerData={layerData}
                  headerValue={headerValue}
                  insiderWarning={insiderWarning}
                  rawInput={insight.rawInput}
                />
              )
            })}
          </div>
        </ScrollArea>

        {/* ─── LEFT (md+): Layer Cards ─── */}
        <ScrollArea className="hidden md:block w-[240px] shrink-0 border-r border-border/15">
          <div className="p-2 space-y-2">
            {LAYERS_ORDER.map((key) => {
	              const cfg = LAYER_CONFIG[key]
	              const items = getLayerSummary(key)
	              const isActive = selectedLayer === key
	              const headerValue = key === "liquidity"
                ? (insight.layers?.[key]?.output?.["Thanh khoản"] || "")
                : ""
              const insiderWarning = key === "insider"
                ? getInsiderWarning(insight.layers?.[key]?.output?.["Tác động"])
                : null
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: LAYERS_ORDER.indexOf(key) * 0.1 }}
                  onClick={() => setSelectedLayer(isActive ? null : key)}
                  className={`rounded-xl border cursor-pointer transition-all duration-200 ${isActive ? "scale-[1.02]" : "hover:scale-[1.01]"}`}
                  style={{
                    borderColor: isActive ? cfg.color : `${cfg.color}30`,
                    borderLeftWidth: 3,
                    borderLeftColor: cfg.color,
                    backgroundColor: isActive ? `${cfg.color}08` : "transparent",
                  }}
                >
                  <div className="p-2.5">
                    {/* Card header */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[9px] font-black uppercase tracking-[0.15em]" style={{ color: cfg.color }}>{cfg.shortLabel}</span>
                      <span className="text-[12px] font-bold text-foreground">{cfg.label}</span>
                      {headerValue && (
	                        <span className={`text-[10px] font-bold ml-auto ${getValueColor(headerValue)}`}>{String(headerValue)}</span>
                      )}
                      {insiderWarning && <WarningBadge w={insiderWarning} />}
                    </div>
                    {/* Card rows */}
                    {items.map((item) => (
                      <div key={item.label} className="flex items-center justify-between py-0.5">
                        <span className="text-[10px] text-muted-foreground/70">{item.label}</span>
	                        <span className={`text-[11px] font-bold truncate max-w-[130px] text-right ${item.color || getValueColor(item.value)}`}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )
            })}
          </div>
          {/* Bottom hint */}
          <div className="px-2 pb-2">
            <p className="text-[9px] text-muted-foreground text-center">Click layer → xem dữ liệu đầu vào chi tiết</p>
          </div>
        </ScrollArea>

        {/* ─── CENTER (md+): Summary Card ─── */}
        <ScrollArea className="hidden md:block md:flex-none md:w-[340px] md:shrink-0">
          <div className="flex items-center justify-center p-3 min-h-full">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 120 }}
              onClick={() => setSelectedLayer(selectedLayer === "decision" ? null : "decision")}
              className="w-full max-w-[420px] md:max-w-[340px] rounded-2xl border-2 border-primary/25 bg-gradient-to-br from-primary/5 via-background/95 to-background/85 backdrop-blur-sm p-4 shadow-xl cursor-pointer hover:border-primary/40 transition-colors"
            >
              {/* Title */}
              <div className="flex items-center justify-center gap-2 mb-3">
                <Sparkles className="size-5 text-primary" />
                <div className="text-center">
                  <p className="text-[14px] font-bold text-foreground">IQX AI Insights</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-[0.2em] mt-0.5">Tổng hợp phân tích</p>
                </div>
              </div>

              {/* Trend Tags */}
              {trendTags.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5 mb-3">
                  {trendTags[0] && (
                    <span className="text-[11px] font-semibold px-3 py-1 rounded-full"
                      style={{ backgroundColor: `${trendTags[0].color}20`, color: trendTags[0].color, border: `1px solid ${trendTags[0].color}30` }}>
                      Xu hướng {trendTags[0].label}
                    </span>
                  )}
                  {trendTags[1] && (
                    <span className="text-[11px] font-semibold px-3 py-1 rounded-full"
                      style={{ backgroundColor: `${trendTags[1].color}20`, color: trendTags[1].color, border: `1px solid ${trendTags[1].color}30` }}>
                      Sức mạnh {trendTags[1].label}
                    </span>
                  )}
                </div>
              )}

              {/* Overview Quote */}
              {overview && (
                <div className="bg-background/40 rounded-lg p-3 border border-border/15 mb-3">
                  <p className="text-[12px] text-foreground/80 leading-relaxed">❝ {overview}</p>
                </div>
              )}

              {/* Timestamp */}
              <p className="text-[9px] text-muted-foreground text-center mb-3">
                Cập nhật lúc {new Date(insight.timestamp).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
              </p>

              {/* Metrics Row */}
              <div className="flex items-center justify-around rounded-lg bg-background/50 border border-border/15 py-3 px-2 mb-3">
                {/* Confidence Gauge */}
                <div className="text-center">
                  <p className="text-[9px] text-muted-foreground mb-1">Sức mạnh tổng thể</p>
                  <svg viewBox="0 0 60 40" className="w-14 h-9 mx-auto">
                    <path d="M 5 35 A 25 25 0 0 1 55 35" fill="none" stroke="hsl(var(--border) / 0.2)" strokeWidth="5" strokeLinecap="round" />
                    <path d="M 5 35 A 25 25 0 0 1 55 35" fill="none" stroke="#10b981" strokeWidth="5" strokeLinecap="round"
                      strokeDasharray={`${(confidence / 100) * 78.5} 78.5`} />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-muted-foreground mb-1">Độ tin cậy</p>
                  <p className="text-[18px] font-bold tabular-nums text-emerald-400">{confidence}%</p>
                  <div className="h-1 w-12 bg-border/30 rounded-full overflow-hidden mt-1 mx-auto">
                    <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${confidence}%` }} />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-muted-foreground mb-1">Xác suất đảo chiều</p>
                  <p className="text-[18px] font-bold tabular-nums text-blue-400">{reversal}%</p>
                  <div className="h-1 w-12 bg-border/30 rounded-full overflow-hidden mt-1 mx-auto">
                    <div className="h-full bg-blue-400 rounded-full" style={{ width: `${reversal}%` }} />
                  </div>
                </div>
              </div>

              {/* Action Hint */}
              {actionHint && (
                <div className="bg-background/40 rounded-lg p-2.5 border border-border/15">
                  <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                    <Brain className="size-3 text-primary" /> Gợi ý hành động
                  </p>
                  <p className="text-[11px] text-foreground/80 leading-relaxed">{actionHint}</p>
                </div>
              )}
            </motion.div>
          </div>
        </ScrollArea>

        {/* ─── RIGHT (md+): Detail Panel — desktop only ─── */}
        <AnimatePresence>
          {selectedLayer && insight && (
            <DetailPanel
              key={selectedLayer}
              layerKey={selectedLayer}
              insight={insight}
              onClose={() => setSelectedLayer(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
