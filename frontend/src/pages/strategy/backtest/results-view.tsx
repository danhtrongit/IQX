/**
 * Kết quả backtest — port từ
 * `dashboard/src/features/backtest/components/ResultsView.tsx`.
 *
 * Ba phần: lưới 6 KPI cốt lõi (kèm giải thích Sharpe), đường vốn so với mua-giữ
 * và VN-Index (quy về % từ điểm đầu, giảm mẫu còn ~400 điểm), và bảng lịch sử
 * lệnh (mới nhất trước, mặc định 12 lệnh). Giá trị thiếu hiển thị "—".
 */
import { useState, type ReactNode } from "react"
import { Info } from "lucide-react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { fmtDateVN, fmtNum, fmtPrice, fmtSignedPct } from "../format"
import type { EquityPoint, Kpis, RunMeta, RunResult, Trade } from "../types"

/** Xếp hạng Sharpe theo thang 0–2 của tài liệu chỉ báo. */
function sharpeBand(sharpe: number | null): string {
  if (sharpe == null) return "—"
  if (sharpe < 0) return "Tệ"
  if (sharpe < 1) return "Kém"
  if (sharpe <= 2) return "Tốt"
  return "Rất tốt"
}

function Kpi({
  label,
  value,
  sub,
  tone,
  info,
}: {
  label: string
  value: string
  sub?: string
  tone?: "up" | "down"
  info?: ReactNode
}) {
  const color =
    tone === "up" ? "text-price-up" : tone === "down" ? "text-price-down" : "text-foreground"

  return (
    <div className="border-b border-border px-4 py-4 lg:border-r lg:border-b-0 lg:last:border-r-0">
      <div className="flex items-center gap-1 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
        {info}
      </div>
      <div className={`mt-1.5 font-mono text-[20px] font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

function SharpeInfo({ sharpe }: { sharpe: number | null }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Giải thích Sharpe ratio"
          className="cursor-help text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] space-y-1.5 p-3 text-[12px] leading-snug">
        <p className="font-semibold">Sharpe ratio là gì?</p>
        <p>
          Đo lường lợi nhuận kiếm được trên mỗi đơn vị rủi ro. Sharpe càng cao, chiến lược càng hiệu
          quả so với mức biến động.
        </p>
        <ul className="space-y-0.5 pl-3 text-[11px]">
          <li>{"< 0 → Tệ (tệ hơn không rủi ro)"}</li>
          <li>{"0–1 → Kém"}</li>
          <li>{"1–2 → Tốt"}</li>
          <li>{"> 2 → Rất tốt"}</li>
        </ul>
        <p className="border-t border-border pt-1 font-semibold">
          Chiến lược của bạn: {fmtNum(sharpe, 2)} → {sharpeBand(sharpe)}
        </p>
      </TooltipContent>
    </Tooltip>
  )
}

function KpiGrid({ kpis, meta }: { kpis: Kpis; meta: RunMeta }) {
  const [ciLow, ciHigh] = kpis.sharpeCi
  const sharpeSub =
    ciLow != null && ciHigh != null
      ? `KTC 95%: ${fmtNum(ciLow, 2)} – ${fmtNum(ciHigh, 2)}`
      : "Đã điều chỉnh rủi ro"

  return (
    <div className="grid grid-cols-2 border-b border-border md:grid-cols-3 lg:grid-cols-6">
      <Kpi
        label="Lãi trung bình mỗi năm"
        value={fmtSignedPct(kpis.cagr)}
        tone={(kpis.cagr ?? 0) >= 0 ? "up" : "down"}
      />
      <Kpi
        label="Tổng lãi sau phí + thuế"
        value={fmtSignedPct(kpis.netReturn)}
        sub={`Trong ${(kpis.nSessions / 252).toFixed(1)} năm`}
        tone={(kpis.netReturn ?? 0) >= 0 ? "up" : "down"}
      />
      <Kpi
        label="Lãi nếu chỉ mua và giữ"
        value={fmtSignedPct(kpis.buyHoldReturn)}
        sub={`Mua ${fmtDateVN(meta.start)}, giữ đến cuối kỳ`}
        tone={(kpis.buyHoldReturn ?? 0) >= 0 ? "up" : "down"}
      />
      <Kpi
        label="Sharpe ratio"
        value={fmtNum(kpis.sharpe, 2)}
        sub={sharpeSub}
        info={<SharpeInfo sharpe={kpis.sharpe} />}
      />
      <Kpi
        label="Tỷ lệ lệnh bán có lãi"
        value={`${Math.round((kpis.winRate ?? 0) * 100)}%`}
        sub={`${kpis.nWins} lệnh lãi / ${kpis.nTrades} lệnh đã đóng`}
      />
      <Kpi
        label="Số phiên giữ trung bình"
        value={kpis.avgHold == null ? "—" : `${kpis.avgHold} phiên`}
        sub={kpis.avgHold == null ? undefined : `~${(kpis.avgHold / 20).toFixed(1)} tháng mỗi lệnh`}
      />
    </div>
  )
}

/** Giảm mẫu để biểu đồ nhiều năm vẫn mượt. */
function downsample(points: EquityPoint[], max = 400): EquityPoint[] {
  if (points.length <= max) return points
  const step = Math.ceil(points.length / max)
  const out = points.filter((_, index) => index % step === 0)
  const last = points[points.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

/** Chuỗi base-100 → % lãi cộng dồn tính từ điểm đầu của chính chuỗi đó. */
function toPctSeries(points: EquityPoint[]) {
  if (points.length === 0) return []
  const first = points[0]
  const firstVnindex = points.find((point) => point.vnindex != null)?.vnindex
  const hasVnindex = firstVnindex != null && firstVnindex !== 0

  return points.map((point) => {
    const row: { date: string; strategy: number; buy_hold: number; vnindex?: number } = {
      date: point.date,
      strategy: (point.strategy / first.strategy - 1) * 100,
      buy_hold: (point.buyHold / first.buyHold - 1) * 100,
    }
    if (hasVnindex && point.vnindex != null) {
      row.vnindex = (point.vnindex / firstVnindex - 1) * 100
    }
    return row
  })
}

const CHART_CONFIG = {
  strategy: { label: "Chiến lược của bạn", color: "var(--primary)" },
  buy_hold: { label: "Mua-giữ", color: "var(--muted-foreground)" },
  vnindex: { label: "VN-Index", color: "var(--accent)" },
} satisfies ChartConfig

const pctTick = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`
const pctValue = (value: unknown) => `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(1)}%`

function EquityChart({ data, symbol }: { data: EquityPoint[]; symbol: string }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center p-4 text-xs text-muted-foreground italic">
        Không có dữ liệu giá trong khoảng thời gian đã chọn.
      </div>
    )
  }

  const series = toPctSeries(downsample(data))
  const hasVnindex = series.some((point) => point.vnindex != null)

  return (
    <div className="p-4">
      <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[280px] w-full">
        <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            minTickGap={48}
            tickFormatter={(value: string) => fmtDateVN(value)}
          />
          <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={pctTick} domain={["auto", "auto"]} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(value) => fmtDateVN(String(value))}
                formatter={(value, name) => (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {CHART_CONFIG[name as keyof typeof CHART_CONFIG]?.label ?? String(name)}
                    </span>
                    <span className="font-mono font-medium tabular-nums">{pctValue(value)}</span>
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
              value === "buy_hold" ? `Mua-giữ ${symbol}` : (CHART_CONFIG[value as keyof typeof CHART_CONFIG]?.label ?? value)
            }
          />
          <Line
            type="monotone"
            dataKey="strategy"
            stroke="var(--color-strategy)"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="buy_hold"
            stroke="var(--color-buy_hold)"
            strokeWidth={1.5}
            strokeDasharray="6 4"
            dot={false}
            isAnimationActive={false}
          />
          {hasVnindex && (
            <Line
              type="monotone"
              dataKey="vnindex"
              stroke="var(--color-vnindex)"
              strokeWidth={1.5}
              strokeDasharray="2 3"
              dot={false}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ChartContainer>
    </div>
  )
}

const TRADE_HEADINGS = [
  { label: "Lệnh #", align: "left" },
  { label: "Ngày mua", align: "left" },
  { label: "Lý do mua", align: "left" },
  { label: "Giá mua", align: "left" },
  { label: "Ngày bán", align: "left" },
  { label: "Lý do bán", align: "left" },
  { label: "Giá bán", align: "left" },
  { label: "Số phiên giữ", align: "right" },
  { label: "Lãi/Lỗ", align: "right" },
] as const

export function TradesTable({ trades }: { trades: Trade[] }) {
  const [expanded, setExpanded] = useState(false)
  const reversed = [...trades].reverse()
  const total = reversed.length
  const shown = expanded ? total : Math.min(12, total)
  const visible = reversed.slice(0, shown)

  if (total === 0) {
    return (
      <div className="border-t border-border p-4 text-xs text-muted-foreground italic">
        Không có lệnh nào khớp với chiến lược trong khoảng thời gian này.
      </div>
    )
  }

  return (
    <div className="border-t border-border p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-bold tracking-wide text-foreground uppercase">
        <span>Lịch sử giao dịch</span>
        <span className="font-normal text-muted-foreground normal-case tabular-nums">
          · Hiển thị {shown} / {total} lệnh
        </span>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="font-normal text-primary normal-case underline-offset-2 hover:underline"
        >
          {expanded ? "Thu gọn" : "Xem tất cả"}
        </button>
      </div>

      <Table className="text-[12px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {TRADE_HEADINGS.map((heading) => (
              <TableHead
                key={heading.label}
                className={`text-[10.5px] tracking-wide text-muted-foreground uppercase ${
                  heading.align === "right" ? "text-right" : ""
                }`}
              >
                {heading.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="font-mono tabular-nums">
          {visible.map((trade) => (
            <TableRow key={trade.idx}>
              <TableCell>{trade.idx}</TableCell>
              <TableCell>{fmtDateVN(trade.entryDate)}</TableCell>
              <TableCell className="text-muted-foreground">{trade.entryTrigger}</TableCell>
              <TableCell>{fmtPrice(trade.entryPrice)}</TableCell>
              <TableCell>{fmtDateVN(trade.exitDate)}</TableCell>
              <TableCell className="text-muted-foreground">{trade.trigger}</TableCell>
              <TableCell>{fmtPrice(trade.exitPrice)}</TableCell>
              <TableCell className="text-right">{trade.hold}</TableCell>
              <TableCell
                className={`text-right ${trade.pnlPct >= 0 ? "text-price-up" : "text-price-down"}`}
              >
                {fmtSignedPct(trade.pnlPct)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function ResultsView({ result }: { result: RunResult }) {
  const { meta, kpis, equityCurve, trades } = result

  return (
    <div className="overflow-hidden rounded-lg bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3.5">
        <span className="text-[12px] font-bold tracking-wide text-foreground uppercase">
          Kết quả backtest
        </span>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {meta.symbol} · {fmtDateVN(meta.start)} → {fmtDateVN(meta.end)} · {meta.nSessions} phiên
        </span>
      </div>

      <KpiGrid kpis={kpis} meta={meta} />

      {(kpis.maxDrawdown != null || kpis.ddRecoverySessions != null) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 text-[11px] text-muted-foreground">
          <span className="tracking-wide uppercase">Đường vốn · % so với điểm đầu</span>
          <span className="font-mono tabular-nums">
            {kpis.maxDrawdown != null && <>Mức giảm sâu nhất {fmtSignedPct(kpis.maxDrawdown)}</>}
            {kpis.maxDrawdown != null && kpis.ddRecoverySessions != null && " · "}
            {kpis.ddRecoverySessions != null && <>hồi phục sau {kpis.ddRecoverySessions} phiên</>}
          </span>
        </div>
      )}

      <EquityChart data={equityCurve} symbol={meta.symbol} />
      <TradesTable trades={trades} />
    </div>
  )
}
