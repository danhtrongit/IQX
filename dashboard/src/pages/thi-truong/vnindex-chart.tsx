import { useState, useEffect, useMemo } from "react"
import { Loader2 } from "lucide-react"
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

interface BarData {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

function fmtVol(v: number) {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B"
  if (v >= 1e6) return (v / 1e6).toFixed(0) + "M"
  return v.toLocaleString()
}

function formatDateParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function VnindexChart() {
  const [bars, setBars] = useState<BarData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const to = new Date()
        const from = new Date()
        from.setMonth(from.getMonth() - 3)
        // New backend: /market-data/quotes/{symbol}/ohlcv?interval=1D&start=YYYY-MM-DD&end=YYYY-MM-DD
        const url = `${API_BASE}/market-data/quotes/VNINDEX/ohlcv?interval=1D&start=${formatDateParam(from)}&end=${formatDateParam(to)}`
        const res = await fetch(url)
        const json = await res.json()
        const raw: BarData[] = json.data || json || []
        // Dedupe by date — keep last entry per date (more complete data)
        const map = new Map<string, BarData>()
        for (const b of raw) {
          const key = b.time?.slice(0, 10) || b.time
          map.set(key, b)
        }
        setBars(Array.from(map.values()))
      } catch {
        setBars([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const chartData = useMemo(() => {
    return bars.map((b) => ({
      date: fmtDate(b.time),
      close: Number(b.close) || 0,
      volume: Number(b.volume) || 0,
      open: Number(b.open) || 0,
      high: Number(b.high) || 0,
      low: Number(b.low) || 0,
      change: (Number(b.close) || 0) - (Number(b.open) || 0),
    }))
  }, [bars])

  // Compute price domain with some padding
  const [priceMin, priceMax] = useMemo(() => {
    if (chartData.length === 0) return [0, 0]
    const prices = chartData.map((d) => d.close)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const pad = (max - min) * 0.05
    return [Math.floor(min - pad), Math.ceil(max + pad)]
  }, [chartData])

  const lastBar = chartData[chartData.length - 1]
  const prevBar = chartData.length > 1 ? chartData[chartData.length - 2] : null
  const priceChange = lastBar && prevBar ? lastBar.close - prevBar.close : 0
  const pricePct = prevBar && prevBar.close ? (priceChange / prevBar.close) * 100 : 0
  const isUp = priceChange >= 0

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border flex items-center justify-center" style={{ minHeight: 280 }}>
        <Loader2 className="size-4 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="bg-card rounded-lg border border-border flex flex-col overflow-hidden" style={{ minHeight: 280 }}>
      {/* Compact price overlay */}
      {lastBar && (
        <div className="flex items-baseline gap-2 px-3 pt-2">
          <span className="text-xs font-bold text-muted-foreground">VNINDEX</span>
          <span className={`text-sm font-bold tabular-nums ${isUp ? "text-emerald-500" : "text-red-500"}`}>
            {lastBar.close.toFixed(2)}
          </span>
          <span className={`text-[10px] font-medium tabular-nums ${isUp ? "text-emerald-500" : "text-red-500"}`}>
            {isUp ? "+" : ""}{priceChange.toFixed(2)} ({isUp ? "+" : ""}{pricePct.toFixed(2)}%)
          </span>
        </div>
      )}

      {/* Chart area */}
      <div className="flex-1 min-h-0 px-1 pb-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: "#555" }}
              axisLine={false}
              tickLine={false}
              interval={Math.max(0, Math.floor(chartData.length / 8))}
            />
            {/* Price Y axis (left) */}
            <YAxis
              yAxisId="price"
              orientation="right"
              domain={[priceMin, priceMax]}
              tick={{ fontSize: 9, fill: "#555" }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v: number) => v.toFixed(0)}
            />
            {/* Volume Y axis (hidden) */}
            <YAxis yAxisId="volume" orientation="left" hide domain={[0, (dataMax: number) => dataMax * 4]} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1a1a2e",
                border: "1px solid #333",
                borderRadius: 6,
                fontSize: 11,
                padding: "6px 10px",
              }}
              labelStyle={{ color: "#888", fontSize: 10, marginBottom: 4 }}
	              formatter={(value: unknown, name: unknown) => {
	                const key = String(name ?? "")
	                if (key === "close") return [Number(value).toFixed(2), "Giá"]
	                if (key === "volume") return [fmtVol(Number(value)), "KL"]
	                return [String(value ?? ""), key]
	              }}
            />
            {/* Volume bars */}
            <Bar
              yAxisId="volume"
              dataKey="volume"
              fill="rgba(59,130,246,0.2)"
              radius={[1, 1, 0, 0]}
              isAnimationActive={false}
            />
            {/* Price line */}
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="close"
              stroke={isUp ? "#10b981" : "#ef4444"}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
