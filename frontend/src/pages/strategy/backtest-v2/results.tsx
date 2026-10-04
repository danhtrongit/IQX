/**
 * Backtest v2 results (BACKTEST-RETROFIT §7, EXECUTION-PROFILE "Kết quả").
 *
 * - KPI cards in percent units; `null` → "—".
 * - Chart: strategy return % = (NAV/V0 − 1) × 100, buy & hold % and VN-Index %
 *   on ONE linear axis, starting from the engine's 0% initial point (before
 *   the first fee) — never rebased on the first post-fee bar.
 * - Full trade list (no row cap), signal vs execution dates, exit reason.
 * - Open position, canceled end-of-range orders and the immutable snapshot.
 */
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import {
  exitReasonLabel,
  fmtCount,
  fmtDate,
  fmtMoney,
  fmtNumberVN,
  fmtPercent,
  fmtPlainPercent,
  SIDE_LABEL,
  toneOf,
} from "./format"
import { thinSeries, toReturnSeries } from "./series"
import type { ClosedTrade, Kpis, RunResult } from "./types"

function KpiCard({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | null }) {
  const color = tone === "up" ? "text-price-up" : tone === "down" ? "text-price-down" : "text-foreground"
  return (
    <div className="border-b border-border px-4 py-3.5 sm:border-r" data-testid="kpi">
      <div className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className={`mt-1.5 font-mono text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  )
}

export function KpiGrid({ kpis }: { kpis: Kpis }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4">
      <KpiCard label="Tổng lợi nhuận" value={fmtPercent(kpis.net_return)} tone={toneOf(kpis.net_return)} />
      <KpiCard label="CAGR" value={fmtPercent(kpis.cagr)} tone={toneOf(kpis.cagr)} />
      <KpiCard label="Sụt giảm lớn nhất" value={fmtPercent(kpis.max_drawdown)} tone={toneOf(kpis.max_drawdown)} />
      <KpiCard label="Số giao dịch đã đóng" value={fmtCount(kpis.n_trades)} />
      <KpiCard label="Tỷ lệ thắng" value={fmtPlainPercent(kpis.win_rate)} />
      <KpiCard label="Profit factor" value={fmtNumberVN(kpis.profit_factor)} />
      <KpiCard label="Mua và giữ" value={fmtPercent(kpis.buy_hold_return)} tone={toneOf(kpis.buy_hold_return)} />
      <KpiCard label="VN-Index" value={fmtPercent(kpis.market_return)} tone={toneOf(kpis.market_return)} />
    </div>
  )
}

const CHART_CONFIG = {
  strategy: { label: "Danh mục chiến lược", color: "var(--primary)" },
  buy_hold: { label: "Mua và giữ", color: "var(--muted-foreground)" },
  vnindex: { label: "VN-Index", color: "var(--accent)" },
} satisfies ChartConfig

const pctTick = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(0)}%`

export function ReturnChart({ result, symbol }: { result: RunResult; symbol: string }) {
  const series = thinSeries(toReturnSeries(result))
  if (series.length < 2) {
    return (
      <div className="flex h-[200px] items-center justify-center p-4 text-xs text-muted-foreground italic">
        Không có dữ liệu giá trong khoảng thời gian đã chọn.
      </div>
    )
  }
  const hasVnindex = series.some((point) => point.vnindex != null)

  return (
    <div className="p-4">
      <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[300px] w-full">
        <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={56} tickFormatter={(value: string) => value.slice(0, 10)} />
          <YAxis type="number" scale="linear" tickLine={false} axisLine={false} width={56} tickFormatter={pctTick} domain={["auto", "auto"]} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <ChartTooltip
            content={
              <ChartTooltipContent
                indicator="line"
                formatter={(value, name) => (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {name === "buy_hold" ? `Mua và giữ ${symbol}` : (CHART_CONFIG[name as keyof typeof CHART_CONFIG]?.label ?? String(name))}
                    </span>
                    <span className="font-mono font-medium tabular-nums">{fmtPercent(Number(value))}</span>
                  </div>
                )}
              />
            }
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            align="right"
            verticalAlign="top"
            formatter={(value: string) =>
              value === "buy_hold" ? `Mua và giữ ${symbol}` : (CHART_CONFIG[value as keyof typeof CHART_CONFIG]?.label ?? value)
            }
          />
          <Line type="linear" dataKey="strategy" stroke="var(--color-strategy)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="buy_hold" stroke="var(--color-buy_hold)" strokeWidth={1.5} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          {hasVnindex && (
            <Line
              type="linear"
              dataKey="vnindex"
              stroke="var(--color-vnindex)"
              strokeWidth={1.5}
              strokeDasharray="2 3"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ChartContainer>
      {!hasVnindex && (
        <p className="mt-1 text-[11px] text-muted-foreground">Không có dữ liệu VN-Index cùng ngày gốc — không vẽ đường chỉ số.</p>
      )}
    </div>
  )
}

const TRADE_HEADINGS = [
  "#",
  "Tín hiệu mua",
  "Ngày mua",
  "Giá mua",
  "Tín hiệu bán",
  "Ngày bán",
  "Giá bán",
  "Số lượng",
  "Số phiên",
  "Lý do bán",
  "Lãi/Lỗ",
] as const

/** Every closed trade is rendered (newest first) — no row cap. */
export function TradeList({ trades }: { trades: ClosedTrade[] }) {
  const rows = [...trades].reverse()
  return (
    <section className="border-t border-border p-4" aria-label="Lịch sử giao dịch">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-bold tracking-wide uppercase">
        <span>Lịch sử giao dịch</span>
        <span className="font-normal text-muted-foreground normal-case tabular-nums">
          {trades.length} / {trades.length} giao dịch đã đóng
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Chưa có giao dịch đã đóng.</p>
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <Table className="text-[12px]">
            <TableHeader className="sticky top-0 bg-card">
              <TableRow className="hover:bg-transparent">
                {TRADE_HEADINGS.map((heading) => (
                  <TableHead key={heading} className="text-[10.5px] tracking-wide text-muted-foreground uppercase">
                    {heading}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="font-mono tabular-nums">
              {rows.map((trade) => (
                <TableRow key={trade.number} data-testid="trade-row">
                  <TableCell>{trade.number}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(trade.entry_signal_date)}</TableCell>
                  <TableCell>{fmtDate(trade.entry_date)}</TableCell>
                  <TableCell>{fmtNumberVN(trade.entry_price, 0)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(trade.exit_signal_date)}</TableCell>
                  <TableCell>{fmtDate(trade.exit_date)}</TableCell>
                  <TableCell>{fmtNumberVN(trade.exit_price, 0)}</TableCell>
                  <TableCell>{fmtCount(trade.qty)}</TableCell>
                  <TableCell>{fmtCount(trade.hold)}</TableCell>
                  <TableCell className="font-sans">
                    {exitReasonLabel(trade.exit_reason)}
                    {trade.concurrent_reasons && trade.concurrent_reasons.length > 1 && (
                      <span className="block text-[10.5px] text-muted-foreground">
                        Đồng thời: {trade.concurrent_reasons.map(exitReasonLabel).join(", ")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={trade.pnl >= 0 ? "text-price-up" : "text-price-down"}>
                    {fmtPercent(trade.pnl_pct)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}

const FEE_LABEL = (buy: number, sell: number) =>
  buy === 0 && sell === 0
    ? "Không tính phí"
    : `Phí mua ${fmtNumberVN(buy * 100)}%, phí/thuế bán ${fmtNumberVN(sell * 100)}%`

export function SnapshotBlock({ result }: { result: RunResult }) {
  const snapshot = result.snapshot
  const options = snapshot.options
  const revision = snapshot.shared_revision ?? snapshot.config?.revision
  return (
    <details className="border-t border-border px-4 py-3 text-xs" data-testid="snapshot">
      <summary className="cursor-pointer font-medium">Giả định và cấu hình của lần chạy</summary>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        <div><dt className="inline text-muted-foreground">Cấu hình: </dt><dd className="inline">#{revision ?? "—"}</dd></div>
        <div><dt className="inline text-muted-foreground">Mã băm cấu hình: </dt><dd className="inline font-mono break-all">{snapshot.config_hash ?? "—"}</dd></div>
        <div><dt className="inline text-muted-foreground">Phiên bản: </dt><dd className="inline font-mono">{result.engine_version} · {result.calculation_version} · {result.rule_version} · {result.formula_version}</dd></div>
        <div><dt className="inline text-muted-foreground">Dữ liệu: </dt><dd className="inline font-mono break-all">{snapshot.data_source ?? "—"}{snapshot.data_hash ? ` · ${snapshot.data_hash}` : ""}</dd></div>
        <div><dt className="inline text-muted-foreground">Khoảng yêu cầu: </dt><dd className="inline">{fmtDate(snapshot.requested_start ?? options?.start)} → {fmtDate(snapshot.requested_end ?? options?.end)}</dd></div>
        <div><dt className="inline text-muted-foreground">Khoảng thực tế: </dt><dd className="inline">{fmtDate(snapshot.actual_start)} → {fmtDate(snapshot.actual_end)} · {fmtCount(snapshot.bar_count)} phiên</dd></div>
        <div><dt className="inline text-muted-foreground">Khớp lệnh: </dt><dd className="inline">{options?.execution === "same_close" ? "Đóng cửa cùng phiên (giả định demo)" : "Mở cửa phiên kế tiếp"}</dd></div>
        <div><dt className="inline text-muted-foreground">Phí: </dt><dd className="inline">{options ? FEE_LABEL(options.fee_buy, options.fee_sell) : "—"}</dd></div>
        <div><dt className="inline text-muted-foreground">Vốn ban đầu: </dt><dd className="inline">{fmtMoney(options?.capital)}</dd></div>
        <div><dt className="inline text-muted-foreground">Lô: </dt><dd className="inline">{fmtCount(options?.lot ?? result.profile?.lot_size)} · giữ tối thiểu {fmtCount(options?.min_held_bars ?? result.profile?.min_held_bars)} phiên</dd></div>
      </dl>
      <p className="mt-2 text-muted-foreground">
        100% tiền mặt khả dụng; tối đa một vị thế. Không ATR stop, không chốt lời và không giới hạn thời gian giữ.
        Giữ tối thiểu là tương thích mô phỏng cũ, không xác nhận lịch thanh toán thực tế. Trượt giá chưa mô phỏng.
        Mua và giữ là tỷ số giá thuần (không phí, không lô). Không ép bán cuối kỳ.
      </p>
    </details>
  )
}

export function OpenPositionBlock({ result }: { result: RunResult }) {
  const position = result.open_position
  if (!position) return null
  return (
    <section className="border-t border-border px-4 py-3 text-xs" data-testid="open-position">
      <strong>Vị thế đang mở:</strong> {fmtCount(position.qty)} cổ phiếu mua {fmtDate(position.date)} (tín hiệu{" "}
      {fmtDate(position.signal_date)}) giá {fmtNumberVN(position.price, 0)} · giá cuối {fmtNumberVN(position.last_price, 0)} ·
      giá trị {fmtMoney(position.market_value)} · lãi/lỗ chưa thực hiện {fmtMoney(position.unrealized_pnl)}. Được định giá
      trong tổng lợi nhuận nhưng chưa tính là giao dịch đã đóng; chưa trừ phí/thuế bán.
    </section>
  )
}

export function CanceledOrdersNote({ result }: { result: RunResult }) {
  if (!result.canceled?.length) return null
  return (
    <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground" data-testid="canceled-orders">
      {result.canceled.length} lệnh chờ bị hủy vì hết khoảng kiểm thử (
      {result.canceled.map((order) => SIDE_LABEL[order.action]).join(", ")}) — không khớp ngoài ngày kết thúc.
    </p>
  )
}

export function BacktestResults({
  result,
  symbol,
  currentRevision,
}: {
  result: RunResult
  symbol: string
  currentRevision: number
}) {
  const revision = result.snapshot.shared_revision ?? result.snapshot.config?.revision
  const stale = typeof revision === "number" && revision !== currentRevision
  return (
    <section className="overflow-hidden rounded-lg bg-card" aria-label="Kết quả backtest">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-[12px] font-bold tracking-wide uppercase">Kết quả backtest</h2>
          <div className="font-mono text-[11px] text-muted-foreground">
            {symbol} · {fmtDate(result.snapshot.actual_start)} → {fmtDate(result.snapshot.actual_end)} · Cấu hình #{revision ?? "—"}
          </div>
        </div>
        {stale && (
          <span className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            Cấu hình đã lưu hiện tại là #{currentRevision}
          </span>
        )}
      </div>
      <KpiGrid kpis={result.kpis} />
      <div className="px-4 pt-3 text-[11px] tracking-wide text-muted-foreground uppercase">Lợi nhuận danh mục (%) · thang tuyến tính</div>
      <ReturnChart result={result} symbol={symbol} />
      <SnapshotBlock result={result} />
      <OpenPositionBlock result={result} />
      <CanceledOrdersNote result={result} />
      <TradeList trades={result.trades ?? []} />
    </section>
  )
}
