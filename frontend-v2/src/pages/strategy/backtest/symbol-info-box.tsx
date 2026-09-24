/**
 * Khối thông tin mã đang backtest — port từ
 * `dashboard/src/features/backtest/components/SymbolInfoBox.tsx`.
 *
 * Ba dòng: tên/sàn/ngành (từ danh mục mã), giá hiện tại + % thay đổi theo giá
 * tham chiếu (bảng giá thật, poll 15s), và khoảng dữ liệu đã mô phỏng khi đã có
 * kết quả chạy. Không có dữ liệu thì hiển thị "—", không suy diễn giá.
 */
import { useQuery } from "@tanstack/react-query"

import { marketKeys, quoteChange, searchTradableSymbols, useQuote } from "@/pages/demo-trading/market"

import { fmtDateVN, fmtPrice } from "../format"
import type { RunMeta } from "../types"

export function SymbolInfoBox({ symbol, meta }: { symbol: string; meta: RunMeta | null }) {
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
  const tone =
    change?.tone === "up"
      ? "text-price-up"
      : change?.tone === "down"
        ? "text-price-down"
        : "text-price-ref"

  return (
    <div className="rounded-lg bg-card px-4 py-2.5 text-xs text-muted-foreground">
      <div className="flex flex-wrap gap-x-1.5 font-medium text-foreground">
        {reference?.name && <span>{reference.name}</span>}
        {reference?.exchange && (
          <>
            <span className="text-muted-foreground">·</span>
            <span>{reference.exchange}</span>
          </>
        )}
        {reference?.industry && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{reference.industry}</span>
          </>
        )}
      </div>

      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="font-mono tabular-nums">{fmtPrice(quote?.price)}</span>
        {change?.percent == null ? (
          <span>—</span>
        ) : (
          <span className={`font-mono tabular-nums ${tone}`}>
            {change.percent >= 0 ? "+" : ""}
            {change.percent.toFixed(2)}%
          </span>
        )}
      </div>

      {meta && (
        <div className="mt-0.5">
          Dữ liệu: {meta.nSessions} phiên ({fmtDateVN(meta.start)} → {fmtDateVN(meta.end)})
        </div>
      )}
    </div>
  )
}
