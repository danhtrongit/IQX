/**
 * Định dạng hiển thị của Bản tin thị trường: số kiểu Việt Nam (dấu phẩy thập phân), thứ ngày
 * tháng và giờ theo múi giờ Việt Nam. Ngày giao dịch là ngày lịch (không đổi qua UTC).
 */
import { parseISODate } from "@/lib/date-only"

const WEEKDAYS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"] as const

/** Ngưỡng bề rộng cửa sổ (px): từ đây trở lên dùng bản máy tính và bảng, dưới đó dùng bản điện thoại. */
export const BULLETIN_WIDE_BREAKPOINT = 900

export function formatBulletinNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

/** `+1,25%`, `-0,40%`, `0,00%`: luôn có dấu cho giá trị khác 0. */
export function formatSignedPercent(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : ""
  return `${sign}${formatBulletinNumber(Math.abs(value), digits)}%`
}

/** `+12,34`, `-5,00`: điểm thay đổi. */
export function formatSignedNumber(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : ""
  return `${sign}${formatBulletinNumber(Math.abs(value), digits)}`
}

/** `06/11/2026`. */
export function formatBulletinDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-")
  return year && month && day ? `${day}/${month}/${year}` : isoDate
}

/** `06/11`. */
export function formatBulletinDayMonth(isoDate: string): string {
  const [, month, day] = isoDate.split("-")
  return month && day ? `${day}/${month}` : isoDate
}

export function weekdayName(isoDate: string): string {
  const date = parseISODate(isoDate)
  return date ? WEEKDAYS[date.getDay()] : ""
}

/** `Thứ Sáu, 06/11/2026`. */
export function formatWeekdayDate(isoDate: string): string {
  const weekday = weekdayName(isoDate)
  return weekday ? `${weekday}, ${formatBulletinDate(isoDate)}` : formatBulletinDate(isoDate)
}

/** `15:40` theo giờ Việt Nam từ một mốc thời gian ISO. */
export function formatBulletinTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date)
}

/** `15:42 06/11/2026` theo giờ Việt Nam từ một mốc thời gian ISO. */
export function formatBulletinDateTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) return ""
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Ho_Chi_Minh",
  }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ""
  return `${part("hour")}:${part("minute")} ${part("day")}/${part("month")}/${part("year")}`
}

/** Số phiên giữ mã: `Hôm nay` cho 0, ngược lại `{n} phiên`. */
export function formatSessionCount(sessions: number): string {
  return sessions <= 0 ? "Hôm nay" : `${sessions} phiên`
}

/** Tên file tải về: `iqx-ban-tin-2026-11-06-may-tinh.pdf`. */
export function bulletinDownloadName(isoDate: string, variant: "desktop" | "mobile"): string {
  return `iqx-ban-tin-${isoDate}-${variant === "desktop" ? "may-tinh" : "dien-thoai"}.pdf`
}

/** "Bản tin cuối phiên · Thứ Sáu, 06/11/2026 · Public 15:42 · Cập nhật lúc 16:05". */
export function bulletinHeadline(bulletin: { trade_date: string; published_at: string; updated_at: string | null }): string {
  const parts = [
    "Bản tin cuối phiên",
    formatWeekdayDate(bulletin.trade_date),
    `Public ${formatBulletinTime(bulletin.published_at)}`,
  ]
  if (bulletin.updated_at) parts.push(`Cập nhật lúc ${formatBulletinTime(bulletin.updated_at)}`)
  return parts.join(" · ")
}
