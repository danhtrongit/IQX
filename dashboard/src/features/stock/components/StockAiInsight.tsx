import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useNavigate } from "react-router"
import { Button, Input } from "@arco-design/web-react"
import {
  IconArrowFall,
  IconArrowRise,
  IconCheckCircle,
  IconClockCircle,
  IconExclamationCircle,
  IconExclamationCircleFill,
  IconMinusCircle,
  IconStorage,
  IconUser,
} from "@arco-design/web-react/icon"
import { getErrorMessage } from "@/shared/http/client"
import { isIndexSymbol, useStockAiInsight } from "../hooks"
import type { InsightRawInput, InsightResponse } from "../types"
import { formatSupportResistance, getLayerSummary as buildLayerSummary } from "../format"
import {
  IconArrowLeftRight,
  IconBrain,
  IconDroplets,
  IconNewspaper,
  IconSparkles,
} from "../icons"
import {
  InsiderRawChart,
  LiquidityRawChart,
  MoneyFlowRawChart,
  TrendRawChart,
} from "./StockAiInsightCharts"

type IconCmp = (props: { className?: string }) => ReactNode

/* ── Layer config ──────────────────────────────────────────────────────────── */

const LAYERS_ORDER = ["trend", "liquidity", "moneyFlow", "insider", "news"] as const

interface LayerCfg {
  label: string
  shortLabel: string
  icon: IconCmp
  color: string
  description: string
}

const LAYER_CONFIG: Record<string, LayerCfg> = {
  trend: { label: "Xu hướng", shortLabel: "L1", icon: IconArrowRise, color: "#3b82f6", description: "MA, hỗ trợ/kháng cự" },
  liquidity: { label: "Thanh khoản", shortLabel: "L2", icon: IconDroplets, color: "#06b6d4", description: "Cung cầu, áp lực vào/ra" },
  moneyFlow: { label: "Dòng tiền", shortLabel: "L3", icon: IconArrowLeftRight, color: "#10b981", description: "Nước ngoài, tự doanh" },
  insider: { label: "Nội bộ", shortLabel: "L4", icon: IconUser, color: "#f59e0b", description: "GD cổ đông, ban lãnh đạo" },
  news: { label: "Tin tức", shortLabel: "L5", icon: IconNewspaper, color: "#ec4899", description: "AI sentiment, điểm tin" },
}

function fmtNum(n: number): string {
  if (n == null) return "—"
  const abs = Math.abs(n)
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B"
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M"
  if (abs >= 1e3) return (n / 1e3).toFixed(0) + "K"
  return n.toLocaleString("vi-VN")
}

/* ── Decision output (L6) ──────────────────────────────────────────────────── */

const DECISION_OUTPUT_ROWS: Array<{ key: string; icon: IconCmp; color: string }> = [
  { key: "Tổng quan", icon: IconSparkles, color: "text-[#3b82f6]" },
  { key: "Thanh khoản", icon: IconDroplets, color: "text-[#06b6d4]" },
  { key: "Dòng tiền", icon: IconArrowLeftRight, color: "text-[#10b981]" },
  { key: "Giao dịch nội bộ", icon: IconUser, color: "text-[#f59e0b]" },
  { key: "Tin tức", icon: IconNewspaper, color: "text-[#ec4899]" },
  { key: "Hành động chính", icon: IconCheckCircle, color: "text-up" },
  { key: "Kịch bản thuận lợi", icon: IconArrowRise, color: "text-up" },
  { key: "Kịch bản bất lợi", icon: IconArrowFall, color: "text-down" },
  { key: "Kịch bản đi ngang", icon: IconMinusCircle, color: "text-reference" },
]

function DecisionOutput({ output }: { output: Record<string, unknown> }) {
  const rendered = new Set<string>()
  const rows = DECISION_OUTPUT_ROWS.filter((row) => output[row.key]).map((row) => {
    rendered.add(row.key)
    return row
  })
  const extraRows = Object.keys(output)
    .filter((key) => !rendered.has(key) && output[key] != null && output[key] !== "")
    .map((key) => ({ key, icon: IconExclamationCircle as IconCmp, color: "text-[rgb(var(--primary-6))]" }))

  return (
    <div className="space-y-2">
      {[...rows, ...extraRows].map(({ key, icon: Icon, color }) => (
        <div key={key} className="grid grid-cols-[16px_104px_minmax(0,1fr)] items-start gap-x-2">
          <Icon className={`mt-[2px] ${color}`} />
          <span className="text-[10px] font-semibold leading-relaxed text-[var(--color-text-3)]">{key}:</span>
          <span className="text-[11px] leading-relaxed text-[var(--color-text-2)]">{String(output[key])}</span>
        </div>
      ))}
    </div>
  )
}

function renderOutput(output: unknown, layerKey?: string): ReactNode {
  if (!output) return null
  if (typeof output === "string") return <span>{output}</span>
  const obj = output as Record<string, unknown>
  if (obj.error) {
    return (
      <span className="text-[10px] text-down">
        <IconExclamationCircle className="mr-1 inline" />
        {String(obj.error)}
      </span>
    )
  }
  if (obj.text) return <span className="whitespace-pre-wrap">{String(obj.text)}</span>
  if (layerKey === "decision") return <DecisionOutput output={obj} />

  return (
    <div className="space-y-1">
      {Object.entries(obj).map(([key, val]) => {
        if ((key === "items" || key === "Tin tức") && Array.isArray(val)) {
          return (
            <div key={key} className="space-y-0.5">
              <span className="text-[10px] font-semibold text-[var(--color-text-3)]">{key}:</span>
              {(val as string[]).map((item, i) => (
                <div key={i} className="border-l-2 border-[var(--color-border-2)] pl-2 text-[11px] text-[var(--color-text-2)]">
                  {item}
                </div>
              ))}
            </div>
          )
        }
        const value = key === "Hỗ trợ" || key === "Kháng cự" ? formatSupportResistance(val) : String(val)
        const valueColor =
          key === "Hỗ trợ" ? "text-up" : key === "Kháng cự" ? "text-down" : "text-[var(--color-text-2)]"
        return (
          <div key={key} className="flex gap-2">
            <span className="min-w-[80px] shrink-0 text-[10px] font-semibold text-[var(--color-text-3)]">{key}:</span>
            <span className={`text-[11px] ${valueColor}`}>{value}</span>
          </div>
        )
      })}
    </div>
  )
}

function getValueColor(value: string): string {
  const v = value.toLowerCase()
  if (v.includes("tăng") || v.includes("mua") || v.includes("cải thiện") || v.includes("tích cực") || v.includes("hỗ trợ") || v.includes("thuận lợi")) return "text-up"
  if (v.includes("giảm") || v.includes("bán") || v.includes("suy yếu") || v.includes("tiêu cực") || v.includes("áp lực") || v.includes("thận trọng")) return "text-down"
  if (v.includes("ngang") || v.includes("giằng co") || v.includes("thất thường") || v.includes("trái chiều") || v.includes("trung tính") || v.includes("lẫn lộn")) return "text-reference"
  if (v.includes("mạnh")) return "text-[#3b82f6]"
  if (v.includes("yếu")) return "text-[var(--color-text-3)]"
  return "text-[var(--color-text-1)]"
}

/* ── Insider warning ───────────────────────────────────────────────────────── */

interface InsiderWarning {
  label: string
  icon: IconCmp
  cls: string
  severity: 1 | 2 | 3
  dotColor: string
}

function getInsiderWarning(value: unknown): InsiderWarning | null {
  if (value == null) return null
  const v = String(value).toLowerCase().trim()
  if (!v) return null

  const isCritical = v.includes("nghiêm trọng") || v.includes("rất tiêu cực") || v.includes("nguy cơ cao") || v.includes("rủi ro cao") || v.includes("báo động")
  const isHigh = v.includes("đáng lo") || v.includes("cảnh báo") || v.includes("rủi ro") || v.includes("tiêu cực") || v.includes("nguy cơ") || v.includes("áp lực bán")
  const isMild = v.includes("lo ngại") || v.includes("áp lực") || v.includes("thận trọng") || v.includes("cần lưu ý")

  if (isCritical || isHigh || isMild) {
    const severity: 1 | 2 | 3 = isCritical ? 3 : isHigh ? 2 : 1
    const label = severity === 3 ? "Cảnh báo nghiêm trọng" : severity === 2 ? "Cảnh báo cao" : "Cảnh báo nhẹ"
    return { label, icon: IconExclamationCircleFill, cls: "bg-down/15 text-down border-down/30", severity, dotColor: "#f87171" }
  }
  if (v.includes("hỗ trợ") || v.includes("tích cực") || v.includes("ủng hộ") || v.includes("thuận lợi") || v.includes("tốt")) {
    return { label: "Tích cực", icon: IconCheckCircle, cls: "bg-up/15 text-up border-up/30", severity: 1, dotColor: "#34d399" }
  }
  if (v.includes("trung tính") || v.includes("ngang") || v.includes("không") || v.includes("chưa rõ") || v.includes("bình thường")) {
    return { label: "Trung tính", icon: IconMinusCircle, cls: "bg-reference/15 text-reference border-reference/30", severity: 1, dotColor: "#fbbf24" }
  }
  return { label: "Chưa rõ", icon: IconExclamationCircle, cls: "bg-[var(--color-fill-2)] text-[var(--color-text-3)] border-[var(--color-border-2)]", severity: 1, dotColor: "#94a3b8" }
}

function WarningBadge({ w }: { w: InsiderWarning }) {
  const Icon = w.icon
  return (
    <span
      className={`ml-auto inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold leading-none ${w.cls}`}
      title={`${w.label} (mức ${w.severity}/3)`}
    >
      <Icon />
      {w.label}
      <span className="ml-0.5 inline-flex items-center gap-0.5">
        {[1, 2, 3].map((lvl) => (
          <span
            key={lvl}
            className="rounded-full"
            style={{ width: 4, height: 4, backgroundColor: w.dotColor, opacity: lvl <= w.severity ? 1 : 0.25 }}
          />
        ))}
      </span>
    </span>
  )
}

/* ── Raw input panels ──────────────────────────────────────────────────────── */

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <IconStorage className="text-[var(--color-text-3)]" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-1)]">{children}</span>
    </div>
  )
}

function DataRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex justify-between border-b border-[var(--color-border-2)]/40 py-0.5 last:border-0">
      <span className="text-[10px] text-[var(--color-text-3)]">{label}</span>
      <span className={`font-mono text-[10px] font-medium ${color || "text-[var(--color-text-1)]"}`}>{value}</span>
    </div>
  )
}

function RawInputContent({ layerKey, rawInput }: { layerKey: string; rawInput: InsightRawInput }) {
  switch (layerKey) {
    case "trend": {
      const { computed, realtime, ohlcv } = rawInput.trend
      const rt = realtime as Record<string, unknown> | null
      return (
        <>
          <div>
            <SectionTitle>Realtime</SectionTitle>
            {rt ? (
              <>
                <DataRow label="Giá hiện tại (P0)" value={String(rt.price)} />
                <DataRow label="Volume hiện tại (V0)" value={fmtNum(Number(rt.volume))} />
                <DataRow label="Cao / Thấp" value={`${rt.high} / ${rt.low}`} />
                <DataRow label="Tham chiếu" value={String(rt.ref)} />
              </>
            ) : (
              <p className="text-[10px] italic text-[var(--color-text-3)]">Ngoài giờ giao dịch</p>
            )}
          </div>
          <div>
            <SectionTitle>MA &amp; VolMA</SectionTitle>
            <DataRow label="MA10" value={computed.ma10} color="text-[#3b82f6]" />
            <DataRow label="MA20" value={computed.ma20} color="text-[#f59e0b]" />
            <DataRow label="VolMA10" value={fmtNum(computed.volMa10)} />
            <DataRow label="VolMA20" value={fmtNum(computed.volMa20)} />
            <DataRow label="Giá đóng cửa gần nhất" value={computed.latestClose?.toFixed(2) || "—"} />
          </div>
          <TrendRawChart ohlcv={ohlcv} />
        </>
      )
    }
    case "liquidity": {
      const { latest, avg30, history } = rawInput.liquidity
      const l = latest as Record<string, unknown> | null
      const a = avg30 as Record<string, unknown> | null
      return (
        <>
          <div>
            <SectionTitle>Phiên gần nhất</SectionTitle>
            {l ? (
              <>
                <DataRow label="KL chưa khớp Mua" value={fmtNum(Number(l.buyUnmatchedVolume))} />
                <DataRow label="KL chưa khớp Bán" value={fmtNum(Number(l.sellUnmatchedVolume))} />
                <DataRow label="Số lệnh Mua" value={fmtNum(Number(l.buyTradeCount))} />
                <DataRow label="Số lệnh Bán" value={fmtNum(Number(l.sellTradeCount))} />
                <DataRow label="KL đặt Mua" value={fmtNum(Number(l.buyTradeVolume))} />
                <DataRow label="KL đặt Bán" value={fmtNum(Number(l.sellTradeVolume))} />
                <DataRow label="Volume khớp" value={fmtNum(Number(l.totalVolume))} color="text-[#3b82f6]" />
              </>
            ) : (
              <p className="text-[10px] italic text-[var(--color-text-3)]">Không có dữ liệu</p>
            )}
          </div>
          {a && (
            <div>
              <SectionTitle>Trung bình 30 phiên</SectionTitle>
              <DataRow label="KL chưa khớp Mua TB" value={fmtNum(Number(a.buyUnmatchedVolume))} />
              <DataRow label="KL chưa khớp Bán TB" value={fmtNum(Number(a.sellUnmatchedVolume))} />
              <DataRow label="Volume khớp TB" value={fmtNum(Number(a.totalVolume))} color="text-[#f59e0b]" />
            </div>
          )}
          {history.length > 0 && <LiquidityRawChart history={history} avgVolume={a ? Number(a.totalVolume) : undefined} />}
        </>
      )
    }
    case "moneyFlow":
      return (
        <>
          <MoneyFlowRawChart items={rawInput.moneyFlow.foreign} title={`Nước ngoài (${rawInput.moneyFlow.foreign.length} phiên)`} />
          <MoneyFlowRawChart items={rawInput.moneyFlow.proprietary} title={`Tự doanh (${rawInput.moneyFlow.proprietary.length} phiên)`} />
        </>
      )
    case "insider":
      return <InsiderRawChart txns={rawInput.insider.transactions.slice(0, 15)} />
    case "news": {
      const ts = rawInput.news.tickerScore as Record<string, unknown> | null
      return (
        <>
          {ts && (
            <div>
              <SectionTitle>AI Score</SectionTitle>
              <DataRow label="Điểm" value={`${ts.score}/10`} color="text-[rgb(var(--primary-6))]" />
              <DataRow label="Sentiment" value={String(ts.sentiment || "—")} />
              <DataRow label="Tích cực" value={Number(ts.countPositive) || 0} color="text-up" />
              <DataRow label="Tiêu cực" value={Number(ts.countNegative) || 0} color="text-down" />
              <DataRow label="Trung lập" value={Number(ts.countNeutral) || 0} />
            </div>
          )}
          <div>
            <SectionTitle>Tin tức ({rawInput.news.items.length})</SectionTitle>
            <div className="space-y-1.5">
              {rawInput.news.items.map((n, i) => {
                const item = n as Record<string, unknown>
                return (
                  <div key={i} className="rounded-md border border-[var(--color-border-2)] bg-[var(--color-fill-1)] p-1.5">
                    <p className="text-[10px] font-medium leading-snug text-[var(--color-text-1)]">{String(item.title)}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-[9px] text-[var(--color-text-3)]">{String(item.sourceName || item.source || "")}</span>
                      <span className="text-[9px] text-[var(--color-text-3)]">{String(item.updatedAt || "").split(" ")[0]}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )
    }
    default:
      return null
  }
}

/* ── Summary card + metrics ────────────────────────────────────────────────── */

function MetricStat({ label, value, color, bar, pct }: { label: string; value: string; color: string; bar: string; pct: number }) {
  return (
    <div className="text-center">
      <p className="mb-1 text-[9px] text-[var(--color-text-3)]">{label}</p>
      <p className={`text-[18px] font-bold tabular-nums ${color}`}>{value}</p>
      <div className="mx-auto mt-1 h-1 w-12 overflow-hidden rounded-full bg-[var(--color-fill-3)]">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(Math.abs(pct), 100)}%` }} />
      </div>
    </div>
  )
}

function SummaryCard({
  insight,
  overview,
  actionHint,
  confidence,
  reversal,
  totalPower,
  trendTags,
  onClick,
}: {
  insight: InsightResponse
  overview: string
  actionHint: string
  confidence: number
  reversal: number
  totalPower: number
  trendTags: { label: string; color: string }[]
  onClick?: () => void
}) {
  const powerColor = totalPower >= 0 ? "text-up" : "text-down"
  const powerBar = totalPower >= 0 ? "bg-up" : "bg-down"
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border-2 border-[rgb(var(--primary-6))]/25 bg-[var(--color-bg-2)] p-4 shadow-xl ${onClick ? "cursor-pointer hover:border-[rgb(var(--primary-6))]/40" : ""}`}
    >
      <div className="mb-3 flex items-center justify-center gap-2">
        <IconSparkles className="text-[rgb(var(--primary-6))]" />
        <div className="text-center">
          <p className="text-[14px] font-bold text-[var(--color-text-1)]">IQX AI Insights</p>
          <p className="mt-0.5 text-[9px] uppercase tracking-[0.2em] text-[var(--color-text-3)]">Tổng hợp phân tích</p>
        </div>
      </div>

      {trendTags.length > 0 && (
        <div className="mb-3 flex flex-wrap justify-center gap-1.5">
          {trendTags[0] && (
            <span className="rounded-full px-3 py-1 text-[11px] font-semibold" style={{ backgroundColor: `${trendTags[0].color}20`, color: trendTags[0].color, border: `1px solid ${trendTags[0].color}30` }}>
              Xu hướng {trendTags[0].label}
            </span>
          )}
          {trendTags[1] && (
            <span className="rounded-full px-3 py-1 text-[11px] font-semibold" style={{ backgroundColor: `${trendTags[1].color}20`, color: trendTags[1].color, border: `1px solid ${trendTags[1].color}30` }}>
              Sức mạnh {trendTags[1].label}
            </span>
          )}
        </div>
      )}

      {overview && (
        <div className="mb-3 rounded-lg border border-[var(--color-border-2)] bg-[var(--color-fill-1)] p-3">
          <p className="text-[12px] leading-relaxed text-[var(--color-text-2)]">❝ {overview}</p>
        </div>
      )}

      <p className="mb-3 text-center text-[9px] text-[var(--color-text-3)]">
        Cập nhật lúc{" "}
        {new Date(insight.timestamp).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
      </p>

      <div className="mb-3 flex items-center justify-around rounded-lg border border-[var(--color-border-2)] bg-[var(--color-fill-1)] px-2 py-3">
        <MetricStat label="Sức mạnh tổng thể" value={`${totalPower > 0 ? "+" : ""}${totalPower}%`} color={powerColor} bar={powerBar} pct={totalPower} />
        <MetricStat label="Độ tin cậy" value={`${confidence}%`} color="text-up" bar="bg-up" pct={confidence} />
        <MetricStat label="Xác suất đảo chiều" value={`${reversal}%`} color="text-[#3b82f6]" bar="bg-[#3b82f6]" pct={reversal} />
      </div>

      {actionHint && (
        <div className="rounded-lg border border-[var(--color-border-2)] bg-[var(--color-fill-1)] p-2.5">
          <p className="mb-1 flex items-center gap-1 text-[10px] text-[var(--color-text-3)]">
            <IconBrain className="text-[rgb(var(--primary-6))]" /> Gợi ý hành động
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--color-text-2)]">{actionHint}</p>
        </div>
      )}
    </div>
  )
}

/* ── Main ──────────────────────────────────────────────────────────────────── */

export function StockAiInsight({ symbol }: { symbol: string }) {
  const navigate = useNavigate()
  const isIndex = isIndexSymbol(symbol)
  const { insight, analyze, isPending, isError, error, reset } = useStockAiInsight(symbol)
  const [pickSymbol, setPickSymbol] = useState("")
  const [errText, setErrText] = useState("")

  // Auto-run once per symbol (premium-gated upstream by the page).
  useEffect(() => {
    reset()
    if (!isIndex && symbol) analyze()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

  // Resolve a friendly error string when the mutation fails. `errText` is only
  // read inside the `isError` branch below, so no reset on success is needed.
  useEffect(() => {
    if (isError && error) {
      getErrorMessage(error, "Lỗi kết nối tới AI Insight").then(setErrText)
    }
  }, [isError, error])

  const trendTags = useMemo(() => {
    const trendOut = insight?.layers?.trend?.output
    if (!trendOut || typeof trendOut !== "object") return []
    const out = trendOut as Record<string, unknown>
    const result: { label: string; color: string }[] = []
    const trendVal = out["Xu hướng"] || out.trend
    if (trendVal) {
      const t = String(trendVal).toLowerCase()
      if (t.includes("tăng")) result.push({ label: "Tăng", color: "#10b981" })
      else if (t.includes("giảm")) result.push({ label: "Giảm", color: "#ef4444" })
      else result.push({ label: "Đi ngang", color: "#f59e0b" })
    }
    const stateVal = out["Trạng thái"] || out.state
    if (stateVal) {
      const s = String(stateVal).toLowerCase()
      if (s.includes("mạnh")) result.push({ label: "Mạnh", color: "#3b82f6" })
      else if (s.includes("yếu")) result.push({ label: "Yếu", color: "#94a3b8" })
      else result.push({ label: "Giằng co", color: "#f59e0b" })
    }
    return result
  }, [insight])

  // ── Indices → prompt to pick a stock ──
  if (isIndex) {
    const trimmed = pickSymbol.trim().toUpperCase()
    const valid = /^[A-Z0-9]{2,10}$/.test(trimmed) && !isIndexSymbol(trimmed)
    const go = () => {
      if (valid) navigate(`/co-phieu/${trimmed}`)
    }
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-6 text-center shadow-xl">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-[rgb(var(--primary-6))]/10">
            <IconBrain className="text-2xl text-[rgb(var(--primary-6))]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-[var(--color-text-1)]">
              AI Insight chỉ áp dụng cho mã cổ phiếu
            </h3>
            <p className="text-xs text-[var(--color-text-3)]">
              <span className="font-medium text-[var(--color-text-1)]">{symbol.toUpperCase()}</span> là
              chỉ số thị trường. Nhập mã cổ phiếu (vd. VCB, HPG, FPT) để chạy phân tích AI 6 lớp.
            </p>
          </div>
          <div className="mt-1 flex w-full gap-2">
            <Input
              value={pickSymbol}
              onChange={(v) => setPickSymbol(v.toUpperCase())}
              onPressEnter={go}
              placeholder="VD: VCB"
              maxLength={10}
            />
            <Button type="primary" disabled={!valid} onClick={go}>
              Phân tích
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <IconBrain className="animate-pulse text-4xl text-[rgb(var(--primary-6))]/40" />
        <p className="text-sm font-medium text-[var(--color-text-1)]">Đang phân tích {symbol}</p>
        <p className="text-[11px] text-[var(--color-text-3)]">AI đang xử lý 6 lớp dữ liệu...</p>
        <div className="mt-1 flex gap-1">
          {["L1", "L2", "L3", "L4", "L5", "L6"].map((l) => (
            <span key={l} className="animate-pulse rounded-full bg-[var(--color-fill-2)] px-1.5 py-0.5 text-[9px] text-[var(--color-text-3)]">
              {l}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <IconBrain className="text-4xl text-[var(--color-text-4)]" />
        <p className="text-xs text-[var(--color-text-3)]">{errText || "Lỗi kết nối tới AI Insight"}</p>
        <Button size="small" onClick={() => analyze()}>
          Thử lại
        </Button>
      </div>
    )
  }

  if (!insight) return null

  const decisionOut = (insight.layers?.decision?.output ?? {}) as Record<string, unknown>
  const overview = String(decisionOut["Tổng quan"] || decisionOut.overview || "")
  const actionHint = String(decisionOut["Hành động chính"] || "")
  const summary = insight.summary
  const confidence = summary?.confidence || 0
  const reversal = summary?.reversalProbability || 0
  const totalPower = summary?.totalPower || 0

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border-2)] px-4 py-2.5">
        <IconSparkles className="text-[rgb(var(--primary-6))]" />
        <span className="text-xs font-bold text-[var(--color-text-1)]">{insight.symbol}</span>
        <div className="ml-auto flex items-center gap-1 text-[var(--color-text-3)]">
          <IconClockCircle />
          <span className="text-[10px]">
            {new Date(insight.timestamp).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
          </span>
        </div>
      </div>

      {/* Body: summary + 5 layer sections stacked (responsive grid on md+) */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mx-auto max-w-[1000px] space-y-3">
          <SummaryCard
            insight={insight}
            overview={overview}
            actionHint={actionHint}
            confidence={confidence}
            reversal={reversal}
            totalPower={totalPower}
            trendTags={trendTags}
          />

          {/* L6 decision detail */}
          {Object.keys(decisionOut).length > 0 && (
            <div className="rounded-xl border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <IconBrain className="text-[rgb(var(--primary-6))]" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--primary-6))]">
                  Tổng hợp &amp; Hành động
                </span>
              </div>
              {renderOutput(decisionOut, "decision")}
            </div>
          )}

          {LAYERS_ORDER.map((key) => {
            const cfg = LAYER_CONFIG[key]
            const layerData = insight.layers?.[key]
            if (!layerData) return null
            const items = buildLayerSummary(key, (layerData.output ?? null) as Record<string, unknown> | null)
            const out = (layerData.output ?? {}) as Record<string, unknown>
            const headerValue = key === "liquidity" ? String(out["Thanh khoản"] || "") : ""
            const insiderWarning = key === "insider" ? getInsiderWarning(out["Mức cảnh báo"]) : null
            const Icon = cfg.icon
            return (
              <div
                key={key}
                className="rounded-xl border bg-[var(--color-bg-2)]"
                style={{ borderColor: `${cfg.color}30`, borderLeftWidth: 3, borderLeftColor: cfg.color }}
              >
                {/* Header */}
                <div className="flex items-center gap-2 border-b border-[var(--color-border-2)] px-3 py-2">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}>
                    <Icon />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[9px] font-black uppercase tracking-[0.15em]" style={{ color: cfg.color }}>
                      {cfg.shortLabel}
                    </span>
                    <span className="text-xs font-bold leading-tight text-[var(--color-text-1)]">{cfg.label}</span>
                  </div>
                  {headerValue && <span className={`text-[10px] font-bold ${getValueColor(headerValue)}`}>{headerValue}</span>}
                  {insiderWarning && <WarningBadge w={insiderWarning} />}
                </div>

                {/* Quick summary */}
                {items.length > 0 && (
                  <div className="space-y-0.5 border-b border-[var(--color-border-2)] px-3 py-2">
                    {items.map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-[var(--color-text-3)]">{item.label}</span>
                        <span className={`truncate text-right text-[11px] font-bold ${item.color || getValueColor(item.value)}`}>
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* AI output */}
                <div className="px-3 py-2.5">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <IconSparkles className="text-[rgb(var(--primary-6))]" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--primary-6))]">
                      Kết quả phân tích
                    </span>
                  </div>
                  <div className="text-xs leading-relaxed">{renderOutput(layerData.output, key)}</div>
                </div>

                {/* Raw input */}
                <div className="flex items-center gap-1.5 border-t border-[var(--color-border-2)] px-3 py-2 text-[10px] font-semibold text-[var(--color-text-3)]">
                  <IconStorage />
                  <span className="uppercase tracking-wider">Dữ liệu đầu vào</span>
                </div>
                <div className="space-y-3 px-3 pb-3">
                  <RawInputContent layerKey={key} rawInput={insight.rawInput} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
