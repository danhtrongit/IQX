import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts"
import { useVNIndexOHLCV, useMarketOverview } from "../hooks"
import { changeColor, CHART_HEIGHT, wholeNumber } from "../utils"
import { IconTrendingUp } from "../icons"

const round2 = (v: number) => Math.round(v * 100) / 100

const CANDLE_UP = "var(--color-up)"
const CANDLE_DOWN = "var(--color-down)"

interface CandleDatum {
  date: string
  open: number
  high: number
  low: number
  close: number
  range: [number, number]
  volume: number
}

/** Custom candlestick shape for a recharts range Bar (dataKey = [low, high]). */
function Candle(props: {
  x?: number
  y?: number
  width?: number
  height?: number
  payload?: CandleDatum
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props
  if (!payload) return null
  const { open, close, high, low } = payload
  const isUp = close >= open
  const color = isUp ? CANDLE_UP : CANDLE_DOWN

  const range = high - low
  const priceToY = (p: number) => (range === 0 ? y : y + ((high - p) / range) * height)

  const openY = priceToY(open)
  const closeY = priceToY(close)
  const bodyTop = Math.min(openY, closeY)
  const bodyHeight = Math.max(Math.abs(closeY - openY), 1)
  const cx = x + width / 2
  const bodyWidth = Math.max(width * 0.6, 1)
  const bodyX = cx - bodyWidth / 2

  return (
    <g>
      <line x1={cx} y1={y} x2={cx} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={bodyX} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} />
    </g>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ payload: CandleDatum }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  if (!d) return null
  const isUp = d.close >= d.open
  const closeColor = isUp ? CANDLE_UP : CANDLE_DOWN
  return (
    <div
      className="rounded-md px-2.5 py-2 text-[11px]"
      style={{ backgroundColor: "var(--color-bg-2)", border: "1px solid var(--color-border-2)", color: "var(--color-text-1)" }}
    >
      <div className="text-[10px] text-[var(--color-text-3)] mb-1">{label}</div>
      <Row label="Mở" value={wholeNumber(d.open)} />
      <Row label="Cao" value={wholeNumber(d.high)} valueClass="text-up" />
      <Row label="Thấp" value={wholeNumber(d.low)} valueClass="text-down" />
      <div className="flex justify-between gap-3">
        <span className="text-[var(--color-text-3)]">Đóng</span>
        <span className="tabular-nums font-semibold" style={{ color: closeColor }}>
          {wholeNumber(d.close)}
        </span>
      </div>
      <div className="flex justify-between gap-3 mt-0.5 pt-0.5 border-t border-[var(--color-border-2)]">
        <span className="text-[var(--color-text-3)]">KLGD</span>
        <span className="tabular-nums">{d.volume}M</span>
      </div>
    </div>
  )
}

function Row({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[var(--color-text-3)]">{label}</span>
      <span className={`tabular-nums ${valueClass}`}>{value}</span>
    </div>
  )
}

export function VNIndexChart() {
  const { data: ohlcv, loading } = useVNIndexOHLCV()
  const { data: market } = useMarketOverview()
  const source = loading ? "mock" : "live"

  const chartData: CandleDatum[] = ohlcv.map((bar) => {
    const d = new Date(bar.time * 1000)
    return {
      date: `${d.getDate()}/${d.getMonth() + 1}`,
      open: round2(bar.open),
      high: round2(bar.high),
      low: round2(bar.low),
      close: round2(bar.close),
      range: [round2(bar.low), round2(bar.high)],
      volume: Math.round(bar.volume / 1_000_000),
    }
  })

  const lows = chartData.map((d) => d.low).filter((v) => v > 0)
  const highs = chartData.map((d) => d.high).filter((v) => v > 0)
  const minLow = lows.length ? Math.min(...lows) : 0
  const maxHigh = highs.length ? Math.max(...highs) : 0
  const pad = (maxHigh - minLow) * 0.05 || 1
  const priceDomain: [number, number] = [Math.floor(minLow - pad), Math.ceil(maxHigh + pad)]

  const m = market.vnindex
  const isUp = m.change >= 0

  return (
    <div className="h-full w-full bg-[var(--color-bg-2)] border border-[var(--color-border-2)] rounded-md overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-bg-2)] border-b border-[var(--color-border-2)]">
        <div className="flex items-center gap-2">
          <IconTrendingUp className="text-up text-base" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-1)]">
            VNINDEX
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tabular-nums text-[var(--color-text-1)]">
            {wholeNumber(m.value)}
          </span>
          <span className={`text-sm font-semibold tabular-nums ${changeColor(m.change)}`}>
            {isUp ? "+" : ""}
            {wholeNumber(m.change)} ({isUp ? "+" : ""}
            {wholeNumber(m.changePercent)}%)
          </span>
          <span
            className={`text-[8px] px-1.5 py-px leading-tight font-semibold tracking-wider rounded border ${
              source === "live"
                ? "bg-up/15 text-up border-up/30"
                : "bg-[var(--color-fill-2)] text-[var(--color-text-3)] border-[var(--color-border-2)]"
            }`}
          >
            {source === "live" ? "● LIVE" : "○ MOCK"}
          </span>
        </div>
      </div>
      <div className="p-1 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--color-text-2)", fontSize: 9 }}
              axisLine={{ stroke: "var(--color-border-2)" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="price"
              domain={priceDomain}
              tick={{ fill: "var(--color-text-2)", fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => wholeNumber(v)}
              width={40}
            />
            <YAxis
              yAxisId="vol"
              orientation="right"
              domain={[0, (max: number) => max * 4]}
              tick={false}
              axisLine={false}
              tickLine={false}
              width={0}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-fill-2)" }} />
            <Bar
              yAxisId="vol"
              dataKey="volume"
              fill="var(--color-up)"
              fillOpacity={0.2}
              radius={[1, 1, 0, 0]}
              isAnimationActive={false}
            />
            <Bar yAxisId="price" dataKey="range" shape={<Candle />} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
