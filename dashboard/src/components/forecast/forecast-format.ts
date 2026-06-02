/** Hàm format thuần dùng chung cho các component của cửa sổ Dự báo. */

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
