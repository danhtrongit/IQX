/**
 * Feature-local query keys for Cấp 0. Leaves are `readonly` tuples per the
 * foundation key convention.
 */
export const cap0Keys = {
  all: ["cap0"] as const,
  progress: () => ["cap0", "progress"] as const,
  /** `GET /cap0/kehoach/latest?symbol=` — per-symbol, so two symbols never share a row. */
  kehoachLatest: (symbol: string) => ["cap0", "kehoach", "latest", symbol] as const,
} as const
