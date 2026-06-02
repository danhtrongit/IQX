import { api } from "./client"
import type { PaginatedResult } from "@/hooks/use-paginated-query"

// ── Types ──────────────────────────────────────────────────────────────────

export interface IPNLogBrief {
  id: string
  receivedAt: string
  secretKeyValid: boolean
  resultStatus: string | null
  sepayTransactionId: string | null
  errorMessage: string | null
  rawBody: Record<string, unknown> | null
}

export interface PaymentRow {
  id: string
  invoiceNumber: string
  amountVnd: number
  currency: string
  status: string
  grantType: string | null
  paidAt: string | null
  createdAt: string
  planId: string
  planName: string | null
  planCode: string | null
  userId: string
  userEmail: string | null
  ipnLogCount: number
}

export interface PaymentDetail extends PaymentRow {
  updatedAt: string
  grantNote: string | null
  planPriceVnd: number | null
  subscriptionId: string | null
  subscriptionStatus: string | null
  subscriptionPeriodEnd: string | null
  ipnLogs: IPNLogBrief[]
}

// ── Backend raw shapes ──────────────────────────────────────────────────────

interface BackendBrief {
  id: string
  invoice_number: string
  amount_vnd: number
  currency: string
  status: string
  grant_type: string | null
  paid_at: string | null
  created_at: string
  plan_id: string
  plan_name: string | null
  plan_code: string | null
  user_id: string
  user_email: string | null
  ipn_log_count: number
}

interface BackendIPNLog {
  id: string
  received_at: string
  secret_key_valid: boolean
  result_status: string | null
  sepay_transaction_id: string | null
  error_message: string | null
  raw_body?: Record<string, unknown> | null
}

interface BackendDetail extends BackendBrief {
  updated_at: string
  grant_note: string | null
  plan_price_vnd: number | null
  subscription_id: string | null
  subscription_status: string | null
  subscription_period_end: string | null
  ipn_logs: BackendIPNLog[]
}

// ── Adapters ───────────────────────────────────────────────────────────────

function adaptBrief(raw: BackendBrief): PaymentRow {
  return {
    id: String(raw.id),
    invoiceNumber: raw.invoice_number,
    amountVnd: raw.amount_vnd,
    currency: raw.currency,
    status: raw.status,
    grantType: raw.grant_type,
    paidAt: raw.paid_at,
    createdAt: raw.created_at,
    planId: String(raw.plan_id),
    planName: raw.plan_name,
    planCode: raw.plan_code,
    userId: String(raw.user_id),
    userEmail: raw.user_email,
    ipnLogCount: raw.ipn_log_count,
  }
}

function adaptDetail(raw: BackendDetail): PaymentDetail {
  return {
    ...adaptBrief(raw),
    updatedAt: raw.updated_at,
    grantNote: raw.grant_note,
    planPriceVnd: raw.plan_price_vnd,
    subscriptionId: raw.subscription_id ? String(raw.subscription_id) : null,
    subscriptionStatus: raw.subscription_status,
    subscriptionPeriodEnd: raw.subscription_period_end,
    ipnLogs: raw.ipn_logs.map((l) => ({
      id: String(l.id),
      receivedAt: l.received_at,
      secretKeyValid: l.secret_key_valid,
      resultStatus: l.result_status,
      sepayTransactionId: l.sepay_transaction_id,
      errorMessage: l.error_message,
      rawBody: l.raw_body ?? null,
    })),
  }
}

interface BackendPaginated {
  items: BackendBrief[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// ── API client ─────────────────────────────────────────────────────────────

export const paymentsApi = {
  list: async (params: {
    page: number
    pageSize: number
    status?: string
    grantType?: string
    userId?: string
    planId?: string
    dateFrom?: string
    dateTo?: string
    search?: string
  }): Promise<PaginatedResult<PaymentRow>> => {
    const search = new URLSearchParams()
    search.set("page", String(params.page))
    search.set("page_size", String(params.pageSize))
    if (params.status) search.set("status", params.status)
    if (params.grantType) search.set("grant_type", params.grantType)
    if (params.userId) search.set("user_id", params.userId)
    if (params.planId) search.set("plan_id", params.planId)
    if (params.dateFrom) search.set("date_from", params.dateFrom)
    if (params.dateTo) search.set("date_to", params.dateTo)
    if (params.search) search.set("search", params.search)

    const raw = await api.get(`admin/payments?${search}`).json<BackendPaginated>()
    return {
      items: raw.items.map(adaptBrief),
      total: raw.total,
      page: raw.page,
      pageSize: raw.page_size,
      totalPages: raw.total_pages,
    }
  },

  get: async (id: string): Promise<PaymentDetail> => {
    const raw = await api.get(`admin/payments/${id}`).json<BackendDetail>()
    return adaptDetail(raw)
  },

  refund: async (id: string, reason: string): Promise<PaymentDetail> => {
    const raw = await api
      .post(`admin/payments/${id}/refund`, { json: { reason } })
      .json<BackendDetail>()
    return adaptDetail(raw)
  },

  reconcile: async (id: string, note?: string): Promise<Record<string, string>> => {
    return api
      .post(`admin/payments/${id}/reconcile`, { json: { note } })
      .json<Record<string, string>>()
  },
}
