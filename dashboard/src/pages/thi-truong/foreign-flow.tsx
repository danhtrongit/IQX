import { useState, useEffect } from "react"
import { Globe2, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { ScrollArea } from "@/components/ui/scroll-area"

interface PriceItem {
  symbol: string
  foreignBuy: number
  foreignSell: number
  totalValue: number
}

export function ForeignFlow() {
  const [stocks, setStocks] = useState<{ symbol: string; buy: number; sell: number; net: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const listRes = await api.get("listing/symbols", { searchParams: { group: "VN30" } }).json<any>()
        const symbols: string[] = (listRes.data || []).map((s: any) => s.symbol || s).slice(0, 30)
        if (symbols.length === 0) { setLoading(false); return }

        const priceRes = await api.post("trading/price-board", { json: { symbols } }).json<any>()
        const items = (priceRes.data || [])
          .map((p: PriceItem) => ({
            symbol: p.symbol,
            buy: p.foreignBuy || 0,
            sell: p.foreignSell || 0,
            net: (p.foreignBuy || 0) - (p.foreignSell || 0),
          }))
          .sort((a: any, b: any) => Math.abs(b.net) - Math.abs(a.net))
          .slice(0, 12)
        setStocks(items)
      } catch {
        setStocks([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const fmtVol = (v: number) => {
    const abs = Math.abs(v)
    if (abs >= 1e6) return (v / 1e6).toFixed(1) + "tr"
    if (abs >= 1e3) return (v / 1e3).toFixed(0) + "K"
    return v.toLocaleString("vi-VN")
  }

  return (
    <div className="bg-card rounded-lg border border-border flex flex-col" style={{ minHeight: 280 }}>
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border">
        <Globe2 className="size-3.5 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">Khối ngoại</h3>
      </div>
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="size-4 animate-spin text-primary" /></div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-card">
              <tr className="text-[9px] text-muted-foreground/70">
                <th className="text-left py-1.5 px-2 font-medium">Mã</th>
                <th className="text-right py-1.5 px-1.5 font-medium">Mua (CP)</th>
                <th className="text-right py-1.5 px-1.5 font-medium">Bán (CP)</th>
                <th className="text-right py-1.5 px-1.5 font-medium">Ròng</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((s) => (
                <tr key={s.symbol} className="hover:bg-muted/30 transition-colors border-t border-border/30">
                  <td className="py-1.5 px-2 text-[11px] font-semibold text-foreground">{s.symbol}</td>
                  <td className="text-right py-1.5 px-1.5 text-[10px] font-medium text-emerald-500 tabular-nums">{fmtVol(s.buy)}</td>
                  <td className="text-right py-1.5 px-1.5 text-[10px] font-medium text-red-500 tabular-nums">{fmtVol(s.sell)}</td>
                  <td className={`text-right py-1.5 px-1.5 text-[10px] font-bold tabular-nums ${s.net >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {s.net >= 0 ? "+" : ""}{fmtVol(s.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ScrollArea>
    </div>
  )
}
