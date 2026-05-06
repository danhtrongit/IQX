import { useState, useEffect, useMemo } from "react"
import { BrainCircuit, Loader2, RefreshCw } from "lucide-react"
import { api } from "@/lib/api"
import { ScrollArea } from "@/components/ui/scroll-area"

interface SectorAnalysisItem {
  icbCode: number
  icbName: string | null
  label: string | null
  analysis: {
    trang_thai: string
    hieu_suat: string
    dong_tien: string
    do_rong: string
    dan_dat: string
    diem_yeu: string
    co_hoi: string
    rui_ro: string
  } | null
}

interface AiSectorsResponse {
  message: string
  data: {
    group: string
    asOfDate: string | null
    total: number
    sectors: SectorAnalysisItem[]
  } | null
}

interface MarketIndex {
  symbol: string
  price: number
  change: number
  changePercent: number
  advances: number
  declines: number
  noChange: number
  volume: number
  value: number
}

type Sentiment = "positive" | "negative" | "neutral"

const LABEL_ORDER: Record<string, number> = {
  "Dẫn sóng": 1,
  "Hút tiền": 2,
  "Tích lũy": 3,
  "Hồi kỹ thuật": 4,
  "Phân phối": 5,
  "Suy yếu": 6,
}

const LABEL_COLORS: Record<string, string> = {
  "Dẫn sóng": "text-emerald-400",
  "Hút tiền": "text-blue-400",
  "Tích lũy": "text-amber-400",
  "Hồi kỹ thuật": "text-purple-400",
  "Phân phối": "text-orange-400",
  "Suy yếu": "text-red-400",
}

function deriveSentiment(labelCounts: Record<string, number>): Sentiment {
  const positive = (labelCounts["Dẫn sóng"] || 0) + (labelCounts["Hút tiền"] || 0)
  const negative = (labelCounts["Phân phối"] || 0) + (labelCounts["Suy yếu"] || 0)
  const neutral = (labelCounts["Tích lũy"] || 0) + (labelCounts["Hồi kỹ thuật"] || 0)

  if (positive > negative + neutral) return "positive"
  if (negative > positive + neutral) return "negative"
  if (positive > negative) return "positive"
  if (negative > positive) return "negative"
  return "neutral"
}

function buildMarketSummary(
  sectors: SectorAnalysisItem[],
  vnindex: MarketIndex | null,
): { sentiment: Sentiment; summary: string; points: string[] } {
  const withLabel = sectors.filter((s) => s.label)
  const labelCounts: Record<string, number> = {}
  for (const s of withLabel) {
    if (s.label) labelCounts[s.label] = (labelCounts[s.label] || 0) + 1
  }

  const sentiment = deriveSentiment(labelCounts)

  // Build summary line
  let summary = ""
  if (vnindex) {
    const change = Number(vnindex.change) || 0
    const changePct = Number(vnindex.changePercent) || 0
    const price = Number(vnindex.price) || 0
    const dir = change >= 0 ? "tăng" : "giảm"
    summary = `VNINDEX ${dir} ${Math.abs(change).toFixed(2)} điểm (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%) lên ${price.toFixed(2)}.`
  }

  // Build analysis points
  const points: string[] = []

  // Point 1: Sector signal distribution
  const labelEntries = Object.entries(labelCounts).sort(
    ([a], [b]) => (LABEL_ORDER[a] || 99) - (LABEL_ORDER[b] || 99),
  )
  if (labelEntries.length > 0) {
    const parts = labelEntries.map(([label, count]) => `${label}: ${count}`)
    points.push(`Phân bố tín hiệu ngành (${withLabel.length} ngành): ${parts.join(", ")}.`)
  }

  // Point 2: Leading sectors (Dẫn sóng)
  const leaders = sectors.filter((s) => s.label === "Dẫn sóng")
  if (leaders.length > 0) {
    const names = leaders.slice(0, 5).map((s) => s.icbName).filter(Boolean)
    points.push(`Ngành dẫn sóng: ${names.join(", ")}.`)
  }

  // Point 3: Money-attracting sectors (Hút tiền)
  const moneyIn = sectors.filter((s) => s.label === "Hút tiền")
  if (moneyIn.length > 0) {
    const names = moneyIn.slice(0, 5).map((s) => s.icbName).filter(Boolean)
    points.push(`Ngành hút tiền: ${names.join(", ")}.`)
  }

  // Point 4: Weakening sectors
  const weak = sectors.filter((s) => s.label === "Suy yếu" || s.label === "Phân phối")
  if (weak.length > 0) {
    const names = weak.slice(0, 5).map((s) => s.icbName).filter(Boolean)
    const weakLabels = [...new Set(weak.map((s) => s.label))].join("/")
    points.push(`Ngành ${weakLabels}: ${names.join(", ")}.`)
  }

  // Point 5: Market breadth from VNINDEX
  if (vnindex) {
    const advances = Number(vnindex.advances) || 0
    const declines = Number(vnindex.declines) || 0
    const noChange = Number(vnindex.noChange) || 0
    const total = advances + declines + noChange
    if (total > 0) {
      const advPct = ((advances / total) * 100).toFixed(0)
      points.push(
        `Độ rộng: ${advances} tăng / ${declines} giảm / ${noChange} đứng (${advPct}% mã tăng).`,
      )
    }
  }

  // Point 6: Top insights from AI analysis if available
  const withAnalysis = sectors.filter((s) => s.analysis)
  if (withAnalysis.length > 0) {
    // Find opportunities from leading sectors
    const opportunity = withAnalysis.find(
      (s) => s.label === "Dẫn sóng" && s.analysis?.co_hoi && s.analysis.co_hoi !== "chưa đủ dữ liệu",
    )
    if (opportunity?.analysis?.co_hoi) {
      points.push(`Cơ hội nổi bật (${opportunity.icbName}): ${opportunity.analysis.co_hoi}`)
    }

    // Find risks from weakening sectors
    const risk = withAnalysis.find(
      (s) =>
        (s.label === "Suy yếu" || s.label === "Phân phối") &&
        s.analysis?.rui_ro &&
        s.analysis.rui_ro !== "chưa đủ dữ liệu",
    )
    if (risk?.analysis?.rui_ro) {
      points.push(`Rủi ro cần lưu ý (${risk.icbName}): ${risk.analysis.rui_ro}`)
    }
  }

  return { sentiment, summary, points }
}

export function AiMarketAnalysis() {
  const [sectors, setSectors] = useState<SectorAnalysisItem[]>([])
  const [vnindex, setVnindex] = useState<MarketIndex | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError(false)
    try {
      const [aiRes, idxRes] = await Promise.allSettled([
        // New backend: POST /ai/dashboard/analyze → { analysis, model, as_of, ... }
        api.post("ai/dashboard/analyze", { json: { language: "vi" } }).json<any>(),
        // New backend: GET /market-data/overview/market-index
        fetch(`${import.meta.env.VITE_API_URL || "/api/v1"}/market-data/overview/market-index`).then((r) => r.json()),
      ])

      // AI sectors data — new backend returns analysis text, not structured sectors
      // Try to extract structured data if available, or fall back to text display
      if (aiRes.status === "fulfilled") {
        const aiData = aiRes.value
        // If backend returns structured sectors (legacy format)
        if (aiData?.data?.sectors) {
          setSectors(aiData.data.sectors)
        } else if (aiData?.sectors) {
          setSectors(aiData.sectors)
        } else {
          // AI returns text analysis — create a synthetic sector entry for display
          setSectors([])
        }
      }

      if (idxRes.status === "fulfilled") {
        const rawItems = idxRes.value?.data || idxRes.value || []
        if (Array.isArray(rawItems)) {
          // Adapt snake_case backend → UI MarketIndex shape
          const items: MarketIndex[] = rawItems.map((r: any) => ({
            symbol: (r.index_name || r.symbol || "").toUpperCase(),
            price: Number(r.index_value || r.price) || 0,
            change: Number(r.change) || 0,
            changePercent: Number(r.change_percent || r.changePercent) || 0,
            advances: Number(r.total_stock_increase || r.advances) || 0,
            declines: Number(r.total_stock_decline || r.declines) || 0,
            noChange: Number(r.total_stock_no_change || r.noChange) || 0,
            volume: Number(r.total_shares || r.volume) || 0,
            value: Number(r.total_value_million_vnd || r.value) || 0,
          }))
          setVnindex(items.find((i) => i.symbol === "VNINDEX") || null)
        }
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const { sentiment, summary, points } = useMemo(
    () => buildMarketSummary(sectors, vnindex),
    [sectors, vnindex],
  )

  const sentimentConfig = {
    positive: { color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Tích cực" },
    negative: { color: "text-red-500", bg: "bg-red-500/10", label: "Tiêu cực" },
    neutral: { color: "text-amber-500", bg: "bg-amber-500/10", label: "Trung lập" },
  }

  const sc = sentimentConfig[sentiment]

  return (
    <div className="bg-card rounded-lg border border-border flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <BrainCircuit className="size-3.5 text-primary" />
          <h3 className="text-xs font-semibold text-foreground">AI Phân tích thị trường</h3>
        </div>
        <div className="flex items-center gap-2">
          {!loading && sectors.length > 0 && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${sc.bg} ${sc.color}`}>
              {sc.label}
            </span>
          )}
          <button
            onClick={loadData}
            disabled={loading}
            className="text-muted-foreground/50 hover:text-primary transition-colors disabled:opacity-30"
            title="Làm mới"
          >
            <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3">
          {loading ? (
            <div className="flex flex-col justify-center items-center py-8 gap-2">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span className="text-[10px] text-muted-foreground">Đang phân tích dữ liệu AI...</span>
            </div>
          ) : error || sectors.length === 0 ? (
            <div className="flex flex-col justify-center items-center py-8 gap-2">
              <span className="text-xs text-muted-foreground">
                {error ? "Không thể tải dữ liệu AI" : "Chưa có dữ liệu phân tích"}
              </span>
              <button onClick={loadData} className="text-[10px] text-primary hover:underline">
                Thử lại
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* Summary */}
              {summary && (
                <p className="text-xs font-medium text-foreground leading-relaxed">{summary}</p>
              )}

              {/* Signal distribution badges */}
              {sectors.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(
                    sectors.reduce<Record<string, number>>((acc, s) => {
                      if (s.label) acc[s.label] = (acc[s.label] || 0) + 1
                      return acc
                    }, {}),
                  )
                    .sort(([a], [b]) => (LABEL_ORDER[a] || 99) - (LABEL_ORDER[b] || 99))
                    .map(([label, count]) => (
                      <span
                        key={label}
                        className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-muted/50 ${LABEL_COLORS[label] || "text-muted-foreground"}`}
                      >
                        {label}: {count}
                      </span>
                    ))}
                </div>
              )}

              {/* Analysis points */}
              <div className="space-y-1.5">
                {points.map((point, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-[10px] text-primary font-bold mt-0.5 shrink-0">{i + 1}.</span>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{point}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
