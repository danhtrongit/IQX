import { api } from "./client"
import { adaptPage, type BackendPaginated, type PaginatedResult } from "./types"

export interface IPNLogBrief {
  id: string
  receivedAt: string
  secretKeyValid: boolean
  resultStatus: string | null
  sepayTransactionId: string | null
  errorMessage: string | null
  rawBody?: Record<string, unknown> | null
}

export interface PaymentRow {
  id: string
  invoiceNumber: string
  userId: string
  userEmail: string | null
  planId: string | null
  planName: string | null
  planCode: string | null
  amountVnd: number
  status: string
  grantType: string | null
  paidAt: string | null
  createdAt: string
}

export interface PaymentDetail extends PaymentRow {
  planPriceVnd: number | null
  subscriptionId: string | null
  grantNote: string | null
  rawIpn: Record<string, unknown> | null
  updatedAt: string
  ipnLogs: IPNLogBrief[]
}

interface BackendBrief {
  id: string
  invoice_number: string
  user_id: string
  user_email: string | null
  plan_id: string | null
  plan_name: string | null
  plan_code: string | null
  amount_vnd: number
  status: string
  grant_type: string | null
  paid_at: string | null
  created_at: string
}

interface BackendDetail extends BackendBrief {
  plan_price_vnd: number | null
  subscription_id: string | null
  grant_note: string | null
  raw_ipn: Record<string, unknown> | null
  updated_at: string
  ipn_logs: BackendIPNLog[]
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

function adaptBrief(raw: BackendBrief): PaymentRow {
  return {
    id: String(raw.id),
    invoiceNumber: raw.invoice_number,
    userId: String(raw.user_id),
    userEmail: raw.user_email,
    planId: raw.plan_id ? String(raw.plan_id) : null,
    planName: raw.plan_name,
    planCode: raw.plan_code,
    amountVnd: raw.amount_vnd,
    status: raw.status,
    grantType: raw.grant_type,
    paidAt: raw.paid_at,
    createdAt: raw.created_at,
  }
}

function adaptIPNLog(raw: BackendIPNLog): IPNLogBrief {
  return {
    id: String(raw.id),
    receivedAt: raw.received_at,
    secretKeyValid: raw.secret_key_valid,
    resultStatus: raw.result_status,
    sepayTransactionId: raw.sepay_transaction_id,
    errorMessage: raw.error_message,
    rawBody: raw.raw_body ?? null,
  }
}

function adaptDetail(raw: BackendDetail): PaymentDetail {
  return {
    ...adaptBrief(raw),
    planPriceVnd: raw.plan_price_vnd,
    subscriptionId: raw.subscription_id ? String(raw.subscription_id) : null,
    grantNote: raw.grant_note,
    rawIpn: raw.raw_ipn,
    updatedAt: raw.updated_at,
    ipnLogs: raw.ipn_logs.map(adaptIPNLog),
  }
}

export const paymentsApi = {
  list: async (params: { page: number; pageSize: number; status?: string; grantType?: string; userId?: string; planId?: string; dateFrom?: string; dateTo?: string; search?: string }): Promise<PaginatedResult<PaymentRow>> => {
    const qs = new URLSearchParams({ page: String(params.page), page_size: String(params.pageSize) })
    if (params.status) qs.set("status", params.status)
    if (params.grantType) qs.set("grant_type", params.grantType)
    if (params.userId) qs.set("user_id", params.userId)
    if (params.planId) qs.set("plan_id", params.planId)
    if (params.dateFrom) qs.set("date_from", params.dateFrom)
    if (params.dateTo) qs.set("date_to", params.dateTo)
    if (params.search) qs.set("search", params.search)
    return adaptPage(await api.get(`admin/payments?${qs}`).json<BackendPaginated<BackendBrief>>(), adaptBrief)
  },
  get: async (id: string): Promise<PaymentDetail> => adaptDetail(await api.get(`admin/payments/${id}`).json<BackendDetail>()),
  refund: async (id: string, reason: string): Promise<PaymentDetail> => adaptDetail(await api.post(`admin/payments/${id}/refund`, { json: { reason } }).json<BackendDetail>()),
  reconcile: (id: string, note?: string): Promise<Record<string, string>> => api.post(`admin/payments/${id}/reconcile`, { json: { note } }).json<Record<string, string>>(),
}
