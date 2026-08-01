/**
 * Feature-local query keys for Cấp 7. Leaves are `readonly` tuples per the
 * foundation key convention (mirrors `cap6/keys.ts`).
 */
export const cap7Keys = {
  all: ["cap7"] as const,
  progress: () => ["cap7", "progress"] as const,
  /** `GET /cap7/phien` — giờ giao dịch (đồng hồ SERVER) + hằng số của khối. */
  phien: () => ["cap7", "phien"] as const,
  thachThuc: () => ["cap7", "thach-thuc"] as const,
} as const
