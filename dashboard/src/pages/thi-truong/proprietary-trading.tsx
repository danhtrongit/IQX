import { useEffect, useState } from "react"
import { Building2, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { ScrollArea } from "@/components/ui/scroll-area"

interface ProprietaryFlowItem {
  matchBuyValue?: number
  dealBuyValue?: number
  matchSellValue?: number
  dealSellValue?: number
  totalNetValue?: number
}

interface ProprietaryStock {
  symbol: string
  buyVal: number
  sellVal: number
  net: number
}

export function ProprietaryTrading() {
  const [stocks, setStocks] = useState<ProprietaryStock[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const listRes = await api.get("listing/symbols", { searchParams: { group: "VN30" } }).json<any>()
        const symbols: string[] = (listRes.data || []).map((s: any) => s.symbol || s).slice(0, 15)

        if (symbols.length === 0) {
          setStocks([])
          return
        }

        const responses = await Promise.allSettled(
          symbols.map((symbol) =>
            api.get(`company/${symbol}/proprietary-flow`, {
              searchParams: { timeFrame: "D", page: 0, size: 1 },
            }).json<any>(),
          ),
        )

        const items = responses
          .flatMap((result, index) => {
            if (result.status !== "fulfilled") return []

            const latest = result.value?.data?.[0] as ProprietaryFlowItem | undefined
            if (!latest) return []

            const buyVal = (latest.matchBuyValue || 0) + (latest.dealBuyValue || 0)
            const sellVal = (latest.matchSellValue || 0) + (latest.dealSellValue || 0)
            const net = latest.totalNetValue ?? buyVal - sellVal

            return [{ symbol: symbols[index], buyVal, sellVal, net }]
          })
          .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
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

  const fmtBillions = (v: number) => (v / 1e9).toFixed(1)

  return (
    <div className="bg-card rounded-lg border border-border flex flex-col" style={{ minHeight: 280 }}>
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border">
        <Building2 className="size-3.5 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">Tự doanh</h3>
      </div>
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="size-4 animate-spin text-primary" /></div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-card">
              <tr className="text-[9px] text-muted-foreground/70">
                <th className="text-left py-1.5 px-2 font-medium">Mã</th>
                <th className="text-right py-1.5 px-1.5 font-medium">Mua (tỷ)</th>
                <th className="text-right py-1.5 px-1.5 font-medium">Bán (tỷ)</th>
                <th className="text-right py-1.5 px-1.5 font-medium">Ròng (tỷ)</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((s) => (
                <tr key={s.symbol} className="hover:bg-muted/30 transition-colors border-t border-border/30">
                  <td className="py-1.5 px-2 text-[11px] font-semibold text-foreground">{s.symbol}</td>
                  <td className="text-right py-1.5 px-1.5 text-[10px] font-medium text-emerald-500 tabular-nums">
                    {fmtBillions(s.buyVal)}
                  </td>
                  <td className="text-right py-1.5 px-1.5 text-[10px] font-medium text-red-500 tabular-nums">
                    {fmtBillions(s.sellVal)}
                  </td>
                  <td
                    className={`text-right py-1.5 px-1.5 text-[10px] font-bold tabular-nums ${s.net >= 0 ? "text-emerald-500" : "text-red-500"}`}
                  >
                    {s.net >= 0 ? "+" : ""}
                    {fmtBillions(s.net)}
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
