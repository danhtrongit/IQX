/**
 * Typed adapters for the admin core routes.
 *
 * Every request goes through the shared `api()` client from `@/lib/api`, so the
 * admin app inherits the app's token storage, refresh and error handling — it
 * keeps no session of its own. Wire shapes are snake_case; everything handed to
 * the UI is camelCase and defensive about nulls (a missing plan, a soft-deleted
 * user or an empty page never crashes a render).
 */
import { api, apiResponse } from "@/lib/api"
import type { AdminJobQueuedV2, AdminSystemStatusV2, LegacyPaymentOrderBrief, LegacySubscriptionBrief, LegacyUserBriefForAdmin } from "@/lib/generated/backend-v2"


/* ── Pagination ─────────────────────────────────────────────────────────── */

export type AdminPage<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

type WirePage<T> = {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export function adaptPage<TIn, TOut>(
  raw: { items?: TIn[] | null; data?: TIn[] | null; total?: number; page?: number; page_size?: number; pageSize?: number; total_pages?: number; totalPages?: number },
  adapt: (row: TIn) => TOut,
): AdminPage<TOut> {
  const items = raw.items ?? raw.data ?? []
  const pageSize = raw.page_size ?? raw.pageSize ?? (items.length || 1)
  const total = raw.total ?? items.length
  const page = raw.page ?? 1
  return {
    items: items.map(adapt),
    total,
    page,
    pageSize,
    totalPages: raw.total_pages ?? raw.totalPages ?? Math.max(1, Math.ceil(total / pageSize)),
  }
}

/** Drops empty values so a blank filter never becomes `?role=`. */
function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    search.set(key, String(value))
  }
  return search.toString()
}

/* ── Metrics ────────────────────────────────────────────────────────────── */

export type PlanDistributionPoint = {
  planCode: string
  planName: string
  priceVnd: number
  activeSubscriptions: number
}

export type MetricsOverview = {
  totalUsers: number
  activeUsers: number
  newUsersToday: number
  newUsersLast7d: number
  newUsersLast30d: number
  activeSubscribers: number
  activeTrialCount: number
  activePaidCount: number
  planDistribution: PlanDistributionPoint[]
  mrrVnd: number
  revenueTodayVnd: number
  revenueLast7dVnd: number
  revenueLast30dVnd: number
  vtActiveAccounts: number
  vtOrdersToday: number
  generatedAt: string
}

export type DailyRevenuePoint = {
  date: string
  paidOrders: number
  revenueVnd: number
}

type WirePlanDistributionPoint = {
  plan_code: string
  plan_name: string
  price_vnd: number
  active_subscriptions: number
}

function adaptPlanDistributionPoint(raw: WirePlanDistributionPoint): PlanDistributionPoint {
  return {
    planCode: raw.plan_code,
    planName: raw.plan_name,
    priceVnd: raw.price_vnd,
    activeSubscriptions: raw.active_subscriptions,
  }
}

type WireMetricsOverview = {
  total_users: number
  active_users: number
  new_users_today: number
  new_users_last_7d: number
  new_users_last_30d: number
  active_subscribers: number
  active_trial_count: number
  active_paid_count: number
  plan_distribution: WirePlanDistributionPoint[]
  mrr_vnd: number
  revenue_today_vnd: number
  revenue_last_7d_vnd: number
  revenue_last_30d_vnd: number
  vt_active_accounts: number
  vt_orders_today: number
  generated_at: string
}

type WireDailyRevenuePoint = { date: string; paid_orders: number; revenue_vnd: number }

export const metricsApi = {
  overview: async (): Promise<MetricsOverview> => {
    const raw = await api<WireMetricsOverview>("/admin/metrics/overview")
    return {
      totalUsers: raw.total_users,
      activeUsers: raw.active_users,
      newUsersToday: raw.new_users_today,
      newUsersLast7d: raw.new_users_last_7d,
      newUsersLast30d: raw.new_users_last_30d,
      activeSubscribers: raw.active_subscribers,
      activeTrialCount: raw.active_trial_count,
      activePaidCount: raw.active_paid_count,
      planDistribution: (raw.plan_distribution ?? []).map(adaptPlanDistributionPoint),
      mrrVnd: raw.mrr_vnd,
      revenueTodayVnd: raw.revenue_today_vnd,
      revenueLast7dVnd: raw.revenue_last_7d_vnd,
      revenueLast30dVnd: raw.revenue_last_30d_vnd,
      vtActiveAccounts: raw.vt_active_accounts,
      vtOrdersToday: raw.vt_orders_today,
      generatedAt: raw.generated_at,
    }
  },
  revenue: async (days = 30): Promise<DailyRevenuePoint[]> => {
    const raw = await api<WireDailyRevenuePoint[]>(`/admin/metrics/revenue?days=${days}`)
    return raw.map((point) => ({
      date: point.date,
      paidOrders: point.paid_orders,
      revenueVnd: point.revenue_vnd,
    }))
  },
}

/* ── Users ──────────────────────────────────────────────────────────────── */

export const ADMIN_ROLES = ["user", "premium", "admin"] as const
export const ADMIN_STATUSES = ["active", "inactive", "suspended", "deleted"] as const
/** Statuses an admin may assign with `set_status` (soft delete is its own op). */
export const ASSIGNABLE_STATUSES = ["active", "inactive", "suspended"] as const
export const USER_SORT_FIELDS = [
  "created_at",
  "updated_at",
  "email",
  "full_name",
  "role",
  "status",
  "last_login_at",
] as const
export type UserSortField = (typeof USER_SORT_FIELDS)[number]
export const BULK_OPS = ["set_role", "set_status", "soft_delete"] as const
export type BulkOp = (typeof BULK_OPS)[number]

export type AdminUserRow = {
  id: string
  email: string
  fullName: string | null
  phoneNumber: string | null
  role: string
  status: string
  isEmailVerified: boolean
  lastLoginAt: string | null
  createdAt: string
}

type WireUserRow = LegacyUserBriefForAdmin

export function adaptUserRow(raw: WireUserRow): AdminUserRow {
  return {
    id: String(raw.id),
    email: raw.email,
    fullName: typeof raw.full_name === "string" && raw.full_name.length > 0 ? raw.full_name : null,
    phoneNumber: typeof raw.phone_number === "string" && raw.phone_number.length > 0 ? raw.phone_number : null,
    role: raw.role,
    status: raw.status,
    isEmailVerified: raw.is_email_verified,
    lastLoginAt: raw.last_login_at,
    createdAt: raw.created_at,
  }
}

export type PlanBrief = {
  id: string
  code: string
  name: string
  priceVnd: number
  durationDays: number
}

export type SubscriptionBrief = {
  id: string
  status: string
  plan: PlanBrief | null
  currentPeriodStart: string
  currentPeriodEnd: string
  isTrial: boolean
  cancelledAt: string | null
  cancelledByUserId: string | null
  cancelReason: string | null
}

export type PaymentOrderBrief = {
  id: string
  invoiceNumber: string
  amountVnd: number
  status: string
  grantType: string | null
  planCode: string | null
  paidAt: string | null
  createdAt: string
}

export type VTAccountBrief = {
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

export type VTOrderBrief = {
  id: string
  symbol: string
  side: string
  status: string
  quantity: number
  priceVnd: number | null
  createdAt: string
}

export type LoginHistoryRow = {
  id: string
  userId: string | null
  email: string
  success: boolean
  failureReason: string | null
  ip: string | null
  userAgent: string | null
  loginAt: string
}

export type User360 = {
  user: AdminUserRow
  subscription: SubscriptionBrief | null
  subscriptionHistory: SubscriptionBrief[]
  paymentHistory: PaymentOrderBrief[]
  trialUsed: boolean
  vtAccount: VTAccountBrief | null
  vtRecentOrders: VTOrderBrief[]
  loginHistory: LoginHistoryRow[]
}

type WireSubscriptionBrief = Required<LegacySubscriptionBrief>

type WirePaymentOrderBrief = LegacyPaymentOrderBrief

type WireVTAccountBrief = {
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

type WireVTOrderBrief = {
  id: string
  symbol: string
  side: string
  status: string
  quantity: number
  price_vnd: number | null
  created_at: string
}

type WireLoginHistoryRow = {
  id: string
  user_id: string | null
  email: string
  success: boolean
  failure_reason: string | null
  ip: string | null
  user_agent: string | null
  login_at: string
}

type WireUser360 = {
  user: WireUserRow
  subscription: WireSubscriptionBrief | null
  subscription_history: WireSubscriptionBrief[]
  payment_history: WirePaymentOrderBrief[]
  trial_used: boolean
  vt_account: WireVTAccountBrief | null
  vt_recent_orders: WireVTOrderBrief[]
  login_history: WireLoginHistoryRow[]
}

function adaptSubscription(raw: WireSubscriptionBrief): SubscriptionBrief {
  return {
    id: String(raw.id),
    status: raw.status,
    plan: raw.plan
      ? {
          id: String(raw.plan.id),
          code: raw.plan.code,
          name: raw.plan.name,
          priceVnd: raw.plan.price_vnd,
          durationDays: raw.plan.duration_days,
        }
      : null,
    currentPeriodStart: raw.current_period_start,
    currentPeriodEnd: raw.current_period_end,
    isTrial: raw.is_trial,
    cancelledAt: raw.cancelled_at,
    cancelledByUserId: raw.cancelled_by_user_id,
    cancelReason: raw.cancel_reason,
  }
}

function adaptPaymentOrder(raw: WirePaymentOrderBrief): PaymentOrderBrief {
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

function adaptVTAccount(raw: WireVTAccountBrief): VTAccountBrief {
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

function adaptVTOrder(raw: WireVTOrderBrief): VTOrderBrief {
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

export function adaptLoginHistoryRow(raw: WireLoginHistoryRow): LoginHistoryRow {
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

function adaptUser360(raw: WireUser360): User360 {
  return {
    user: adaptUserRow(raw.user),
    subscription: raw.subscription ? adaptSubscription(raw.subscription) : null,
    subscriptionHistory: (raw.subscription_history ?? []).map(adaptSubscription),
    paymentHistory: (raw.payment_history ?? []).map(adaptPaymentOrder),
    trialUsed: raw.trial_used,
    vtAccount: raw.vt_account ? adaptVTAccount(raw.vt_account) : null,
    vtRecentOrders: (raw.vt_recent_orders ?? []).map(adaptVTOrder),
    loginHistory: (raw.login_history ?? []).map(adaptLoginHistoryRow),
  }
}

export type AdminUserDetail = {
  id: string
  email: string
  fullName: string | null
  phoneNumber: string | null
  phoneCountryCode: string | null
  phoneNationalNumber: string | null
  phoneE164: string | null
  phoneVerifiedAt: string | null
  avatarUrl: string | null
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

type WireUserDetail = {
  id: string
  email: string
  full_name: string | null
  phone_number: string | null
  phone_country_code: string | null
  phone_national_number: string | null
  phone_e164: string | null
  phone_verified_at: string | null
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
  role: string
  status: string
  is_email_verified: boolean
  email_verified_at: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export function adaptUserDetail(raw: WireUserDetail): AdminUserDetail {
  return {
    id: String(raw.id),
    email: raw.email,
    fullName: typeof raw.full_name === "string" && raw.full_name.length > 0 ? raw.full_name : null,
    phoneNumber: raw.phone_number,
    phoneCountryCode: raw.phone_country_code,
    phoneNationalNumber: raw.phone_national_number,
    phoneE164: raw.phone_e164,
    phoneVerifiedAt: raw.phone_verified_at,
    avatarUrl: raw.avatar_url,
    dateOfBirth: raw.date_of_birth,
    gender: raw.gender,
    country: raw.country,
    provinceState: raw.province_state,
    city: raw.city,
    district: raw.district,
    ward: raw.ward,
    streetAddress: raw.street_address,
    postalCode: raw.postal_code,
    role: raw.role,
    status: raw.status,
    isEmailVerified: raw.is_email_verified,
    emailVerifiedAt: raw.email_verified_at,
    lastLoginAt: raw.last_login_at,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

export type UserListParams = {
  page: number
  pageSize: number
  sortBy?: UserSortField
  sortDir?: "asc" | "desc"
  role?: string
  status?: string
  search?: string
}

export type AdminUserPatch = {
  full_name?: string | null
  phone_number?: string | null
  avatar_url?: string | null
  date_of_birth?: string | null
  gender?: string | null
  country?: string | null
  province_state?: string | null
  city?: string | null
  district?: string | null
  ward?: string | null
  street_address?: string | null
  postal_code?: string | null
  role?: string
  status?: string
  is_email_verified?: boolean
}

export type BulkUpdateResponse = {
  affected: number
  skipped: string[]
  errors: { userId: string; message: string }[]
}

export type ResetPasswordResult = { temporaryPassword: string; warning: string }

export type UserExportFilters = {
  role?: string
  status?: string
  search?: string
  lastLoginFrom?: string
  lastLoginTo?: string
}

/** Download CSV through the same authenticated refresh path as JSON requests. */
async function downloadUsersCsv(filters: UserExportFilters): Promise<string> {
  const search = query({
    role: filters.role,
    status: filters.status,
    search: filters.search,
    last_login_from: filters.lastLoginFrom,
    last_login_to: filters.lastLoginTo,
  })
  const response = await apiResponse(`/admin/users/export${search ? `?${search}` : ""}`)
  const disposition = response.headers.get("content-disposition") ?? ""
  const match = /filename="?([^";]+)"?/.exec(disposition)
  const filename = match?.[1] ?? `users-${new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-")}.csv`
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
  return filename
}

export const usersApi = {
  list: async (params: UserListParams): Promise<AdminPage<AdminUserRow>> => {
    const search = query({
      page: params.page,
      page_size: params.pageSize,
      sort_by: params.sortBy,
      sort_order: params.sortDir,
      role: params.role,
      status: params.status,
      search: params.search,
    })
    return adaptPage(await api<WirePage<WireUserRow>>(`/users?${search}`), adaptUserRow)
  },
  get360: async (userId: string): Promise<User360> =>
    adaptUser360(await api<WireUser360>(`/admin/users/${userId}/360`)),
  /** Full record (`GET /users/{id}`, admin-only) — the source for the profile editor. */
  get: async (userId: string): Promise<AdminUserDetail> =>
    adaptUserDetail(await api<WireUserDetail>(`/users/${userId}`)),
  update: async (userId: string, patch: AdminUserPatch): Promise<AdminUserRow> =>
    adaptUserRow(
      await api<WireUserRow>(`/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    ),
  softDelete: (userId: string) => api<void>(`/users/${userId}`, { method: "DELETE" }),
  bulk: (body: { userIds: string[]; op: BulkOp; value?: string | null }): Promise<BulkUpdateResponse> =>
    api<{ affected: number; skipped: string[]; errors: { user_id: string; message: string }[] }>(
      "/admin/users/bulk",
      {
        method: "POST",
        body: JSON.stringify({ user_ids: body.userIds, op: body.op, value: body.value ?? null }),
      },
    ).then((raw) => ({
      affected: raw.affected,
      skipped: raw.skipped ?? [],
      errors: (raw.errors ?? []).map((error) => ({ userId: error.user_id, message: error.message })),
    })),
  resetPassword: async (userId: string): Promise<ResetPasswordResult> => {
    const raw = await api<{ temporary_password: string; warning: string }>(
      `/admin/users/${userId}/reset-password`,
      { method: "POST" },
    )
    return { temporaryPassword: raw.temporary_password, warning: raw.warning }
  },
  resendVerification: async (userId: string): Promise<string> => {
    const raw = await api<{ message: string }>(`/admin/users/${userId}/resend-verification`, {
      method: "POST",
    })
    return raw.message
  },
  loginHistory: async (
    userId: string,
    params: { page: number; pageSize: number },
  ): Promise<AdminPage<LoginHistoryRow>> =>
    adaptPage(
      await api<WirePage<WireLoginHistoryRow>>(
        `/admin/users/${userId}/login-history?${query({ page: params.page, page_size: params.pageSize })}`,
      ),
      adaptLoginHistoryRow,
    ),
  exportCsv: downloadUsersCsv,
}

/* ── System ─────────────────────────────────────────────────────────────── */

export type JobInfo = {
  id: string
  name: string
  nextRunAt: string | null
  trigger: string
}

export type SystemStatus = {
  version: string
  environment: string
  schedulerRunning: boolean
  jobs: JobInfo[]
  dbStats: Record<string, number>
  lastIpnReceivedAt: string | null
  lastIpnProcessedCount24h: number
  generatedAt: string
}

export type RunJobResult = {
  jobId: string
  result: Record<string, unknown>
  ranAt: string
}

/** Finance operations intentionally exposed as manual actions in this UI. */
export const MANUAL_JOB_IDS = ["billing.expiry-sweep", "billing.ipn-reconcile"] as const

type WireSystemStatus = AdminSystemStatusV2

export const systemApi = {
  status: async (): Promise<SystemStatus> => {
    const raw = await api<WireSystemStatus>("/admin/system/status")
    return {
      version: raw.version,
      environment: raw.environment,
      schedulerRunning: raw.scheduler_running,
      jobs: (raw.jobs ?? []).map((job) => ({
        id: job.name,
        name: job.description,
        nextRunAt: job.nextRunAt ?? null,
        trigger: job.pattern ? `Cron: ${job.pattern} (Asia/Ho_Chi_Minh)` : job.everyMs ? `Mỗi ${job.everyMs / 1000} giây` : "Chưa cấu hình",
      })),
      dbStats: raw.db_stats ?? {},
      lastIpnReceivedAt: raw.last_ipn_received_at,
      lastIpnProcessedCount24h: raw.last_ipn_processed_count_24h,
      generatedAt: raw.generated_at,
    }
  },
  runJob: async (jobId: string): Promise<RunJobResult> => {
    const raw = await api<AdminJobQueuedV2>(
      `/admin/system/jobs/${jobId}/run`,
      { method: "POST" },
    )
    return { jobId: raw.job_id, result: { queueJobId: raw.jobId, state: raw.state, name: raw.name }, ranAt: raw.ran_at }
  },
}

/* ── Audit ──────────────────────────────────────────────────────────────── */

export type AuditLogRow = {
  id: string
  adminUserId: string | null
  adminEmail: string | null
  action: string
  targetEntity: string | null
  targetId: string | null
  payloadBefore: Record<string, unknown> | null
  payloadAfter: Record<string, unknown> | null
  note: string | null
  ip: string | null
  userAgent: string | null
  requestId: string | null
  createdAt: string
}

export type AuditLogParams = {
  page: number
  pageSize: number
  adminUserId?: string
  actionPrefix?: string
  targetEntity?: string
  targetId?: string
  dateFrom?: string
  dateTo?: string
}

type WireAuditLogRow = {
  id: string
  admin_user_id: string | null
  admin_email: string | null
  action: string
  target_entity: string | null
  target_id: string | null
  payload_before: Record<string, unknown> | null
  payload_after: Record<string, unknown> | null
  note: string | null
  ip: string | null
  user_agent: string | null
  request_id: string | null
  created_at: string
}

export function adaptAuditLogRow(raw: WireAuditLogRow): AuditLogRow {
  return {
    id: String(raw.id),
    adminUserId: raw.admin_user_id ? String(raw.admin_user_id) : null,
    adminEmail: raw.admin_email,
    action: raw.action,
    targetEntity: raw.target_entity,
    targetId: raw.target_id,
    payloadBefore: raw.payload_before ?? null,
    payloadAfter: raw.payload_after ?? null,
    note: raw.note,
    ip: raw.ip,
    userAgent: raw.user_agent,
    requestId: raw.request_id,
    createdAt: raw.created_at,
  }
}

export const auditApi = {
  /** The list is always newest-first — the endpoint exposes no sort parameter. */
  list: async (params: AuditLogParams): Promise<AdminPage<AuditLogRow>> => {
    const search = query({
      page: params.page,
      page_size: params.pageSize,
      admin_user_id: params.adminUserId,
      action_prefix: params.actionPrefix,
      target_entity: params.targetEntity,
      target_id: params.targetId,
      date_from: params.dateFrom,
      date_to: params.dateTo,
    })
    return adaptPage(await api<WirePage<WireAuditLogRow>>(`/admin/audit?${search}`), adaptAuditLogRow)
  },
}

/* ── Alert signals ──────────────────────────────────────────────────────── */

export type AlertSide = "buy" | "sell"
export type AlertLogic = "AND" | "OR"

export type AlertCondition = {
  indicator: string
  op: string
  value: number | string | null
  /** Connector to the previous condition (AND/OR); ignored on the first row. */
  join?: AlertLogic | null
}

export type AlertCombination = {
  logic: AlertLogic
  conditions: AlertCondition[]
}

export type AlertSignal = {
  key: string
  side: AlertSide
  taName: string
  messageTitle: string
  combination: AlertCombination
  isEnabled: boolean
  sortOrder: number
}

export type AlertSignalUpsert = {
  side: AlertSide
  taName: string
  messageTitle: string
  combination: AlertCombination
  isEnabled: boolean
  sortOrder: number
}

type WireSignal = {
  key: string
  side: AlertSide
  ta_name: string
  message_title: string
  combination: AlertCombination | null
  is_enabled: boolean
  sort_order: number
}

function adaptSignal(raw: WireSignal): AlertSignal {
  const combination = raw.combination ?? { logic: "AND" as AlertLogic, conditions: [] }
  return {
    key: raw.key,
    side: raw.side,
    taName: raw.ta_name,
    messageTitle: raw.message_title,
    combination: {
      logic: combination.logic === "OR" ? "OR" : "AND",
      conditions: combination.conditions ?? [],
    },
    isEnabled: raw.is_enabled,
    sortOrder: raw.sort_order,
  }
}

function toWireSignal(body: AlertSignalUpsert) {
  return {
    side: body.side,
    ta_name: body.taName,
    message_title: body.messageTitle,
    combination: body.combination,
    is_enabled: body.isEnabled,
    sort_order: body.sortOrder,
  }
}

export type IndicatorOption = { id: string; label: string; kind: string }

/** Display labels for the 5 raw price fields the backend catalog omits. */
export const RAW_FIELD_LABELS: Record<string, string> = {
  close: "Giá đóng cửa",
  open: "Giá mở cửa",
  high: "Giá cao nhất",
  low: "Giá thấp nhất",
  volume: "Khối lượng",
}

/** Fallback catalog: the 38 indicators plus the 5 raw OHLCV fields. */
export const ALERT_INDICATORS = [
  "ma_5", "ma_20", "ma_50", "ma_200", "ma_stack_bull", "uptrend", "death_cross",
  "ma_20_slope", "dist_ma_20", "dist_ma_200", "rsi_14", "macd_hist", "macd_bull_cross",
  "macd_bear_cross", "roc_20d", "atr_14", "atr_pct", "bb_width", "bb_squeeze",
  "bb_breakout_down", "vol_ma_20", "vol_zscore", "obv", "obv_ma_20", "high_20",
  "high_52w", "dist_52w_high", "breakout_20d", "breakout_52w", "low_20", "low_52w",
  "dist_52w_low", "breakdown_20d", "breakdown_52w", "hammer", "bull_engulfing",
  "bear_engulfing", "shooting_star", "close", "open", "high", "low", "volume",
]

export const ALERT_OPS = [">", "<", ">=", "<=", "==", "cross_above", "cross_below", "is_true"] as const

/** Ops the backend refuses on a binary (signal) indicator. */
export const CROSS_OPS = ["cross_above", "cross_below"] as const

/** Fallback list of the 15 signal indicators; the catalog's `kind` is authoritative. */
export const BINARY_INDICATOR_IDS = [
  "ma_stack_bull", "uptrend", "death_cross", "macd_bull_cross", "macd_bear_cross",
  "bb_squeeze", "bb_breakout_down", "breakout_20d", "breakout_52w", "breakdown_20d",
  "breakdown_52w", "hammer", "bull_engulfing", "bear_engulfing", "shooting_star",
] as const

const binaryIds: readonly string[] = BINARY_INDICATOR_IDS

/** True when a condition on `indicator` needs no threshold value. */
export function isBinaryIndicator(indicator: string, kind?: string): boolean {
  if (kind) return kind === "signal"
  return binaryIds.includes(indicator)
}

export const alertsApi = {
  list: async (): Promise<AlertSignal[]> => {
    const raw = await api<WireSignal[]>("/admin/alerts/signals")
    return raw.map(adaptSignal)
  },
  create: async (key: string, body: AlertSignalUpsert): Promise<AlertSignal> =>
    adaptSignal(
      await api<WireSignal>("/admin/alerts/signals", {
        method: "POST",
        body: JSON.stringify({ key, ...toWireSignal(body) }),
      }),
    ),
  update: async (key: string, body: AlertSignalUpsert): Promise<AlertSignal> =>
    adaptSignal(
      await api<WireSignal>(`/admin/alerts/signals/${key}`, {
        method: "PUT",
        body: JSON.stringify(toWireSignal(body)),
      }),
    ),
  remove: (key: string) => api<void>(`/admin/alerts/signals/${key}`, { method: "DELETE" }),
  seed: (overwrite = false): Promise<{ created: number; overwrite: boolean }> =>
    api<{ created: number; overwrite: boolean }>(
      `/admin/alerts/seed?overwrite=${String(overwrite)}`,
      { method: "POST" },
    ),
  indicators: (): Promise<IndicatorOption[]> => api<IndicatorOption[]>("/admin/alerts/indicators"),
}
