/**
 * "Tài chính" tab — the KBS spreadsheet reports (KQKD / CDKT / LCTT), the ratio
 * view with its charts, and the forensic BCTC analysis slot.
 *
 * Both the raw statements and the ratios come straight from
 * `/market-data/fundamentals/*`; the period controls change the request, never
 * the rendering rules. Rows that the backend marks as parent rows collapse for
 * real (their descendants hide), which is what the legacy ± affordance promised.
 */
import { useState } from "react"
import { ChartColumn, Layers, Minus, ChartPie, Plus, Wallet } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

import { fmtCompactShort, fmtRatioVal, fmtReport, fmtVnd } from "../format"
import { useFinancialRatios, useFinancialReport } from "../hooks"
import type { FinReportType, KbsRow, RatioRow } from "../types"

type FinSubTab = "KQKD" | "CDKT" | "LCTT" | "ratios"

const REPORT_TYPE_MAP: Record<string, FinReportType> = {
  KQKD: "income_statement",
  CDKT: "balance_sheet",
  LCTT: "cash_flow",
}

const SUB_TABS: { id: FinSubTab; label: string; icon: typeof ChartColumn }[] = [
  { id: "KQKD", label: "KQKD", icon: ChartColumn },
  { id: "CDKT", label: "CDKT", icon: Layers },
  { id: "LCTT", label: "LCTT", icon: Wallet },
  { id: "ratios", label: "Chỉ số", icon: ChartPie },
]

const PERIOD_COUNTS = [4, 8, 12]

/** Which rows to hide: descendants of every collapsed parent row. */
function hiddenRowIndexes(rows: KbsRow[], collapsed: Set<number>): Set<number> {
  const hidden = new Set<number>()
  const collapsedLevels: number[] = []
  rows.forEach((row, index) => {
    const level = typeof row.Levels === "number" ? row.Levels : 0
    while (collapsedLevels.length > 0 && level <= collapsedLevels[collapsedLevels.length - 1]) {
      collapsedLevels.pop()
    }
    if (collapsedLevels.length > 0) {
      hidden.add(index)
      return
    }
    const key = row.ReportNormID ?? index
    if ((row.ChildTotal ?? 0) > 0 && collapsed.has(key)) collapsedLevels.push(level)
  })
  return hidden
}

function FinancialReport({
  symbol,
  subTab,
  termType,
  periodCount,
}: {
  symbol: string
  subTab: Exclude<FinSubTab, "ratios">
  termType: number
  periodCount: number
}) {
  const report = useFinancialReport(symbol, REPORT_TYPE_MAP[subTab], termType, periodCount)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  if (report.isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((key) => (
          <Skeleton key={key} className="h-5 w-full" />
        ))}
      </div>
    )
  }

  if (!report.data || report.data.heads.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <ChartColumn className="size-5 text-muted-foreground/70" aria-hidden="true" />
        <span className="text-xs text-muted-foreground">Không có dữ liệu {subTab}</span>
      </div>
    )
  }

  const { heads, sections } = report.data
  const periodLabels = heads.map((head) =>
    termType === 2 ? `${head.TermCode}/${head.YearPeriod}` : String(head.YearPeriod),
  )
  const allRows: KbsRow[] = Object.values(sections).flat()
  const hidden = hiddenRowIndexes(allRows, collapsed)

  function toggle(row: KbsRow, index: number) {
    const key = row.ReportNormID ?? index
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="p-3">
      <p className="mb-2 text-[11px] text-muted-foreground">Đơn vị: tỷ VND</p>
      <ScrollArea className="w-full" orientation="horizontal" viewportClassName="pb-2">
        <table className="w-full min-w-max border-collapse text-xs">
          <thead>
            <tr className="sticky top-0 z-20 border-b border-border bg-card">
              <th className="sticky left-0 z-30 min-w-60 bg-card px-2 py-2 text-left" />
              {periodLabels.map((label) => (
                <th
                  key={label}
                  className="min-w-25 px-3 py-2 text-right font-semibold whitespace-nowrap text-muted-foreground"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allRows.map((row, index) => {
              if (hidden.has(index)) return null
              const isSection =
                (typeof row.CssStyle === "string" && row.CssStyle.includes("B")) ||
                row.Levels === 0
              const hasChildren = (row.ChildTotal ?? 0) > 0
              const key = row.ReportNormID ?? index
              const isCollapsed = collapsed.has(key)
              const indent = row.Levels ? row.Levels * 16 : 0
              return (
                <tr
                  key={key}
                  className="border-b border-border/50 transition-colors duration-150 hover:bg-muted/50"
                >
                  <td
                    className="sticky left-0 z-10 bg-card px-2 py-1.5"
                    style={{ paddingLeft: `${indent + 8}px` }}
                  >
                    <div className="flex items-center gap-1">
                      {hasChildren && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-expanded={!isCollapsed}
                          aria-label={isCollapsed ? "Mở rộng" : "Thu gọn"}
                          onClick={() => toggle(row, index)}
                          className="text-muted-foreground"
                        >
                          {isCollapsed ? <Plus aria-hidden="true" /> : <Minus aria-hidden="true" />}
                        </Button>
                      )}
                      <span
                        className={cn(
                          "leading-tight",
                          isSection ? "font-bold" : "text-muted-foreground",
                        )}
                      >
                        {row.Name?.trim()}
                      </span>
                    </div>
                  </td>
                  {heads.map((_, columnIndex) => {
                    const raw = row[`Value${columnIndex + 1}`]
                    const value = typeof raw === "number" ? raw : null
                    return (
                      <td
                        key={columnIndex}
                        className={cn(
                          "px-3 py-1.5 text-right tabular-nums whitespace-nowrap",
                          value != null && value < 0
                            ? "text-price-down"
                            : isSection
                              ? "font-bold"
                              : "text-muted-foreground",
                        )}
                      >
                        {fmtReport(value)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/60 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function pick(row: RatioRow, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key]
    if (value != null && value !== 0) return value
  }
  return null
}

/** Fraction ratio → "X.XX%" (ratios arrive as fractions, not percentages). */
function fmtPercentValue(value: number | null | undefined): string {
  if (value == null) return "—"
  return `${(value * 100).toFixed(2)}%`
}

function FinancialRatios({ symbol, period }: { symbol: string; period: "Q" | "Y" }) {
  const ratios = useFinancialRatios(symbol, period)
  const rows = ratios.data ?? []
  const chronological = [...rows].slice(0, 12).reverse()
  const latest = rows[0] ?? null

  const chartData = chronological.map((row) => {
    const length = (row.length_report ?? row.lengthReport ?? row.quarter) as number
    const year = (row.year_report ?? row.yearReport ?? row.year) as number
    const revenue = (row.revenue ??
      row.totalOperatingIncome ??
      row.total_operating_income ??
      0) as number
    const netProfit = (row.net_profit ??
      row.netProfit ??
      row.profitAfterTax ??
      row.profit_after_tax ??
      row.net_profit_after_tax ??
      0) as number
    const grossMargin = (row.gross_margin ?? row.grossMargin ?? 0) as number
    const netProfitMargin = (row.net_profit_margin ??
      row.netProfitMargin ??
      row.afterTaxProfitMargin ??
      row.after_tax_profit_margin ??
      0) as number
    const roe = (row.roe ?? 0) as number
    return {
      period: period === "Q" ? `Q${length}/${year}` : String(year),
      revenue: revenue ? Math.round(revenue / 1e9) : 0,
      netProfit: netProfit ? Math.round(netProfit / 1e9) : 0,
      grossMargin: grossMargin ? Number((grossMargin * 100).toFixed(1)) : 0,
      netProfitMargin: netProfitMargin ? Number((netProfitMargin * 100).toFixed(1)) : 0,
      roe: roe ? Number((roe * 100).toFixed(1)) : 0,
    }
  })

  const detailRows: {
    label: string
    keys: string[]
    format: (value: number) => string
    bold?: boolean
    isGrowth?: boolean
  }[] = [
    {
      label: "Doanh thu",
      keys: ["revenue", "totalOperatingIncome", "total_operating_income"],
      format: fmtRatioVal,
      bold: true,
    },
    {
      label: "Lợi nhuận",
      keys: [
        "net_profit",
        "netProfit",
        "profitAfterTax",
        "profit_after_tax",
        "net_profit_after_tax",
      ],
      format: fmtRatioVal,
      bold: true,
    },
    {
      label: "TT DT",
      keys: ["revenue_growth", "revenueGrowth"],
      format: (value) => (value ? `${(value * 100).toFixed(1)}%` : "—"),
      isGrowth: true,
    },
    {
      label: "TT LN",
      keys: ["net_profit_growth", "netProfitGrowth"],
      format: (value) => (value ? `${(value * 100).toFixed(1)}%` : "—"),
      isGrowth: true,
    },
    {
      label: "Biên gộp",
      keys: ["gross_margin", "grossMargin"],
      format: (value) => (value ? `${(value * 100).toFixed(1)}%` : "—"),
    },
    {
      label: "Biên ròng",
      keys: [
        "net_profit_margin",
        "netProfitMargin",
        "afterTaxProfitMargin",
        "after_tax_profit_margin",
      ],
      format: (value) => (value ? `${(value * 100).toFixed(1)}%` : "—"),
    },
    { label: "ROE", keys: ["roe"], format: (value) => (value ? `${(value * 100).toFixed(1)}%` : "—") },
    { label: "ROA", keys: ["roa"], format: (value) => (value ? `${(value * 100).toFixed(1)}%` : "—") },
    { label: "P/E", keys: ["pe"], format: (value) => value.toFixed(1) },
    { label: "EPS", keys: ["eps"], format: (value) => (value ? fmtVnd(value) : "—") },
  ]

  if (ratios.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
        <Skeleton className="h-56" />
        <Skeleton className="h-56 md:col-span-2" />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <ChartPie className="size-5 text-muted-foreground/70" aria-hidden="true" />
        <span className="text-xs text-muted-foreground">
          Không có dữ liệu chỉ số cho {symbol}
        </span>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
      <div className="space-y-3 p-3">
        <span className="text-[11px] font-bold tracking-wide uppercase">Định giá</span>
        <InfoRow label="P/E" value={latest?.pe != null ? (latest.pe as number).toFixed(2) : "—"} />
        <InfoRow label="P/B" value={latest?.pb != null ? (latest.pb as number).toFixed(2) : "—"} />
        <InfoRow
          label="EPS"
          value={latest?.eps ? `${fmtVnd(latest.eps as number)} VND` : "—"}
        />
        <span className="block pt-2 text-[11px] font-bold tracking-wide uppercase">Sinh lợi</span>
        <InfoRow label="ROE" value={fmtPercentValue(pick(latest ?? {}, "roe"))} />
        <InfoRow label="ROA" value={fmtPercentValue(pick(latest ?? {}, "roa"))} />
        <InfoRow
          label="Biên LN gộp"
          value={fmtPercentValue(pick(latest ?? {}, "gross_margin", "grossMargin"))}
        />
        <InfoRow
          label="Biên LN ròng"
          value={fmtPercentValue(
            pick(
              latest ?? {},
              "net_profit_margin",
              "netProfitMargin",
              "afterTaxProfitMargin",
              "after_tax_profit_margin",
            ),
          )}
        />
        <InfoRow
          label="Hệ số TT"
          value={pick(latest ?? {}, "current_ratio", "currentRatio")?.toFixed(2) ?? "—"}
        />
      </div>

      <div className="col-span-1 space-y-4 p-3 md:col-span-2">
        <section className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <ChartColumn className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-[11px] font-bold tracking-wide uppercase">
              Doanh thu &amp; Lợi nhuận
            </span>
            <span className="text-[10px] text-muted-foreground">(tỷ VND)</span>
          </div>
          <div className="h-50 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--border)"
                />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => fmtCompactShort(Number(value))}
                />
                <Tooltip
                  formatter={(value) => `${Number(value).toLocaleString("en-US")} tỷ`}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="revenue" name="Doanh thu" fill="var(--chart-1)" radius={[3, 3, 0, 0]} barSize={20} />
                <Bar dataKey="netProfit" name="Lợi nhuận" fill="var(--chart-3)" radius={[3, 3, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <ChartColumn className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-[11px] font-bold tracking-wide uppercase">
              Biên lợi nhuận &amp; ROE
            </span>
            <span className="text-[10px] text-muted-foreground">(%)</span>
          </div>
          <div className="h-50 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--border)"
                />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip
                  formatter={(value) => `${value}%`}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="grossMargin"
                  name="Biên LN gộp"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                />
                <Line
                  type="monotone"
                  dataKey="netProfitMargin"
                  name="Biên LN ròng"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                />
                <Line
                  type="monotone"
                  dataKey="roe"
                  name="ROE"
                  stroke="var(--chart-3)"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={{ r: 2.5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Layers className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-[11px] font-bold tracking-wide uppercase">Chi tiết theo kỳ</span>
          </div>
          <ScrollArea className="w-full" orientation="horizontal" viewportClassName="pb-2">
            <table className="w-full min-w-max border-collapse text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="min-w-20 px-2 py-1.5 text-left" />
                  {chronological.slice(-6).map((row, index) => {
                    const length = (row.length_report ?? row.lengthReport ?? row.quarter) as number
                    const year = (row.year_report ?? row.yearReport ?? row.year) as number
                    return (
                      <th
                        key={index}
                        className="px-2 py-1.5 text-right font-semibold text-muted-foreground"
                      >
                        {period === "Q" ? `Q${length}/${year}` : year}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {detailRows.map((row) => (
                  <tr
                    key={row.label}
                    className="border-b border-border/50 transition-colors duration-150 hover:bg-muted/50"
                  >
                    <td
                      className={cn(
                        "px-2 py-1.5 whitespace-nowrap",
                        row.bold ? "font-bold" : "text-muted-foreground",
                      )}
                    >
                      {row.label}
                    </td>
                    {chronological.slice(-6).map((periodRow, index) => {
                      const value = pick(periodRow, ...row.keys)
                      return (
                        <td
                          key={index}
                          className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap"
                        >
                          <span
                            className={cn(
                              row.isGrowth && value != null
                                ? value >= 0
                                  ? "text-price-up"
                                  : "text-price-down"
                                : row.bold
                                  ? "font-bold"
                                  : "text-muted-foreground",
                            )}
                          >
                            {value != null ? row.format(value) : "—"}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </section>
      </div>
    </div>
  )
}

export function StockFinancials({
  symbol,
  analysisSlot,
}: {
  symbol: string
  /** BCTC analysis view (composed by the page so this stays presentational). */
  analysisSlot?: React.ReactNode
}) {
  const [viewGroup, setViewGroup] = useState<"analysis" | "raw">(
    analysisSlot ? "analysis" : "raw",
  )
  const [subTab, setSubTab] = useState<FinSubTab>("KQKD")
  const [termType, setTermType] = useState<1 | 2>(2)
  const [ratioPeriod, setRatioPeriod] = useState<"Q" | "Y">("Q")
  const [periodCount, setPeriodCount] = useState(8)
  const isReport = subTab !== "ratios"

  return (
    <div className="flex min-h-0 flex-col">
      <div className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {analysisSlot && (
            <ToggleGroup
              type="single"
              spacing={0}
              variant="outline"
              value={viewGroup}
              onValueChange={(value) => value && setViewGroup(value as "analysis" | "raw")}
              className="overflow-hidden"
            >
              <ToggleGroupItem value="analysis" className="text-xs">
                Phân tích
              </ToggleGroupItem>
              <ToggleGroupItem value="raw" className="text-xs">
                Số liệu thô
              </ToggleGroupItem>
            </ToggleGroup>
          )}

          {viewGroup === "raw" && (
            <ToggleGroup
              type="single"
              spacing={0}
              variant="outline"
              value={subTab}
              onValueChange={(value) => value && setSubTab(value as FinSubTab)}
              className="overflow-hidden"
            >
              {SUB_TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <ToggleGroupItem key={tab.id} value={tab.id} className="gap-1 text-xs">
                    <Icon className="size-3.5" aria-hidden="true" />
                    {tab.label}
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>
          )}
        </div>

        {viewGroup === "raw" && (
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              spacing={0}
              variant="outline"
              value={isReport ? (termType === 2 ? "Q" : "Y") : ratioPeriod}
              onValueChange={(value) => {
                if (!value) return
                if (isReport) setTermType(value === "Q" ? 2 : 1)
                else setRatioPeriod(value as "Q" | "Y")
              }}
              className="overflow-hidden"
            >
              <ToggleGroupItem value="Q" className="text-xs">
                Quý
              </ToggleGroupItem>
              <ToggleGroupItem value="Y" className="text-xs">
                Năm
              </ToggleGroupItem>
            </ToggleGroup>

            {isReport && (
              <Select
                value={String(periodCount)}
                onValueChange={(value) => setPeriodCount(Number(value))}
              >
                <SelectTrigger size="sm" className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_COUNTS.map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {count} kỳ
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {viewGroup === "analysis" && analysisSlot ? (
        analysisSlot
      ) : isReport ? (
        <FinancialReport
          symbol={symbol}
          subTab={subTab as Exclude<FinSubTab, "ratios">}
          termType={termType}
          periodCount={periodCount}
        />
      ) : (
        <FinancialRatios symbol={symbol} period={ratioPeriod} />
      )}
    </div>
  )
}
