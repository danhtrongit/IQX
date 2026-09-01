/**
 * Feature-local query keys for Cấp 6. Leaves are `readonly` tuples per the
 * foundation key convention (mirrors `cap5/keys.ts`).
 */
export const cap6Keys = {
  all: ["cap6"] as const,
  progress: () => ["cap6", "progress"] as const,
  /** `GET /cap6/mau-thuan/{symbol}` — bức tranh 5 lớp chia phe của một mã. */
  mauThuan: (symbol: string) => ["cap6", "mau-thuan", symbol] as const,
  /** `GET /cap6/kehoach/{order_id}` — cột Cấp 6 đã lưu của MỘT lệnh (wire mới). */
  kehoachMauThuan: (orderId: string) => ["cap6", "kehoach-mau-thuan", orderId] as const,
  /** `GET /cap6/phan-tich` — khối ⑭ + ⑮ của Phân tích danh mục. */
  phanTich: () => ["cap6", "phan-tich"] as const,
} as const
