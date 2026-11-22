/**
 * Kết quả of one stored basket run (spec v2.0 §4.7, §4.8): title + caption, 7 KPIs, the 3-line chart
 * (Chiến lược, Mua và giữ rổ, VN-Index), 5 tabs and the per-symbol chart. A stored run never changes; a
 * result that no longer matches the form is flagged "Cấu hình đã đổi sau lần chạy này · cần chạy lại".
 */
import { useState } from "react"
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react"
import { CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"

import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { ErrorLine } from "../shared/controls"
import { DialogShell } from "../shared/dialog-shell"
import { errorMessage } from "../shared/errors"
import { fmtDate, fmtInt, fmtNumber, fmtPercent, fmtSignedPercent, fmtSignedVnd, fmtVnd, toneClass } from "../shared/format"
import { TRADES_PAGE_SIZE, type ClosedTrade, type RunView } from "./api"
import { universeLabel } from "./draft"
import { useSymbolChart, useTradesPage } from "./hooks"
import { exitReasonText, thinPoints, warningText } from "./results-model"
import { CLOSE_FILL, LABEL, PAST_RESULTS, SUB_TEXT } from "./ui"

const TH = `px-3 py-2 text-left text-[10.5px] font-semibold tracking-wide uppercase whitespace-nowrap ${SUB_TEXT}`
const TD = "px-3 py-2 whitespace-nowrap tabular-nums"

function Kpi({ label, value, tone, compare }: { label: string; value: string; tone?: string; compare?: boolean }) {
  return (
    <div className={`min-w-0 px-3 py-3 ${compare ? "bg-muted/40" : ""}`} data-testid="kpi">
      <div className={LABEL}>{label}</div>
      <div className={`mt-1.5 font-heading text-lg font-bold tabular-nums ${tone ?? ""}`}>{value}</div>
    </div>
  )
}

export function KpiStrip({ run }: { run: RunView }) {
  const k = run.kpis
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border border-y border-border sm:grid-cols-4 xl:grid-cols-7 xl:divide-y-0" role="group" aria-label="Bảy chỉ số kết quả">
      <Kpi label="Tổng lợi nhuận" value={fmtSignedPercent(k.total_return, 1)} tone={toneClass(k.total_return)} />
      <Kpi label="Lợi nhuận năm hóa" value={k.annualized_return === null ? "—" : fmtSignedPercent(k.annualized_return, 1)} tone={toneClass(k.annualized_return)} />
      <Kpi label="Sụt giảm lớn nhất" value={fmtSignedPercent(k.max_drawdown, 1)} tone={toneClass(k.max_drawdown)} />
      <Kpi label="Giao dịch đã đóng" value={fmtInt(k.closed_trades)} />
      <Kpi label="Tỷ lệ thắng" value={k.win_rate === null ? "—" : fmtPercent(k.win_rate, 1)} />
      <Kpi label="Mua và giữ rổ" value={k.basket_buy_hold === null ? "—" : fmtSignedPercent(k.basket_buy_hold, 1)} tone={toneClass(k.basket_buy_hold)} compare />
      <Kpi label="VN-Index" value={k.vnindex === null ? "—" : fmtSignedPercent(k.vnindex, 1)} tone={toneClass(k.vnindex)} compare />
    </div>
  )
}

const CHART_CONFIG = {
  strategy: { label: "Chiến lược", color: "var(--primary)" },
  basket: { label: "Mua và giữ rổ", color: "var(--chart-7)" },
  vnindex: { label: "VN-Index", color: "var(--price-ref)" },
} satisfies ChartConfig

const pctTick = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(0)}%`

export function ReturnChart({ run }: { run: RunView }) {
  const points = thinPoints(run.curve)
  if (points.length < 2) {
    return <div className={`flex h-[200px] items-center justify-center p-4 text-xs ${SUB_TEXT}`}>Không có dữ liệu giá trong khoảng thời gian đã chọn.</div>
  }
  const names = { strategy: "Chiến lược", basket: "Mua và giữ rổ", vnindex: "VN-Index" } as const
  const legend = [
    { key: "strategy" as const, dash: "", color: "var(--primary)" },
    { key: "basket" as const, dash: "6 4", color: "var(--chart-7)" },
    { key: "vnindex" as const, dash: "2 3", color: "var(--price-ref)" },
  ]
  return (
    <div className="px-1 pb-2 sm:px-3" data-testid="return-chart">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pt-3 text-xs" aria-label="Chú giải biểu đồ">
        {legend.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5">
            <svg aria-hidden="true" width="22" height="6" viewBox="0 0 22 6">
              <line x1="0" y1="3" x2="22" y2="3" stroke={item.color} strokeWidth="2" strokeDasharray={item.dash || undefined} />
            </svg>
            {item.key === "basket" ? "Mua và giữ rổ (chia đều vốn)" : names[item.key]}
          </li>
        ))}
      </ul>
      <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[260px] w-full sm:h-[300px]">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={56} tickFormatter={(value: string) => fmtDate(value)} />
          <YAxis type="number" tickLine={false} axisLine={false} width={52} tickFormatter={pctTick} domain={["auto", "auto"]} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <ChartTooltip
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(_label, payload) => fmtDate(String((payload?.[0]?.payload as { date?: string } | undefined)?.date ?? ""))}
                formatter={(value, name) => (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span>{names[name as keyof typeof names] ?? String(name)}</span>
                    <span className="font-mono font-medium tabular-nums">{fmtSignedPercent(Number(value), 1)}</span>
                  </div>
                )}
              />
            }
          />
          <Line type="linear" dataKey="vnindex" stroke="var(--color-vnindex)" strokeWidth={1.5} strokeDasharray="2 3" dot={false} connectNulls isAnimationActive={false} />
          <Line type="linear" dataKey="basket" stroke="var(--color-basket)" strokeWidth={1.7} strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />
          <Line type="linear" dataKey="strategy" stroke="var(--color-strategy)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ChartContainer>
    </div>
  )
}

function Pager({ page, pages, onPage, children }: { page: number; pages: number; onPage: (page: number) => void; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-2 text-xs">
      <span>Trang {page + 1}/{pages}{children}</span>
      <span className="flex gap-1">
        <Button type="button" variant="outline" size="icon-sm" aria-label="Trang trước" disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft aria-hidden="true" /></Button>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Trang sau" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}><ChevronRight aria-hidden="true" /></Button>
      </span>
    </div>
  )
}

function TradesTab({ run, onSymbol }: { run: RunView; onSymbol: (symbol: string) => void }) {
  const [page, setPage] = useState(0)
  const query = useTradesPage(run.run_id, page)
  const total = query.data?.total ?? run.trades_total
  const pages = Math.max(1, Math.ceil(total / TRADES_PAGE_SIZE))
  if (total === 0) return <p className={`p-4 text-center text-xs ${SUB_TEXT}`}>Chưa có giao dịch nào được đóng trong khoảng thời gian này.</p>
  if (query.isError) return <div className="p-3"><ErrorLine>{errorMessage(query.error)}</ErrorLine></div>
  if (!query.data) return <Skeleton className="m-3 h-40" aria-label="Đang tải giao dịch" />
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" aria-label="Giao dịch đã đóng">
          <thead className="border-b border-border"><tr>{["Mã", "Ngày mua", "Giá mua", "KL", "Ngày bán", "Giá bán", "Số phiên giữ", "Lý do bán", "Lãi/lỗ", "%"].map((head) => <th key={head} className={TH}>{head}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {query.data.items.map((trade, index) => (
              <tr key={`${trade.symbol}-${trade.entry_date}-${index}`} className="cursor-pointer hover:bg-muted/50" onClick={() => onSymbol(trade.symbol)}>
                <td className={TD}><button type="button" className="font-semibold text-primary hover:underline" onClick={(event) => { event.stopPropagation(); onSymbol(trade.symbol) }}>{trade.symbol}</button></td>
                <td className={TD}>{fmtDate(trade.entry_date)}</td>
                <td className={TD}>{fmtInt(trade.entry_price)}</td>
                <td className={TD}>{fmtInt(trade.quantity)}</td>
                <td className={TD}>{fmtDate(trade.exit_date)}</td>
                <td className={TD}>{fmtInt(trade.exit_price)}</td>
                <td className={TD}>{trade.holding_sessions}</td>
                <td className={`${TD} ${trade.exit_reason === "max_holding" ? "text-status-warning" : ""}`}>{exitReasonText(trade)}</td>
                <td className={`${TD} ${toneClass(trade.pnl)}`}>{fmtSignedVnd(trade.pnl)}</td>
                <td className={`${TD} ${toneClass(trade.pnl_pct)}`}>{fmtSignedPercent(trade.pnl_pct, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} onPage={setPage}>
        {" "}· {fmtInt(query.data.time_exit_count ?? run.time_exit_count)} lệnh bán do hết thời gian giữ
      </Pager>
    </div>
  )
}

function PerSymbolTab({ run, onSymbol }: { run: RunView; onSymbol: (symbol: string) => void }) {
  const rows = run.per_symbol.filter((row) => row.closed_trades > 0 || (row.unrealized_pnl ?? 0) !== 0)
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" aria-label="Theo mã">
          <thead className="border-b border-border"><tr>{["Mã", "Lệnh đã đóng", "Thắng", "Lãi/lỗ đã chốt", "Tạm tính", "Đóng góp vào vốn (%)"].map((head) => <th key={head} className={TH}>{head}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr><td colSpan={6} className={`${TD} ${SUB_TEXT}`}>Không có mã nào được giao dịch.</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.symbol} className="cursor-pointer hover:bg-muted/50" onClick={() => onSymbol(row.symbol)}>
                  <td className={TD}><b>{row.symbol}</b></td>
                  <td className={TD}>{row.closed_trades}</td>
                  <td className={TD}>{row.wins}</td>
                  <td className={`${TD} ${toneClass(row.realized_pnl)}`}>{fmtSignedVnd(row.realized_pnl)}</td>
                  <td className={`${TD} ${toneClass(row.unrealized_pnl)}`}>{row.unrealized_pnl ? fmtSignedVnd(row.unrealized_pnl) : "—"}</td>
                  <td className={`${TD} ${toneClass(row.contribution_pct)}`}>{fmtSignedPercent(row.contribution_pct, 1)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className={`px-1 pt-2 text-xs ${SUB_TEXT}`}>Bấm một mã để xem biểu đồ giá với điểm mua, bán. Các mã trong rổ chưa từng được mua không hiện ở đây.</p>
    </div>
  )
}

function OpenTab({ run, onSymbol }: { run: RunView; onSymbol: (symbol: string) => void }) {
  if (run.open_positions.length === 0) return <p className={`p-4 text-center text-xs ${SUB_TEXT}`}>Không còn vị thế mở cuối kỳ. Tiền mặt cuối kỳ: {fmtVnd(run.final_cash)}.</p>
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" aria-label="Vị thế còn mở">
          <thead className="border-b border-border"><tr>{["Mã", "Ngày mua", "Giá mua", "KL", "Giá cuối kỳ", "Đã giữ", "Tạm tính", "%"].map((head) => <th key={head} className={TH}>{head}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {run.open_positions.map((row) => (
              <tr key={row.symbol} className="cursor-pointer hover:bg-muted/50" onClick={() => onSymbol(row.symbol)}>
                <td className={TD}><b>{row.symbol}</b></td>
                <td className={TD}>{fmtDate(row.entry_date)}</td>
                <td className={TD}>{fmtInt(row.entry_price)}</td>
                <td className={TD}>{fmtInt(row.quantity)}</td>
                <td className={TD}>{fmtInt(row.last_price)}</td>
                <td className={TD}>{row.held_sessions}/{row.max_holding} phiên</td>
                <td className={`${TD} ${toneClass(row.unrealized_pnl)}`}>{fmtSignedVnd(row.unrealized_pnl)}</td>
                <td className={`${TD} ${toneClass(row.unrealized_pct)}`}>{fmtSignedPercent(row.unrealized_pct, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`px-1 pt-2 text-xs ${SUB_TEXT}`}>Tạm tính theo giá đóng cửa phiên cuối, chưa trừ phí bán. Tiền mặt cuối kỳ: {fmtVnd(run.final_cash)}.</p>
    </div>
  )
}

function SkippedTab({ run }: { run: RunView }) {
  const counts = Object.entries(run.skipped_orders.counts)
  const total = run.skipped_orders.total ?? counts.reduce((sum, [, value]) => sum + value, 0)
  if (total === 0) return <p className={`p-4 text-center text-xs ${SUB_TEXT}`}>Không có lệnh mua nào bị bỏ qua.</p>
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-1.5 pt-2 text-xs" aria-label="Đếm theo lý do">
        {counts.map(([reason, value]) => <li key={reason} className="rounded-sm border border-border bg-muted/40 px-2 py-0.5">{reason}: <b>{fmtInt(value)}</b></li>)}
      </ul>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" aria-label="Lệnh mua bị bỏ qua">
          <thead className="border-b border-border"><tr>{["Ngày", "Mã", "Lý do"].map((head) => <th key={head} className={TH}>{head}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {run.skipped_orders.items.slice(0, 60).map((row, index) => (
              <tr key={`${row.date}-${row.symbol}-${index}`}>
                <td className={TD}>{fmtDate(row.date)}</td>
                <td className={TD}><b>{row.symbol}</b></td>
                <td className="px-3 py-2">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 60 && <p className={`text-xs ${SUB_TEXT}`}>Hiện 60 dòng gần nhất / {fmtInt(total)}.</p>}
      <p className={`text-xs ${SUB_TEXT}`}>Khi có hơn 2 mã đạt điều kiện Mua trong cùng phiên, ưu tiên mã có GTGD trung bình 20 phiên cao hơn.</p>
    </div>
  )
}

function AssumptionsTab({ run }: { run: RunView }) {
  const snapshot = run.snapshot
  const hold = snapshot.content.max_holding
  return (
    <div className="space-y-3 pt-2 text-xs leading-6" data-testid="assumptions">
      <ul className="list-disc space-y-0.5 pl-5">
        <li>Vốn ban đầu cố định <b>{fmtVnd(snapshot.capital)}</b>, bằng vốn Bot.</li>
        <li>Tín hiệu tính khi có giá đóng cửa phiên T, chỉ dùng nến đến phiên T. Lệnh <b>khớp giá đóng cửa cùng phiên T</b>.</li>
        <li>Phiên khớp Mua là <b>phiên 0</b>. Mỗi phiên: <b>bán trước, mua sau</b>; tiền bán dùng mua được ngay trong phiên.</li>
        <li>Bán khi điều kiện Bán đạt <b>hoặc</b> đã giữ đủ {hold} phiên. <b>T+2</b>: mua phiên T, bán sớm nhất phiên T+2.</li>
        <li>Mua tối đa 2 mã mỗi phiên, mỗi lệnh 12% NAV, làm tròn xuống lô 100, mỗi mã tối đa 30% NAV; không mua thêm mã đang giữ, không mua lại mã vừa bán trong phiên.</li>
        <li>Phí mua 0,15%, bán 0,25% (đã gồm thuế). Cuối kỳ không ép bán; vị thế mở tạm tính theo giá đóng cửa.</li>
        <li>
          Dữ liệu giá: kho VN100 ({snapshot.data_store}), đơn vị {snapshot.price_unit === "VND" ? "đồng" : snapshot.price_unit}, {snapshot.adjusted ? "giá đã điều chỉnh" : "giá chưa điều chỉnh"}, tới phiên {fmtDate(snapshot.data_as_of)}. Luật {snapshot.rules_version}.
        </li>
        <li>Mua và giữ rổ: chia đều vốn cho các mã trong rổ ở phiên đầu, tính theo tỷ lệ, có phí mua, không bán.</li>
      </ul>
      <p className="font-bold">{CLOSE_FILL}</p>
      {snapshot.warnings.length > 0 && (
        <ul className="space-y-1.5" aria-label="Cảnh báo dữ liệu">
          {snapshot.warnings.map((warning, index) => (
            <li key={`${warning.code}-${index}`} className="flex items-start gap-1.5 rounded-md border border-status-warning/50 bg-status-warning/10 px-2.5 py-1.5">
              <TriangleAlert aria-hidden="true" className="mt-1 size-3.5 shrink-0 text-status-warning" />
              <span>{warningText(warning)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type Marker = { date: string; close: number | null; buy: number | null; sellInd: number | null; sellMax: number | null }

function Triangle({ cx, cy, value, color, down }: { cx?: number; cy?: number; value?: number | null; color: string; down?: boolean }) {
  if (value == null || cx == null || cy == null) return <g />
  const d = down ? `M${cx} ${cy - 3} l-5 -9 h10z` : `M${cx} ${cy + 3} l-5 9 h10z`
  return <path d={d} fill={color} />
}

function SymbolChartDialog({ run, symbol, onClose }: { run: RunView; symbol: string; onClose: () => void }) {
  const query = useSymbolChart(run, symbol)
  const data = query.data
  const at = new Map<string, Marker>((data?.closes ?? []).map((bar) => [bar.date, { date: bar.date, close: bar.close, buy: null, sellInd: null, sellMax: null }]))
  // A trade session missing from the market closes still gets its marker (at the fill price).
  const rowAt = (date: string) => {
    const found = at.get(date)
    if (found) return found
    const created: Marker = { date, close: null, buy: null, sellInd: null, sellMax: null }
    at.set(date, created)
    return created
  }
  const trades: ClosedTrade[] = data?.trades ?? []
  for (const trade of trades) {
    rowAt(trade.entry_date).buy = trade.entry_price
    const exit = rowAt(trade.exit_date)
    if (trade.exit_reason === "max_holding") exit.sellMax = trade.exit_price
    else exit.sellInd = trade.exit_price
  }
  if (data?.open_position) rowAt(data.open_position.entry_date).buy = data.open_position.entry_price
  const rows = [...at.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return (
    <DialogShell title={`${symbol} · giá đóng cửa và điểm giao dịch`} size="lg" onClose={onClose} footer={<Button type="button" variant="outline" onClick={onClose}>Đóng</Button>}>
      {query.isError ? (
        <ErrorLine>{errorMessage(query.error)}</ErrorLine>
      ) : !data ? (
        <Skeleton className="h-[240px] w-full" aria-label="Đang tải biểu đồ mã" />
      ) : (
        <div data-testid="symbol-chart">
          <ChartContainer config={{ close: { label: "Giá đóng cửa", color: "var(--primary)" } }} className="aspect-auto h-[240px] w-full">
            <ComposedChart data={rows} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={56} tickFormatter={(value: string) => fmtDate(value)} />
              <YAxis tickLine={false} axisLine={false} width={60} domain={["auto", "auto"]} tickFormatter={(value: number) => fmtNumber(value, 0)} />
              <Line type="linear" dataKey="close" stroke="var(--color-close)" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
              <Line dataKey="buy" stroke="none" isAnimationActive={false} dot={(props: { cx?: number; cy?: number; value?: number | null; index?: number }) => <Triangle key={`b${props.index}`} {...props} color="var(--price-up)" />} activeDot={false} />
              <Line dataKey="sellInd" stroke="none" isAnimationActive={false} dot={(props: { cx?: number; cy?: number; value?: number | null; index?: number }) => <Triangle key={`s${props.index}`} {...props} color="var(--price-down)" down />} activeDot={false} />
              <Line dataKey="sellMax" stroke="none" isAnimationActive={false} dot={(props: { cx?: number; cy?: number; value?: number | null; index?: number }) => <Triangle key={`m${props.index}`} {...props} color="var(--status-warning)" down />} activeDot={false} />
            </ComposedChart>
          </ChartContainer>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs" aria-label="Chú giải điểm giao dịch">
            <li><span className="text-price-up" aria-hidden="true">▲</span> Mua</li>
            <li><span className="text-price-down" aria-hidden="true">▼</span> Bán · Điều kiện Bán</li>
            <li><span className="text-status-warning" aria-hidden="true">▼</span> Bán · Hết thời gian giữ</li>
          </ul>
          <p className={`pt-1 text-xs ${SUB_TEXT}`}>{trades.length} giao dịch đã đóng{data.open_position ? " · đang giữ cuối kỳ" : ""}.</p>
        </div>
      )}
    </DialogShell>
  )
}

export function BacktestResults({ run, label, stale }: { run: RunView; label: string; stale: boolean }) {
  const [symbol, setSymbol] = useState<string | null>(null)
  const snapshot = run.snapshot
  const triggers = "h-8 flex-none rounded-none px-3 text-xs font-medium after:bottom-0 after:bg-primary data-active:text-primary"
  return (
    <section aria-label="Kết quả backtest" className="min-w-0 overflow-hidden rounded-lg border border-border bg-card" data-testid="backtest-results">
      <div className="space-y-1.5 p-4">
        {stale && (
          <p className="inline-flex items-center gap-1.5 rounded-md border border-status-warning/50 bg-status-warning/10 px-2 py-1 text-xs font-semibold" data-testid="stale-label">
            <TriangleAlert aria-hidden="true" className="size-3.5 text-status-warning" />
            Cấu hình đã đổi sau lần chạy này · cần chạy lại
          </p>
        )}
        <h2 className="font-heading text-base font-bold break-words">Kết quả · {label}</h2>
        <p className={`text-xs leading-5 break-words ${SUB_TEXT}`} data-testid="result-caption">
          Rổ {universeLabel(snapshot.content.universe)} ({snapshot.universe_resolved.length} mã) · {fmtDate(snapshot.start)} – {fmtDate(snapshot.end)} · {fmtInt(snapshot.sessions)} phiên · giữ tối đa {snapshot.content.max_holding} phiên · khớp giá đóng cửa cùng phiên
        </p>
      </div>
      <KpiStrip run={run} />
      <ReturnChart run={run} />
      <Tabs defaultValue="trades" className="gap-0 border-t border-border">
        <TabsList variant="line" aria-label="Chi tiết kết quả" className="h-9 w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border px-2">
          <TabsTrigger value="trades" className={triggers}>Giao dịch ({fmtInt(run.trades_total)})</TabsTrigger>
          <TabsTrigger value="symbols" className={triggers}>Theo mã</TabsTrigger>
          <TabsTrigger value="open" className={triggers}>Vị thế còn mở ({run.open_positions.length})</TabsTrigger>
          <TabsTrigger value="skipped" className={triggers}>Lệnh mua bị bỏ qua ({fmtInt(run.skipped_orders.total ?? Object.values(run.skipped_orders.counts).reduce((sum, value) => sum + value, 0))})</TabsTrigger>
          <TabsTrigger value="assumptions" className={triggers}>Giả định</TabsTrigger>
        </TabsList>
        <div className="p-3">
          <TabsContent value="trades"><TradesTab run={run} onSymbol={setSymbol} /></TabsContent>
          <TabsContent value="symbols"><PerSymbolTab run={run} onSymbol={setSymbol} /></TabsContent>
          <TabsContent value="open"><OpenTab run={run} onSymbol={setSymbol} /></TabsContent>
          <TabsContent value="skipped"><SkippedTab run={run} /></TabsContent>
          <TabsContent value="assumptions"><AssumptionsTab run={run} /></TabsContent>
        </div>
      </Tabs>
      <p className="border-t border-border px-4 py-2.5 text-xs" data-testid="past-results">{PAST_RESULTS}</p>
      {symbol && <SymbolChartDialog run={run} symbol={symbol} onClose={() => setSymbol(null)} />}
    </section>
  )
}
