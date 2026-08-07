/**
 * Feature-local query keys for Cấp 0. Leaves are `readonly` tuples per the
 * foundation key convention.
 */
export const cap0Keys = {
  all: ["cap0"] as const,
  progress: () => ["cap0", "progress"] as const,
  /**
   * `GET /cap0/kehoach?order_id=` — per BUY ORDER, so two round trips of the
   * SAME mã never share a cache entry (the old per-symbol key made a re-entry
   * serve the previous round trip's Kết sổ rows, and vice versa).
   */
  kehoach: (orderId: string) => ["cap0", "kehoach", orderId] as const,
} as const
