/**
 * Feature-local query keys for Cấp 2. Leaves are `readonly` tuples per the
 * foundation key convention (mirrors `cap1/keys.ts`).
 */
export const cap2Keys = {
  all: ["cap2"] as const,
  progress: () => ["cap2", "progress"] as const,
  trades: () => ["cap2", "trades"] as const,
  analysis: () => ["cap2", "analysis"] as const,
  activeAlerts: (sessionDate?: string) =>
    ["cap2", "alerts", "active", sessionDate ?? "today"] as const,
  diemKyLuat: (ngay?: string) => ["cap2", "diem-ky-luat", ngay ?? "today"] as const,
  diemKyLuatHistory: () => ["cap2", "diem-ky-luat", "history"] as const,
} as const
