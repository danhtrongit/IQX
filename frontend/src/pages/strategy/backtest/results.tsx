/**
 * Result of one stored run (immutable): exactly six KPIs, the "Lợi nhuận danh mục (%)" chart, the
 * assumptions of the run, the full closed-trade history (paged by the server) and, apart from it,
 * the open position and the orders left unfilled at the end of the range. Editing the form never
 * edits a result: a result that no longer matches the form is flagged "cần chạy lại".
 */
import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import type { TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"

import { ErrorLine } from "../shared/controls"
import { DialogShell } from "../shared/dialog-shell"
import { errorMessage } from "../shared/errors"
import { EvidenceTable } from "../shared/evidence-table"
import { fmtDate, fmtInt, fmtNumber, fmtPercent, fmtSignedPercent, fmtSignedVnd, fmtVnd, shortHash, toneClass } from "../shared/format"
import { TRADES_PAGE_SIZE, type ClosedTrade, type OpenPosition, type PendingOrder, type RunResponse, type RunResult } from "./api"
import { useTradesPage } from "./hooks"
import {
  chartPoints,
  conditionNames,
  configCaption,
  exitReasonLabel,
  OUTCOME_LABEL,
  snapshotParams,
  thinPoints,
  tradesPageFromRun,
} from "./results-model"

const TH = "px-3 py-2.5 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase"

function Kpi({ label, value, caption, tone }: { label: string; value: string; caption: string; tone?: string }) {
  return (
    <div className="px-4 py-3.5" data-testid="kpi">
      <div className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className={`mt-2 font-heading text-xl font-bold tabular-nums ${tone ?? ""}`}>{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{caption}</div>
    </div>
  )
}

/** Exactly the six KPIs of the Strategy spec; nothing else is a KPI here. */
export function KpiStrip({ result }: { result: RunResult }) {
  const { kpis, supplementary } = result
  const wins = supplementary.winning_trade_count
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border border-y border-border sm:grid-cols-3 xl:grid-cols-6 xl:divide-y-0" role="group" aria-label="Sáu chỉ số kết quả">
      <Kpi label="Tổng lợi nhuận" value={fmtSignedPercent(kpis.total_return_pct, 1)} caption="Gồm tiền mặt và vị thế cuối kỳ" tone={toneClass(kpis.total_return_pct)} />
      <Kpi label="Lợi nhuận năm hóa" value={fmtSignedPercent(kpis.annualized_return_pct, 1)} caption="CAGR, quy ước 252 phiên/năm" tone={toneClass(kpis.annualized_return_pct)} />
      <Kpi label="Sụt giảm lớn nhất" value={fmtSignedPercent(kpis.max_drawdown_pct, 1)} caption="Từ đỉnh trước đó" tone={toneClass(kpis.max_drawdown_pct)} />
      <Kpi label="Số giao dịch" value={fmtInt(kpis.closed_trade_count)} caption="Vòng mua và bán đã đóng" />
      <Kpi
        label="Tỷ lệ thắng"
        value={fmtPercent(kpis.win_rate_pct, 1)}
        caption={kpis.closed_trade_count > 0 ? `${wins} / ${kpis.closed_trade_count} giao dịch` : "Chưa có giao dịch đã đóng"}
      />
      <Kpi label="Lợi nhuận mua và giữ" value={fmtSignedPercent(kpis.buy_hold_return_pct, 1)} caption="Đầu kỳ → cuối kỳ, chưa phí/cổ tức" tone={toneClass(kpis.buy_hold_return_pct)} />
    </div>
  )
}

const CHART_CONFIG = {
  strategy: { label: "Danh mục chiến lược", color: "var(--primary)" },
  buyHold: { label: "Mua và giữ", color: "var(--muted-foreground)" },
  market: { label: "VN-Index", color: "var(--price-ref)" },
} satisfies ChartConfig

const pctTick = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(0)}%`

export function ReturnChart({ result, symbol }: { result: RunResult; symbol: string }) {
  const points = thinPoints(chartPoints(result))
  const market = result.chart.series.find((series) => series.id === "market")
  const showMarket = !!market?.available && points.some((point) => point.market !== null)
  if (points.length < 2) {
    return <div className="flex h-[200px] items-center justify-center p-4 text-xs text-muted-foreground italic">Không có dữ liệu giá trong khoảng thời gian đã chọn.</div>
  }
  const names = { strategy: "Danh mục chiến lược", buyHold: `Mua và giữ ${symbol}`, market: "VN-Index" } as const
  const legend: { key: keyof typeof names; dash: string; color: string }[] = [
    { key: "strategy", dash: "", color: "var(--primary)" },
    { key: "buyHold", dash: "6 4", color: "var(--muted-foreground)" },
    ...(showMarket ? [{ key: "market" as const, dash: "2 3", color: "var(--price-ref)" }] : []),
  ]
  return (
    <div className="px-2 pb-2 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2 pt-4">
        <h3 className="text-[11px] font-bold tracking-wide uppercase">{result.chart.title}</h3>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Chú giải biểu đồ">
          {legend.map((item) => (
            <li key={item.key} className="flex items-center gap-1.5">
              <svg aria-hidden="true" width="22" height="6" viewBox="0 0 22 6">
                <line x1="0" y1="3" x2="22" y2="3" stroke={item.color} strokeWidth="2" strokeDasharray={item.dash || undefined} />
              </svg>
              {names[item.key]}
            </li>
          ))}
        </ul>
      </div>
      <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[280px] w-full sm:h-[320px]">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={56} tickFormatter={(value: string) => fmtDate(value)} />
          <YAxis type="number" scale="linear" tickLine={false} axisLine={false} width={56} tickFormatter={pctTick} domain={["auto", "auto"]} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <ChartTooltip
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(_label, payload) => fmtDate(String((payload?.[0]?.payload as { date?: string } | undefined)?.date ?? ""))}
                formatter={(value, name) => (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-muted-foreground">{names[name as keyof typeof names] ?? String(name)}</span>
                    <span className="font-mono font-medium tabular-nums">{fmtSignedPercent(Number(value))}</span>
                  </div>
                )}
              />
            }
          />
          <Line type="linear" dataKey="strategy" stroke="var(--color-strategy)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="buyHold" stroke="var(--color-buyHold)" strokeWidth={1.5} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          {showMarket && <Line type="linear" dataKey="market" stroke="var(--color-market)" strokeWidth={1.5} strokeDasharray="2 3" dot={false} connectNulls={false} isAnimationActive={false} />}
        </LineChart>
      </ChartContainer>
      {!showMarket && (
        <p className="mt-1 text-[11px] text-muted-foreground">VN-Index: {market?.unavailable_reason ?? "chưa đủ dữ liệu cùng ngày gốc"}. Không vẽ chuỗi 0% thay thế.</p>
      )}
    </div>
  )
}

function Assumptions({ run, result }: { run: RunResponse; result: RunResult }) {
  const snapshot = result.snapshot
  const simulation = snapshot.simulation
  const warnings = snapshot.data_warnings
  return (
    <details className="border-t border-border px-4 py-3 text-xs" data-testid="assumptions">
      <summary className="cursor-pointer font-medium">Giả định của lần kiểm thử</summary>
      <div className="mt-2 space-y-2 leading-5 text-muted-foreground">
        <p>
          <strong className="text-foreground">{simulation?.execution_label ?? (snapshot.execution === "same_close" ? "Đóng cửa cùng phiên" : "Mở cửa phiên kế tiếp")}</strong>
          {simulation ? `. ${simulation.fill_price}. ${simulation.caveat}` : ""}
        </p>
        <p>
          Một mã, tối đa một vị thế. Mỗi lần mua dùng tối đa tiền khả dụng gồm phí, làm tròn xuống lô {fmtInt(snapshot.lot_size)} cổ phiếu. Phí: mua {fmtNumber(snapshot.fees.buy * 100)}%, bán gồm thuế {fmtNumber(snapshot.fees.sell * 100)}%
          {snapshot.fee_preset === "none" ? " (không tính phí)" : ""}. Không có stop, chốt lời, trailing hay giới hạn thời gian giữ. Không ép bán cuối kỳ.
        </p>
        {simulation && (
          <p>
            Khóa bán tối thiểu {fmtInt(simulation.min_held_bars)} phiên giữ là quy ước kế thừa từ engine tham chiếu, đang chờ chủ sản phẩm chốt. Thanh toán, thanh khoản và trượt giá chưa được mô phỏng. Mua và giữ là tỷ số giá đóng cửa, chưa tính phí hoặc cổ tức; năm hóa theo {simulation.annualization_sessions} phiên/năm.
          </p>
        )}
        <p>
          Cấu hình chung bản {snapshot.shared_revision} · {shortHash(snapshot.config_hash)} · dữ liệu {snapshot.data_source}{snapshot.adjusted ? " (giá điều chỉnh)" : ""} · {shortHash(snapshot.data_hash)}
          {" "}· phiên bản {snapshot.versions.engine_version}, {snapshot.versions.calculation_version}, {snapshot.versions.rule_version}. Chạy kiểm thử không ghi cấu hình của Bot và không đổi vốn tài khoản.
        </p>
        <p>Vốn ban đầu {fmtVnd(snapshot.capital)} · khoảng yêu cầu {fmtDate(snapshot.requested_start)} đến {fmtDate(snapshot.requested_end)} · mã lần chạy {shortHash(run.run_id, 8)}.</p>
        {warnings.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4 text-price-ref" aria-label="Cảnh báo dữ liệu">
            {warnings.map((warning) => <li key={warning.code}>{warning.message}</li>)}
          </ul>
        )}
      </div>
    </details>
  )
}

function TradeDetail({ trade, run, indicators, onClose }: { trade: ClosedTrade; run: RunResponse; indicators: readonly TechnicalIndicator[]; onClose: () => void }) {
  const config = run.result?.snapshot.config as Record<string, unknown> | undefined
  const paramsFor = (rule: { indicator: string; side: "buy" | "sell" }) => snapshotParams(config, rule.indicator, rule.side)
  return (
    <DialogShell
      title={`Giao dịch #${trade.number} · ${run.result?.snapshot.symbol ?? ""}`}
      badge={<Badge variant="outline" className={toneClass(trade.pnl) || undefined}>{OUTCOME_LABEL[trade.outcome]}</Badge>}
      description="Ngày tín hiệu khác ngày khớp. Các giá trị bên dưới là đúng lúc tín hiệu được ghi nhận."
      size="lg"
      onClose={onClose}
      footer={<Button type="button" variant="outline" onClick={onClose}>Đóng</Button>}
    >
      <dl className="grid gap-x-8 gap-y-3 text-xs sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="font-semibold text-price-up">Mua</dt>
          <dd>Tín hiệu {fmtDate(trade.entry_signal_date)} · khớp {fmtDate(trade.entry_date)}</dd>
          <dd>{fmtInt(trade.qty)} cổ phiếu × {fmtNumber(trade.entry_price, 0)} đ · phí {fmtVnd(trade.entry_fee)}</dd>
          <dd>Tổng chi <strong className="tabular-nums">{fmtVnd(trade.entry_total)}</strong></dd>
        </div>
        <div className="space-y-1">
          <dt className="font-semibold text-price-down">Bán</dt>
          <dd>Tín hiệu {fmtDate(trade.exit_signal_date)} · khớp {fmtDate(trade.exit_date)}</dd>
          <dd>{fmtInt(trade.qty)} cổ phiếu × {fmtNumber(trade.exit_price, 0)} đ · phí và thuế {fmtVnd(trade.exit_fee_tax)}</dd>
          <dd>Thực nhận <strong className="tabular-nums">{fmtVnd(trade.exit_net)}</strong> ({exitReasonLabel(trade.exit_reason)})</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Giữ {fmtInt(trade.hold)} phiên · lãi/lỗ thuần</dt>
          <dd className={`text-sm font-bold tabular-nums ${toneClass(trade.pnl)}`}>{fmtSignedVnd(trade.pnl)} ({fmtSignedPercent(trade.pnl_pct)})</dd>
        </div>
      </dl>
      <section className="space-y-1.5">
        <h3 className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">Điều kiện Mua tại tín hiệu</h3>
        {trade.entry_conditions ? <EvidenceTable rules={trade.entry_conditions.rules} indicators={indicators} paramsFor={paramsFor} label="Điều kiện Mua tại tín hiệu" /> : <p className="text-xs text-muted-foreground">Không có bằng chứng điều kiện được lưu.</p>}
      </section>
      <section className="space-y-1.5">
        <h3 className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">Điều kiện Bán tại tín hiệu</h3>
        {trade.exit_conditions ? <EvidenceTable rules={trade.exit_conditions.rules} indicators={indicators} paramsFor={paramsFor} label="Điều kiện Bán tại tín hiệu" /> : <p className="text-xs text-muted-foreground">Không có bằng chứng điều kiện được lưu.</p>}
      </section>
    </DialogShell>
  )
}

function OpenPositionStrip({ position, symbol }: { position: OpenPosition; symbol: string }) {
  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-muted/20 px-4 py-3 text-xs" data-testid="open-position" aria-label="Vị thế đang mở">
      <Badge variant="secondary">Vị thế đang mở</Badge>
      <b>{symbol} · {fmtInt(position.qty)} CP</b>
      <span className="text-muted-foreground">Mua {fmtDate(position.date)} (tín hiệu {fmtDate(position.signal_date)})</span>
      <span className="text-muted-foreground">Giá vốn {fmtNumber(position.price, 0)} đ</span>
      <span className="text-muted-foreground">Giá cuối {fmtNumber(position.last_price, 0)} đ · giá trị {fmtVnd(position.market_value)}</span>
      <span className={toneClass(position.unrealized_pnl)}>Tạm tính {fmtSignedVnd(position.unrealized_pnl)}</span>
      <span className="basis-full text-[11px] text-muted-foreground">
        Chỉ tính tạm: giá trị tại giá đóng cửa cuối trừ tổng chi mua, chưa trừ phí và thuế bán. Chưa là giao dịch đã đóng, không vào số giao dịch hay tỷ lệ thắng.
      </span>
    </section>
  )
}

function PendingOrders({ orders }: { orders: readonly PendingOrder[] }) {
  if (orders.length === 0) return null
  return (
    <section className="space-y-1 border-t border-border px-4 py-3 text-xs" data-testid="pending-orders" aria-label="Lệnh chưa khớp cuối kỳ">
      <Badge variant="outline">Lệnh chưa khớp cuối kỳ</Badge>
      <ul className="space-y-1 text-muted-foreground">
        {orders.map((order) => (
          <li key={`${order.action}-${order.signal_date}`}>
            Tín hiệu {order.action === "buy" ? "Mua" : "Bán"} cuối kỳ {fmtDate(order.signal_date)} chưa có phiên khớp tiếp theo trong khoảng đã chọn. {order.note}
          </li>
        ))}
      </ul>
    </section>
  )
}

function TradeHistory({ run, result, indicators }: { run: RunResponse; result: RunResult; indicators: readonly TechnicalIndicator[] }) {
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<ClosedTrade | null>(null)
  const seed = useMemo(() => tradesPageFromRun(run), [run])
  const trades = useTradesPage(run.run_id, page, seed)
  const view = trades.data
  const total = view?.total ?? result.counts.closed_trade_count
  const pages = Math.max(1, Math.ceil(total / TRADES_PAGE_SIZE))
  const symbol = result.snapshot.symbol

  return (
    <section aria-label="Lịch sử giao dịch" className="border-t border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h3 className="font-heading text-sm font-bold">Lịch sử giao dịch</h3>
        <span className="text-xs text-muted-foreground" data-testid="trade-total">Toàn bộ {fmtInt(total)} giao dịch đã đóng</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-xs" aria-label="Giao dịch đã đóng">
          <thead className="border-y border-border bg-muted/30">
            <tr>
              <th scope="col" className={`${TH} text-left`}>#</th>
              <th scope="col" className={`${TH} text-left`}>Ngày mua</th>
              <th scope="col" className={`${TH} text-left`}>Điều kiện mua</th>
              <th scope="col" className={`${TH} text-right`}>Giá mua (đ)</th>
              <th scope="col" className={`${TH} text-right`}>Số CP</th>
              <th scope="col" className={`${TH} text-left`}>Ngày bán</th>
              <th scope="col" className={`${TH} text-left`}>Điều kiện bán</th>
              <th scope="col" className={`${TH} text-right`}>Giá bán (đ)</th>
              <th scope="col" className={`${TH} text-right`}>Giữ (phiên)</th>
              <th scope="col" className={`${TH} text-right`}>Lãi/lỗ</th>
              <th scope="col" className="w-10 px-2"><span className="sr-only">Chi tiết</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {trades.isPending && !view ? (
              [0, 1, 2].map((row) => <tr key={row}><td colSpan={11} className="p-3"><Skeleton className="h-6 w-full" /></td></tr>)
            ) : trades.isError && !view ? (
              <tr><td colSpan={11} className="space-y-2 p-4">
                <ErrorLine>{errorMessage(trades.error)}</ErrorLine>
                <Button type="button" variant="outline" size="sm" onClick={() => void trades.refetch()}>Thử lại</Button>
              </td></tr>
            ) : !view || view.items.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">Chưa có giao dịch đã đóng trong khoảng kiểm thử này.</td></tr>
            ) : (
              view.items.map((trade) => (
                <tr key={trade.number} data-testid="trade-row">
                  <td className="px-3 py-2.5 text-muted-foreground">{trade.number}</td>
                  <td className="px-3 py-2.5">{fmtDate(trade.entry_date)}</td>
                  <td className="max-w-[180px] px-3 py-2.5 font-sans break-words">{conditionNames(trade.entry_conditions, indicators)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtNumber(trade.entry_price, 0)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtInt(trade.qty)}</td>
                  <td className="px-3 py-2.5">{fmtDate(trade.exit_date)}</td>
                  <td className="max-w-[180px] px-3 py-2.5 font-sans break-words">{conditionNames(trade.exit_conditions, indicators)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtNumber(trade.exit_price, 0)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtInt(trade.hold)}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${toneClass(trade.pnl)}`}>{fmtSignedPercent(trade.pnl_pct, 1)}</td>
                  <td className="px-2 py-1.5">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Chi tiết giao dịch ${trade.number}`} onClick={() => setSelected(trade)}>
                      <ChevronRight aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <span>Hiển thị từ {page * TRADES_PAGE_SIZE + 1} đến {Math.min(total, (page + 1) * TRADES_PAGE_SIZE)} trên {fmtInt(total)} giao dịch</span>
          <span className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon-sm" aria-label="Trang trước" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft aria-hidden="true" /></Button>
            <span className="px-1 tabular-nums">Trang {page + 1}/{pages}</span>
            <Button type="button" variant="outline" size="icon-sm" aria-label="Trang sau" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}><ChevronRight aria-hidden="true" /></Button>
          </span>
        </div>
      )}
      {view?.open_position && <OpenPositionStrip position={view.open_position} symbol={symbol} />}
      <PendingOrders orders={view?.pending_orders ?? result.pending_orders} />
      {selected && <TradeDetail trade={selected} run={run} indicators={indicators} onClose={() => setSelected(null)} />}
    </section>
  )
}

export function BacktestResults({
  run,
  indicators,
  stale,
}: {
  run: RunResponse
  indicators: readonly TechnicalIndicator[]
  /** The form or the saved config no longer matches the inputs of this run. */
  stale: boolean
}) {
  const result = run.result
  if (!result) return null
  const snapshot = result.snapshot
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label="Kết quả backtest" data-testid="backtest-results">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="font-heading text-sm font-bold tracking-wide uppercase">Kết quả backtest</h2>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            {snapshot.symbol} · {fmtDate(snapshot.actual_start)} đến {fmtDate(snapshot.actual_end)} · {fmtInt(snapshot.bar_count)} phiên · cấu hình bản {snapshot.shared_revision} · {result.snapshot.simulation?.execution_label ?? (snapshot.execution === "same_close" ? "Đóng cửa cùng phiên" : "Mở cửa phiên kế tiếp")}
            <br />
            {configCaption(snapshot.config as Record<string, unknown>, indicators)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Mỗi lần chạy được lưu bất biến; xem lại ở mục Đã lưu.</p>
        </div>
        {stale && <Badge variant="outline" className="border-price-ref/50 text-price-ref" data-testid="stale-badge">Cấu hình đã đổi · cần chạy lại</Badge>}
      </div>
      <KpiStrip result={result} />
      <ReturnChart result={result} symbol={snapshot.symbol} />
      <Assumptions run={run} result={result} />
      <TradeHistory run={run} result={result} indicators={indicators} />
    </section>
  )
}
