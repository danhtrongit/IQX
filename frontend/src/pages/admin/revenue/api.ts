/**
 * Wire layer cho khu vực quản trị gói Premium / thuê bao / thanh toán / IPN.
 *
 * Mọi request đi qua `api()` dùng chung (token + refresh + `ApiError`), đường dẫn
 * tương đối `/api/v2`. Kiểu dữ liệu ở đây là snake_case đúng như backend trả về
 * (`backend/app/schemas/{premium,admin_subscriptions,admin_payments,admin_ipn}.py`)
 * — không đổi tên trường, không bịa giá trị mặc định: trường nào backend không
 * trả thì để `null`/`undefined` và UI hiển thị "—".
 */
import { api } from "@/lib/api"
import type { LegacyAdminPaymentOrderBrief, LegacyAdminPaymentOrderDetail, LegacyAdminSubscriptionBrief, LegacyAdminSubscriptionDetail, LegacyPlanResponse } from "@/lib/generated/backend-v2"

/* ── Dùng chung ─────────────────────────────────────────────────────────── */

/** `PaginatedResponse` của backend (`app/schemas/common.py`). */
export type Paginated<T> = {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

/**
 * Admin endpoints have historically emitted both snake_case and camelCase
 * pagination metadata. Normalize at the boundary so list pages do not need to
 * know which controller version answered the request.
 */
export function adaptPaginated<T>(raw: {
  items?: T[] | null
  data?: T[] | null
  total?: number | null
  page?: number | null
  page_size?: number | null
  pageSize?: number | null
  total_pages?: number | null
  totalPages?: number | null
}): Paginated<T> {
  const items = raw.items ?? raw.data ?? []
  const pageSize = raw.page_size ?? raw.pageSize ?? (items.length > 0 ? items.length : 1)
  const total = raw.total ?? items.length
  const page = raw.page ?? 1
  return {
    items,
    total,
    page,
    page_size: pageSize,
    total_pages: raw.total_pages ?? raw.totalPages ?? Math.max(1, Math.ceil(total / pageSize)),
  }
}

function query(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue
    search.set(key, String(value))
  }
  return search.toString()
}

function json(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) }
}

/* ── Gói Premium — /premium/admin/plans ─────────────────────────────────── */

/** `PlanResponse`. */
export type Plan = LegacyPlanResponse

/** `PlanCreate` — `price_vnd` và `duration_days` phải > 0. */
export type PlanCreateInput = {
  code: string
  name: string
  description: string | null
  price_vnd: number
  duration_days: number
  is_active: boolean
  sort_order: number
}

/** `PlanUpdate` — không có `code`: mã gói bất biến sau khi tạo. */
export type PlanUpdateInput = {
  name?: string
  description?: string | null
  price_vnd?: number
  duration_days?: number
  is_active?: boolean
  sort_order?: number
}

export function listPlans(signal?: AbortSignal) {
  return api<Plan[]>("/premium/admin/plans", { signal })
}

export function createPlan(body: PlanCreateInput) {
  return api<Plan>("/premium/admin/plans", json(body))
}

export function updatePlan(id: string, body: PlanUpdateInput) {
  return api<Plan>(`/premium/admin/plans/${id}`, { method: "PATCH", body: JSON.stringify(body) })
}

/** `DELETE` là soft-delete: backend chỉ đặt `is_active = false` (trừ TRIAL_7D). */
export function deactivatePlan(id: string) {
  return api<Plan>(`/premium/admin/plans/${id}`, { method: "DELETE" })
}

/* ── Thuê bao — /admin/subscriptions ────────────────────────────────────── */

/** `SubscriptionStatus` của backend: chỉ có 3 giá trị. */
export type SubscriptionStatus = "active" | "expired" | "cancelled"

export type SubscriptionBrief = Omit<LegacyAdminSubscriptionBrief, "status"> & { status: SubscriptionStatus }

export type SubscriptionDetail = Omit<LegacyAdminSubscriptionDetail, "status"> & { status: SubscriptionStatus }

export type SubscriptionListParams = {
  page: number
  page_size: number
  status?: string
  plan_id?: string
  user_id?: string
  expiring_within_days?: number
}

export function listSubscriptions(params: SubscriptionListParams, signal?: AbortSignal) {
  const qs = query({
    page: params.page,
    page_size: params.page_size,
    status: params.status,
    plan_id: params.plan_id,
    user_id: params.user_id,
    expiring_within_days: params.expiring_within_days,
  })
  return api<Paginated<SubscriptionBrief>>(`/admin/subscriptions?${qs}`, { signal }).then(adaptPaginated)
}

export function getSubscription(id: string, signal?: AbortSignal) {
  return api<SubscriptionDetail>(`/admin/subscriptions/${id}`, { signal })
}

/** `CancelSubscriptionRequest.reason` là bắt buộc. */
export function cancelSubscription(id: string, reason: string) {
  return api<SubscriptionDetail>(`/admin/subscriptions/${id}/cancel`, json({ reason }))
}

/** `ExtendSubscriptionRequest`: `days > 0`, `reason` tuỳ chọn. */
export function extendSubscription(id: string, days: number, reason?: string) {
  return api<SubscriptionDetail>(`/admin/subscriptions/${id}/extend`, json({ days, reason }))
}

/* ── Thanh toán — /admin/payments ───────────────────────────────────────── */

/** `PaymentOrderStatus` của backend. */
export type PaymentStatus = "pending" | "paid" | "failed" | "cancelled" | "partially_refunded" | "refunded"

/** `grant_type` trên đơn hàng: do webhook, do admin xác nhận, hay cấp không thanh toán. */
export type GrantType = "payment" | "admin_confirmed" | "admin_grant"

export type PaymentBrief = Omit<LegacyAdminPaymentOrderBrief, "status" | "grant_type"> & {
  status: PaymentStatus
  grant_type: GrantType | null
  refunded_amount_vnd: number
}

/** Một dòng trong `AdminPaymentOrderDetail.ipn_logs` (dict do service dựng). */
export type PaymentIpnLog = {
  id: string
  received_at: string | null
  secret_key_valid: boolean
  result_status: IpnResultStatus | null
  sepay_transaction_id: string | null
  error_message: string | null
}

export type PaymentDetail = Omit<LegacyAdminPaymentOrderDetail, "status" | "grant_type" | "subscription_status" | "ipn_logs"> & {
  status: PaymentStatus
  grant_type: GrantType | null
  subscription_status: SubscriptionStatus | null
  refunded_amount_vnd: number
  ipn_logs: PaymentIpnLog[]
}

export type PaymentListParams = {
  page: number
  page_size: number
  status?: string
  grant_type?: string
  user_id?: string
  plan_id?: string
  search?: string
}

export function listPayments(params: PaymentListParams, signal?: AbortSignal) {
  const qs = query({
    page: params.page,
    page_size: params.page_size,
    status: params.status,
    grant_type: params.grant_type,
    user_id: params.user_id,
    plan_id: params.plan_id,
    search: params.search,
  })
  return api<Paginated<PaymentBrief>>(`/admin/payments?${qs}`, { signal }).then(adaptPaginated)
}

export function getPayment(id: string, signal?: AbortSignal) {
  return api<PaymentDetail>(`/admin/payments/${id}`, { signal })
}

/** `RefundRequest.reason` bắt buộc; backend huỷ luôn thuê bao còn hạn của user. */
export function refundPayment(id: string, reason: string) {
  return api<PaymentDetail>(`/admin/payments/${id}/refund`, json({ reason }))
}

/**
 * `POST /admin/payments/{id}/mark-paid` — xác nhận thủ công đơn PENDING khi SePay
 * không gửi IPN. `note` là bằng chứng admin đã đối chiếu, bắt buộc (1–1000 ký tự).
 */
export function markPaymentPaid(id: string, note: string) {
  return api<PaymentDetail>(`/admin/payments/${id}/mark-paid`, json({ note }))
}

/** Kết quả `/reconcile`: `reconciled` = tìm thấy IPN hợp lệ, `no_match` = không có bằng chứng. */
export type ReconcileResult = {
  status: string
  order_id?: string | null
}

/** Chỉ chạy được với đơn PENDING đã tạo > 30 phút và có IPN hợp lệ khớp đơn. */
export function reconcilePayment(id: string, note?: string) {
  return api<ReconcileResult>(`/admin/payments/${id}/reconcile`, json({ note }))
}

export type GrantResult = {
  id: string
  invoice_number: string
  status: string
  grant_type: string | null
}

/** Cấp Premium thủ công: tạo một đơn mới 0đ và kích hoạt ngay, không có thanh toán. */
export function grantPremium(userId: string, planId: string, note: string) {
  return api<GrantResult>(`/premium/admin/users/${userId}/grant`, json({ plan_id: planId, note }))
}

/* ── Nhật ký IPN — /admin/ipn ───────────────────────────────────────────── */

/** `result_status` của `sepay_ipn_logs`: các giá trị `PremiumService.process_ipn` ghi lại. */
export type IpnResultStatus =
  | "processed"
  | "ignored"
  | "already_processed"
  | "order_not_found"
  | "amount_mismatch"
  | "amount_invalid"
  | "currency_mismatch"
  | "secret_invalid"
  | "invalid_json"
  | "invalid_payload"
  | "retried"

export type IpnLog = {
  id: string
  received_at: string
  secret_key_valid: boolean
  result_status: IpnResultStatus | null
  matched_order_id: string | null
  sepay_transaction_id: string | null
  error_message: string | null
  /** Chỉ có ở endpoint chi tiết; danh sách không trả về. */
  raw_body?: Record<string, unknown> | null
  raw_headers?: Record<string, unknown> | null
}

export type IpnListParams = {
  page: number
  page_size: number
  secret_key_valid?: boolean
  result_status?: string
  search?: string
}

export function listIpnLogs(params: IpnListParams, signal?: AbortSignal) {
  const qs = query({
    page: params.page,
    page_size: params.page_size,
    secret_key_valid: params.secret_key_valid,
    result_status: params.result_status,
    search: params.search,
  })
  return api<Paginated<IpnLog>>(`/admin/ipn?${qs}`, { signal }).then(adaptPaginated)
}

export function getIpnLog(id: string, signal?: AbortSignal) {
  return api<IpnLog>(`/admin/ipn/${id}`, { signal })
}

/**
 * `POST /admin/ipn/{id}/retry` — chỉ hợp lệ khi `secret_key_valid` và
 * `result_status != "processed"` và có `raw_body`; backend tạo một log mới.
 */
export function retryIpnLog(id: string) {
  return api<{ status: string; log_id: string; message: string }>(`/admin/ipn/${id}/retry`, json({}))
}
