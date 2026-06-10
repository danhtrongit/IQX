import { api } from "./client"
import { adaptPage, type BackendPaginated, type PaginatedResult } from "./types"

export interface AuditLogRow {
  id: string
  adminUserId: string | null
  adminEmail: string | null
  action: string
  targetEntity: string | null
  targetId: string | null
  payloadBefore: unknown
  payloadAfter: unknown
  note: string | null
  ip: string | null
  userAgent: string | null
  requestId: string | null
  createdAt: string
}

interface BackendAuditLog {
  id: string
  admin_user_id: string | null
  admin_email: string | null
  action: string
  target_entity: string | null
  target_id: string | null
  payload_before: unknown
  payload_after: unknown
  note: string | null
  ip: string | null
  user_agent: string | null
  request_id: string | null
  created_at: string
}

export function adaptAuditLog(raw: BackendAuditLog): AuditLogRow {
  return {
    id: String(raw.id),
    adminUserId: raw.admin_user_id ? String(raw.admin_user_id) : null,
    adminEmail: raw.admin_email,
    action: raw.action,
    targetEntity: raw.target_entity,
    targetId: raw.target_id,
    payloadBefore: raw.payload_before,
    payloadAfter: raw.payload_after,
    note: raw.note,
    ip: raw.ip,
    userAgent: raw.user_agent,
    requestId: raw.request_id,
    createdAt: raw.created_at,
  }
}

export const auditApi = {
  list: async (params: { page: number; pageSize: number; adminUserId?: string; actionPrefix?: string; targetEntity?: string; targetId?: string; dateFrom?: string; dateTo?: string }): Promise<PaginatedResult<AuditLogRow>> => {
    const qs = new URLSearchParams({ page: String(params.page), page_size: String(params.pageSize) })
    if (params.adminUserId) qs.set("admin_user_id", params.adminUserId)
    if (params.actionPrefix) qs.set("action_prefix", params.actionPrefix)
    if (params.targetEntity) qs.set("target_entity", params.targetEntity)
    if (params.targetId) qs.set("target_id", params.targetId)
    if (params.dateFrom) qs.set("date_from", params.dateFrom)
    if (params.dateTo) qs.set("date_to", params.dateTo)
    return adaptPage(await api.get(`admin/audit?${qs}`).json<BackendPaginated<BackendAuditLog>>(), adaptAuditLog)
  },
}
