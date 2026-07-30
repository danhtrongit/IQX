/**
 * Feature-local query keys for Cấp 3. Leaves are `readonly` tuples per the
 * foundation key convention (mirrors `cap2/keys.ts`).
 */
export const cap3Keys = {
  all: ["cap3"] as const,
  progress: () => ["cap3", "progress"] as const,
  thachThuc: () => ["cap3", "thach-thuc"] as const,
} as const
