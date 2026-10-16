/**
 * Adapters của `admin/team-leads` (admin spec v1.1 §4.2). Mọi request đi qua
 * `requestOperation`, tức client `api()` dùng chung; dạng dây là snake_case, UI nhận
 * camelCase. Các trường enum có thể null (ví dụ `offer_days` khi ưu đãi không phải loại
 * `days`) được giữ null thay vì đoán.
 */
import { ApiError } from "@/lib/api"
import { requestOperation } from "@/lib/contract-client"
import type { AdminPage } from "@/pages/admin/core/api"

export const TEAM_LEAD_OFFER_DAYS = [7, 30, 90, 180, 365] as const
export type TeamLeadOfferDays = (typeof TEAM_LEAD_OFFER_DAYS)[number]
export type TeamLeadOfferType = "none" | "days" | "lifetime"
export type TeamLeadStatus = "active" | "revoked"
export type GroupJoinVia = "code" | "admin"

export type TeamLeadUser = {
  id: string
  username: string
  email: string
  fullName: string | null
  role: string
  status: string
}

/** Chính sách để gửi hoặc so sánh: `offerDays` chỉ có khi `offerType = days`. */
export type TeamLeadPolicyValue = {
  commissionPct: number
  offerType: TeamLeadOfferType
  offerDays: TeamLeadOfferDays | null
}

export type TeamLeadListItem = {
  user: TeamLeadUser
  code: string
  status: TeamLeadStatus
  appointedAt: string
  revokedAt: string | null
  memberCount: number
  commissionPct: number | null
  offerType: TeamLeadOfferType | null
  offerDays: number | null
  revenue30dVnd: number
  commission30dVnd: number
}

export type TeamLeadPolicy = TeamLeadPolicyValue & {
  id: string
  offerVersionId: string
  effectiveFrom: string
  reason: string
  createdBy: string | null
}

export type TeamLeadHistoryEntry = {
  id: string
  createdAt: string
  action: string
  actorRole: string
  actor: { id: string; username: string | null; fullName: string | null } | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  reason: string | null
}

export type TeamLeadDetail = {
  user: TeamLeadUser
  code: string
  status: TeamLeadStatus
  acceptingNewUsers: boolean
  appointedAt: string
  revokedAt: string | null
  policy: TeamLeadPolicy | null
  metrics: {
    memberCount: number
    revenue30dVnd: number
    commission30dVnd: number
    activeFreePremiumCount: number
  }
  history: TeamLeadHistoryEntry[]
}

export type TeamLeadMember = TeamLeadUser & {
  groupJoinVia: GroupJoinVia
  groupJoinedAt: string
  createdAt: string
}

export type AppointReason = "TEAM_LEAD_EXISTS" | "USER_NOT_ELIGIBLE"
export type AddMemberReason = "TARGET_IS_TEAM_LEAD" | "USER_NOT_ELIGIBLE" | "ALREADY_IN_GROUP"

export type TeamLeadLookup = {
  user: TeamLeadUser
  teamLead: { status: TeamLeadStatus; appointedAt: string } | null
  group: {
    leadUserId: string
    leadUsername: string
    leadFullName: string | null
    leadStatus: TeamLeadStatus
    joinVia: GroupJoinVia
    joinedAt: string
  } | null
  appoint: { eligible: boolean; reason: AppointReason | null }
  addMember: { eligible: boolean; reason: AddMemberReason | null; action: "add" | "move" | null }
}

export type AddMemberResult = {
  action: "add" | "move"
  previousLeadUserId: string | null
  member: TeamLeadMember
  offerGrant: { grantId: string; offerType: "days" | "lifetime"; offerDays: number | null; startsAt: string; endsAt: string } | null
}

type WireUser = { id: string; username: string; email: string; full_name: string | null; role: string; status: string }

function adaptUser(raw: WireUser): TeamLeadUser {
  return {
    id: raw.id,
    username: raw.username,
    email: raw.email,
    fullName: raw.full_name ? raw.full_name : null,
    role: raw.role,
    status: raw.status,
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function offerDaysOf(offerType: TeamLeadOfferType, offerDays: number | null | undefined): TeamLeadOfferDays | null {
  if (offerType !== "days") return null
  return (TEAM_LEAD_OFFER_DAYS as readonly number[]).includes(offerDays ?? -1) ? (offerDays as TeamLeadOfferDays) : null
}

type WireMember = WireUser & { group_join_via: GroupJoinVia; group_joined_at: string; created_at: string }

function adaptMember(raw: WireMember): TeamLeadMember {
  return {
    ...adaptUser(raw),
    groupJoinVia: raw.group_join_via,
    groupJoinedAt: raw.group_joined_at,
    createdAt: raw.created_at,
  }
}

type WireDetail = Awaited<ReturnType<typeof requestDetail>>

function requestDetail(leadId: string) {
  return requestOperation("GET /api/v2/admin/team-leads/{leadId}", { path: { leadId } })
}

export function adaptTeamLeadDetail(raw: WireDetail): TeamLeadDetail {
  const policy = raw.policy
  return {
    user: adaptUser(raw.user),
    code: raw.code,
    status: raw.status,
    acceptingNewUsers: raw.accepting_new_users,
    appointedAt: raw.appointed_at,
    revokedAt: raw.revoked_at ?? null,
    policy: policy
      ? {
          id: policy.id,
          commissionPct: policy.commission_pct,
          offerType: policy.offer_type,
          offerDays: offerDaysOf(policy.offer_type, policy.offer_days),
          offerVersionId: policy.offer_version_id,
          effectiveFrom: policy.effective_from,
          reason: policy.reason,
          createdBy: policy.created_by ?? null,
        }
      : null,
    metrics: {
      memberCount: raw.metrics.member_count,
      revenue30dVnd: raw.metrics.revenue_30d_vnd,
      commission30dVnd: raw.metrics.commission_30d_vnd,
      activeFreePremiumCount: raw.metrics.active_free_premium_count,
    },
    history: (raw.history ?? []).map((entry) => ({
      id: entry.id,
      createdAt: entry.created_at,
      action: entry.action,
      actorRole: entry.actor_role,
      actor: entry.actor
        ? { id: entry.actor.id, username: entry.actor.username ?? null, fullName: entry.actor.full_name ?? null }
        : null,
      before: asRecord(entry.before),
      after: asRecord(entry.after),
      reason: entry.reason ?? null,
    })),
  }
}

function policyBody(policy: TeamLeadPolicyValue) {
  return {
    commission_pct: policy.commissionPct,
    offer_type: policy.offerType,
    offer_days: policy.offerType === "days" ? policy.offerDays : null,
  }
}

export type TeamLeadListParams = { page: number; pageSize: number; status?: TeamLeadStatus; search?: string }
export type TeamLeadMembersParams = { page: number; pageSize: number; search?: string }

export const teamLeadsApi = {
  list: async (params: TeamLeadListParams): Promise<AdminPage<TeamLeadListItem>> => {
    const raw = await requestOperation("GET /api/v2/admin/team-leads", {
      query: {
        page: params.page,
        page_size: params.pageSize,
        status: params.status,
        search: params.search || undefined,
      },
    })
    return {
      items: raw.items.map((item) => ({
        user: adaptUser(item.user),
        code: item.code,
        status: item.status,
        appointedAt: item.appointed_at,
        revokedAt: item.revoked_at ?? null,
        memberCount: item.member_count,
        commissionPct: item.commission_pct ?? null,
        offerType: item.offer_type ?? null,
        offerDays: item.offer_type === "days" ? (item.offer_days ?? null) : null,
        revenue30dVnd: item.revenue_30d_vnd,
        commission30dVnd: item.commission_30d_vnd,
      })),
      total: raw.total,
      page: raw.page,
      pageSize: raw.page_size,
      totalPages: Math.max(1, raw.total_pages),
    }
  },

  detail: async (leadId: string): Promise<TeamLeadDetail> => adaptTeamLeadDetail(await requestDetail(leadId)),

  /** Tra cứu theo tên đăng nhập hoặc email; `null` khi không có người dùng đó (404). */
  lookup: async (q: string, leadId?: string, signal?: AbortSignal): Promise<TeamLeadLookup | null> => {
    try {
      const raw = await requestOperation(
        "GET /api/v2/admin/team-leads/lookup",
        { query: { q, lead_id: leadId } },
        { signal },
      )
      return {
        user: adaptUser(raw.user),
        teamLead: raw.team_lead ? { status: raw.team_lead.status, appointedAt: raw.team_lead.appointed_at } : null,
        group: raw.group
          ? {
              leadUserId: raw.group.lead_user_id,
              leadUsername: raw.group.lead_username,
              leadFullName: raw.group.lead_full_name || null,
              leadStatus: raw.group.lead_status,
              joinVia: raw.group.join_via,
              joinedAt: raw.group.joined_at,
            }
          : null,
        appoint: { eligible: raw.appoint.eligible, reason: raw.appoint.reason ?? null },
        addMember: {
          eligible: raw.add_member.eligible,
          reason: raw.add_member.reason ?? null,
          action: raw.add_member.action ?? null,
        },
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null
      throw error
    }
  },

  appoint: async (input: TeamLeadPolicyValue & { userId: string; reason: string }): Promise<TeamLeadDetail> =>
    adaptTeamLeadDetail(
      await requestOperation("POST /api/v2/admin/team-leads", {
        body: { user_id: input.userId, ...policyBody(input), reason: input.reason },
      }),
    ),

  updatePolicy: async (leadId: string, input: TeamLeadPolicyValue & { reason: string }): Promise<TeamLeadDetail> =>
    adaptTeamLeadDetail(
      await requestOperation("PUT /api/v2/admin/team-leads/{leadId}/policy", {
        path: { leadId },
        body: { ...policyBody(input), reason: input.reason },
      }),
    ),

  revoke: async (leadId: string, reason: string): Promise<TeamLeadDetail> =>
    adaptTeamLeadDetail(
      await requestOperation("POST /api/v2/admin/team-leads/{leadId}/revoke", { path: { leadId }, body: { reason } }),
    ),

  members: async (leadId: string, params: TeamLeadMembersParams): Promise<AdminPage<TeamLeadMember>> => {
    const raw = await requestOperation("GET /api/v2/admin/team-leads/{leadId}/members", {
      path: { leadId },
      query: { page: params.page, page_size: params.pageSize, search: params.search || undefined },
    })
    return {
      items: raw.items.map(adaptMember),
      total: raw.total,
      page: raw.page,
      pageSize: raw.page_size,
      totalPages: Math.max(1, raw.total_pages),
    }
  },

  addMember: async (leadId: string, userId: string, reason: string): Promise<AddMemberResult> => {
    const raw = await requestOperation("POST /api/v2/admin/team-leads/{leadId}/members", {
      path: { leadId },
      body: { user_id: userId, reason },
    })
    return {
      action: raw.action,
      previousLeadUserId: raw.previous_lead_user_id ?? null,
      member: adaptMember(raw.member),
      offerGrant: raw.offer_grant
        ? {
            grantId: raw.offer_grant.grant_id,
            offerType: raw.offer_grant.offer_type,
            offerDays: raw.offer_grant.offer_days ?? null,
            startsAt: raw.offer_grant.starts_at,
            endsAt: raw.offer_grant.ends_at,
          }
        : null,
    }
  },

  removeMember: async (leadId: string, userId: string, reason: string): Promise<void> => {
    await requestOperation("POST /api/v2/admin/team-leads/{leadId}/members/{userId}/remove", {
      path: { leadId, userId },
      body: { reason },
    })
  },
}

/** So sánh hai chính sách theo đúng quy tắc POLICY_UNCHANGED của máy chủ. */
export function samePolicy(a: TeamLeadPolicyValue, b: TeamLeadPolicyValue): boolean {
  return (
    a.commissionPct === b.commissionPct &&
    a.offerType === b.offerType &&
    (a.offerType === "days" ? a.offerDays : null) === (b.offerType === "days" ? b.offerDays : null)
  )
}
