import { useQuery } from "@tanstack/react-query"

import { marketKeys, quoteChange, searchTradableSymbols, useQuote } from "@/pages/demo-trading/market"

import { fmtNumber } from "../shared/format"

/** Name, exchange and industry of the chosen symbol and its CURRENT reference price (never a fill price). */
export function SymbolStrip({ symbol }: { symbol: string }) {
  const code = symbol.trim().toUpperCase()
  const { data: matches } = useQuery({
    queryKey: marketKeys.symbolSearch(code),
    enabled: code.length > 0,
    queryFn: ({ signal }) => searchTradableSymbols(code, signal),
    staleTime: 60 * 60_000,
  })
  const { data: quote } = useQuote(code)
  if (!code) return null
  const reference = matches?.find((item) => item.symbol === code) ?? null
  const change = quoteChange(quote)
  const tone = change?.tone === "up" ? "text-price-up" : change?.tone === "down" ? "text-price-down" : "text-price-ref"
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-border bg-card px-4 py-2.5 text-xs">
      <div className="flex min-w-0 flex-wrap gap-x-1.5 font-medium">
        <b className="text-foreground">{reference?.name ?? code}</b>
        {reference?.exchange && <span className="text-muted-foreground">· {reference.exchange}</span>}
        {reference?.industry && <span className="text-muted-foreground">· {reference.industry}</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-semibold tabular-nums">{quote?.price == null ? "—" : `${fmtNumber(quote.price, 0)} đ`}</span>
        {change?.percent != null && (
          <span className={`font-mono tabular-nums ${tone}`}>
            {change.percent >= 0 ? "+" : "−"}
            {Math.abs(change.percent).toFixed(2)}%
          </span>
        )}
        <span className="text-muted-foreground">Giá tham khảo hiện tại</span>
      </div>
    </div>
  )
}
