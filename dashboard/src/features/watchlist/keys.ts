import { sharedKeys } from "@/shared/query/keys"

/**
 * Watchlist query keys. The list itself is user-scoped (AuthProvider invalidates
 * `sharedKeys.watchlist.all` on login/logout) so it re-uses the shared factory.
 * Symbol-info and sparkline lookups are reference data, cached locally.
 */
export const watchlistKeys = {
  all: sharedKeys.watchlist.all,
  symbolInfo: (symbol: string) => ["watchlist", "symbol-info", symbol] as const,
  sparkline: (symbol: string) => ["watchlist", "sparkline", symbol] as const,
} as const
