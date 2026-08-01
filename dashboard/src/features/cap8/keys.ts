/**
 * Feature-local query keys for Cấp 8. Leaves are `readonly` tuples per the
 * foundation key convention (mirrors `cap7/keys.ts`).
 */
export const cap8Keys = {
  all: ["cap8"] as const,
  progress: () => ["cap8", "progress"] as const,
  /**
   * `GET /cap8/kiem-tra` — keyed on all FOUR inputs, because every one of them
   * changes the answer (a different volume moves dồn ngành, a different cắt lỗ
   * decides whether tổng rủi ro is computable at all).
   *
   * ★ This endpoint is EXPENSIVE — O(vị thế) price lookups plus bounded O(n²)
   * correlation fetches — so `useKiemTraCap8` debounces the key before it ever
   * reaches this function. Never call it straight off a keystroke.
   */
  kiemTra: (symbol: string, khoiLuong: number, gia: number, catLo: number | null) =>
    ["cap8", "kiem-tra", symbol, khoiLuong, gia, catLo] as const,
  thachThuc: () => ["cap8", "thach-thuc"] as const,
} as const
