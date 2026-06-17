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
import { fmtNum, fmtPrice, fmtSignedPct } from "../format"
import type { EquityPoint, Kpis, RunResult, Trade } from "../types"

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: "pos" | "neg"
}) {
  const color = tone === "pos" ? "text-up" : tone === "neg" ? "text-down" : "text-[var(--color-text-1)]"
  return (
    <div className="border-r border-[var(--color-border-2)] px-4 py-4 last:border-r-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-text-3)]">
        {label}
      </div>
      <div className={`mt-1.5 font-mono text-[20px] font-semibold ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 font-mono text-[11px] text-[var(--color-text-3)]">{sub}</div>}
    </div>
  )
}

function KpiGrid({ kpis }: { kpis: Kpis }) {
  const [lo, hi] = kpis.sharpe_ci
  return (
    <div className="grid grid-cols-2 border-b border-[var(--color-border-2)] md:grid-cols-3 lg:grid-cols-6">
      <Kpi
        label="CAGR"
        value={fmtSignedPct(kpis.cagr)}
        sub={`vs Buy-Hold ${fmtSignedPct(kpis.buy_hold_return)}`}
        tone={(kpis.cagr ?? 0) >= 0 ? "pos" : "neg"}
      />
      <Kpi
        label="Sharpe"
        value={fmtNum(kpis.sharpe)}
        sub={lo != null && hi != null ? `[${fmtNum(lo)} — ${fmtNum(hi)}] 95% CI` : undefined}
      />
      <Kpi
        label="Max Drawdown"
        value={fmtSignedPct(kpis.max_drawdown)}
        sub={kpis.dd_recovery_sessions != null ? `${kpis.dd_recovery_sessions} phiên hồi phục` : undefined}
        tone="neg"
      />
      <Kpi
        label="Win rate"
        value={kpis.win_rate == null ? "—" : `${(kpis.win_rate * 100).toFixed(1)}%`}
        sub={`${kpis.n_wins} / ${kpis.n_trades} trades`}
      />
      <Kpi label="Avg hold" value={fmtNum(kpis.avg_hold, 1)} sub="phiên giao dịch" />
      <Kpi
        label="Net return"
        value={fmtSignedPct(kpis.net_return)}
        sub="sau phí + thuế"
        tone={(kpis.net_return ?? 0) >= 0 ? "pos" : "neg"}
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
  const series = downsample(data)
  return (
    <div className="p-4">
      <div className="h-[280px] w-full">
        <ResponsiveContainer>
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
      <KpiGrid kpis={kpis} />
      <EquityChart data={equity_curve} />
      <TradesTable trades={trades} />
    </div>
  )
}
