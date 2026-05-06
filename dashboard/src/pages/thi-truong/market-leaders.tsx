import { useState, useEffect } from "react"
import { Crown, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StockLogo } from "@/components/stock/stock-logo"
import { useNavigate } from "react-router"

interface PriceItem {
  symbol: string
  closePrice: number
  referencePrice: number
  percentChange: number
  totalVolume: number
  totalValue: number
}

export function MarketLeaders() {
  const [stocks, setStocks] = useState<PriceItem[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const load = async () => {
      try {
        // Fetch VN30 symbols then get price board
        const listRes = await api.get("listing/symbols", { searchParams: { group: "VN30" } }).json<any>()
        const symbols: string[] = (listRes.data || []).map((s: any) => s.symbol || s).slice(0, 30)
        if (symbols.length === 0) { setLoading(false); return }

        const priceRes = await api.post("trading/price-board", { json: { symbols } }).json<any>()
        const items: PriceItem[] = (priceRes.data || [])
          .sort((a: PriceItem, b: PriceItem) => (b.totalValue || 0) - (a.totalValue || 0))
          .slice(0, 15)
        setStocks(items)
      } catch {
        setStocks([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const fmtVal = (v: number) => {
    if (v >= 1e9) return (v / 1e9).toFixed(0) + " tỷ"
    if (v >= 1e6) return (v / 1e6).toFixed(0) + "tr"
    return v.toLocaleString("vi-VN")
  }

  return (
    <div className="bg-card rounded-lg border border-border flex flex-col" style={{ minHeight: 280 }}>
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border">
        <Crown className="size-3.5 text-amber-500" />
        <h3 className="text-xs font-semibold text-foreground">Cổ phiếu dẫn dắt thị trường</h3>
      </div>
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="size-4 animate-spin text-primary" /></div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-card">
              <tr className="text-[9px] text-muted-foreground/70">
                <th className="text-left py-1.5 px-2 font-medium">Mã</th>
                <th className="text-right py-1.5 px-1.5 font-medium">Giá</th>
                <th className="text-right py-1.5 px-1.5 font-medium">%</th>
                <th className="text-right py-1.5 px-1.5 font-medium">GTGD</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((s) => {
                const pct = s.percentChange || 0
                const color = pct > 0 ? "text-emerald-500" : pct < 0 ? "text-red-500" : "text-amber-500"
                return (
                  <tr key={s.symbol} className="hover:bg-muted/30 transition-colors cursor-pointer border-t border-border/30"
                    onClick={() => navigate(`/co-phieu/${s.symbol}`)}>
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <StockLogo symbol={s.symbol} size={20} />
                        <span className="text-[11px] font-semibold text-foreground">{s.symbol}</span>
                      </div>
                    </td>
                    <td className={`text-right py-1.5 px-1.5 text-[11px] font-semibold tabular-nums ${color}`}>
                      {((s.closePrice || 0) * 1000).toLocaleString("vi-VN")}
                    </td>
                    <td className={`text-right py-1.5 px-1.5 text-[10px] font-medium tabular-nums ${color}`}>
                      {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                    </td>
                    <td className="text-right py-1.5 px-1.5 text-[10px] text-muted-foreground tabular-nums">
                      {fmtVal(s.totalValue || 0)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </ScrollArea>
    </div>
  )
}
