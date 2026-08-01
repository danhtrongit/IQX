/**
 * Feature-local query keys for Cấp 6. Leaves are `readonly` tuples per the
 * foundation key convention (mirrors `cap5/keys.ts`).
 */
export const cap6Keys = {
  all: ["cap6"] as const,
  progress: () => ["cap6", "progress"] as const,
  goiY: (symbol: string) => ["cap6", "goi-y", symbol] as const,
  /** `GET /cap6/kehoach/{order_id}` — khối Đối chiếu ĐÃ GHI của một lệnh. */
  kehoach: (orderId: string) => ["cap6", "kehoach", orderId] as const,
  thachThuc: () => ["cap6", "thach-thuc"] as const,
} as const
