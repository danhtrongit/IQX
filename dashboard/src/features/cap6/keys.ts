/**
 * Feature-local query keys for Cấp 6. Leaves are `readonly` tuples per the
 * foundation key convention (mirrors `cap5/keys.ts`).
 */
export const cap6Keys = {
  all: ["cap6"] as const,
  progress: () => ["cap6", "progress"] as const,
  goiY: (symbol: string) => ["cap6", "goi-y", symbol] as const,
  thachThuc: () => ["cap6", "thach-thuc"] as const,
} as const
