/** Định dạng hiển thị dùng chung cho các trang tài khoản. */

const dateOnly = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

/** `dd/mm/yyyy`, hoặc `—` khi thiếu/không hợp lệ. */
export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : dateOnly.format(date)
}

/** Số ngày còn lại tới `value`, không bao giờ âm; `0` khi thiếu mốc thời gian. */
export function daysUntil(value: string | null | undefined): number {
  if (!value) return 0
  const target = new Date(value).getTime()
  if (Number.isNaN(target)) return 0
  return Math.max(0, Math.ceil((target - Date.now()) / 86_400_000))
}
