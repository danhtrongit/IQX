import { api } from "./client"
import type { PaginatedResult } from "@/hooks/use-paginated-query"

// ── Types ──────────────────────────────────────────────────────────────────

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

export interface IPNRetryResult {
  status: string
  logId: string
  message: string
}

// ── Backend raw shapes ──────────────────────────────────────────────────────

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

interface BackendPaginated {
  items: BackendLog[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

interface BackendRetry {
  status: string
  log_id: string
  message: string
}

// ── Adapters ───────────────────────────────────────────────────────────────

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
  return {
    ...adaptRow(raw),
    rawBody: raw.raw_body ?? null,
    rawHeaders: raw.raw_headers ?? null,
  }
}

// ── API client ─────────────────────────────────────────────────────────────

export const ipnApi = {
  list: async (params: {
    page: number
    pageSize: number
    secretKeyValid?: boolean | null
    resultStatus?: string
    dateFrom?: string
    dateTo?: string
    search?: string
  }): Promise<PaginatedResult<IPNLogRow>> => {
    const search = new URLSearchParams()
    search.set("page", String(params.page))
    search.set("page_size", String(params.pageSize))
    if (params.secretKeyValid !== undefined && params.secretKeyValid !== null)
      search.set("secret_key_valid", String(params.secretKeyValid))
    if (params.resultStatus) search.set("result_status", params.resultStatus)
    if (params.dateFrom) search.set("date_from", params.dateFrom)
    if (params.dateTo) search.set("date_to", params.dateTo)
    if (params.search) search.set("search", params.search)

    const raw = await api.get(`admin/ipn?${search}`).json<BackendPaginated>()
    return {
      items: raw.items.map(adaptRow),
      total: raw.total,
      page: raw.page,
      pageSize: raw.page_size,
      totalPages: raw.total_pages,
    }
  },

  get: async (id: string): Promise<IPNLogDetail> => {
    const raw = await api.get(`admin/ipn/${id}`).json<BackendLog>()
    return adaptDetail(raw)
  },

  retry: async (id: string): Promise<IPNRetryResult> => {
    const raw = await api.post(`admin/ipn/${id}/retry`, { json: {} }).json<BackendRetry>()
    return {
      status: raw.status,
      logId: String(raw.log_id),
      message: raw.message,
    }
  },
}
