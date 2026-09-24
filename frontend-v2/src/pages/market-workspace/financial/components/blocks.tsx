/**
 * KHỐI 2–7 — thân của từng khối. Template A (doanh nghiệp) và B (ngân hàng)
 * chia nhánh ở đây; tiêu đề/câu hỏi chia nhánh ở `bctc-dashboard.tsx`.
 *
 * Mọi số đều lấy từ payload; chỉ tiêu thiếu dữ liệu render "—" chứ không suy
 * diễn. Không có verdict pill/badge ở bất kỳ khối nào.
 */
import { round } from "../charts/chart-tokens"
import { ComboBarLine, type ComboBar, type ComboLine } from "../charts/combo-bar-line"
import { FootballField, type ValuationMethod } from "../charts/football-field"
import { LineChart } from "../charts/line-chart"
import { PeerBar } from "../charts/peer-bar"
import { StackedBarAbsolute, type StackedYear } from "../charts/stacked-bar-absolute"
import { Waterfall, type WaterfallStep } from "../charts/waterfall"
import { isNum, pct, toLine, toPeerRows, ty, tyLabel } from "../format"
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
  BctcTemplate,
  BctcValuationBlock,
} from "../types"
import { Checklist } from "./checklist"
import { Drilldown } from "./drilldown"
import { DuoPanel } from "./duo-panel"
import { Bars, Legend, MetricRow, PanelLabel, Totals, type BarRow } from "./layout"
import { SubQuestion } from "./sub-question"

/* ── KHỐI 2 · định giá ─────────────────────────────────────────────────────── */

export function ValuationBody({
  block,
  template,
}: {
  block: BctcValuationBlock
  template: BctcTemplate
}) {
  const ff = block.methods.flatMap<ValuationMethod>((m) => {
    const base = m.base
    if (!isNum(base)) return []
    return [
      {
        name: m.name,
        bear: isNum(m.bear) ? m.bear : base,
        base,
        bull: isNum(m.bull) ? m.bull : base,
      },
    ]
  })
  return (
    <div className="space-y-5">
      {template === "A" && ff.length > 0 && isNum(block.current_price) ? (
        <FootballField methods={ff} currentPrice={block.current_price} />
      ) : null}
      <MetricRow items={block.metrics} />
    </div>
  )
}

/* ── KHỐI 3 · bức tranh tài chính ──────────────────────────────────────────── */

export function FinancialBody({
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
  // Chart is scaled to tỷ (the payload carries đồng) so the axis labels stay
  // readable and match the tỷ totals printed right below it.
  const series: StackedYear[] = block.stacked_abs.map((s) => ({
    year: s.year,
    parts: [
      { label: legend[0].label, value: round(ty(s.equity)), cls: "fill-g" },
      { label: legend[1].label, value: round(ty(s.other_liab)), cls: "fill-accent" },
      { label: legend[2].label, value: round(ty(s.debt)), cls: "fill-a" },
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
    <div className="space-y-5">
      <StackedBarAbsolute series={series} ariaLabel="Quy mô & cơ cấu nguồn vốn 5 năm" />
      <Legend items={legend} />
      <Totals items={block.totals} />
      <PanelLabel>Phần tăng thêm đến từ đâu (5 năm)</PanelLabel>
      <Bars rows={growthRows} />
      <PanelLabel>{template === "B" ? "Tài sản dùng làm gì" : "Tài sản nằm ở đâu"}</PanelLabel>
      <Bars rows={assetRows} />
    </div>
  )
}

/* ── KHỐI 4 · kinh doanh (A) ───────────────────────────────────────────────── */

export function BusinessBodyA({
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
      points: block.revenue_series.map((r) =>
        isNum(r.gross_margin) ? round(r.gross_margin * 100) : 0,
      ),
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
    <div className="space-y-5">
      <ComboBarLine bars={bars} lines={lines} ariaLabel="Doanh thu (tỷ) & biên lợi nhuận 5 năm" />
      <MetricRow items={block.metrics} />
      <PanelLabel>
        Chất lượng lợi nhuận
        {estimated ? <span className="italic normal-case text-price-ref"> (ước tính)</span> : null}
      </PanelLabel>
      <Bars rows={eqRows} />
    </div>
  )
}

/* ── KHỐI 4 · ngân hàng kiếm tiền (B) ──────────────────────────────────────── */

export function EarningBodyB({ block }: { block: BctcBusinessBlockB }) {
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
    <div className="space-y-5">
      <PanelLabel>NIM 5 năm (%)</PanelLabel>
      <LineChart series={[nim]} ariaLabel="NIM 5 năm" />
      <MetricRow items={block.metrics} />
      <PanelLabel>Cơ cấu thu nhập</PanelLabel>
      <Bars rows={mixRows} />
    </div>
  )
}

/* ── KHỐI 5 · tiền có thật (A) ─────────────────────────────────────────────── */

export function CashflowBodyA({ block }: { block: BctcCashflowBlockA }) {
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
  const steps: WaterfallStep[] = block.waterfall.flatMap<WaterfallStep>((w) => {
    const value = w.value
    if (!isNum(value)) return []
    if (w.kind === "base") {
      return [{ label: w.label, value: round(value / 1e9), kind: "total" }]
    }
    return [
      {
        label: w.label,
        value: round(Math.abs(value) / 1e9),
        kind: value >= 0 ? "increase" : "subtract",
      },
    ]
  })
  return (
    <div className="space-y-5">
      <PanelLabel>Lợi nhuận vs Tiền mặt (tỷ · 5 năm)</PanelLabel>
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

export function EfficiencyBodyB({ block }: { block: BctcCashflowBlockB }) {
  const cir = toLine(
    block.cir_series.map((r) => ({ year: r.year, value: r.cir })),
    "fill-g",
    "CIR",
    (v) => round(v * 100),
  )
  return (
    <div className="space-y-5">
      <PanelLabel>CIR 5 năm (%) — thấp là tốt</PanelLabel>
      <LineChart series={[cir]} ariaLabel="CIR 5 năm" />
      <MetricRow items={block.metrics} />
      {isNum(block.ppop) ? (
        <div className="text-xs italic leading-5 text-muted-foreground">
          PPOP hiện tại: {tyLabel(block.ppop)}.
        </div>
      ) : null}
    </div>
  )
}

/* ── KHỐI 6 · sức khỏe (A) ─────────────────────────────────────────────────── */

export function HealthBodyA({
  block,
  sub,
}: {
  block: BctcHealthBlockA
  sub?: Record<string, string>
}) {
  return (
    <div className="space-y-3.5">
      <SubQuestion code="6A" question="Công ty có nợ nhiều không?" answer={sub?.a ?? ""}>
        <DuoPanel
          left={
            <>
              <PanelLabel>Nợ ròng / EBITDA (5 năm) · dưới 0 = dư tiền</PanelLabel>
              <LineChart
                series={[toLine(block.sub_a.series, "fill-g")]}
                threshold={0}
                ariaLabel="Nợ ròng trên EBITDA"
              />
            </>
          }
          right={
            <>
              <PanelLabel>Nợ vay / Vốn chủ so ngành</PanelLabel>
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
              <PanelLabel>Khả năng trả lãi vay (5 năm)</PanelLabel>
              <LineChart
                series={[toLine(block.sub_b.series, "fill-accent")]}
                ariaLabel="Khả năng trả lãi vay"
              />
            </>
          }
          right={
            <>
              <PanelLabel>Thanh khoản hiện hành so ngành</PanelLabel>
              <PeerBar rows={toPeerRows(block.sub_b.peer)} />
            </>
          }
        />
      </SubQuestion>

      <SubQuestion code="6C" question="Chất lượng sổ sách có ổn không?" answer={sub?.c ?? ""}>
        <div className="space-y-5">
          <Checklist items={block.sub_c.checklist} />
          <PanelLabel>Số ngày thu tiền (5 năm)</PanelLabel>
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
        </div>
      </SubQuestion>
    </div>
  )
}

/* ── KHỐI 6 · chất lượng tài sản (B) ───────────────────────────────────────── */

export function AssetQualityBodyB({
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
    <div className="space-y-3.5">
      {estimated ? (
        <p className="text-xs italic leading-5 text-price-ref">
          Nợ xấu chi tiết &amp; CAR là ước tính do thiếu thuyết minh; chi phí dự phòng lấy từ KQKD.
        </p>
      ) : null}

      <SubQuestion code="6A" question="Nợ cho vay có bị xấu nhiều không?" answer={sub?.a ?? ""}>
        <DuoPanel
          left={
            <>
              <PanelLabel>Tỷ lệ nợ xấu (%) · ngưỡng 3%</PanelLabel>
              <LineChart
                series={[toLine(block.sub_a.series, "fill-g", "NPL", (v) => round(v * 100))]}
                threshold={3}
                ariaLabel="Tỷ lệ nợ xấu"
              />
            </>
          }
          right={
            <>
              <PanelLabel>So ngành</PanelLabel>
              <PeerBar rows={nplPeers} />
            </>
          }
        />
      </SubQuestion>

      <SubQuestion code="6B" question="Có dự phòng đủ cho rủi ro không?" answer={sub?.b ?? ""}>
        <DuoPanel
          left={
            <>
              <PanelLabel>Chi phí dự phòng / PPOP (5 năm)</PanelLabel>
              <LineChart
                series={[toLine(block.sub_b.series, "fill-accent", "", (v) => round(v * 100))]}
                ariaLabel="Chi phí dự phòng trên PPOP"
              />
            </>
          }
          right={
            <>
              <PanelLabel>So ngành</PanelLabel>
              <PeerBar rows={toPeerRows(block.sub_b.peer)} />
            </>
          }
        />
      </SubQuestion>
    </div>
  )
}

/* ── KHỐI 7 · cổ tức ───────────────────────────────────────────────────────── */

export function DividendBody({ block }: { block: BctcDashboardData["blocks"]["dividend"] }) {
  const bars: ComboBar[] = block.series.flatMap<ComboBar>((r) => {
    const value = r.value
    if (!isNum(value)) return []
    return [{ year: r.year, value: Math.round(value) }]
  })
  const metrics: BctcMetric[] = [
    { key: "yield", label: "Tỷ suất cổ tức", value: block.yield, unit: "%", peer_median: null },
    { key: "payout", label: "Tỷ lệ chi trả", value: block.payout, unit: "%", peer_median: null },
  ]
  return (
    <div className="space-y-5">
      <ComboBarLine bars={bars} lines={[]} ariaLabel="Cổ tức 5 năm" />
      <MetricRow items={metrics} />
      <div className="text-xs italic leading-5 text-muted-foreground">
        Hình thức chi trả chủ yếu: {block.form}.
      </div>
    </div>
  )
}
