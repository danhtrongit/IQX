/**
 * Feature-local query keys for Cấp 5. Leaves are `readonly` tuples per the
 * foundation key convention (mirrors `cap4/keys.ts`).
 *
 * ★ `verdict` / `dungNgoai` / `thachThuc` đã bị GỠ cùng Cấp 5 cũ — không còn
 * endpoint nào đứng sau chúng.
 */
export const cap5Keys = {
  all: ["cap5"] as const,
  progress: () => ["cap5", "progress"] as const,
  phanTich: () => ["cap5", "phan-tich"] as const,
  nguonSan: (symbol: string) => ["cap5", "nguon-san", symbol] as const,
} as const
