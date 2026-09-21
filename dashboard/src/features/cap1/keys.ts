/**
 * Feature-local query keys for Cấp 1. Leaves are `readonly` tuples per the
 * foundation key convention (mirrors `cap0/keys.ts`).
 */
export const cap1Keys = {
  all: ["cap1"] as const,
  progress: () => ["cap1", "progress"] as const,
  trades: () => ["cap1", "trades"] as const,
} as const
