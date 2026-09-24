/**
 * Vietnamese labels for the values the admin API returns.
 *
 * The API speaks raw enums (`active`, `user.bulk_update`, `payment_orders`); the
 * UI never shows those bare except where the identifier itself is the subject
 * (signal keys, job ids, action strings in the audit detail).
 */

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral"

export const STATUS_LABELS: Record<string, string> = {
  active: "Đang hoạt động",
  inactive: "Không hoạt động",
  suspended: "Bị đình chỉ",
  deleted: "Đã xóa",
  paid: "Đã thanh toán",
  pending: "Đang chờ",
  failed: "Thất bại",
  refunded: "Đã hoàn tiền",
  cancelled: "Đã hủy",
  canceled: "Đã hủy",
  expired: "Hết hạn",
  success: "Thành công",
  reconciled: "Đã đối soát",
  filled: "Khớp lệnh",
  partial_filled: "Khớp một phần",
  partially_filled: "Khớp một phần",
  rejected: "Từ chối",
  trial: "Dùng thử",
  admin_grant: "Cấp thủ công",
  admin_confirmed: "Admin xác nhận",
  ignored: "Đã bỏ qua",
  published: "Đã xuất bản",
  draft: "Bản nháp",
  frozen: "Đã khóa",
  running: "Đang chạy",
  stopped: "Đã dừng",
  settled: "Đã tất toán",
  open: "Đang mở",
  processed: "Đã xử lý",
}

export const ROLE_LABELS: Record<string, string> = {
  user: "Người dùng",
  premium: "Premium",
  admin: "Quản trị viên",
}

export const GRANT_TYPE_LABELS: Record<string, string> = {
  payment: "Thanh toán",
  // Admin tự kiểm tra tiền về rồi xác nhận đơn có thật — khác hẳn "Cấp thủ công"
  // vốn là cấp Premium mà không hề có thanh toán nào.
  admin_confirmed: "Admin xác nhận",
  admin_grant: "Cấp thủ công",
}

export const VT_SIDE_LABELS: Record<string, string> = { buy: "Mua", sell: "Bán" }

export const ALERT_SIDE_LABELS: Record<string, string> = { buy: "MUA", sell: "BÁN" }

/** Keys of `/admin/system/status`'s `db_stats`. */
export const DB_STAT_LABELS: Record<string, string> = {
  users: "Người dùng",
  subscriptions: "Thuê bao",
  payment_orders: "Đơn thanh toán",
  ipn_logs: "Nhật ký IPN",
  audit_log: "Nhật ký kiểm toán",
}

/** Every `action` value the backend writes to `admin_audit_log`. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "user.create": "Tạo người dùng",
  "user.update": "Cập nhật người dùng",
  "user.delete": "Xóa người dùng",
  "user.bulk_update": "Cập nhật người dùng hàng loạt",
  "user.password_reset": "Đặt lại mật khẩu",
  "user.verify_resend": "Gửi lại email xác thực",
  "user.export": "Xuất CSV người dùng",
  "alert.signal_create": "Tạo tín hiệu cảnh báo",
  "alert.signal_update": "Cập nhật tín hiệu cảnh báo",
  "alert.signal_delete": "Xóa tín hiệu cảnh báo",
  "system.job_run": "Chạy job thủ công",
  "system.expiry_sweep": "Quét thuê bao hết hạn",
  "system.ipn_reconcile_scan": "Đối soát IPN tồn đọng",
  "premium.grant": "Cấp Premium thủ công",
  "premium.ipn.retry": "Thử lại IPN",
  "premium.order.mark_paid": "Đánh dấu đơn đã thanh toán",
  "premium.order.reconcile": "Đối soát đơn thanh toán",
  "premium.order.refund": "Hoàn tiền đơn thanh toán",
  "premium.plan.create": "Tạo gói Premium",
  "premium.plan.update": "Cập nhật gói Premium",
  "premium.plan.delete": "Xóa gói Premium",
  "premium.subscription.cancel": "Hủy thuê bao (quản trị)",
  "subscription.cancel": "Hủy thuê bao",
  "subscription.extend": "Gia hạn thuê bao",
  "lesson.course.create": "Tạo khóa học",
  "lesson.course.update": "Cập nhật khóa học",
  "lesson.course.delete": "Xóa khóa học",
  "lesson.course.thumbnail": "Cập nhật ảnh khóa học",
  "lesson.episode.create": "Tạo bài học",
  "lesson.episode.update": "Cập nhật bài học",
  "lesson.episode.delete": "Xóa bài học",
  "lesson.episode.reorder": "Sắp xếp bài học",
  "lesson.episode.upload": "Tải media bài học",
  "vt.account.freeze": "Khóa tài khoản giao dịch ảo",
  "vt.account.unfreeze": "Mở khóa tài khoản giao dịch ảo",
  "vt.account.reset": "Đặt lại tài khoản giao dịch ảo",
  "vt.account.reset_all": "Đặt lại toàn bộ tài khoản giao dịch ảo",
  "vt.cash.adjust": "Điều chỉnh số dư ảo",
  "vt.config.update": "Cập nhật cấu hình giao dịch ảo",
}

const SUCCESS_STATUSES = ["active", "paid", "success", "reconciled", "filled", "settled", "published", "running", "processed"]
const WARNING_STATUSES = ["pending", "trial", "admin_grant", "admin_confirmed", "ignored", "partial_filled", "partially_filled", "draft"]
const DANGER_STATUSES = ["failed", "cancelled", "canceled", "expired", "suspended", "deleted", "refunded", "rejected", "frozen", "stopped"]

/** Badge tone for a status/boolean flag — the same mapping the legacy admin used. */
export function statusTone(status: string | boolean | null | undefined): StatusTone {
  if (status === true) return "success"
  if (status === false) return "neutral"
  const value = String(status ?? "")
  if (SUCCESS_STATUSES.includes(value)) return "success"
  if (WARNING_STATUSES.includes(value)) return "warning"
  if (DANGER_STATUSES.includes(value)) return "danger"
  if (value === "") return "neutral"
  return "info"
}

/** `active` → `Đang hoạt động`; unknown values are shown verbatim, never guessed. */
export function labelForStatus(status: string | boolean | null | undefined): string {
  if (status === true) return "Có"
  if (status === false) return "Không"
  if (status === null || status === undefined || status === "") return "—"
  return STATUS_LABELS[status] ?? status
}

export function labelForRole(role: string | null | undefined): string {
  if (!role) return "—"
  return ROLE_LABELS[role] ?? role
}

export function labelForGrantType(grantType: string | null | undefined): string {
  if (!grantType) return "Thanh toán"
  return GRANT_TYPE_LABELS[grantType] ?? grantType
}

export function labelForVtSide(side: string | null | undefined): string {
  if (!side) return "—"
  return VT_SIDE_LABELS[side] ?? side
}

/** Every `target_entity` value the backend writes to `admin_audit_log`. */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  user: "Người dùng",
  job: "Job hệ thống",
  alert_signal: "Tín hiệu cảnh báo",
  payment_order: "Đơn thanh toán",
  plan: "Gói Premium",
  subscription: "Thuê bao",
  sepay_ipn_log: "Nhật ký IPN",
  course: "Khóa học",
  episode: "Bài học",
  market_analysis: "Phân tích thị trường",
  vt_account: "Tài khoản giao dịch ảo",
  vt_config: "Cấu hình giao dịch ảo",
}

/** Falls back to the raw action so an unmapped action is still readable. */
export function labelForAction(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action
}

/** Falls back to the raw entity name when it is not in the catalogue. */
export function labelForEntity(entity: string | null | undefined): string {
  if (!entity) return "—"
  return AUDIT_ENTITY_LABELS[entity] ?? entity
}
