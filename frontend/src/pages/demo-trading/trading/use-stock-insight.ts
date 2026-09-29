/**
 * Real data sources behind the panel's AI reads.
 *
 * - `useStockInsight` → `POST /ai/insight/analyze {symbol, language:'vi',
 *   include_payload:true}` — the premium-gated 6-layer AI Insight v2 payload
 *   (L1 xu hướng · L2 thanh khoản · L3 dòng tiền · L4 nội bộ · L5 tin tức).
 *
 * It is a *reader*: nothing in this module synthesises a verdict, and a
 * missing/invalid field stays `null` so the UI can say "chưa đọc được" instead
 * of inventing a tier.
 */
import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { api } from "@/lib/api"
import { normalizeInsightLayerSubset } from "@/pages/charts/stock/insight/normalize-insight"
import type { StockInsight } from "./stock-insight"

type Raw = Record<string, unknown>

/** The AI Insight payload is returned bare by the POST route and wrapped by
 * `/insight/{symbol}`; accept both without guessing fields. */
function adaptInsight(payload: unknown, symbol: string): StockInsight | null {
  const outer = payload as { data?: unknown } | null
  const raw = (outer && typeof outer === "object" && "layers" in outer ? outer : outer?.data) as Raw | undefined
  if (!raw || typeof raw !== "object" || !raw.layers) return null
  return {
    symbol: typeof raw.symbol === "string" ? raw.symbol.toUpperCase() : symbol,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    layers: normalizeInsightLayerSubset(raw.layers),
    rawInput: (raw.rawInput ?? undefined) as StockInsight["rawInput"],
  }
}

/**
 * 6-layer AI Insight for one symbol. Premium-gated upstream, so the query only
 * runs for a signed-in premium user with `enabled`.
 */
export function useStockInsight(symbol: string, enabled = true) {
  const { user, isPremium } = useAuth()
  const code = symbol.trim().toUpperCase()
  return useQuery({
    queryKey: ["stock-insight", user?.id, code],
    enabled: enabled && !!user && isPremium && code !== "",
    retry: false,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async ({ signal }): Promise<StockInsight | null> => {
      const payload = await api<unknown>("/ai/insight/analyze", {
        method: "POST",
        body: JSON.stringify({ symbol: code, language: "vi", include_payload: true }),
        signal,
      })
      return adaptInsight(payload, code)
    },
  })
}
