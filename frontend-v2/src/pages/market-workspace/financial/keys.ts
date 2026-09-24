/**
 * Query keys for the BCTC dashboard. Namespaced under `market-workspace` so
 * they never collide with the sibling slices (market briefs / stock insight).
 * The symbol is upper-cased so `fpt` and `FPT` share one cache entry.
 */
export const bctcKeys = {
  all: ["market-workspace", "bctc"] as const,
  dashboard: (symbol: string, termType: number) =>
    ["market-workspace", "bctc", "dashboard", symbol.toUpperCase(), termType] as const,
  narrative: (symbol: string, termType: number) =>
    ["market-workspace", "bctc", "narrative", symbol.toUpperCase(), termType] as const,
}
