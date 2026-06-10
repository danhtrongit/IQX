import { api } from "./client"
import { adaptPage, type BackendPaginated, type PaginatedResult } from "./types"

export interface SubscriptionRow {
  id: string
  userId: string
  userEmail: string | null
  planId: string | null
  planName: string | null
  planCode: string | null
  currentPeriodStart: string
  currentPeriodEnd: string
  status: string
  cancelledAt: string | null
  cancelReason: string | null
  createdAt: string
}

export interface SubscriptionDetail extends SubscriptionRow {
  updatedAt: string
  cancelledByUserId: string | null
}

interface BackendBrief {
  id: string
  user_id: string
  user_email: string | null
  current_plan_id: string | null
  plan_name: string | null
  plan_code: string | null
  current_period_start: string
  current_period_end: string
  status: string
  cancelled_at: string | null
  cancel_reason: string | null
  created_at: string
}

interface BackendDetail extends BackendBrief {
  updated_at: string
  cancelled_by_user_id: string | null
}

function adaptBrief(raw: BackendBrief): SubscriptionRow {
  return {
    id: String(raw.id),
    userId: String(raw.user_id),
    userEmail: raw.user_email,
    planId: raw.current_plan_id ? String(raw.current_plan_id) : null,
    planName: raw.plan_name,
    planCode: raw.plan_code,
    currentPeriodStart: raw.current_period_start,
    currentPeriodEnd: raw.current_period_end,
    status: raw.status,
    cancelledAt: raw.cancelled_at,
    cancelReason: raw.cancel_reason,
    createdAt: raw.created_at,
  }
}

function adaptDetail(raw: BackendDetail): SubscriptionDetail {
  return { ...adaptBrief(raw), updatedAt: raw.updated_at, cancelledByUserId: raw.cancelled_by_user_id ? String(raw.cancelled_by_user_id) : null }
}

export const subscriptionsApi = {
  list: async (params: { page: number; pageSize: number; status?: string; planId?: string; userId?: string; expiringWithinDays?: number }): Promise<PaginatedResult<SubscriptionRow>> => {
    const qs = new URLSearchParams({ page: String(params.page), page_size: String(params.pageSize) })
    if (params.status) qs.set("status", params.status)
    if (params.planId) qs.set("plan_id", params.planId)
    if (params.userId) qs.set("user_id", params.userId)
    if (params.expiringWithinDays !== undefined) qs.set("expiring_within_days", String(params.expiringWithinDays))
    return adaptPage(await api.get(`admin/subscriptions?${qs}`).json<BackendPaginated<BackendBrief>>(), adaptBrief)
  },
  get: async (id: string): Promise<SubscriptionDetail> => adaptDetail(await api.get(`admin/subscriptions/${id}`).json<BackendDetail>()),
  cancel: async (id: string, reason: string): Promise<SubscriptionDetail> => adaptDetail(await api.post(`admin/subscriptions/${id}/cancel`, { json: { reason } }).json<BackendDetail>()),
  extend: async (id: string, days: number, reason?: string): Promise<SubscriptionDetail> => adaptDetail(await api.post(`admin/subscriptions/${id}/extend`, { json: { days, reason } }).json<BackendDetail>()),
}
