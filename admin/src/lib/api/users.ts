import { api, API_BASE, getAccessToken } from "./client"
import type { PaginatedResult } from "@/hooks/use-paginated-query"

// ── Types ──────────────────────────────────────────────────────────────────

export interface AdminUserRow {
  id: string
  email: string
  firstName: string
  lastName: string
  fullName: string | null
  phoneNumber: string | null
  role: "user" | "premium" | "admin"
  status: "active" | "inactive" | "suspended" | "deleted"
  isEmailVerified: boolean
  lastLoginAt: string | null
  createdAt: string
}

export interface PlanBrief {
  id: string
  code: string
  name: string
  priceVnd: number
  durationDays: number
}

export interface SubscriptionBrief {
  id: string
  status: string
  plan: PlanBrief | null
  currentPeriodStart: string
  currentPeriodEnd: string
  isTrial: boolean
  cancelledAt: string | null
  cancelReason: string | null
}

export interface PaymentOrderBrief {
  id: string
  invoiceNumber: string
  amountVnd: number
  status: string
  grantType: string | null
  planCode: string | null
  paidAt: string | null
  createdAt: string
}

export interface VTAccountBrief {
  id: string
  status: string
  initialCashVnd: number
  cashAvailableVnd: number
  cashReservedVnd: number
  cashPendingVnd: number
  activatedAt: string | null
  frozenAt: string | null
  freezeReason: string | null
}

export interface VTOrderBrief {
  id: string
  symbol: string
  side: string
  status: string
  quantity: number
  priceVnd: number | null
  createdAt: string
}

export interface LoginHistoryRow {
  id: string
  userId: string | null
  email: string
  success: boolean
  failureReason: string | null
  ip: string | null
  userAgent: string | null
  loginAt: string
}

export interface User360 {
  user: AdminUserRow
  subscription: SubscriptionBrief | null
  subscriptionHistory: SubscriptionBrief[]
  paymentHistory: PaymentOrderBrief[]
  trialUsed: boolean
  vtAccount: VTAccountBrief | null
  vtRecentOrders: VTOrderBrief[]
  loginHistory: LoginHistoryRow[]
}

export type BulkOp = "set_role" | "set_status" | "soft_delete"

export interface BulkRequest {
  user_ids: string[]
  op: BulkOp
  value?: string | null
}

export interface BulkResponse {
  affected: number
  skipped: string[]
  errors: Array<{ user_id: string; message: string }>
}

export interface UserListParams {
  page: number
  pageSize: number
  sortBy?: string
  sortDir?: "asc" | "desc"
  role?: string
  status?: string
  search?: string
}

// ── Backend raw shapes ─────────────────────────────────────────────────────

interface BackendUserRow {
  id: string
  email: string
  first_name: string
  last_name: string
  full_name: string | null
  phone_number: string | null
  role: string
  status: string
  is_email_verified: boolean
  last_login_at: string | null
  created_at: string
  [key: string]: unknown
}

interface BackendPlanBrief {
  id: string
  code: string
  name: string
  price_vnd: number
  duration_days: number
}

interface BackendSubscriptionBrief {
  id: string
  status: string
  plan: BackendPlanBrief | null
  current_period_start: string
  current_period_end: string
  is_trial: boolean
  cancelled_at: string | null
  cancel_reason: string | null
}

interface BackendPaymentBrief {
  id: string
  invoice_number: string
  amount_vnd: number
  status: string
  grant_type: string | null
  plan_code: string | null
  paid_at: string | null
  created_at: string
}

interface BackendVTAccountBrief {
  id: string
  status: string
  initial_cash_vnd: number
  cash_available_vnd: number
  cash_reserved_vnd: number
  cash_pending_vnd: number
  activated_at: string | null
  frozen_at: string | null
  freeze_reason: string | null
}

interface BackendVTOrderBrief {
  id: string
  symbol: string
  side: string
  status: string
  quantity: number
  price_vnd: number | null
  created_at: string
}

interface BackendLoginHistoryRow {
  id: string
  user_id: string | null
  email: string
  success: boolean
  failure_reason: string | null
  ip: string | null
  user_agent: string | null
  login_at: string
}

interface BackendUser360 {
  user: BackendUserRow
  subscription: BackendSubscriptionBrief | null
  subscription_history: BackendSubscriptionBrief[]
  payment_history: BackendPaymentBrief[]
  trial_used: boolean
  vt_account: BackendVTAccountBrief | null
  vt_recent_orders: BackendVTOrderBrief[]
  login_history: BackendLoginHistoryRow[]
}

interface BackendPaginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// ── Adapters ───────────────────────────────────────────────────────────────

function adaptUserRow(raw: BackendUserRow): AdminUserRow {
  return {
    id: String(raw.id),
    email: raw.email,
    firstName: raw.first_name,
    lastName: raw.last_name,
    fullName: raw.full_name ?? `${raw.first_name} ${raw.last_name}`.trim(),
    phoneNumber: raw.phone_number,
    role: raw.role as AdminUserRow["role"],
    status: raw.status as AdminUserRow["status"],
    isEmailVerified: raw.is_email_verified,
    lastLoginAt: raw.last_login_at,
    createdAt: raw.created_at,
  }
}

function adaptPlanBrief(raw: BackendPlanBrief): PlanBrief {
  return {
    id: String(raw.id),
    code: raw.code,
    name: raw.name,
    priceVnd: raw.price_vnd,
    durationDays: raw.duration_days,
  }
}

function adaptSubscription(raw: BackendSubscriptionBrief): SubscriptionBrief {
  return {
    id: String(raw.id),
    status: raw.status,
    plan: raw.plan ? adaptPlanBrief(raw.plan) : null,
    currentPeriodStart: raw.current_period_start,
    currentPeriodEnd: raw.current_period_end,
    isTrial: raw.is_trial,
    cancelledAt: raw.cancelled_at,
    cancelReason: raw.cancel_reason,
  }
}

function adaptPayment(raw: BackendPaymentBrief): PaymentOrderBrief {
  return {
    id: String(raw.id),
    invoiceNumber: raw.invoice_number,
    amountVnd: raw.amount_vnd,
    status: raw.status,
    grantType: raw.grant_type,
    planCode: raw.plan_code,
    paidAt: raw.paid_at,
    createdAt: raw.created_at,
  }
}

function adaptVTAccount(raw: BackendVTAccountBrief): VTAccountBrief {
  return {
    id: String(raw.id),
    status: raw.status,
    initialCashVnd: raw.initial_cash_vnd,
    cashAvailableVnd: raw.cash_available_vnd,
    cashReservedVnd: raw.cash_reserved_vnd,
    cashPendingVnd: raw.cash_pending_vnd,
    activatedAt: raw.activated_at,
    frozenAt: raw.frozen_at,
    freezeReason: raw.freeze_reason,
  }
}

function adaptVTOrder(raw: BackendVTOrderBrief): VTOrderBrief {
  return {
    id: String(raw.id),
    symbol: raw.symbol,
    side: raw.side,
    status: raw.status,
    quantity: raw.quantity,
    priceVnd: raw.price_vnd,
    createdAt: raw.created_at,
  }
}

function adaptLoginHistory(raw: BackendLoginHistoryRow): LoginHistoryRow {
  return {
    id: String(raw.id),
    userId: raw.user_id ? String(raw.user_id) : null,
    email: raw.email,
    success: raw.success,
    failureReason: raw.failure_reason,
    ip: raw.ip,
    userAgent: raw.user_agent,
    loginAt: raw.login_at,
  }
}

function adaptUser360(raw: BackendUser360): User360 {
  return {
    user: adaptUserRow(raw.user),
    subscription: raw.subscription ? adaptSubscription(raw.subscription) : null,
    subscriptionHistory: raw.subscription_history.map(adaptSubscription),
    paymentHistory: raw.payment_history.map(adaptPayment),
    trialUsed: raw.trial_used,
    vtAccount: raw.vt_account ? adaptVTAccount(raw.vt_account) : null,
    vtRecentOrders: raw.vt_recent_orders.map(adaptVTOrder),
    loginHistory: raw.login_history.map(adaptLoginHistory),
  }
}

// ── API client ─────────────────────────────────────────────────────────────

export const usersApi = {
  list: async (params: UserListParams): Promise<PaginatedResult<AdminUserRow>> => {
    const qs = new URLSearchParams()
    qs.set("page", String(params.page))
    qs.set("page_size", String(params.pageSize))
    if (params.sortBy) qs.set("sort_by", params.sortBy)
    if (params.sortDir) qs.set("sort_order", params.sortDir)
    if (params.role) qs.set("role", params.role)
    if (params.status) qs.set("status", params.status)
    if (params.search) qs.set("search", params.search)

    const raw = await api
      .get(`users/?${qs.toString()}`)
      .json<BackendPaginated<BackendUserRow>>()

    return {
      items: raw.items.map(adaptUserRow),
      total: raw.total,
      page: raw.page,
      pageSize: raw.page_size,
      totalPages: raw.total_pages,
    }
  },

  get: async (id: string): Promise<AdminUserRow> => {
    const raw = await api.get(`users/${id}`).json<BackendUserRow>()
    return adaptUserRow(raw)
  },

  get360: async (id: string): Promise<User360> => {
    const raw = await api.get(`admin/users/${id}/360`).json<BackendUser360>()
    return adaptUser360(raw)
  },

  bulk: (body: BulkRequest) =>
    api.post("admin/users/bulk", { json: body }).json<BulkResponse>(),

  resetPassword: (id: string) =>
    api
      .post(`admin/users/${id}/reset-password`)
      .json<{ temporary_password: string }>(),

  resendVerification: (id: string) =>
    api.post(`admin/users/${id}/resend-verification`),

  loginHistory: async (
    id: string,
    params: { page: number; page_size: number },
  ): Promise<PaginatedResult<LoginHistoryRow>> => {
    const qs = new URLSearchParams()
    qs.set("page", String(params.page))
    qs.set("page_size", String(params.page_size))
    const raw = await api
      .get(`admin/users/${id}/login-history?${qs.toString()}`)
      .json<BackendPaginated<BackendLoginHistoryRow>>()
    return {
      items: raw.items.map(adaptLoginHistory),
      total: raw.total,
      page: raw.page,
      pageSize: raw.page_size,
      totalPages: raw.total_pages,
    }
  },

  exportCsv: async (filters: Record<string, string>) => {
    const qs = new URLSearchParams(filters)
    const token = getAccessToken()
    const url = `${API_BASE}/admin/users/export?${qs.toString()}`
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!response.ok) throw new Error("Export thất bại")
    const blob = await response.blob()
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    const filename = `users_${ts}.csv`
    const href = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = href
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(href)
  },
}
