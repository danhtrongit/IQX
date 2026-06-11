/**
 * Feature-local query keys for market-data. Leaves are functions returning
 * `readonly` tuples so the union/price keys can be parameterized.
 */
export const marketDataKeys = {
  all: ["market-data"] as const,
  /** Batched price-board keyed on the sorted symbol union. */
  priceBoard: (symbolsKey: string) =>
    ["market-data", "price-board", symbolsKey] as const,
  /** Market indices (single shared query). */
  indices: () => ["market-data", "indices"] as const,
  /** Symbol typeahead search. */
  symbolSearch: (q: string) => ["market-data", "symbol-search", q] as const,
  /** Per-symbol recent daily closes (for off-hours previous-session change). */
  dailyCloses: (symbol: string) =>
    ["market-data", "daily-closes", symbol] as const,
} as const
