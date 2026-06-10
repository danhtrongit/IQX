import { useQuery } from "@tanstack/react-query"
import {
  fetchCompanyMeta,
  fetchFinancialRatio,
  fetchForecastRanking,
  fetchInsight,
  fetchPatterns,
  type ForecastHorizon,
} from "./api"
import { forecastKeys } from "./keys"

/**
 * AI profit-forecast ranking (T+3 / T+5 / T+10). Premium-gated upstream; the
 * page wraps the view in `<PremiumGate>`. Replaces the old effect-based
 * `use-forecast-ranking` hook.
 */
export function useForecastRanking(horizon: ForecastHorizon, limit = 30) {
  return useQuery({
    queryKey: forecastKeys.ranking(horizon, limit),
    queryFn: () => fetchForecastRanking(horizon, limit),
    staleTime: 60_000,
  })
}

/** 5-layer AI insight for the selected symbol. */
export function useForecastInsight(symbol: string | null) {
  return useQuery({
    queryKey: forecastKeys.insight(symbol ?? ""),
    queryFn: () => fetchInsight(symbol as string),
    enabled: !!symbol,
    staleTime: 60_000,
    retry: false,
  })
}

/** Latest quarterly financial ratios (BCTC rail). */
export function useForecastRatio(symbol: string | null) {
  return useQuery({
    queryKey: forecastKeys.ratio(symbol ?? ""),
    queryFn: () => fetchFinancialRatio(symbol as string),
    enabled: !!symbol,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/** Company name + exchange for the stock header. */
export function useForecastCompany(symbol: string | null) {
  return useQuery({
    queryKey: forecastKeys.company(symbol ?? ""),
    queryFn: () => fetchCompanyMeta(symbol as string),
    enabled: !!symbol,
    staleTime: 10 * 60_000,
    retry: false,
  })
}

/** Detected candle + chart patterns for the selected symbol. */
export function useForecastPatterns(symbol: string | null) {
  return useQuery({
    queryKey: forecastKeys.patterns(symbol ?? ""),
    queryFn: () => fetchPatterns(symbol as string),
    enabled: !!symbol,
    staleTime: 60_000,
    retry: false,
  })
}
