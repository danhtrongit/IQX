const WEEKDAYS_VI = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"]

/** "2026-06-30" → "Thứ Ba, 30/06/2026". Input hỏng → "". */
export function formatSessionDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return ""
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return ""
  return `${WEEKDAYS_VI[d.getDay()]}, ${m[3]}/${m[2]}/${m[1]}`
}
