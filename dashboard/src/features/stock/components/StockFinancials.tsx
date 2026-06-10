import { useCallback, useMemo, useState } from "react"
import { Radio, Select, Spin } from "@arco-design/web-react"
import { IconMinus, IconPlus } from "@arco-design/web-react/icon"
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
import { useFinancialRatios, useFinancialReport } from "../hooks"
import type { FinReportType, KbsRow, RatioRow } from "../types"
import {
  fmtCompactShort,
  fmtRatioVal,
  fmtReport,
  fmtVnd,
} from "../format"
import { IconBars, IconLayers, IconPieChart, IconWallet } from "../icons"

const RadioGroup = Radio.Group
const Option = Select.Option

type FinSubTab = "KQKD" | "CDKT" | "LCTT" | "ratios"

const REPORT_TYPE_MAP: Record<string, FinReportType> = {
  KQKD: "income_statement",
  CDKT: "balance_sheet",
  LCTT: "cash_flow",
}

const SUB_TABS: { id: FinSubTab; label: string; icon: React.ReactNode }[] = [
  { id: "KQKD", label: "KQKD", icon: <IconBars /> },
  { id: "CDKT", label: "CDKT", icon: <IconLayers /> },
  { id: "LCTT", label: "LCTT", icon: <IconWallet /> },
  { id: "ratios", label: "Chỉ số", icon: <IconPieChart /> },
]

const PERIOD_COUNTS = [4, 8, 12] as const

/* ── KBS Report Viewer (dense spreadsheet) ─────────────────────────────────── */

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
  const backendType = REPORT_TYPE_MAP[subTab]
  const { data, isLoading } = useFinancialReport(symbol, backendType, termType, periodCount)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

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
      <div className="flex h-64 items-center justify-center">
        <Spin />
      </div>
    )
  }

  if (!data || data.heads.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <IconBars className="text-2xl text-[var(--color-text-4)]" />
        <span className="text-xs text-[var(--color-text-3)]">Không có dữ liệu {subTab}</span>
      </div>
    )
  }

  const { heads, sections } = data
  const periodLabels = heads.map((h) =>
    termType === 2 ? `${h.TermCode}/${h.YearPeriod}` : String(h.YearPeriod),
  )
  const allRows: KbsRow[] = Object.values(sections).flat()

  return (
    <div className="overflow-x-auto">
      <div className="mb-2 px-1 text-[10px] text-[var(--color-text-3)]">Đơn vị: tỷ VND</div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="sticky top-0 z-20 border-b border-[var(--color-border-2)] bg-[var(--color-bg-2)]">
            <th className="sticky left-0 z-30 min-w-[240px] bg-[var(--color-bg-2)] px-2 py-2 text-left" />
            {periodLabels.map((label, i) => (
              <th
                key={i}
                className="min-w-[100px] whitespace-nowrap px-3 py-2 text-right font-semibold text-[var(--color-text-3)]"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allRows.map((row, idx) => {
            const isSection =
              (typeof row.CssStyle === "string" && row.CssStyle.includes("B")) || row.Levels === 0
            const hasChildren = (row.ChildTotal || 0) > 0
            const normId = row.ReportNormID || idx
            const isCollapsed = collapsed.has(normId)
            const indent = row.Levels ? row.Levels * 16 : 0
            return (
              <tr
                key={idx}
                className="border-b border-[var(--color-border-2)]/40 transition-colors hover:bg-[var(--color-fill-1)]"
              >
                <td
                  className="sticky left-0 z-10 bg-[var(--color-bg-2)] px-2 py-[7px]"
                  style={{ paddingLeft: `${indent + 8}px` }}
                >
                  <div className="flex items-center gap-1">
                    {hasChildren && (
                      <button
                        onClick={() => toggleCollapse(normId)}
                        className="cursor-pointer text-[var(--color-text-3)] transition-colors hover:text-[var(--color-text-1)]"
                      >
                        {isCollapsed ? <IconPlus /> : <IconMinus />}
                      </button>
                    )}
                    <span
                      className={`leading-tight ${
                        isSection
                          ? "font-bold text-[var(--color-text-1)]"
                          : "text-[var(--color-text-2)]"
                      }`}
                    >
                      {row.Name?.trim()}
                    </span>
                  </div>
                </td>
                {heads.map((_, j) => {
                  const val = row[`Value${j + 1}`]
                  const num = typeof val === "number" ? val : null
                  const isNeg = num != null && num < 0
                  return (
                    <td
                      key={j}
                      className={`whitespace-nowrap px-3 py-[7px] text-right tabular-nums ${
                        isNeg
                          ? "text-down"
                          : isSection
                            ? "font-bold text-[var(--color-text-1)]"
                            : "text-[var(--color-text-2)]"
                      }`}
                    >
                      {fmtReport(num)}
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

/* ── Ratios with charts ────────────────────────────────────────────────────── */

const REVENUE_COLORS = { revenue: "#3b82f6", netProfit: "#22c55e" }
const MARGIN_COLORS = { grossMargin: "#f59e0b", netProfitMargin: "#3b82f6", roe: "#22c55e" }

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[var(--color-border-2)]/40 py-[5px] last:border-0">
      <span className="text-xs text-[var(--color-text-3)]">{label}</span>
      <span className="text-xs font-semibold tabular-nums text-[var(--color-text-1)]">{value}</span>
    </div>
  )
}

function pick(r: RatioRow, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = r[k]
    if (v != null && v !== 0) return v
  }
  return null
}

function FinancialRatios({ symbol, period }: { symbol: string; period: "Q" | "Y" }) {
  const { data: ratios = [], isLoading } = useFinancialRatios(symbol, period)

  const chronological = useMemo(() => [...ratios].slice(0, 12).reverse(), [ratios])

  const chartData = useMemo(
    () =>
      chronological.map((r) => {
        const length = (r.length_report ?? r.lengthReport ?? r.quarter) as number
        const year = (r.year_report ?? r.yearReport ?? r.year) as number
        const revenue =
          (r.revenue ?? r.totalOperatingIncome ?? r.total_operating_income ?? 0) as number
        const netProfit =
          (r.net_profit ??
            r.netProfit ??
            r.profitAfterTax ??
            r.profit_after_tax ??
            r.net_profit_after_tax ??
            0) as number
        const grossMargin = (r.gross_margin ?? r.grossMargin ?? 0) as number
        const netProfitMargin =
          (r.net_profit_margin ??
            r.netProfitMargin ??
            r.afterTaxProfitMargin ??
            r.after_tax_profit_margin ??
            0) as number
        const roe = (r.roe ?? 0) as number
        return {
          period: period === "Q" ? `Q${length}/${year}` : String(year),
          revenue: revenue ? +(revenue / 1e9).toFixed(0) : 0,
          netProfit: netProfit ? +(netProfit / 1e9).toFixed(0) : 0,
          grossMargin: grossMargin ? +(grossMargin * 100).toFixed(1) : 0,
          netProfitMargin: netProfitMargin ? +(netProfitMargin * 100).toFixed(1) : 0,
          roe: roe ? +(roe * 100).toFixed(1) : 0,
        }
      }),
    [chronological, period],
  )

  const latest = ratios[0] || null

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spin />
      </div>
    )
  }

  if (ratios.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <IconPieChart className="text-2xl text-[var(--color-text-4)]" />
        <span className="text-xs text-[var(--color-text-3)]">
          Không có dữ liệu chỉ số cho {symbol}
        </span>
      </div>
    )
  }

  const detailRows: {
    label: string
    keys: string[]
    fmt: (v: number) => string
    bold?: boolean
    isGrowth?: boolean
  }[] = [
    { label: "Doanh thu", keys: ["revenue", "totalOperatingIncome", "total_operating_income"], fmt: fmtRatioVal, bold: true },
    { label: "Lợi nhuận", keys: ["net_profit", "netProfit", "profitAfterTax", "profit_after_tax", "net_profit_after_tax"], fmt: fmtRatioVal, bold: true },
    { label: "TT DT", keys: ["revenue_growth", "revenueGrowth"], fmt: (v) => (v ? (v * 100).toFixed(1) + "%" : "—"), isGrowth: true },
    { label: "TT LN", keys: ["net_profit_growth", "netProfitGrowth"], fmt: (v) => (v ? (v * 100).toFixed(1) + "%" : "—"), isGrowth: true },
    { label: "Biên gộp", keys: ["gross_margin", "grossMargin"], fmt: (v) => (v ? (v * 100).toFixed(1) + "%" : "—") },
    { label: "Biên ròng", keys: ["net_profit_margin", "netProfitMargin", "afterTaxProfitMargin", "after_tax_profit_margin"], fmt: (v) => (v ? (v * 100).toFixed(1) + "%" : "—") },
    { label: "ROE", keys: ["roe"], fmt: (v) => (v ? (v * 100).toFixed(1) + "%" : "—") },
    { label: "ROA", keys: ["roa"], fmt: (v) => (v ? (v * 100).toFixed(1) + "%" : "—") },
    { label: "P/E", keys: ["pe"], fmt: (v) => v?.toFixed(1) ?? "—" },
    { label: "EPS", keys: ["eps"], fmt: (v) => (v ? fmtVnd(v) : "—") },
  ]

  return (
    <div className="grid grid-cols-1 divide-y divide-[var(--color-border-2)]/40 md:grid-cols-3 md:divide-x md:divide-y-0">
      {/* Left: key ratios */}
      <div className="space-y-3 p-3">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-1)]">
          Định giá
        </span>
        {latest && (
          <>
            <InfoRow label="P/E" value={(latest.pe as number)?.toFixed(2) ?? "—"} />
            <InfoRow label="P/B" value={(latest.pb as number)?.toFixed(2) ?? "—"} />
            <InfoRow label="EPS" value={latest.eps ? fmtVnd(latest.eps as number) + " VND" : "—"} />
          </>
        )}
        <span className="block pt-2 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-1)]">
          Sinh lợi
        </span>
        {latest && (
          <>
            <InfoRow label="ROE" value={latest.roe ? ((latest.roe as number) * 100).toFixed(2) + "%" : "—"} />
            <InfoRow label="ROA" value={latest.roa ? ((latest.roa as number) * 100).toFixed(2) + "%" : "—"} />
            <InfoRow
              label="Biên LN gộp"
              value={(() => {
                const v = pick(latest, "gross_margin", "grossMargin")
                return v != null ? (v * 100).toFixed(2) + "%" : "—"
              })()}
            />
            <InfoRow
              label="Biên LN ròng"
              value={(() => {
                const v = pick(latest, "net_profit_margin", "netProfitMargin", "afterTaxProfitMargin", "after_tax_profit_margin")
                return v != null ? (v * 100).toFixed(2) + "%" : "—"
              })()}
            />
            <InfoRow
              label="Hệ số TT"
              value={(pick(latest, "current_ratio", "currentRatio"))?.toFixed(2) ?? "—"}
            />
          </>
        )}
      </div>

      {/* Right: charts + detail table */}
      <div className="col-span-1 space-y-4 p-3 md:col-span-2">
        {chartData.length > 0 && (
          <section className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <IconBars className="text-[var(--color-text-3)]" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-1)]">
                Doanh thu &amp; Lợi nhuận
              </span>
              <span className="text-[10px] text-[var(--color-text-3)]">(tỷ VND)</span>
            </div>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-2)" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => fmtCompactShort(v)} />
                  <Tooltip formatter={(v) => `${Number(v).toLocaleString()} tỷ`} />
                  <Bar dataKey="revenue" name="Doanh thu" fill={REVENUE_COLORS.revenue} radius={[3, 3, 0, 0]} barSize={20} />
                  <Bar dataKey="netProfit" name="Lợi nhuận" fill={REVENUE_COLORS.netProfit} radius={[3, 3, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {chartData.length > 0 && (
          <section className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <IconBars className="text-[var(--color-text-3)]" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-1)]">
                Biên lợi nhuận &amp; ROE
              </span>
              <span className="text-[10px] text-[var(--color-text-3)]">(%)</span>
            </div>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-2)" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Line type="monotone" dataKey="grossMargin" name="Biên LN gộp" stroke={MARGIN_COLORS.grossMargin} strokeWidth={2} dot={{ r: 2.5 }} />
                  <Line type="monotone" dataKey="netProfitMargin" name="Biên LN ròng" stroke={MARGIN_COLORS.netProfitMargin} strokeWidth={2} dot={{ r: 2.5 }} />
                  <Line type="monotone" dataKey="roe" name="ROE" stroke={MARGIN_COLORS.roe} strokeWidth={2} dot={{ r: 2.5 }} strokeDasharray="5 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        <section className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <IconLayers className="text-[var(--color-text-3)]" />
            <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-1)]">
              Chi tiết theo kỳ
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border-2)]">
                  <th className="min-w-[80px] px-2 py-1.5 text-left" />
                  {chronological.slice(-6).map((r, i) => {
                    const length = (r.length_report ?? r.lengthReport ?? r.quarter) as number
                    const year = (r.year_report ?? r.yearReport ?? r.year) as number
                    return (
                      <th key={i} className="px-2 py-1.5 text-right font-semibold text-[var(--color-text-3)]">
                        {period === "Q" ? `Q${length}/${year}` : year}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {detailRows.map((row) => (
                  <tr key={row.label} className="border-b border-[var(--color-border-2)]/40 hover:bg-[var(--color-fill-1)]">
                    <td
                      className={`whitespace-nowrap px-2 py-[5px] ${
                        row.bold ? "font-bold text-[var(--color-text-1)]" : "text-[var(--color-text-2)]"
                      }`}
                    >
                      {row.label}
                    </td>
                    {chronological.slice(-6).map((r, i) => {
                      const val = pick(r, ...row.keys)
                      return (
                        <td key={i} className="whitespace-nowrap px-2 py-[5px] text-right tabular-nums">
                          <span
                            className={
                              row.isGrowth && val != null
                                ? val >= 0
                                  ? "text-up"
                                  : "text-down"
                                : row.bold
                                  ? "font-bold text-[var(--color-text-1)]"
                                  : "text-[var(--color-text-2)]"
                            }
                          >
                            {val != null ? row.fmt(val) : "—"}
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

/* ── Main ──────────────────────────────────────────────────────────────────── */

export function StockFinancials({
  symbol,
  analysisSlot,
}: {
  symbol: string
  /** BCTC analysis view (composed by the page so this stays presentational). */
  analysisSlot?: React.ReactNode
}) {
  const [viewGroup, setViewGroup] = useState<"analysis" | "raw">(analysisSlot ? "analysis" : "raw")
  const [subTab, setSubTab] = useState<FinSubTab>("KQKD")
  const [termType, setTermType] = useState<1 | 2>(2)
  const [ratioPeriod, setRatioPeriod] = useState<"Q" | "Y">("Q")
  const [periodCount, setPeriodCount] = useState<number>(8)

  const isReport = subTab !== "ratios"

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="sticky top-0 z-30 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-3 py-2">
        <div className="flex items-center gap-2">
          {analysisSlot && (
            <RadioGroup
              type="button"
              size="mini"
              value={viewGroup}
              onChange={(v) => setViewGroup(v)}
            >
              <Radio value="analysis">Phân tích</Radio>
              <Radio value="raw">Số liệu thô</Radio>
            </RadioGroup>
          )}

          {viewGroup === "raw" && (
            <RadioGroup type="button" size="mini" value={subTab} onChange={(v) => setSubTab(v)}>
              {SUB_TABS.map((tab) => (
                <Radio key={tab.id} value={tab.id}>
                  <span className="inline-flex items-center gap-1">
                    {tab.icon}
                    {tab.label}
                  </span>
                </Radio>
              ))}
            </RadioGroup>
          )}
        </div>

        {viewGroup === "raw" && (
          <div className="flex items-center gap-2">
            <RadioGroup
              type="button"
              size="mini"
              value={isReport ? (termType === 2 ? "Q" : "Y") : ratioPeriod}
              onChange={(v) => {
                if (isReport) setTermType(v === "Q" ? 2 : 1)
                else setRatioPeriod(v)
              }}
            >
              <Radio value="Q">Quý</Radio>
              <Radio value="Y">Năm</Radio>
            </RadioGroup>

            {isReport && (
              <Select
                size="mini"
                value={periodCount}
                onChange={setPeriodCount}
                style={{ width: 72 }}
              >
                {PERIOD_COUNTS.map((c) => (
                  <Option key={c} value={c}>
                    {c} kỳ
                  </Option>
                ))}
              </Select>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {viewGroup === "analysis" && analysisSlot ? (
        <div className="min-h-0 flex-1 overflow-y-auto">{analysisSlot}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isReport ? (
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
      )}
    </div>
  )
}
