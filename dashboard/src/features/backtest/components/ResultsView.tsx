import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Tooltip as ArcoTooltip } from "@arco-design/web-react"
import { fmtNum, fmtPrice, fmtSignedPct, fmtDateVN } from "../format"
import type { EquityPoint, Kpis, RunResult, Trade } from "../types"

export function sharpeBand(s: number | null): string {
  if (s == null) return "—"
  if (s < 0) return "Tệ"
  if (s < 1) return "Kém"
  if (s <= 2) return "Tốt"
  return "Rất tốt"
}

function SharpeTooltipContent({ sharpe }: { sharpe: number | null }) {
  return (
    <div className="max-w-[260px] space-y-1.5 p-1 text-[12px] leading-snug">
      <p className="font-semibold">Sharpe ratio là gì?</p>
      <p>Đo lường lợi nhuận kiếm được trên mỗi đơn vị rủi ro. Sharpe càng cao, chiến lược càng hiệu quả so với mức biến động.</p>
      <ul className="space-y-0.5 pl-3 text-[11px]">
        <li>{"< 0 → Tệ (tệ hơn không rủi ro)"}</li>
        <li>{"0–1 → Kém"}</li>
        <li>{"1–2 → Tốt"}</li>
        <li>{"> 2 → Rất tốt"}</li>
      </ul>
      <p className="border-t border-[var(--color-border-2)] pt-1 font-semibold">
        Chiến lược của bạn: {fmtNum(sharpe, 2)} → {sharpeBand(sharpe)}
      </p>
    </div>
  )
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
  tone?: "pos" | "neg"
  info?: React.ReactNode
}) {
  const color = tone === "pos" ? "text-up" : tone === "neg" ? "text-down" : "text-[var(--color-text-1)]"
  return (
    <div className="border-r border-[var(--color-border-2)] px-4 py-4 last:border-r-0">
      <div className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-text-3)]">
        {label}
        {info}
      </div>
      <div className={`mt-1.5 font-mono text-[20px] font-semibold ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 font-mono text-[11px] text-[var(--color-text-3)]">{sub}</div>}
    </div>
  )
}

export function KpiGrid({ kpis, meta }: { kpis: Kpis; meta: RunResult["meta"] }) {
  const sharpeInfo = (
    <ArcoTooltip
      content={<SharpeTooltipContent sharpe={kpis.sharpe} />}
      position="top"
    >
      <span
        className="cursor-help select-none text-[10px] text-[var(--color-text-3)] hover:text-[var(--color-text-2)]"
        aria-label="Giải thích Sharpe ratio"
      >
        ⓘ
      </span>
    </ArcoTooltip>
  )

  return (
    <div className="grid grid-cols-2 border-b border-[var(--color-border-2)] md:grid-cols-3 lg:grid-cols-6">
      <Kpi
        label="Lãi trung bình mỗi năm"
        value={fmtSignedPct(kpis.cagr)}
        tone={(kpis.cagr ?? 0) >= 0 ? "pos" : "neg"}
      />
      <Kpi
        label="Tổng lãi sau phí + thuế"
        value={fmtSignedPct(kpis.net_return)}
        sub={`Trong ${((kpis.n_sessions ?? 0) / 252).toFixed(1)} năm`}
        tone={(kpis.net_return ?? 0) >= 0 ? "pos" : "neg"}
      />
      <Kpi
        label="Lãi nếu chỉ mua và giữ"
        value={fmtSignedPct(kpis.buy_hold_return)}
        sub={`Mua ${fmtDateVN(meta.start)}, giữ đến nay`}
        tone={(kpis.buy_hold_return ?? 0) >= 0 ? "pos" : "neg"}
      />
      <Kpi
        label="Sharpe ratio"
        value={fmtNum(kpis.sharpe, 2)}
        sub="Đã điều chỉnh rủi ro"
        info={sharpeInfo}
      />
      <Kpi
        label="Tỷ lệ lệnh bán có lãi"
        value={`${Math.round((kpis.win_rate ?? 0) * 100)}%`}
        sub={`${kpis.n_wins} lệnh lãi / ${kpis.n_trades} lệnh đã đóng`}
      />
      <Kpi
        label="Số phiên giữ trung bình"
        value={`${kpis.avg_hold} phiên`}
        sub={`~${((kpis.avg_hold ?? 0) / 20).toFixed(1)} tháng mỗi lệnh`}
      />
    </div>
  )
}

/** Downsample to keep the chart snappy for multi-year daily series. */
function downsample(points: EquityPoint[], max = 400): EquityPoint[] {
  if (points.length <= max) return points
  const step = Math.ceil(points.length / max)
  const out = points.filter((_, i) => i % step === 0)
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1])
  return out
}

function EquityChart({ data }: { data: EquityPoint[] }) {
  if (!data.length) {
    return (
      <div className="flex h-[200px] items-center justify-center p-4 text-xs italic text-[var(--color-text-3)]">
        Không có dữ liệu giá trong khoảng thời gian đã chọn.
      </div>
    )
  }
  const series = downsample(data)
  return (
    <div className="p-4">
      <div className="h-[280px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="var(--color-border-2)" strokeOpacity={0.5} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#64748b", fontSize: 10, fontFamily: "monospace" }}
              minTickGap={48}
              tickFormatter={(d: string) => d.slice(0, 7)}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 10, fontFamily: "monospace" }}
              tickFormatter={(v: number) => v.toFixed(0)}
              width={44}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-bg-3, #1B2638)",
                border: "1px solid var(--color-border-2)",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--color-text-1)" }}
              formatter={(v, name) => [Number(v).toFixed(1), name]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} align="right" verticalAlign="top" />
            <Line
              type="monotone"
              dataKey="strategy"
              name="Chiến lược"
              stroke="rgb(var(--primary-6))"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="buy_hold"
              name="Buy & Hold"
              stroke="#94A3B8"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function TradesTable({ trades }: { trades: Trade[] }) {
  const recent = [...trades].reverse().slice(0, 12)
  if (!recent.length) {
    return (
      <div className="border-t border-[var(--color-border-2)] p-4 text-xs italic text-[var(--color-text-3)]">
        Không có lệnh nào khớp với chiến lược trong khoảng thời gian này.
      </div>
    )
  }
  return (
    <div className="border-t border-[var(--color-border-2)] p-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-2)]">
        {recent.length} lệnh gần nhất
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-wide text-[var(--color-text-3)]">
              <th className="border-b border-[var(--color-border-2)] px-2.5 py-2 text-left">#</th>
              <th className="border-b border-[var(--color-border-2)] px-2.5 py-2 text-left">Entry</th>
              <th className="border-b border-[var(--color-border-2)] px-2.5 py-2 text-left">Giá vào</th>
              <th className="border-b border-[var(--color-border-2)] px-2.5 py-2 text-left">Exit</th>
              <th className="border-b border-[var(--color-border-2)] px-2.5 py-2 text-left">Giá ra</th>
              <th className="border-b border-[var(--color-border-2)] px-2.5 py-2 text-right">Hold</th>
              <th className="border-b border-[var(--color-border-2)] px-2.5 py-2 text-right">P&amp;L</th>
              <th className="border-b border-[var(--color-border-2)] px-2.5 py-2 text-left">Trigger</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {recent.map((t) => (
              <tr key={t.idx} className="hover:bg-[var(--color-fill-1)]">
                <td className="border-b border-[var(--color-border-1)] px-2.5 py-2">{t.idx}</td>
                <td className="border-b border-[var(--color-border-1)] px-2.5 py-2">{t.entry_date}</td>
                <td className="border-b border-[var(--color-border-1)] px-2.5 py-2">{fmtPrice(t.entry_price)}</td>
                <td className="border-b border-[var(--color-border-1)] px-2.5 py-2">{t.exit_date}</td>
                <td className="border-b border-[var(--color-border-1)] px-2.5 py-2">{fmtPrice(t.exit_price)}</td>
                <td className="border-b border-[var(--color-border-1)] px-2.5 py-2 text-right">{t.hold}</td>
                <td
                  className={`border-b border-[var(--color-border-1)] px-2.5 py-2 text-right ${
                    t.pnl_pct >= 0 ? "text-up" : "text-down"
                  }`}
                >
                  {fmtSignedPct(t.pnl_pct)}
                </td>
                <td className="border-b border-[var(--color-border-1)] px-2.5 py-2 text-[var(--color-text-2)]">
                  {t.trigger}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ResultsView({ result }: { result: RunResult }) {
  const { meta, kpis, equity_curve, trades } = result
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border-2)] px-4 py-3.5">
        <span className="text-[12px] font-bold uppercase tracking-wide text-[var(--color-text-1)]">
          Kết quả backtest
        </span>
        <span className="font-mono text-[11px] text-[var(--color-text-3)]">
          {meta.symbol} · {meta.start} → {meta.end} · {meta.n_sessions} phiên
        </span>
      </div>
      <KpiGrid kpis={kpis} meta={meta} />
      <EquityChart data={equity_curve} />
      <TradesTable trades={trades} />
    </div>
  )
}
