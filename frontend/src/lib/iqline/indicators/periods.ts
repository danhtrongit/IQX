/**
 * Kỳ theo lịch cho chỉ báo cần thời gian nến (VWAP, Pivot Points). Giờ Việt Nam cố định UTC+7 như `core/calendar.ts`, nhưng thư mục
 * `indicators/` chỉ phụ thuộc `../types` nên không nhập từ `core`. Thuần, không chạm DOM.
 */
import type { Interval } from "../types"

const DAY = 86_400
/** Giờ Việt Nam (UTC+7); sàn không có giờ mùa hè. */
const ICT = 7 * 3600

export type PeriodUnit = "day" | "week" | "month" | "year"
export const PERIOD_UNITS: readonly PeriodUnit[] = ["day", "week", "month", "year"]

/** Khung trong ngày (phút). */
export const isIntradayInterval = (interval: Interval): boolean => interval !== "D" && interval !== "W" && interval !== "M"

/** Số ngày kể từ 1970-01-01 theo giờ Việt Nam. */
export const ictDayNumber = (time: number): number => Math.floor((time + ICT) / DAY)

/**
 * Khoá kỳ chứa `time`: số nguyên tăng theo thời gian, đổi giá trị đúng lúc sang kỳ mới. Tuần bắt đầu thứ hai; tháng và năm theo
 * lịch dương. Hai nến cùng khoá thuộc cùng một kỳ.
 */
export function periodKey(time: number, unit: PeriodUnit): number {
  const day = ictDayNumber(time)
  if (unit === "day") return day
  // 1970-01-01 là thứ năm, nên (ngày + 3) chia 7 đổi giá trị mỗi thứ hai.
  if (unit === "week") return Math.floor((day + 3) / 7)
  const date = new Date(day * DAY * 1000)
  return unit === "year" ? date.getUTCFullYear() : date.getUTCFullYear() * 12 + date.getUTCMonth()
}

/**
 * Kỳ tự động của VWAP: khung phút đặt lại mỗi ngày giao dịch (theo phiên); khung ngày đặt lại mỗi tháng; khung tuần và tháng đặt lại
 * mỗi năm. Ở khung ngày trở lên một nến đã là cả phiên, nên "theo phiên" chỉ cho ra giá điển hình của nến; vì thế kỳ dài hơn.
 */
export function autoVwapUnit(interval: Interval): PeriodUnit {
  if (isIntradayInterval(interval)) return "day"
  return interval === "D" ? "month" : "year"
}

/** Kỳ tự động của Pivot Points: 1 đến 15 phút theo ngày, 30 và 60 phút theo tuần, khung ngày theo tháng, tuần và tháng theo năm. */
export function autoPivotUnit(interval: Interval): PeriodUnit {
  if (interval === "1" || interval === "5" || interval === "15") return "day"
  if (interval === "30" || interval === "60") return "week"
  return interval === "D" ? "month" : "year"
}

export function resolveUnit(choice: string, auto: PeriodUnit): PeriodUnit {
  return (PERIOD_UNITS as readonly string[]).includes(choice) ? (choice as PeriodUnit) : auto
}
