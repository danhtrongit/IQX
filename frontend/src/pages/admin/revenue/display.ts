/**
 * Cách hiển thị dữ liệu billing: nhãn tiếng Việt cho các enum trên wire, tông màu
 * badge, và hai hàm định dạng mà `@/lib/format` chưa có (ngày không kèm giờ, số
 * tiền theo `currency` của đơn).
 *
 * Quy tắc: chỉ dịch nhãn — giá trị lạ vẫn hiện nguyên văn giá trị wire, và giá
 * trị thiếu luôn là "—" (không suy diễn trạng thái).
 */
import { formatMoney, formatNumber } from "@/lib/format"
import type { GrantType, IpnResultStatus, PaymentStatus, SubscriptionStatus } from "./api"

export type Tone = "success" | "warning" | "danger" | "neutral"

const TONE_CLASS: Record<Tone, string> = {
  success: "border-price-up/40 text-price-up",
  warning: "border-accent/60 text-accent-foreground",
  danger: "border-destructive/40 text-destructive",
  neutral: "border-border text-muted-foreground",
}

export function toneClass(tone: Tone) {
  return TONE_CLASS[tone]
}

const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, string> = {
  active: "Đang hoạt động",
  expired: "Hết hạn",
  cancelled: "Đã hủy",
}

const PAYMENT_STATUS: Record<PaymentStatus, string> = {
  pending: "Đang chờ",
  paid: "Đã thanh toán",
  failed: "Thất bại",
  cancelled: "Đã hủy",
  partially_refunded: "Đã hoàn tiền một phần",
  refunded: "Đã hoàn tiền",
}

const GRANT_TYPE: Record<GrantType, string> = {
  payment: "Thanh toán",
  // Admin tự kiểm tra tiền về rồi xác nhận đơn có thật — khác "Cấp thủ công"
  // (cấp Premium không hề có thanh toán nào).
  admin_confirmed: "Admin xác nhận",
  admin_grant: "Cấp thủ công",
}

/** `result_status` của `sepay_ipn_logs` (xem `PremiumService.process_ipn`). */
const IPN_RESULT: Record<IpnResultStatus, string> = {
  processed: "Đã xử lý",
  ignored: "Đã bỏ qua",
  already_processed: "Đã xử lý trước đó",
  order_not_found: "Không tìm thấy đơn",
  amount_mismatch: "Sai số tiền",
  amount_invalid: "Số tiền không hợp lệ",
  currency_mismatch: "Sai tiền tệ",
  secret_invalid: "Sai secret key",
  invalid_json: "JSON không hợp lệ",
  invalid_payload: "Payload không hợp lệ",
  // `AdminIPNService.retry` ghi giá trị dự phòng này khi kết quả xử lý không có "message".
  retried: "Đã chạy lại",
}

function labelFrom(map: Record<string, string>, value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—"
  return map[value] ?? value
}

export function subscriptionStatusLabel(status: SubscriptionStatus | null | undefined) {
  return labelFrom(SUBSCRIPTION_STATUS, status)
}

export function paymentStatusLabel(status: PaymentStatus | null | undefined) {
  return labelFrom(PAYMENT_STATUS, status)
}

export function grantTypeLabel(grantType: GrantType | null | undefined) {
  return labelFrom(GRANT_TYPE, grantType)
}

export function ipnResultLabel(resultStatus: IpnResultStatus | null | undefined) {
  return labelFrom(IPN_RESULT, resultStatus)
}

export function subscriptionTone(status: SubscriptionStatus | null | undefined): Tone {
  if (status === "active") return "success"
  if (status === "expired") return "warning"
  if (status === "cancelled") return "danger"
  return "neutral"
}

export function paymentTone(status: PaymentStatus | null | undefined): Tone {
  if (status === "paid") return "success"
  if (status === "pending") return "warning"
  if (status === "failed" || status === "refunded" || status === "partially_refunded") return "danger"
  return "neutral"
}

export function ipnTone(resultStatus: IpnResultStatus | null | undefined): Tone {
  if (resultStatus === "processed") return "success"
  if (resultStatus === "ignored" || resultStatus === "already_processed") return "neutral"
  if (!resultStatus) return "neutral"
  return "danger"
}

const dayFormat = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })

/** Ngày không kèm giờ — dùng cho kỳ hạn thuê bao (legacy cũng chỉ hiện ngày). */
export function formatDay(value: string | null | undefined) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : dayFormat.format(date)
}

/** Số tiền theo đúng `currency` của đơn; mặc định VND mới dùng ký hiệu ₫. */
export function formatAmount(amountVnd: number | null | undefined, currency: string | null | undefined) {
  if (amountVnd === null || amountVnd === undefined || !Number.isFinite(amountVnd)) return "—"
  if (currency && currency !== "VND") return `${formatNumber(amountVnd)} ${currency}`
  return formatMoney(amountVnd)
}
