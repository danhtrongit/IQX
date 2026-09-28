/**
 * Định dạng riêng cho màn quản trị giao dịch ảo — hai chỗ `@/lib/format` không
 * diễn tả được:
 *
 * - `formatDateOnly`: các cột `@db.Date` (`trading_date`, `due_date`) là ngày
 *   thuần tuý. `new Date("2026-09-24")` sẽ hiển thị theo múi giờ máy nên có thể
 *   lệch một ngày; ở đây chỉ đọc đúng phần `YYYY-MM-DD` của giá trị.
 * - `formatVndSigned`: sổ cái cần thấy ngay chiều tăng/giảm tiền; dấu `+` được
 *   viết tường minh để màu sắc không phải tín hiệu duy nhất.
 */
import { formatMoney } from "@/lib/format"

/** Ngày `YYYY-MM-DD` (hoặc ISO của cột date) → `dd/MM/yyyy`, không đổi múi giờ. */
export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "—"
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return "—"
  const [, year, month, day] = match
  return `${day}/${month}/${year}`
}

/** Tiền VND kèm dấu chiều: `+1.000.000 ₫` / `-500.000 ₫`. */
export function formatVndSigned(value: number): string {
  return value > 0 ? `+${formatMoney(value)}` : formatMoney(value)
}
