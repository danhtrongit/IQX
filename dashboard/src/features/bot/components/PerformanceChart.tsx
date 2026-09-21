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
import { formatDate, formatPercent, toFiniteNumber } from "../format"
import type { BotPerformance } from "../types"

export function PerformanceChart({ performance }: { performance: BotPerformance }) {
  const data = performance.points
    .filter((point) => point.navVnd !== null && point.botReturn !== null)
    .map((point) => ({
      date: point.tradingDate,
      bot: toFiniteNumber(point.botReturn),
      vnindex: performance.comparisonAvailable ? toFiniteNumber(point.vnindexReturn) : null,
    }))

  if (data.length < 2) return null

  return (
    <div className="h-52 w-full" role="img" aria-label="Biểu đồ tỷ suất Bot và VN-Index cùng kỳ">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -18 }} accessibilityLayer>
          <CartesianGrid stroke="var(--color-border-2)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            minTickGap={36}
            tick={{ fill: "var(--color-text-3)", fontSize: 10 }}
            tickFormatter={(value: string) => formatDate(value)}
          />
          <YAxis
            tick={{ fill: "var(--color-text-3)", fontSize: 10 }}
            tickFormatter={(value: number) => formatPercent(value)}
          />
          <Tooltip
            labelFormatter={(value) => `Phiên ${formatDate(String(value))}`}
            formatter={(value, name) => [
              formatPercent(typeof value === "number" ? value : null, { signed: true }),
              name === "bot" ? "Bot IQX" : "VN-Index",
            ]}
            contentStyle={{
              background: "var(--color-bg-2)",
              border: "1px solid var(--color-border-2)",
              borderRadius: 8,
            }}
          />
          <Legend formatter={(value) => (value === "bot" ? "Bot IQX" : "VN-Index")} />
          <Line
            type="monotone"
            dataKey="bot"
            stroke="rgb(var(--primary-6))"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
          {performance.comparisonAvailable && (
            <Line
              type="monotone"
              dataKey="vnindex"
              stroke="rgb(var(--orange-6))"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              connectNulls={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
