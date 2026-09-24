/**
 * Live quote for one symbol — the demo shell's single price source.
 *
 * REST only: the upstream realtime WS (DNSE) cannot authenticate today, so the
 * price board is polled instead of streamed. `data` is `null` (not an error)
 * when the upstream knows nothing about the ticker, which lets callers render
 * "chưa có dữ liệu" instead of inventing a price.
 */
import { useQuery } from "@tanstack/react-query"

import type { MarketQuote } from "@/pages/demo-trading/types"

import { fetchQuote, marketKeys } from "./market-api"

/** Board refresh cadence — the board is a snapshot API, not a stream. */
export const QUOTE_POLL_MS = 15_000

export function useQuote(symbol: string) {
  const code = symbol.trim().toUpperCase()
  return useQuery<MarketQuote | null>({
    queryKey: marketKeys.quote(code),
    enabled: code.length > 0,
    queryFn: ({ signal }) => fetchQuote(code, signal),
    staleTime: 10_000,
    refetchInterval: QUOTE_POLL_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  })
}

export type QuoteTone = "up" | "down" | "ref"
export type QuoteChange = { absolute: number; percent: number | null; tone: QuoteTone }

/**
 * Price move against the reference price (giá tham chiếu) — the same base the
 * exchange's ceiling/floor are measured from. `null` until both sides are
 * known, so a missing reference never renders as "0%" (unchanged).
 */
export function quoteChange(quote: MarketQuote | null | undefined): QuoteChange | null {
  if (!quote || quote.price === null || quote.reference === null) return null
  const absolute = quote.price - quote.reference
  return {
    absolute,
    percent: quote.reference > 0 ? (absolute / quote.reference) * 100 : null,
    tone: absolute > 0 ? "up" : absolute < 0 ? "down" : "ref",
  }
}

export { fetchQuote, marketKeys }
export type { MarketQuote }
