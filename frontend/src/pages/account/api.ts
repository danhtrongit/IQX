/**
 * Adapter API cho khu vực tài khoản.
 *
 * Nguồn hợp đồng (backend-v2):
 * - `GET/PATCH /users/me`                      — hồ sơ cá nhân (users.controller.ts)
 * - `GET  /premium/plans`                      — gói đang bán (public)
 * - `GET  /premium/me`                          — trạng thái thuê bao
 * - `POST /premium/checkout`                    — form thanh toán SePay đã ký
 * - `GET  /premium/my-orders`                   — 20 đơn gần nhất (khoá camelCase!)
 * - `POST /auth/forgot-password`                — luôn 200, không tiết lộ email tồn tại
 * - `POST /auth/reset-password`                 — đặt lại mật khẩu bằng token trong email
 *
 * Wire contract là snake_case (trừ `/premium/my-orders`), mọi hàm ở đây trả về
 * dữ liệu camelCase đã kiểm tra kiểu. Không có nhánh nào tự tạo trạng thái
 * "thành công": mọi kết luận về thanh toán đều đọc từ `my-orders`/`me`.
 */
import { api } from "@/lib/api"
import type { LegacyPlanResponse, LegacySubscriptionResponse, LegacyUserResponse } from "@/lib/generated/backend-v2"

/* ── Hồ sơ người dùng ────────────────────────────────────────────────────── */

export type AccountProfile = {
  id: string
  email: string
  /** Chuẩn hoá tên còn null của tài khoản cũ thành chuỗi rỗng cho biểu mẫu. */
  fullName: string
  phoneNumber: string | null
  phoneE164: string | null
  phoneVerifiedAt: string | null
  avatarUrl: string | null
  /** `YYYY-MM-DD` (pydantic `date`). */
  dateOfBirth: string | null
  gender: string | null
  country: string | null
  provinceState: string | null
  city: string | null
  district: string | null
  ward: string | null
  streetAddress: string | null
  postalCode: string | null
  role: string
  status: string
  isEmailVerified: boolean
  emailVerifiedAt: string | null
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

type BackendUserResponse = LegacyUserResponse

/** Chuỗi rỗng từ backend coi như "chưa có dữ liệu". */
function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

function adaptProfile(raw: BackendUserResponse): AccountProfile {
  return {
    id: raw.id,
    email: raw.email,
    fullName: raw.full_name ?? "",
    phoneNumber: optionalText(raw.phone_number),
    phoneE164: optionalText(raw.phone_e164),
    phoneVerifiedAt: optionalText(raw.phone_verified_at),
    avatarUrl: optionalText(raw.avatar_url),
    dateOfBirth: optionalText(raw.date_of_birth),
    gender: optionalText(raw.gender),
    country: optionalText(raw.country),
    provinceState: optionalText(raw.province_state),
    city: optionalText(raw.city),
    district: optionalText(raw.district),
    ward: optionalText(raw.ward),
    streetAddress: optionalText(raw.street_address),
    postalCode: optionalText(raw.postal_code),
    role: raw.role,
    status: raw.status,
    isEmailVerified: raw.is_email_verified,
    emailVerifiedAt: optionalText(raw.email_verified_at),
    lastLoginAt: optionalText(raw.last_login_at),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

/**
 * `PATCH /users/me` — chỉ gửi khoá thực sự đổi (`exclude_unset` của backend).
 * `null` nghĩa là xoá giá trị; `phone_number: null` xoá cả bốn cột điện thoại.
 * Riêng `full_name` là NOT NULL: bỏ trống thì phải bỏ khoá, không gửi `null`.
 */
export type ProfilePatch = Partial<{
  full_name: string
  phone_number: string | null
  avatar_url: string | null
  date_of_birth: string | null
  gender: string | null
  country: string | null
  province_state: string | null
  city: string | null
  district: string | null
  ward: string | null
  street_address: string | null
  postal_code: string | null
}>

export async function fetchAccountProfile(signal?: AbortSignal): Promise<AccountProfile> {
  return adaptProfile(await api<BackendUserResponse>("/users/me", { signal }))
}

export async function saveAccountProfile(patch: ProfilePatch): Promise<AccountProfile> {
  const raw = await api<BackendUserResponse>("/users/me", {
    method: "PATCH",
    body: JSON.stringify(patch),
  })
  return adaptProfile(raw)
}

/* ── Premium ─────────────────────────────────────────────────────────────── */

export type PremiumPlan = {
  id: string
  code: string
  name: string
  description: string | null
  priceVnd: number
  durationDays: number
  sortOrder: number
}

type BackendPlan = Pick<LegacyPlanResponse, "id" | "code" | "name" | "description" | "price_vnd" | "duration_days" | "is_active" | "sort_order">

export type PremiumSubscription = {
  isPremium: boolean
  isTrial: boolean
  status: string | null
  plan: PremiumPlan | null
  periodStart: string | null
  periodEnd: string | null
}

type BackendSubscription = Omit<LegacySubscriptionResponse, "current_plan"> & { current_plan?: BackendPlan | null }

/** `PaymentOrderStatus` trong prisma/schema.prisma. */
export type PremiumOrderStatus = "pending" | "paid" | "failed" | "cancelled" | "partially_refunded" | "refunded" | (string & {})

export type PremiumOrder = {
  id: string
  invoiceNumber: string
  amount: number
  refundedAmount: number
  currency: string
  status: PremiumOrderStatus
  planName: string | null
  planCode: string | null
  paidAt: string | null
  createdAt: string
}

/** `/premium/my-orders` trả camelCase (khác mọi response premium còn lại). */
type BackendMyOrder = {
  id: string
  invoiceNumber: string
  amount: number
  refundedAmount: number
  currency: string
  status: string
  planName: string | null
  planCode: string | null
  paidAt: string | null
  createdAt: string
}

export type CheckoutSession = {
  /** URL trang thanh toán SePay (hosted checkout — nơi hiển thị mã QR). */
  action: string
  method: string
  /** Toàn bộ field đã ký, gồm cả `signature`. */
  fields: Array<{ name: string; value: string }>
  invoiceNumber: string
  orderId: string
}

export function adaptPremiumPlan(raw: BackendPlan): PremiumPlan {
  return {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    description: optionalText(raw.description),
    priceVnd: Number(raw.price_vnd ?? 0),
    durationDays: Number(raw.duration_days ?? 0),
    sortOrder: Number(raw.sort_order ?? 0),
  }
}

/** `GET /premium/plans` — chỉ gói đang bật (gói dùng thử 7 ngày bị loại ở server). */
export async function fetchPremiumPlans(signal?: AbortSignal): Promise<PremiumPlan[]> {
  const rows = await api<BackendPlan[] | null>("/premium/plans", { signal })
  return (Array.isArray(rows) ? rows : []).map(adaptPremiumPlan)
}

/** `GET /premium/me` — trạng thái thuê bao thật (server đã tính cả ca hết hạn). */
export function adaptPremiumSubscription(raw: BackendSubscription | null): PremiumSubscription {
  if (!raw) {
    return {
      isPremium: false,
      isTrial: false,
      status: null,
      plan: null,
      periodStart: null,
      periodEnd: null,
    }
  }
  return {
    isPremium: raw.is_premium === true,
    isTrial: raw.is_trial === true,
    status: raw.status,
    plan: raw.current_plan ? adaptPremiumPlan(raw.current_plan) : null,
    periodStart: optionalText(raw.current_period_start),
    periodEnd: optionalText(raw.current_period_end),
  }
}

export async function fetchPremiumSubscription(signal?: AbortSignal): Promise<PremiumSubscription> {
  const raw = await api<BackendSubscription | null>("/premium/me", { signal })
  return adaptPremiumSubscription(raw)
}

/** `GET /premium/my-orders` — 20 đơn gần nhất, mới nhất trước. */
export async function fetchPremiumOrders(signal?: AbortSignal): Promise<PremiumOrder[]> {
  const rows = await api<BackendMyOrder[] | null>("/premium/my-orders", { signal })
  return (Array.isArray(rows) ? rows : []).map(adaptPremiumOrder)
}

export function adaptPremiumOrder(raw: BackendMyOrder): PremiumOrder {
  return {
    id: raw.id,
    invoiceNumber: raw.invoiceNumber,
    amount: raw.amount,
    refundedAmount: raw.refundedAmount,
    currency: raw.currency,
    status: raw.status,
    planName: optionalText(raw.planName),
    planCode: optionalText(raw.planCode),
    paidAt: optionalText(raw.paidAt),
    createdAt: raw.createdAt,
  }
}

/** `POST /premium/checkout` — tạo đơn + form SePay đã ký cho một gói. */
export async function createPremiumCheckout(planId: string): Promise<CheckoutSession> {
  const raw = await api<{
    action: string
    method: string
    fields: Array<{ name: string; value: string }>
    invoice_number: string
    order_id: string
  }>("/premium/checkout", { method: "POST", body: JSON.stringify({ plan_id: planId }) })
  return {
    action: raw.action,
    method: raw.method,
    fields: Array.isArray(raw.fields) ? raw.fields : [],
    invoiceNumber: raw.invoice_number,
    orderId: raw.order_id,
  }
}

/**
 * Gửi form tới trang thanh toán SePay.
 *
 * `target="_blank"`: tab hiện tại giữ nguyên để người dùng quay lại và tự kiểm
 * tra trạng thái; tab mới nhận chuyển hướng success/error/cancel của SePay.
 * Không có bước nào ở đây tự đánh dấu đơn đã thanh toán — chỉ SePay IPN làm được.
 */
export function openSepayCheckout(session: CheckoutSession): void {
  const form = document.createElement("form")
  form.method = session.method || "POST"
  form.action = session.action
  form.target = "_blank"
  form.rel = "noopener noreferrer"
  form.style.display = "none"
  for (const field of session.fields) {
    const input = document.createElement("input")
    input.type = "hidden"
    input.name = field.name
    input.value = field.value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
  // Form đã được trình duyệt tiếp nhận; gỡ node sau khi điều hướng tab mới bắt đầu
  // (gỡ ngay lập tức có thể huỷ navigation ở một số trình duyệt).
  window.setTimeout(() => form.remove(), 1_000)
}

/* ── Khôi phục mật khẩu ──────────────────────────────────────────────────── */

/** `POST /auth/forgot-password` — luôn 200 kể cả khi email không tồn tại. */
export async function requestPasswordReset(email: string): Promise<string> {
  const raw = await api<{ message?: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  })
  return raw.message ?? "Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu."
}

/**
 * `POST /auth/reset-password` — 400 khi token sai/hết hạn (thông điệp chung, không
 * tiết lộ lý do), 422 khi mật khẩu không đạt chính sách. Thành công thu hồi mọi
 * refresh token của tài khoản.
 */
export async function resetPassword(token: string, newPassword: string): Promise<string> {
  const raw = await api<{ message?: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  })
  return raw.message ?? "Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập lại."
}

/* ── Chính sách mật khẩu (khớp src/common/password.ts của backend-v2) ─────── */

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

/** Đúng thứ tự và đúng câu chữ của `passwordPolicyViolation`. */
const PASSWORD_RULES: ReadonlyArray<{ label: string; test: (value: string) => boolean }> = [
  { label: "Mật khẩu phải chứa ít nhất một chữ in hoa", test: (v) => /[A-Z]/.test(v) },
  { label: "Mật khẩu phải chứa ít nhất một chữ thường", test: (v) => /[a-z]/.test(v) },
  { label: "Mật khẩu phải chứa ít nhất một chữ số", test: (v) => /\p{Nd}/u.test(v) },
  {
    label: "Mật khẩu phải chứa ít nhất một ký tự đặc biệt",
    test: (v) => /[!@#$%^&*(),.?":{}|<>]/.test(v),
  },
]

/** Vi phạm đầu tiên (đúng thứ tự backend), hoặc `null` khi hợp lệ. */
export function passwordViolation(value: string): string | null {
  for (const rule of PASSWORD_RULES) {
    if (!rule.test(value)) return rule.label
  }
  return null
}

/** Từng điều kiện kèm trạng thái đạt/chưa đạt, cho bảng kiểm ngay trong form. */
export function passwordChecks(value: string) {
  return [
    {
      label: `Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`,
      met: value.length >= PASSWORD_MIN_LENGTH,
    },
    {
      label: `Tối đa ${PASSWORD_MAX_LENGTH} ký tự`,
      met: value.length > 0 && value.length <= PASSWORD_MAX_LENGTH,
    },
    ...PASSWORD_RULES.map((rule) => ({ label: rule.label, met: rule.test(value) })),
  ]
}
