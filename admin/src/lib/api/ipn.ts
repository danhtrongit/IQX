import { api } from "./client"
import { adaptPage, type BackendPaginated, type PaginatedResult } from "./types"

export interface IPNLogRow {
  id: string
  receivedAt: string
  secretKeyValid: boolean
  resultStatus: string | null
  matchedOrderId: string | null
  sepayTransactionId: string | null
  errorMessage: string | null
}

export interface IPNLogDetail extends IPNLogRow {
  rawBody: Record<string, unknown> | null
  rawHeaders: Record<string, unknown> | null
}

interface BackendLog {
  id: string
  received_at: string
  secret_key_valid: boolean
  result_status: string | null
  matched_order_id: string | null
  sepay_transaction_id: string | null
  error_message: string | null
  raw_body?: Record<string, unknown> | null
  raw_headers?: Record<string, unknown> | null
}

function adaptRow(raw: BackendLog): IPNLogRow {
  return {
    id: String(raw.id),
    receivedAt: raw.received_at,
    secretKeyValid: raw.secret_key_valid,
    resultStatus: raw.result_status,
    matchedOrderId: raw.matched_order_id ? String(raw.matched_order_id) : null,
    sepayTransactionId: raw.sepay_transaction_id,
    errorMessage: raw.error_message,
  }
}

function adaptDetail(raw: BackendLog): IPNLogDetail {
  return { ...adaptRow(raw), rawBody: raw.raw_body ?? null, rawHeaders: raw.raw_headers ?? null }
}

export const ipnApi = {
  list: async (params: { page: number; pageSize: number; secretKeyValid?: boolean | null; resultStatus?: string; dateFrom?: string; dateTo?: string; search?: string }): Promise<PaginatedResult<IPNLogRow>> => {
    const qs = new URLSearchParams({ page: String(params.page), page_size: String(params.pageSize) })
    if (params.secretKeyValid !== undefined && params.secretKeyValid !== null) qs.set("secret_key_valid", String(params.secretKeyValid))
    if (params.resultStatus) qs.set("result_status", params.resultStatus)
    if (params.dateFrom) qs.set("date_from", params.dateFrom)
    if (params.dateTo) qs.set("date_to", params.dateTo)
    if (params.search) qs.set("search", params.search)
    return adaptPage(await api.get(`admin/ipn?${qs}`).json<BackendPaginated<BackendLog>>(), adaptRow)
  },
  get: async (id: string): Promise<IPNLogDetail> => adaptDetail(await api.get(`admin/ipn/${id}`).json<BackendLog>()),
  retry: async (id: string) => api.post(`admin/ipn/${id}/retry`, { json: {} }).json<{ status: string; log_id: string; message: string }>(),
}
