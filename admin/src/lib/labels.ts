export function labelForStatus(status: string | boolean | null | undefined) {
  if (status === true) return "Có"
  if (status === false) return "Không"
  if (status === null || status === undefined || status === "") return "-"
  return statusLabels[String(status)] ?? String(status)
}

export function tagTypeForStatus(status: string | boolean | null | undefined) {
  if (status === true) return "success"
  if (status === false) return "default"
  const value = String(status ?? "")
  if (["active", "paid", "success", "reconciled", "filled", "settled", "published", "running"].includes(value)) return "success"
  if (["pending", "trial", "admin_grant", "ignored", "partial_filled", "partially_filled", "draft"].includes(value)) return "warning"
  if (["failed", "cancelled", "canceled", "expired", "suspended", "deleted", "refunded", "rejected", "frozen", "stopped"].includes(value)) return "error"
  return "info"
}

export function labelForRole(role: string | null | undefined) {
  if (!role) return "-"
  return roleLabels[role] ?? role
}

export function labelForGrantType(type: string | null | undefined) {
  if (!type) return "Thanh toán"
  return grantTypeLabels[type] ?? type
}

export function labelForCourseLevel(level: string | null | undefined) {
  if (!level) return "-"
  return courseLevelLabels[level] ?? level
}

export function labelForPublishState(state: string | null | undefined) {
  if (!state) return "-"
  return publishStateLabels[state] ?? state
}

export function labelForContentType(type: string | null | undefined) {
  if (!type) return "-"
  return contentTypeLabels[type] ?? type
}

export function labelForVtSide(side: string | null | undefined) {
  if (!side) return "-"
  return vtSideLabels[side] ?? side
}

export function labelForVtKind(kind: string | null | undefined) {
  if (!kind) return "-"
  return vtKindLabels[kind] ?? kind
}

export const statusLabels: Record<string, string> = {
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
  ignored: "Đã bỏ qua",
  published: "Đã xuất bản",
  draft: "Bản nháp",
  frozen: "Đã khóa",
  running: "Đang chạy",
  stopped: "Đã dừng",
  settled: "Đã tất toán",
  open: "Đang mở",
}

export const roleLabels: Record<string, string> = {
  user: "Người dùng",
  premium: "Premium",
  admin: "Quản trị viên",
}

export const grantTypeLabels: Record<string, string> = {
  payment: "Thanh toán",
  admin_grant: "Cấp thủ công",
}

export const courseLevelLabels: Record<string, string> = {
  beginner: "Cơ bản",
  intermediate: "Trung cấp",
  advanced: "Nâng cao",
}

export const publishStateLabels: Record<string, string> = {
  published: "Đã xuất bản",
  draft: "Bản nháp",
}

export const contentTypeLabels: Record<string, string> = {
  text: "Văn bản",
  pdf: "PDF",
  video: "Video",
}

export const vtSideLabels: Record<string, string> = {
  buy: "Mua",
  sell: "Bán",
}

export const vtKindLabels: Record<string, string> = {
  buy: "Mua",
  sell: "Bán",
  cash_adjust: "Điều chỉnh tiền",
  cash_adjustment: "Điều chỉnh tiền",
  initial_cash: "Tiền ban đầu",
  fee: "Phí",
  tax: "Thuế",
  settlement: "Tất toán",
}
