import type { ForecastHorizon } from "./api"

/**
 * Feature-local query keys for the forecast feature.
 * Leaves are `readonly` tuples (or functions returning them) per the foundation
 * key convention.
 */
export const forecastKeys = {
  all: ["forecast"] as const,
  ranking: (horizon: ForecastHorizon, limit: number) =>
    ["forecast", "ranking", horizon, limit] as const,
  insight: (symbol: string) => ["forecast", "insight", symbol] as const,
  ratio: (symbol: string) => ["forecast", "ratio", symbol] as const,
  patterns: (symbol: string) => ["forecast", "patterns", symbol] as const,
  company: (symbol: string) => ["forecast", "company", symbol] as const,
} as const
