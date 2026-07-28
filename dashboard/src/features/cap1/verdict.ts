import type { TrangThaiLucDat } from "./types"

/**
 * AI Thanh tra's verdict (spec §5) — a 5-tier scale, one tier richer than the
 * wire's 4-state `TrangThaiLucDat` (✅ Ủng hộ mạnh / ✅ Ủng hộ both collapse to
 * `"ung_ho"` on the wire — see `verdictToTrangThai`).
 */
export type Verdict = "ung_ho_manh" | "ung_ho" | "trung_tinh" | "can_chu_y" | "nguoc_chieu"

export const VERDICT_LABEL: Record<Verdict, string> = {
  ung_ho_manh: "✅ Ủng hộ mạnh",
  ung_ho: "✅ Ủng hộ",
  trung_tinh: "⚪ Trung tính",
  can_chu_y: "⚠ Cần chú ý",
  nguoc_chieu: "❌ Ngược chiều",
}

/**
 * spec §5 table — AI Thanh tra "map thẳng từ thang 5 bậc của AI Insight v2":
 *
 * | Thang 5 bậc thật                              | AI Thanh tra    |
 * |------------------------------------------------|-----------------|
 * | Rất mạnh · Hỗ trợ mạnh · Rất tích cực           | ✅ Ủng hộ mạnh   |
 * | Mạnh · Hỗ trợ nhẹ · Tích cực                    | ✅ Ủng hộ        |
 * | Trung bình · Trung tính                         | ⚪ Trung tính    |
 * | Yếu · Cảnh báo nhẹ · Tiêu cực                   | ⚠ Cần chú ý     |
 * | Rất yếu · Cảnh báo mạnh · Rất tiêu cực          | ❌ Ngược chiều  |
 *
 * The AI Insight v2 backend already encodes that exact 5-bậc scale as each
 * `LayerCard.statusLevel` (1 = Rất yếu/Cảnh báo mạnh/Rất tiêu cực .. 5 = Rất
 * mạnh/Hỗ trợ mạnh/Rất tích cực) — so this is a direct 1:1 numeric mapping,
 * no Vietnamese-string matching needed (robust to copy tweaks upstream).
 */
export function verdictFromStatusLevel(level: 1 | 2 | 3 | 4 | 5): Verdict {
  switch (level) {
    case 5:
      return "ung_ho_manh"
    case 4:
      return "ung_ho"
    case 3:
      return "trung_tinh"
    case 2:
      return "can_chu_y"
    case 1:
    default:
      return "nguoc_chieu"
  }
}

/**
 * spec §5 💎 Định giá (no `statusLevel` — BCTC KHỐI 02 isn't a 5-bậc AI Insight
 * layer): "Vùng giá trị · Trung vị · Giá hiện tại vs vùng. Giá nửa dưới vùng →
 * ✅ · quanh trung vị → ⚪ · nửa trên → ⚠ · vượt đỉnh → ❌."
 *
 * Interpolated onto the full 5-tier scale so it lines up with the other 4 lý
 * do: below the whole valuation range is the strongest buy signal (✅ Ủng hộ
 * mạnh — price is cheaper than every method's bear case); above the range is
 * its mirror (❌ Ngược chiều — "vượt đỉnh"); "quanh trung vị" is read as a ±5%
 * band around the median (`fair_median`).
 */
export function verdictFromValuation(params: {
  currentPrice: number
  median: number
  rangeLow: number
  rangeHigh: number
}): Verdict {
  const { currentPrice, median, rangeLow, rangeHigh } = params
  if (currentPrice > rangeHigh) return "nguoc_chieu"
  if (currentPrice < rangeLow) return "ung_ho_manh"
  if (currentPrice < median * 0.95) return "ung_ho"
  if (currentPrice > median * 1.05) return "can_chu_y"
  return "trung_tinh"
}

/**
 * Collapse the FE's 5-tier verdict to the backend's 4-state
 * `trangThai_luc_dat` (`order_kehoach` has no "mạnh" distinction — spec §9).
 */
export function verdictToTrangThai(v: Verdict): TrangThaiLucDat {
  return v === "ung_ho_manh" ? "ung_ho" : v
}
