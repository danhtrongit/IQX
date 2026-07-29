/**
 * Feature-local query keys for Cấp 2. Leaves are `readonly` tuples per the
 * foundation key convention (mirrors `cap1/keys.ts`).
 */
export const cap2Keys = {
  all: ["cap2"] as const,
  progress: () => ["cap2", "progress"] as const,
  diemKyLuat: (ngay?: string) => ["cap2", "diem-ky-luat", ngay ?? "today"] as const,
} as const
