/** Hàm format thuần dùng chung cho các component của tính năng Dự báo. */

/** Rút gọn giá trị dòng tiền tự do về đúng nhãn ròng (Mua/Bán/Cân bằng). */
export function netFlowLabel(value: string | null | undefined): string {
  if (!value) return "—"
  const v = value.toLowerCase()
  if (v.includes("mua")) return "Mua ròng"
  if (v.includes("bán") || v.includes("ban")) return "Bán ròng"
  return "Cân bằng"
}

/** Định dạng chỉ số tài chính thành số trơn (không có hậu tố "x"). */
export function fmtRatioPlain(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toFixed(2)
}

/** Giá dự phóng lưu theo VND; hiển thị theo đơn vị nghìn. */
export function fmtProjectedPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—"
  return (v / 1000).toFixed(2)
}

/** Định dạng một phân số thành chuỗi phần trăm. */
export function fmtPct(v: number | null | undefined, signed = false): string {
  if (v == null || !Number.isFinite(v)) return "—"
  const pct = v * 100
  const sign = signed && pct > 0 ? "+" : ""
  return `${sign}${pct.toFixed(1)}%`
}

/** Định dạng giá trị tiền VND, tự rút gọn về tỷ / triệu. */
export function fmtValueVnd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "—"
  if (v >= 1e9) return (v / 1e9).toFixed(1) + " tỷ"
  if (v >= 1e6) return (v / 1e6).toFixed(1) + " tr"
  return v.toLocaleString("vi-VN")
}

/** Định dạng khối lượng cổ phiếu (B / M / K). */
export function fmtVolume(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "—"
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B"
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M"
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "K"
  return v.toLocaleString("vi-VN")
}

/** Định dạng số tiền VND tròn (cho EPS / BVPS). */
export function fmtVnd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toLocaleString("vi-VN", { maximumFractionDigits: 0 })
}

/** Định dạng một phân số (0.12) thành chuỗi phần trăm "12.0%". */
export function fmtPctFraction(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${(v * 100).toFixed(1)}%`
}
