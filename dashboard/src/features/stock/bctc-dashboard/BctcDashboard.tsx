import React, { type ReactNode } from "react"
import { Spin } from "@arco-design/web-react"

import { PremiumGate } from "@/features/premium"

import { BLOCK_ORDER } from "./blockOrder"
import { useBctcDashboard, useBctcDashboardAi } from "./hooks"
import { colorVar, fmtNum, round } from "./charts/chartTokens"
import { ComboBarLine, type ComboBar, type ComboLine } from "./charts/ComboBarLine"
import { FootballField } from "./charts/FootballField"
import { LineChart, type LineSeries } from "./charts/LineChart"
import { PeerBar, type PeerMarker, type PeerRow } from "./charts/PeerBar"
import { RadarScorecard, type RadarDim } from "./charts/RadarScorecard"
import { StackedBarAbsolute, type StackedYear } from "./charts/StackedBarAbsolute"
import { Waterfall, type WaterfallKind, type WaterfallStep } from "./charts/Waterfall"
import { AiMemo } from "./components/AiMemo"
import { Checklist } from "./components/Checklist"
import { Drilldown } from "./components/Drilldown"
import { DuoPanel } from "./components/DuoPanel"
import { HeroCard } from "./components/HeroCard"
import { MetricCard, type MetricPeer } from "./components/MetricCard"
import { QuestionBlock } from "./components/QuestionBlock"
import { SubQuestion } from "./components/SubQuestion"
import type {
  BctcBusinessBlockA,
  BctcBusinessBlockB,
  BctcCashflowBlockA,
  BctcCashflowBlockB,
  BctcDashboardData,
  BctcFinancialBlock,
  BctcHealthBlockA,
  BctcHealthBlockB,
  BctcMetric,
  BctcNarrative,
  BctcPeerRow,
  BctcTemplate,
  BctcTotal,
  BctcValuationBlock,
} from "./types"

import "./bctc-dashboard.css"

/* ── formatters / small helpers ────────────────────────────────────────────── */

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

/** fraction → "24.1%" (or "—") */
const pct = (v: number | null | undefined, dp = 1): string =>
  isNum(v) ? `${(v * 100).toFixed(dp)}%` : "—"

/** VND → tỷ (number) for chart scaling */
const ty = (v: number | null | undefined): number => (isNum(v) ? v / 1e9 : 0)

/** VND → "12,345 tỷ" (or "—") */
const tyLabel = (v: number | null | undefined): string => (isNum(v) ? `${fmtNum(v / 1e9)} tỷ` : "—")

const bandOf = (color?: string | null): string | undefined => {
  switch (color) {
    case "green":
      return "good"
    case "amber":
      return "warn"
    case "red":
      return "bad"
    default:
      return undefined
  }
}

/** Infer a display unit for metrics that don't carry one (valuation P/E, P/B…). */
function inferUnit(m: BctcMetric): string {
  if (m.unit) return m.unit
  const k = m.key.toLowerCase()
  if (k.includes("pe") || k.includes("pb")) return "x"
  return "%"
}

function fmtMetricValue(m: BctcMetric): string {
  if (!isNum(m.value)) return "—"
  const u = inferUnit(m)
  if (u === "%") return `${(m.value * 100).toFixed(1)}%`
  if (u === "x" || u === "×") return `${m.value.toFixed(2)}×`
  return fmtNum(m.value)
}

/** Build the industry-compare track for a MetricCard, when a peer median exists. */
function peerOf(m: BctcMetric): MetricPeer | undefined {
  if (!isNum(m.value) || !isNum(m.peer_median)) return undefined
  const scale = Math.max(Math.abs(m.value), Math.abs(m.peer_median)) * 1.5 || 1
  return {
    you: (m.value / scale) * 100,
    median: (m.peer_median / scale) * 100,
    caption: "Trung vị ngành",
    band: bandOf(m.color),
  }
}

/** LineChart series from a {year,value} history, dropping nulls. */
function toLine(
  rows: Array<{ year: number; value: number | null }>,
  cls: string,
  label = "",
  scale: (v: number) => number = (v) => v,
): LineSeries {
  return {
    label,
    cls,
    points: rows
      .filter((r) => isNum(r.value))
      .map((r) => ({ x: r.year, y: round(scale(r.value as number)) })),
  }
}

/** PeerBar rows from compute peer rows — infer marker from the label. */
function toPeerRows(peer: BctcPeerRow[]): PeerRow[] {
  return peer
    .filter((p) => isNum(p.value))
    .map((p) => {
      const l = p.label.toLowerCase()
      let marker: PeerMarker = "company"
      if (l.includes("trung vị") || l.includes("ngành")) marker = "median"
      else if (l.includes("ngưỡng") || l.includes("cảnh báo")) marker = "threshold"
      return { label: p.label, value: p.value as number, marker }
    })
}

/* ── reusable layout primitives (scoped `.bctc-dash`) ──────────────────────── */

function MetricRow({ items }: { items: BctcMetric[] }) {
  return (
    <div className="bctc-metrics">
      {items.map((m) => (
        <MetricCard key={m.key} label={m.label} value={fmtMetricValue(m)} peer={peerOf(m)} />
      ))}
    </div>
  )
}

interface BarRow {
  label: string
  pct: number | null
  valueLabel?: string
  cls?: string
}

function Bars({ rows }: { rows: BarRow[] }) {
  return (
    <div className="bctc-bars">
      {rows.map((r, i) => {
        const w = isNum(r.pct) ? Math.max(0, Math.min(100, r.pct * 100)) : 0
        return (
          <div className="bctc-bar-row" key={i}>
            <span className="bctc-bar-lbl">{r.label}</span>
            <div className="bctc-bar-track">
              <span
                className="bctc-bar-fill"
                style={{ width: `${w}%`, background: colorVar(r.cls) }}
              />
            </div>
            <span className="bctc-bar-val">{r.valueLabel ?? pct(r.pct)}</span>
          </div>
        )
      })}
    </div>
  )
}

function Totals({ items }: { items: BctcTotal[] }) {
  return (
    <div className="bctc-totals">
      {items.map((t, i) => (
        <div className="bctc-total" key={i}>
          <div className="bctc-total-lbl">{t.label}</div>
          <div className="bctc-total-val">{tyLabel(t.value)}</div>
          {isNum(t.mult) ? <div className="bctc-total-mult">gấp {t.mult.toFixed(1)} lần</div> : null}
        </div>
      ))}
    </div>
  )
}

function Legend({ items }: { items: Array<{ label: string; cls: string }> }) {
  return (
    <div className="bctc-legend">
      {items.map((it, i) => (
        <span className="bctc-legend-item" key={i}>
          <i className="bctc-legend-dot" style={{ background: colorVar(it.cls) }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

function PanelLbl({ children }: { children: ReactNode }) {
  return (
    <div className="bctc-panel-lbl">
      <span className="bctc-pdot" />
      {children}
    </div>
  )
}

/* ── KHỐI 2 · định giá ─────────────────────────────────────────────────────── */

function ValuationBody({
  block,
  template,
}: {
  block: BctcValuationBlock
  template: BctcTemplate
}) {
  const ff = block.methods
    .filter((m) => isNum(m.base))
    .map((m) => ({
      name: m.name,
      bear: isNum(m.bear) ? m.bear : (m.base as number),
      base: m.base as number,
      bull: isNum(m.bull) ? m.bull : (m.base as number),
    }))
  return (
    <div className="bctc-block-body">
      {template === "A" && ff.length > 0 && isNum(block.current_price) ? (
        <FootballField methods={ff} currentPrice={block.current_price} />
      ) : null}
      <MetricRow items={block.metrics} />
    </div>
  )
}

/* ── KHỐI 3 · bức tranh tài chính ──────────────────────────────────────────── */

function FinancialBody({
  block,
  template,
}: {
  block: BctcFinancialBlock
  template: BctcTemplate
}) {
  const legend =
    template === "B"
      ? [
          { label: "Vốn chủ", cls: "fill-g" },
          { label: "Tiền gửi huy động", cls: "fill-accent" },
          { label: "Vay & phát hành", cls: "fill-a" },
        ]
      : [
          { label: "Vốn cổ đông", cls: "fill-g" },
          { label: "Nợ khác", cls: "fill-accent" },
          { label: "Nợ vay", cls: "fill-a" },
        ]
  const series: StackedYear[] = block.stacked_abs.map((s) => ({
    year: s.year,
    parts: [
      { label: legend[0].label, value: isNum(s.equity) ? s.equity : 0, cls: "fill-g" },
      { label: legend[1].label, value: isNum(s.other_liab) ? s.other_liab : 0, cls: "fill-accent" },
      { label: legend[2].label, value: isNum(s.debt) ? s.debt : 0, cls: "fill-a" },
    ],
  }))
  const growthRows: BarRow[] = block.growth_sources.map((g, i) => ({
    label: g.label,
    pct: g.pct,
    valueLabel: `${tyLabel(g.amount)} (${pct(g.pct, 0)})`,
    cls: i === 0 ? "fill-g" : i === 1 ? "fill-accent" : "fill-a",
  }))
  const assetPalette = ["fill-g", "fill-accent", "fill-neutral", "fill-a"]
  const assetRows: BarRow[] = block.asset_mix.map((a, i) => ({
    label: a.label,
    pct: a.pct,
    cls: assetPalette[i] ?? "fill-accent",
  }))
  return (
    <div className="bctc-block-body">
      <StackedBarAbsolute series={series} ariaLabel="Quy mô & cơ cấu nguồn vốn 5 năm" />
      <Legend items={legend} />
      <Totals items={block.totals} />
      <PanelLbl>Phần tăng thêm đến từ đâu (5 năm)</PanelLbl>
      <Bars rows={growthRows} />
      <PanelLbl>{template === "B" ? "Tài sản dùng làm gì" : "Tài sản nằm ở đâu"}</PanelLbl>
      <Bars rows={assetRows} />
    </div>
  )
}

/* ── KHỐI 4 · kinh doanh (A) ───────────────────────────────────────────────── */

function BusinessBodyA({
  block,
  estimated,
}: {
  block: BctcBusinessBlockA
  estimated: boolean
}) {
  const bars: ComboBar[] = block.revenue_series
    .filter((r) => isNum(r.revenue))
    .map((r) => ({ year: r.year, value: Math.round(ty(r.revenue)) }))
  const lines: ComboLine[] = [
    {
      label: "Biên gộp",
      cls: "fill-g",
      points: block.revenue_series.map((r) => (isNum(r.gross_margin) ? round(r.gross_margin * 100) : 0)),
    },
    {
      label: "Biên LNST",
      cls: "fill-a",
      points: block.revenue_series.map((r) => (isNum(r.net_margin) ? round(r.net_margin * 100) : 0)),
    },
  ]
  const eq = block.earnings_quality
  const eqRows: BarRow[] = [
    { label: "Lợi nhuận cốt lõi", pct: eq.core_pct, cls: "fill-g" },
    { label: "Khoản một lần", pct: eq.oneoff_pct, cls: "fill-a" },
  ]
  return (
    <div className="bctc-block-body">
      <ComboBarLine bars={bars} lines={lines} ariaLabel="Doanh thu (tỷ) & biên lợi nhuận 5 năm" />
      <MetricRow items={block.metrics} />
      <PanelLbl>
        Chất lượng lợi nhuận{estimated ? <span className="bctc-note"> (ước tính)</span> : null}
      </PanelLbl>
      <Bars rows={eqRows} />
    </div>
  )
}

/* ── KHỐI 4 · ngân hàng kiếm tiền (B) ──────────────────────────────────────── */

function EarningBodyB({ block }: { block: BctcBusinessBlockB }) {
  const nim = toLine(
    block.nim_series.map((r) => ({ year: r.year, value: r.nim })),
    "fill-g",
    "NIM",
    (v) => round(v * 100),
  )
  const mixPalette = ["fill-g", "fill-accent", "fill-a", "fill-neutral"]
  const mixRows: BarRow[] = block.income_mix.map((m, i) => ({
    label: m.label,
    pct: m.pct,
    cls: mixPalette[i] ?? "fill-accent",
  }))
  return (
    <div className="bctc-block-body">
      <PanelLbl>NIM 5 năm (%)</PanelLbl>
      <LineChart series={[nim]} ariaLabel="NIM 5 năm" />
      <MetricRow items={block.metrics} />
      <PanelLbl>Cơ cấu thu nhập</PanelLbl>
      <Bars rows={mixRows} />
    </div>
  )
}

/* ── KHỐI 5 · tiền có thật (A) ─────────────────────────────────────────────── */

function CashflowBodyA({ block }: { block: BctcCashflowBlockA }) {
  const profit = toLine(
    block.profit_vs_cash.map((r) => ({ year: r.year, value: r.profit })),
    "fill-a",
    "Lợi nhuận",
    ty,
  )
  const cfo = toLine(
    block.profit_vs_cash.map((r) => ({ year: r.year, value: r.cfo })),
    "fill-g",
    "Tiền từ KD",
    ty,
  )
  const steps: WaterfallStep[] = block.waterfall
    .filter((w) => isNum(w.value))
    .map((w) => {
      const v = w.value as number
      if (w.kind === "base") {
        return { label: w.label, value: round(v / 1e9), kind: "total" as WaterfallKind }
      }
      return {
        label: w.label,
        value: round(Math.abs(v) / 1e9),
        kind: (v >= 0 ? "increase" : "subtract") as WaterfallKind,
      }
    })
  return (
    <div className="bctc-block-body">
      <PanelLbl>Lợi nhuận vs Tiền mặt (tỷ · 5 năm)</PanelLbl>
      <LineChart series={[profit, cfo]} ariaLabel="Lợi nhuận vs Tiền mặt 5 năm" />
      <MetricRow items={block.metrics} />
      {steps.length > 0 ? (
        <Drilldown summary="Xem chi tiết — cầu nối dòng tiền (tỷ đồng)">
          <Waterfall steps={steps} />
        </Drilldown>
      ) : null}
    </div>
  )
}

/* ── KHỐI 5 · vận hành hiệu quả (B) ────────────────────────────────────────── */

function EfficiencyBodyB({ block }: { block: BctcCashflowBlockB }) {
  const cir = toLine(
    block.cir_series.map((r) => ({ year: r.year, value: r.cir })),
    "fill-g",
    "CIR",
    (v) => round(v * 100),
  )
  return (
    <div className="bctc-block-body">
      <PanelLbl>CIR 5 năm (%) — thấp là tốt</PanelLbl>
      <LineChart series={[cir]} ariaLabel="CIR 5 năm" />
      <MetricRow items={block.metrics} />
      {isNum(block.ppop) ? (
        <div className="bctc-caption">PPOP hiện tại: {tyLabel(block.ppop)}.</div>
      ) : null}
    </div>
  )
}

/* ── KHỐI 6 · sức khỏe (A) ─────────────────────────────────────────────────── */

function HealthBodyA({
  block,
  sub,
}: {
  block: BctcHealthBlockA
  sub?: Record<string, string>
}) {
  return (
    <>
      <SubQuestion code="6A" question="Công ty có nợ nhiều không?" answer={sub?.a ?? ""}>
        <DuoPanel
          left={
            <>
              <PanelLbl>Nợ ròng / EBITDA (5 năm) · dưới 0 = dư tiền</PanelLbl>
              <LineChart
                series={[toLine(block.sub_a.series, "fill-g")]}
                threshold={0}
                ariaLabel="Nợ ròng trên EBITDA"
              />
            </>
          }
          right={
            <>
              <PanelLbl>Nợ vay / Vốn chủ so ngành</PanelLbl>
              <PeerBar rows={toPeerRows(block.sub_a.peer)} />
            </>
          }
        />
      </SubQuestion>

      <SubQuestion
        code="6B"
        question="Gặp khó khăn thì công ty trụ được không?"
        answer={sub?.b ?? ""}
      >
        <DuoPanel
          left={
            <>
              <PanelLbl>Khả năng trả lãi vay (5 năm)</PanelLbl>
              <LineChart
                series={[toLine(block.sub_b.series, "fill-accent")]}
                ariaLabel="Khả năng trả lãi vay"
              />
            </>
          }
          right={
            <>
              <PanelLbl>Thanh khoản hiện hành so ngành</PanelLbl>
              <PeerBar rows={toPeerRows(block.sub_b.peer)} />
            </>
          }
        />
      </SubQuestion>

      <SubQuestion code="6C" question="Chất lượng sổ sách có ổn không?" answer={sub?.c ?? ""}>
        <Checklist items={block.sub_c.checklist} />
        <PanelLbl>Số ngày thu tiền (5 năm)</PanelLbl>
        <LineChart
          series={[
            toLine(
              block.sub_c.series.map((r) => ({ year: r.year, value: r.company })),
              "fill-accent",
              "Công ty",
            ),
          ]}
          ariaLabel="Số ngày thu tiền"
        />
      </SubQuestion>
    </>
  )
}

/* ── KHỐI 6 · chất lượng tài sản (B) ───────────────────────────────────────── */

function AssetQualityBodyB({
  block,
  sub,
  estimated,
}: {
  block: BctcHealthBlockB
  sub?: Record<string, string>
  estimated: boolean
}) {
  const nplPeers = toPeerRows(block.sub_a.peer).map((r) => ({
    ...r,
    valueLabel: pct(r.value),
    value: r.value * 100,
  }))
  return (
    <>
      {estimated ? (
        <div className="bctc-note bctc-note--block">
          Nợ xấu chi tiết &amp; CAR là ước tính do thiếu thuyết minh; chi phí dự phòng lấy từ KQKD.
        </div>
      ) : null}

      <SubQuestion code="6A" question="Nợ cho vay có bị xấu nhiều không?" answer={sub?.a ?? ""}>
        <DuoPanel
          left={
            <>
              <PanelLbl>Tỷ lệ nợ xấu (%) · ngưỡng 3%</PanelLbl>
              <LineChart
                series={[toLine(block.sub_a.series, "fill-g", "NPL", (v) => round(v * 100))]}
                threshold={3}
                ariaLabel="Tỷ lệ nợ xấu"
              />
            </>
          }
          right={
            <>
              <PanelLbl>So ngành</PanelLbl>
              <PeerBar rows={nplPeers} />
            </>
          }
        />
      </SubQuestion>

      <SubQuestion code="6B" question="Có dự phòng đủ cho rủi ro không?" answer={sub?.b ?? ""}>
        <DuoPanel
          left={
            <>
              <PanelLbl>Chi phí dự phòng / PPOP (5 năm)</PanelLbl>
              <LineChart
                series={[toLine(block.sub_b.series, "fill-accent", "", (v) => round(v * 100))]}
                ariaLabel="Chi phí dự phòng trên PPOP"
              />
            </>
          }
          right={
            <>
              <PanelLbl>So ngành</PanelLbl>
              <PeerBar rows={toPeerRows(block.sub_b.peer)} />
            </>
          }
        />
      </SubQuestion>
    </>
  )
}

/* ── KHỐI 7 · cổ tức ───────────────────────────────────────────────────────── */

function DividendBody({ block }: { block: BctcDashboardData["blocks"]["dividend"] }) {
  const bars: ComboBar[] = block.series
    .filter((r) => isNum(r.value))
    .map((r) => ({ year: r.year, value: round(r.value as number) }))
  const metrics: BctcMetric[] = [
    { key: "yield", label: "Tỷ suất cổ tức", value: block.yield, unit: "%", peer_median: null },
    { key: "payout", label: "Tỷ lệ chi trả", value: block.payout, unit: "%", peer_median: null },
  ]
  return (
    <div className="bctc-block-body">
      <ComboBarLine bars={bars} lines={[]} ariaLabel="Cổ tức 5 năm" />
      <MetricRow items={metrics} />
      <div className="bctc-caption">Hình thức chi trả chủ yếu: {block.form}.</div>
    </div>
  )
}

/* ── main ──────────────────────────────────────────────────────────────────── */

/**
 * BCTC storytelling dashboard (SPEC §2–§3). Walks BLOCK_ORDER and emits, per id:
 *   0 → hero + radar scorecard
 *   1 → AiMemo (premium narrative behind PremiumGate)
 *   2–7 → QuestionBlock with the block's charts/numbers + the narrative answer
 * Template A vs B branches the content + narrative keys of blocks 3–6. NO verdict
 * badges anywhere; the footer carries the compliance disclaimers (SPEC §8).
 */
export function BctcDashboard({ symbol }: { symbol: string }) {
  const { data, isLoading, isError } = useBctcDashboard(symbol)
  const { data: narrative } = useBctcDashboardAi(symbol) as { data: BctcNarrative | undefined }

  if (isLoading) {
    return (
      <div className="bctc-dash">
        <div className="bctc-dash-state">
          <Spin />
        </div>
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="bctc-dash">
        <div className="bctc-dash-state">
          Không tải được dữ liệu phân tích BCTC. Vui lòng thử lại.
        </div>
      </div>
    )
  }

  // Backend returns a 200 "empty dashboard" (blocks: {}) for symbols with no
  // BCTC periods — status/validator treat it as success, so it reaches here
  // with data present but no blocks. Render a friendly notice (with any
  // disclaimers the backend attached) instead of crashing on data.blocks.valuation.
  if (!data.blocks?.valuation) {
    return (
      <div className="bctc-dash">
        <div className="bctc-dash-state">
          {(data.meta?.disclaimers && data.meta.disclaimers[0]) ||
            "Không đủ dữ liệu báo cáo tài chính để dựng phân tích cho mã này."}
        </div>
      </div>
    )
  }

  const isBank = data.template === "B"
  const nb = narrative?.blocks
  const ans = (key: string): string => nb?.[key]?.answer ?? ""
  const subOf = (key: string): Record<string, string> | undefined => nb?.[key]?.sub
  const isEstimated = (prefix: string): boolean =>
    data.meta.is_estimated_fields.some((f) => f.startsWith(prefix))

  // radar dims → coerce B3-optional score/band/value_label into the chart shape
  const radarDims: RadarDim[] = data.radar.dims.map((d) => ({
    key: d.key,
    label: d.label,
    score: isNum(d.score) ? d.score : 0,
    band: d.band ?? "neutral",
    value_label: d.value_label ?? "—",
  }))
  const scored = data.radar.dims.filter((d) => isNum(d.score))
  const overall = scored.length
    ? scored.reduce((a, d) => a + (d.score as number), 0) / scored.length / 20
    : undefined

  const hero = data.hero
  const story = narrative?.story

  const renderBlock = (id: number): ReactNode => {
    switch (id) {
      case 0:
        return (
          <div className="bctc-hero-wrap">
            <HeroCard
              ticker={hero.ticker}
              name={hero.name ?? ""}
              exchange={hero.exchange ?? ""}
              sector={hero.sector ?? ""}
              price={isNum(hero.price) ? hero.price : 0}
              fairValue={isNum(hero.fair_value) ? hero.fair_value : 0}
              upsidePct={isNum(hero.upside_pct) ? hero.upside_pct * 100 : 0}
              verdictOneliner={narrative?.verdict_oneliner ?? "—"}
            >
              <RadarScorecard dims={radarDims} score={overall} />
            </HeroCard>
          </div>
        )

      case 1:
        return (
          <section className="bctc-block">
            <div className="bctc-block-tag">
              <span className="bctc-bt-num">01</span>
              <span className="bctc-bt-title">Câu chuyện doanh nghiệp</span>
              <span className="bctc-bt-line" />
            </div>
            <PremiumGate
              featureName="Phân tích BCTC bằng lời"
              description="Câu chuyện doanh nghiệp + điểm mạnh / cần theo dõi do AI tổng hợp trên số liệu đã tính."
            >
              {story ? (
                <AiMemo
                  lead={story.lead}
                  paragraphs={story.paragraphs}
                  strengths={story.strengths}
                  watchlist={story.watchlist}
                />
              ) : (
                <div className="bctc-memo">
                  <div className="bctc-memo-lead">
                    Phân tích bằng lời do AI tổng hợp từ số liệu đã tính.
                  </div>
                  <div className="bctc-memo-body">
                    <p>
                      Nâng cấp để xem câu chuyện doanh nghiệp: điểm mạnh, dòng tiền, định giá và các
                      điểm cần theo dõi.
                    </p>
                  </div>
                </div>
              )}
            </PremiumGate>
          </section>
        )

      case 2:
        return (
          <QuestionBlock
            num={2}
            title="Giá đang đắt hay rẻ?"
            question="Giá hiện tại đắt hay rẻ?"
            answer={ans("valuation")}
          >
            <ValuationBody block={data.blocks.valuation} template={data.template} />
          </QuestionBlock>
        )

      case 3:
        return (
          <QuestionBlock
            num={3}
            title="Bức tranh tài chính"
            question={
              isBank
                ? "Ngân hàng to cỡ nào và cơ cấu ra sao?"
                : "Công ty phình to ra sao, và tiền tăng thêm đến từ đâu?"
            }
            answer={ans("financial")}
          >
            <FinancialBody block={data.blocks.financial} template={data.template} />
          </QuestionBlock>
        )

      case 4:
        return (
          <QuestionBlock
            num={4}
            title={isBank ? "Ngân hàng kiếm tiền thế nào?" : "Kinh doanh có ổn không?"}
            question={
              isBank
                ? "Ngân hàng kiếm tiền ra sao, có bền không?"
                : "Doanh nghiệp kinh doanh có ổn không?"
            }
            answer={ans(isBank ? "earning" : "business")}
          >
            {isBank ? (
              <EarningBodyB block={data.blocks.business as BctcBusinessBlockB} />
            ) : (
              <BusinessBodyA
                block={data.blocks.business as BctcBusinessBlockA}
                estimated={isEstimated("blocks.business.earnings_quality")}
              />
            )}
          </QuestionBlock>
        )

      case 5:
        return (
          <QuestionBlock
            num={5}
            title={isBank ? "Vận hành có hiệu quả không?" : "Tiền có thật không?"}
            question={
              isBank
                ? "Ngân hàng vận hành có tiết kiệm không?"
                : "Lợi nhuận có biến thành tiền thật không?"
            }
            answer={ans(isBank ? "efficiency" : "cashflow")}
          >
            {isBank ? (
              <EfficiencyBodyB block={data.blocks.cashflow as BctcCashflowBlockB} />
            ) : (
              <CashflowBodyA block={data.blocks.cashflow as BctcCashflowBlockA} />
            )}
          </QuestionBlock>
        )

      case 6:
        return (
          <QuestionBlock
            num={6}
            title={isBank ? "Chất lượng tài sản có tốt không?" : "Sức khỏe tài chính có vững không?"}
            question={
              isBank
                ? "Nợ cho vay có xấu nhiều, dự phòng có đủ không?"
                : "Tài chính có đủ vững để vượt khó không?"
            }
            answer={ans(isBank ? "asset_quality" : "health")}
          >
            {isBank ? (
              <AssetQualityBodyB
                block={data.blocks.health as BctcHealthBlockB}
                sub={subOf("asset_quality")}
                estimated={isEstimated("blocks.health")}
              />
            ) : (
              <HealthBodyA block={data.blocks.health as BctcHealthBlockA} sub={subOf("health")} />
            )}
          </QuestionBlock>
        )

      case 7:
        return (
          <QuestionBlock
            num={7}
            title="Cổ đông nhận được gì?"
            question={
              isBank ? "Ngân hàng có chia tiền cho cổ đông không?" : "Công ty có chia tiền cho cổ đông không?"
            }
            answer={ans("dividend")}
          >
            <DividendBody block={data.blocks.dividend} />
          </QuestionBlock>
        )

      default:
        return null
    }
  }

  return (
    <div className="bctc-dash">
      <div className="bctc-dash-inner">
        {BLOCK_ORDER.map((id) => (
          <React.Fragment key={id}>{renderBlock(id)}</React.Fragment>
        ))}
        <footer className="bctc-footer">
          {data.meta.disclaimers.map((d, i) => (
            <p key={i}>{d}</p>
          ))}
        </footer>
      </div>
    </div>
  )
}
