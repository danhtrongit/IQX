import { useState, useEffect } from "react"
import { Package, Loader2, AlertCircle } from "lucide-react"
import { api } from "@/lib/api"

interface OhlcvBar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface CommodityConfig {
  name: string
  ticker: string
  unit: string
}

const COMMODITIES: CommodityConfig[] = [
  { name: "Vàng", ticker: "GC=F", unit: "USD/oz" },
  { name: "Dầu Brent", ticker: "BZ=F", unit: "USD/thùng" },
  { name: "Dầu WTI", ticker: "CL=F", unit: "USD/thùng" },
  { name: "Bạc", ticker: "SI=F", unit: "USD/oz" },
  { name: "Đồng", ticker: "HG=F", unit: "USD/lb" },
  { name: "Khí tự nhiên", ticker: "NG=F", unit: "USD/MMBtu" },
]

interface CommodityRow {
  name: string
  unit: string
  price: number
  change: number
  pct: number
}

export function CommodityPrices() {
  const [rows, setRows] = useState<CommodityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const results = await Promise.allSettled(
          COMMODITIES.map((c) =>
            api
              .get("market-data/macro/commodity", {
                searchParams: { ticker: c.ticker, interval: "1d" },
              })
              .json<any>(),
          ),
        )

        const parsed: CommodityRow[] = []
        for (let i = 0; i < COMMODITIES.length; i++) {
          const result = results[i]
          if (result.status !== "fulfilled") continue

          const bars: OhlcvBar[] = result.value.data || []
          if (bars.length < 2) continue

          const last = bars[bars.length - 1]
          const prev = bars[bars.length - 2]
          const change = last.close - prev.close
          const pct = prev.close !== 0 ? (change / prev.close) * 100 : 0

          parsed.push({
            name: COMMODITIES[i].name,
            unit: COMMODITIES[i].unit,
            price: last.close,
            change,
            pct,
          })
        }

        setRows(parsed)
        if (parsed.length === 0) setError(true)
      } catch {
        setError(true)
        setRows([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="bg-card rounded-lg border border-border flex flex-col" style={{ minHeight: 280 }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Package className="size-3.5 text-primary" />
          <h3 className="text-xs font-semibold text-foreground">Giá cả hàng hóa</h3>
        </div>
      </div>
      <div className="flex-1 p-2">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="size-4 animate-spin text-primary" />
          </div>
        ) : error || rows.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-full gap-1.5">
            <AlertCircle className="size-4 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Không thể tải dữ liệu hàng hóa</span>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-[9px] text-muted-foreground/70">
                <th className="text-left py-1 px-1.5 font-medium">Hàng hóa</th>
                <th className="text-right py-1 px-1.5 font-medium">Giá</th>
                <th className="text-right py-1 px-1.5 font-medium">+/-</th>
                <th className="text-right py-1 px-1.5 font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.name} className="hover:bg-muted/30 transition-colors">
                  <td className="py-1.5 px-1.5">
                    <div className="text-[11px] font-medium text-foreground">{c.name}</div>
                    <div className="text-[8px] text-muted-foreground/50">{c.unit}</div>
                  </td>
                  <td className="text-right py-1.5 px-1.5 text-[11px] font-semibold text-foreground tabular-nums">
                    {c.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td
                    className={`text-right py-1.5 px-1.5 text-[10px] font-medium tabular-nums ${c.change >= 0 ? "text-emerald-500" : "text-red-500"}`}
                  >
                    {c.change >= 0 ? "+" : ""}
                    {c.change.toFixed(2)}
                  </td>
                  <td
                    className={`text-right py-1.5 px-1.5 text-[10px] font-medium tabular-nums ${c.pct >= 0 ? "text-emerald-500" : "text-red-500"}`}
                  >
                    {c.pct >= 0 ? "+" : ""}
                    {c.pct.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
