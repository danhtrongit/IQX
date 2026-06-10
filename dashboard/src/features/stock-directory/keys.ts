/**
 * Feature-local query keys for the stock directory. Leaves are `readonly`
 * tuples (or functions returning them) per the foundation key convention.
 */
export const stockDirectoryKeys = {
  all: ["stock-directory"] as const,
  /** Full tradable-symbol list (paged-through and merged). */
  symbols: ["stock-directory", "symbols"] as const,
  /** Symbols belonging to an index group (VN30, HOSE, ETF, …). */
  group: (group: string) => ["stock-directory", "group", group] as const,
  /** ICB industry classification list. */
  industries: ["stock-directory", "industries"] as const,
} as const
