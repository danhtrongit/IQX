/**
 * Query keys for the securities surfaces (/co-phieu, /bang-gia).
 *
 * Every key is namespaced under `securities` so the two pages share one cache
 * root; the price board is keyed on its sorted symbol union so switching board
 * tabs reuses the snapshot the previous tab already paid for.
 *
 * None of this data is user-scoped — the directory, the price board and the
 * index quotes are public market data (the watchlist that feeds the board's
 * "Danh mục" tab keeps its own user-scoped key inside its own slice).
 */
export const securitiesKeys = {
  all: ["securities"] as const,
  /** Full tradable-stock directory (paged through, merged, cached for the session). */
  directorySymbols: ["securities", "directory", "symbols"] as const,
  /** Tickers of one index group (VN30, HOSE, ETF, …). */
  directoryGroup: (group: string) => ["securities", "directory", "group", group] as const,
  /** Batched price-board snapshot keyed on the sorted symbol union. */
  priceBoard: (symbolsKey: string) => ["securities", "price-board", symbolsKey] as const,
  /** Main market indices (VN-Index, VN30, HNX-Index, UPCOM). */
  indices: ["securities", "indices"] as const,
  /** Today's 5-minute closes for one index (board index cards). */
  indexIntraday: (symbol: string) => ["securities", "index-intraday", symbol] as const,
} as const
