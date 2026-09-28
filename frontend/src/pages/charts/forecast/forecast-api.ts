import type { ForecastRanking, ForecastSymbol } from "@/lib/generated/backend-v2"
import { requestOperation } from "@/lib/contract-client"

export type ForecastHorizon = "3" | "5" | "10"

export const forecastKeys = {
  ranking: (horizon: ForecastHorizon) => ["forecast", "ranking", horizon] as const,
  symbol: (symbol: string) => ["forecast", "symbol", symbol] as const,
}

export function fetchForecastRanking(horizon: ForecastHorizon, signal?: AbortSignal): Promise<ForecastRanking> {
  return requestOperation("GET /api/v2/ai/forecast/ranking", { query: { horizon, limit: 20 } }, { signal })
}

export function fetchSymbolForecast(symbol: string, signal?: AbortSignal): Promise<ForecastSymbol> {
  return requestOperation("GET /api/v2/ai/forecast/symbols/{symbol}", { path: { symbol } }, { signal })
}
