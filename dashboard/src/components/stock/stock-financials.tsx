import { useState, useEffect, useMemo, useCallback } from "react"
import {
  Loader2,
  BarChart3,
  TrendingUp,
  Layers,
  Wallet,
  PieChart,
  Plus,
  Minus,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, Line, LineChart } from "recharts"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("vi-VN")
}

// Ratio API returns revenue/profit in raw VND
function fmtRatioVal(n: number): string {
  if (n == null) return "—"
  const abs = Math.abs(n)
  if (abs >= 1e12) return (n / 1e9).toLocaleString("en-US", { maximumFractionDigits: 0 }) + " tỷ"
  if (abs >= 1e9) return (n / 1e9).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " tỷ"
  if (abs >= 1e6) return (n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 }) + " tr"
  if (abs >= 1e3) return (n / 1e3).toLocaleString("en-US", { maximumFractionDigits: 0 }) + "K"
  return fmtVnd(n)
}

function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(0) + "M"
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + "K"
  return String(n)
}

// KBS reports: format value (unit=1000 means values in thousands)
function fmtReport(v: number | null | undefined): string {
  if (v == null) return "—"
  // Already in thousands from KBS. Show as: X,XXX.XX (tỷ = /1e6)
  // Display raw number formatted with commas and 2 decimals for tỷ
  const abs = Math.abs(v)
  if (abs >= 1e6) {
    const formatted = (v / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return formatted
  }
  if (abs >= 1e3) {
    const formatted = (v / 1e3).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return formatted
  }
  if (v === 0) return "0"
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type FinSubTab = "KQKD" | "CDKT" | "LCTT" | "ratios"

const SUB_TABS: { id: FinSubTab; label: string; icon: React.ReactNode }[] = [
  { id: "KQKD", label: "KQKD", icon: <BarChart3 className="size-3" /> },
  { id: "CDKT", label: "CDKT", icon: <Layers className="size-3" /> },
  { id: "LCTT", label: "LCTT", icon: <Wallet className="size-3" /> },
  { id: "ratios", label: "Chỉ số", icon: <PieChart className="size-3" /> },
]

const PERIOD_COUNTS = [4, 8, 12] as const

// ── KBS Report Viewer (Spreadsheet style) ──

interface KbsHead {
  TermCode: string
  YearPeriod: number
  TermName: string
}

interface KbsRow {
  Name: string
  NameEn?: string
  Levels?: number
  CssStyle?: string
  ChildTotal?: number
  ReportNormID?: number
  ParentReportNormID?: number
  [key: string]: any
}

function FinancialReport({
  symbol,
  type,
  termType,
  periodCount,
}: {
  symbol: string
  type: string
  termType: number
  periodCount: number
}) {
  const [heads, setHeads] = useState<KbsHead[]>([])
  const [sections, setSections] = useState<Record<string, KbsRow[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  useEffect(() => {
    setIsLoading(true)
    setError("")
    setCollapsed(new Set())

    // Map report type to backend endpoint
    // KQKD → income_statement, CDKT → balance_sheet, LCTT → cash_flow
    const REPORT_TYPE_MAP: Record<string, string> = {
      KQKD: "income_statement",
      CDKT: "balance_sheet",
      LCTT: "cash_flow",
    }
    const backendType = REPORT_TYPE_MAP[type] || type

    fetch(
      `${API_BASE}/market-data/fundamentals/${symbol.toUpperCase()}/${backendType}?term_type=${termType}&page_size=${periodCount}`,
    )
      .then((r) => r.json())
      .then((res) => {
        // Try new response shape first, then fallback to old KBS shape
        const d = res?.data || res
        if (d && d.Head && d.Content) {
          setHeads(d.Head || [])
          setSections(d.Content || {})
        } else if (d && Array.isArray(d)) {
          // Backend may return flat array — show empty state with clear message
          setError("Định dạng dữ liệu mới — đang cập nhật hiển thị")
        } else {
          setError("Không có dữ liệu")
        }
      })
      .catch(() => setError("Lỗi tải dữ liệu"))
      .finally(() => setIsLoading(false))
  }, [symbol, type, termType, periodCount])

  const toggleCollapse = useCallback((id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || heads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <BarChart3 className="size-8 text-muted-foreground/30" />
        <span className="text-xs text-muted-foreground">{error || `Không có dữ liệu ${type}`}</span>
      </div>
    )
  }

  // Column headers
  const periodLabels = heads.map((h) =>
    termType === 2 ? `${h.TermCode}/${h.YearPeriod}` : String(h.YearPeriod)
  )

  // Flatten all rows across sections
  const allRows = Object.entries(sections).flatMap(([, rows]) => rows)

  return (
    <div className="overflow-x-auto">
      {/* Unit indicator */}
      <div className="text-[10px] text-muted-foreground mb-2 px-1">Đơn vị: tỷ VND</div>

      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border/40 sticky top-0 bg-background z-20">
            <th className="text-left py-2 px-2 text-muted-foreground font-medium min-w-[240px] sticky left-0 bg-background z-30">
              {/* empty */}
            </th>
            {periodLabels.map((label, i) => (
              <th
                key={i}
                className="text-right py-2 px-3 text-muted-foreground font-semibold min-w-[100px] whitespace-nowrap"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allRows.map((row, idx) => {
            const isSection = row.CssStyle?.includes("B") || row.Levels === 0
            const hasChildren = (row.ChildTotal || 0) > 0
            const normId = row.ReportNormID || idx
            const isCollapsed = collapsed.has(normId)
            const indent = row.Levels ? row.Levels * 16 : 0

            // Check if this row should be hidden (parent is collapsed)
            // Simple: hide non-zero level rows if they "belong" to a collapsed parent
            // For simplicity, we show all rows (the reference also shows them)

            return (
              <tr
                key={idx}
                className={`border-b border-border/10 transition-colors hover:bg-muted/10 ${
                  isSection ? "" : ""
                }`}
              >
                <td
                  className="py-[7px] px-2 sticky left-0 bg-background z-10"
                  style={{ paddingLeft: `${indent + 8}px` }}
                >
                  <div className="flex items-center gap-1">
                    {hasChildren && (
                      <button
                        onClick={() => toggleCollapse(normId)}
                        className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        {isCollapsed ? <Plus className="size-3" /> : <Minus className="size-3" />}
                      </button>
                    )}
                    <span className={`${isSection ? "font-bold text-foreground" : "text-foreground/80"} leading-tight`}>
                      {row.Name?.trim()}
                    </span>
                  </div>
                </td>
                {heads.map((_, j) => {
                  const val = row[`Value${j + 1}`]
                  const isNeg = typeof val === "number" && val < 0
                  return (
                    <td
                      key={j}
                      className={`text-right py-[7px] px-3 tabular-nums whitespace-nowrap ${
                        isNeg ? "text-red-400" : isSection ? "font-bold text-foreground" : "text-foreground/80"
                      }`}
                    >
                      {fmtReport(val)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Chỉ số (Ratios) with Charts ──

interface RatioRow {
  yearReport: number
  lengthReport: number
  revenue?: number
  revenueGrowth?: number
  netProfit?: number
  netProfitGrowth?: number
  roe?: number
  roa?: number
  pe?: number
  pb?: number
  eps?: number
  currentRatio?: number
  grossMargin?: number
  netProfitMargin?: number
  [key: string]: any
}

const revenueChartConfig = {
  revenue: { label: "Doanh thu", color: "hsl(210, 80%, 55%)" },
  netProfit: { label: "Lợi nhuận", color: "hsl(145, 70%, 45%)" },
} satisfies ChartConfig

const marginChartConfig = {
  grossMargin: { label: "Biên LN gộp", color: "hsl(32, 90%, 55%)" },
  netProfitMargin: { label: "Biên LN ròng", color: "hsl(210, 80%, 55%)" },
  roe: { label: "ROE", color: "hsl(145, 70%, 45%)" },
} satisfies ChartConfig

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-[5px] border-b border-border/10 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  )
}

function FinancialRatios({ symbol, ratioPeriod }: { symbol: string; ratioPeriod: "Q" | "Y" }) {
  const [ratios, setRatios] = useState<RatioRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    // New backend: /market-data/fundamentals/{symbol}/ratio?period=Q|Y
    fetch(`${API_BASE}/market-data/fundamentals/${symbol.toUpperCase()}/ratio?period=${ratioPeriod}`)
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data || res
        const data = d?.ratio || d
        setRatios(Array.isArray(data) ? data : [])
      })
      .catch(() => setRatios([]))
      .finally(() => setIsLoading(false))
  }, [symbol, ratioPeriod])

  const chronological = useMemo(() => [...ratios].reverse().slice(-12), [ratios])

  const chartData = useMemo(
    () =>
      chronological.map((r) => ({
        period: ratioPeriod === "Q" ? `Q${r.lengthReport}/${r.yearReport}` : String(r.yearReport),
        revenue: r.revenue ? +(r.revenue / 1e9).toFixed(0) : 0,
        netProfit: r.netProfit ? +(r.netProfit / 1e9).toFixed(0) : 0,
        grossMargin: r.grossMargin ? +(r.grossMargin * 100).toFixed(1) : 0,
        netProfitMargin: r.netProfitMargin ? +(r.netProfitMargin * 100).toFixed(1) : 0,
        roe: r.roe ? +(r.roe * 100).toFixed(1) : 0,
      })),
    [chronological, ratioPeriod]
  )

  const latest = ratios[0] || null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (ratios.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <PieChart className="size-8 text-muted-foreground/30" />
        <span className="text-xs text-muted-foreground">Không có dữ liệu chỉ số cho {symbol}</span>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-0 md:divide-x divide-y md:divide-y-0 divide-border/20">

      {/* Left: Key Ratios */}
      <div className="p-3 space-y-3">
        <span className="text-[11px] font-bold text-foreground uppercase tracking-wide">Định giá</span>
        {latest && (
          <>
            <InfoRow label="P/E" value={latest.pe?.toFixed(2) ?? "—"} />
            <InfoRow label="P/B" value={latest.pb?.toFixed(2) ?? "—"} />
            <InfoRow label="EPS" value={latest.eps ? fmtVnd(latest.eps) + " VND" : "—"} />
          </>
        )}
        <span className="text-[11px] font-bold text-foreground uppercase tracking-wide block pt-2">Sinh lợi</span>
        {latest && (
          <>
            <InfoRow label="ROE" value={latest.roe ? (latest.roe * 100).toFixed(2) + "%" : "—"} />
            <InfoRow label="ROA" value={latest.roa ? (latest.roa * 100).toFixed(2) + "%" : "—"} />
            <InfoRow label="Biên LN gộp" value={latest.grossMargin ? (latest.grossMargin * 100).toFixed(2) + "%" : "—"} />
            <InfoRow label="Biên LN ròng" value={latest.netProfitMargin ? (latest.netProfitMargin * 100).toFixed(2) + "%" : "—"} />
            <InfoRow label="Hệ số TT" value={latest.currentRatio?.toFixed(2) ?? "—"} />
          </>
        )}
      </div>

      {/* Right: Charts (spanning 2 cols) */}
      <div className="col-span-1 md:col-span-2 p-3 space-y-4">

        {/* Revenue & Profit Chart */}
        {chartData.length > 0 && (
          <section className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] font-bold text-foreground uppercase tracking-wide">Doanh thu & Lợi nhuận</span>
              <span className="text-[10px] text-muted-foreground">(tỷ VND)</span>
            </div>
            <ChartContainer config={revenueChartConfig} className="h-[200px] w-full">
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.3} />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${fmtCompact(v)}`} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${Number(v).toLocaleString()} tỷ`} />} />
                <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[3, 3, 0, 0]} barSize={20} />
                <Bar dataKey="netProfit" fill="var(--color-netProfit)" radius={[3, 3, 0, 0]} barSize={20} />
              </BarChart>
            </ChartContainer>
          </section>
        )}

        {/* Margin & ROE Chart */}
        {chartData.length > 0 && (
          <section className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] font-bold text-foreground uppercase tracking-wide">Biên lợi nhuận & ROE</span>
              <span className="text-[10px] text-muted-foreground">(%)</span>
            </div>
            <ChartContainer config={marginChartConfig} className="h-[200px] w-full">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.3} />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v}%`} />} />
                <Line type="monotone" dataKey="grossMargin" stroke="var(--color-grossMargin)" strokeWidth={2} dot={{ r: 2.5 }} />
                <Line type="monotone" dataKey="netProfitMargin" stroke="var(--color-netProfitMargin)" strokeWidth={2} dot={{ r: 2.5 }} />
                <Line type="monotone" dataKey="roe" stroke="var(--color-roe)" strokeWidth={2} dot={{ r: 2.5 }} strokeDasharray="5 3" />
              </LineChart>
            </ChartContainer>
          </section>
        )}

        {/* Detailed Table */}
        <section className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Layers className="size-3.5 text-muted-foreground" />
            <span className="text-[11px] font-bold text-foreground uppercase tracking-wide">Chi tiết theo kỳ</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left py-1.5 px-2 text-muted-foreground font-medium min-w-[80px]"></th>
                  {chronological.slice(-6).map((r, i) => (
                    <th key={i} className="text-right py-1.5 px-2 text-muted-foreground font-semibold">
                      {ratioPeriod === "Q" ? `Q${r.lengthReport}/${r.yearReport}` : r.yearReport}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Doanh thu", key: "revenue", fmt: (v: number) => fmtRatioVal(v), bold: true },
                  { label: "Lợi nhuận", key: "netProfit", fmt: (v: number) => fmtRatioVal(v), bold: true },
                  { label: "TT DT", key: "revenueGrowth", fmt: (v: number) => (v ? (v * 100).toFixed(1) + "%" : "—"), isGrowth: true },
                  { label: "TT LN", key: "netProfitGrowth", fmt: (v: number) => (v ? (v * 100).toFixed(1) + "%" : "—"), isGrowth: true },
                  { label: "Biên gộp", key: "grossMargin", fmt: (v: number) => (v ? (v * 100).toFixed(1) + "%" : "—") },
                  { label: "Biên ròng", key: "netProfitMargin", fmt: (v: number) => (v ? (v * 100).toFixed(1) + "%" : "—") },
                  { label: "ROE", key: "roe", fmt: (v: number) => (v ? (v * 100).toFixed(1) + "%" : "—") },
                  { label: "ROA", key: "roa", fmt: (v: number) => (v ? (v * 100).toFixed(1) + "%" : "—") },
                  { label: "P/E", key: "pe", fmt: (v: number) => v?.toFixed(1) ?? "—" },
                  { label: "EPS", key: "eps", fmt: (v: number) => (v ? fmtVnd(v) : "—") },
                ].map((row) => (
                  <tr key={row.key} className="border-b border-border/10 hover:bg-muted/10">
                    <td className={`py-[5px] px-2 whitespace-nowrap ${(row as any).bold ? "font-bold text-foreground" : "text-foreground/80"}`}>
                      {row.label}
                    </td>
                    {chronological.slice(-6).map((r: any, i) => {
                      const val = r[row.key]
                      const isGrowth = (row as any).isGrowth
                      return (
                        <td key={i} className="text-right py-[5px] px-2 tabular-nums whitespace-nowrap">
                          <span className={isGrowth && val != null ? (val >= 0 ? "text-emerald-400" : "text-red-400") : (row as any).bold ? "font-bold text-foreground" : "text-foreground/80"}>
                            {row.fmt(val)}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

// ── Main Component ──

export function StockFinancials({ symbol }: { symbol: string }) {
  const [subTab, setSubTab] = useState<FinSubTab>("KQKD")
  const [termType, setTermType] = useState<1 | 2>(2)
  const [ratioPeriod, setRatioPeriod] = useState<"Q" | "Y">("Q")
  const [periodCount, setPeriodCount] = useState<number>(8)

  const isReport = subTab !== "ratios"

  return (
    <ScrollArea className="h-full">
      <div className="space-y-0">
        {/* Toolbar - matches reference image */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/20 sticky top-0 bg-background z-30">
          {/* Sub-tabs */}
          <div className="flex items-center gap-0.5">
            {SUB_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id)}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                  subTab === tab.id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Period toggle */}
            <div className="flex items-center bg-muted/40 rounded overflow-hidden border border-border/20">
              <button
                onClick={() => isReport ? setTermType(2) : setRatioPeriod("Q")}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  (isReport ? termType === 2 : ratioPeriod === "Q")
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Quý
              </button>
              <button
                onClick={() => isReport ? setTermType(1) : setRatioPeriod("Y")}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  (isReport ? termType === 1 : ratioPeriod === "Y")
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Năm
              </button>
            </div>

            {/* Period count selector */}
            {isReport && (
              <div className="flex items-center bg-muted/40 rounded overflow-hidden border border-border/20">
                {PERIOD_COUNTS.map((count) => (
                  <button
                    key={count}
                    onClick={() => setPeriodCount(count)}
                    className={`px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer min-w-[24px] text-center ${
                      periodCount === count
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {isReport ? (
          <FinancialReport symbol={symbol} type={subTab} termType={termType} periodCount={periodCount} />
        ) : (
          <FinancialRatios symbol={symbol} ratioPeriod={ratioPeriod} />
        )}
      </div>
    </ScrollArea>
  )
}
