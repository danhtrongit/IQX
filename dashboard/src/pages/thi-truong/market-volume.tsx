import { useState, useEffect } from "react"
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

interface MarketIndex {
  symbol: string
  price: number
  change: number
  changePercent: number
  volume: number
  value: number
  advances: number
  declines: number
  noChange: number
}

export function MarketVolume() {
  const [vnindex, setVnindex] = useState<MarketIndex | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        // New backend: /market-data/overview/market-index
        const res = await fetch(`${API_BASE}/market-data/overview/market-index`)
        const json = await res.json()
        const rawItems = json?.data || json || []
        if (!Array.isArray(rawItems)) return
        // Adapt snake_case backend → UI shape
        const items: MarketIndex[] = rawItems.map((r: any) => ({
          symbol: (r.index_name || r.symbol || "").toUpperCase(),
          price: Number(r.index_value || r.price) || 0,
          change: Number(r.change) || 0,
          changePercent: Number(r.change_percent || r.changePercent) || 0,
          volume: Number(r.total_shares || r.volume) || 0,
          value: Number(r.total_value_million_vnd || r.value) || 0,
          advances: Number(r.total_stock_increase || r.advances) || 0,
          declines: Number(r.total_stock_decline || r.declines) || 0,
          noChange: Number(r.total_stock_no_change || r.noChange) || 0,
        }))
        setVnindex(items.find((i) => i.symbol === "VNINDEX") || null)
      } catch { /* ignore */ }
    }
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [])

  const advances = vnindex?.advances || 0
  const declines = vnindex?.declines || 0
  const noChange = vnindex?.noChange || 0
  const total = advances + declines + noChange || 1
  const volume = vnindex?.volume || 0
  const value = vnindex?.value || 0

  const fmtVol = (v: number) => {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + " tỷ CP"
    if (v >= 1e6) return (v / 1e6).toFixed(0) + " triệu CP"
    return v.toLocaleString("vi-VN")
  }
  const fmtVal = (v: number) => {
    if (v >= 1e12) return (v / 1e12).toFixed(1) + " nghìn tỷ"
    if (v >= 1e9) return (v / 1e9).toFixed(0) + " tỷ"
    return v.toLocaleString("vi-VN")
  }

  return (
    <div className="bg-card rounded-lg border border-border flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="size-3.5 text-primary" />
          <h3 className="text-xs font-semibold text-foreground">Thanh khoản thị trường</h3>
        </div>
      </div>
      <div className="flex-1 p-3 space-y-3">
        {/* Breadth */}
        <div className="flex items-center justify-center gap-8">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1">
              <TrendingUp className="size-3.5 text-emerald-500" />
              <span className="text-base font-bold text-emerald-500 tabular-nums">{advances}</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Tăng</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-base font-bold text-amber-500 tabular-nums">{noChange}</span>
            <span className="text-[10px] text-muted-foreground">Đứng</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1">
              <TrendingDown className="size-3.5 text-red-500" />
              <span className="text-base font-bold text-red-500 tabular-nums">{declines}</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Giảm</span>
          </div>
        </div>

        {/* Breadth bar */}
        <div>
          <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
            <div className="bg-emerald-500 rounded-l-full flex items-center justify-center" style={{ width: `${(advances / total) * 100}%` }}>
              {advances > 0 && <span className="text-[8px] font-bold text-white">{((advances / total) * 100).toFixed(0)}%</span>}
            </div>
            <div className="bg-amber-500 flex items-center justify-center" style={{ width: `${(noChange / total) * 100}%` }} />
            <div className="bg-red-500 rounded-r-full flex items-center justify-center" style={{ width: `${(declines / total) * 100}%` }}>
              {declines > 0 && <span className="text-[8px] font-bold text-white">{((declines / total) * 100).toFixed(0)}%</span>}
            </div>
          </div>
        </div>

        {/* Volume & Value */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-muted/30 rounded-md p-2.5">
            <div className="text-[10px] text-muted-foreground mb-0.5">Khối lượng GD</div>
            <div className="text-sm font-bold text-foreground tabular-nums">{fmtVol(volume)}</div>
          </div>
          <div className="bg-muted/30 rounded-md p-2.5">
            <div className="text-[10px] text-muted-foreground mb-0.5">Giá trị GD</div>
            <div className="text-sm font-bold text-foreground tabular-nums">{fmtVal(value)}</div>
          </div>
        </div>

        {/* VNINDEX summary */}
        {vnindex && (
          <div className="bg-muted/30 rounded-md p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">VNINDEX</span>
              <span className={`text-sm font-bold tabular-nums ${vnindex.change >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {vnindex.price?.toFixed?.(2) || "—"}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">Thay đổi</span>
              <span className={`text-xs font-semibold tabular-nums ${vnindex.change >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {vnindex.change >= 0 ? "+" : ""}{vnindex.change?.toFixed?.(2) || "0"} ({vnindex.changePercent >= 0 ? "+" : ""}{vnindex.changePercent?.toFixed?.(2) || "0"}%)
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
