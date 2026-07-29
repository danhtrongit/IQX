/**
 * Cấp 2 «Kỷ luật» — Giới hạn số cảnh báo (spec §10, PURE logic, no React).
 *
 * Chống quá tải cảnh báo: quá nhiều popup/ngày → user tắt não → bấm bừa
 * "Vẫn đặt"/"Giữ tiếp" → cảnh báo mất tác dụng. This module answers ONE
 * question — "for the alert about to fire, should it fire at all, and if so
 * at what escalation level?" — given 3 counters the caller already tracks:
 *
 *  - `importantShownThisSession` — how many "quan trọng" alerts (chạm SL cuối
 *    phiên + nhồi lệnh, spec §10) have already been shown THIS phiên.
 *  - `consecutiveCleanOrders` — how many orders in a row had NO vi phạm of
 *    this alert's loại (spec §10 "auto-mute có điều kiện": 10 sạch → tắt).
 *  - `timesThisViolationShown` — how many times in a row the user has
 *    dismissed ("Vẫn đặt"/"Giữ tiếp") THIS loại of alert (spec §10
 *    "escalation ngược").
 *
 * Callers (later tasks) own the counters' storage/reset semantics; this
 * function is a deterministic pure mapping, easy to unit-test exhaustively.
 */

export const MAX_IMPORTANT_ALERTS_PER_SESSION = 2
export const AUTO_MUTE_CLEAN_ORDERS_THRESHOLD = 10

/** lần 3-4 bỏ qua liên tiếp → nút xác nhận bị greyed. */
export const ESCALATION_GREYED_MIN = 3
/** lần 5+ bỏ qua liên tiếp → phải gõ "Tôi hiểu". */
export const ESCALATION_TYPE_CONFIRM_MIN = 5
/** Số giây nút xác nhận bị greyed ở mức `greyed5s`. */
export const GREYED_CONFIRM_SECONDS = 5

export type AlertLevel = "thuong" | "greyed5s" | "typeToConfirm"

export interface AlertRateInput {
  /** Số alert "quan trọng" (chạm SL + nhồi lệnh) đã hiện trong phiên hiện tại. */
  importantShownThisSession: number
  /** Số lệnh liên tiếp gần nhất KHÔNG vi phạm loại này. */
  consecutiveCleanOrders: number
  /** Số lần liên tiếp user đã bỏ qua ("Vẫn đặt"/"Giữ tiếp") loại alert này. */
  timesThisViolationShown: number
}

export interface AlertRateResult {
  /** `false` → đừng hiện alert này (đã đạt giới hạn phiên, hoặc đang auto-mute). */
  allow: boolean
  /** Mức xác nhận cần áp dụng KHI `allow` là `true` (vẫn được tính cả khi
   * `allow=false`, để caller lưu lại "mức đáng lẽ áp dụng" nếu cần). */
  level: AlertLevel
  /** Lý do ngắn khi `allow=false` — để log/debug, không bắt buộc hiển thị UI. */
  reason?: string
}

function escalationLevel(timesShown: number): AlertLevel {
  if (timesShown >= ESCALATION_TYPE_CONFIRM_MIN) return "typeToConfirm"
  if (timesShown >= ESCALATION_GREYED_MIN) return "greyed5s"
  return "thuong"
}

/** spec §10 — Giới hạn số cảnh báo + Auto-mute + Escalation ngược. */
export function evaluateAlertRate(input: AlertRateInput): AlertRateResult {
  const level = escalationLevel(input.timesThisViolationShown)

  if (input.importantShownThisSession >= MAX_IMPORTANT_ALERTS_PER_SESSION) {
    return {
      allow: false,
      level,
      reason: `Đã đạt giới hạn ${MAX_IMPORTANT_ALERTS_PER_SESSION} cảnh báo quan trọng trong phiên này.`,
    }
  }

  if (input.consecutiveCleanOrders >= AUTO_MUTE_CLEAN_ORDERS_THRESHOLD) {
    return {
      allow: false,
      level,
      reason: `Đã tắt cảnh báo loại này sau ${AUTO_MUTE_CLEAN_ORDERS_THRESHOLD} lệnh sạch liên tiếp — bạn đã học được.`,
    }
  }

  return { allow: true, level }
}
