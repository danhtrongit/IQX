/**
 * Feature-local query keys for Cấp 5. Leaves are `readonly` tuples per the
 * foundation key convention (mirrors `cap4/keys.ts`).
 */
export const cap5Keys = {
  all: ["cap5"] as const,
  progress: () => ["cap5", "progress"] as const,
  verdict: (orderId: string) => ["cap5", "verdict", orderId] as const,
  dungNgoai: () => ["cap5", "dung-ngoai"] as const,
  thachThuc: () => ["cap5", "thach-thuc"] as const,
} as const
