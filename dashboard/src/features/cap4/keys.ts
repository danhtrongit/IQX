/**
 * Feature-local query keys for Cấp 4. Leaves are `readonly` tuples per the
 * foundation key convention (mirrors `cap3/keys.ts`).
 */
export const cap4Keys = {
  all: ["cap4"] as const,
  progress: () => ["cap4", "progress"] as const,
  vuKhiDiemMu: () => ["cap4", "vu-khi-diem-mu"] as const,
  thachThuc: () => ["cap4", "thach-thuc"] as const,
} as const
