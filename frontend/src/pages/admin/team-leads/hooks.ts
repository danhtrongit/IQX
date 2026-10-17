/**
 * React Query hooks của trang Trưởng nhóm. Key nằm dưới `["admin", adminId, "team-leads"]`.
 * Mọi thao tác ghi làm mới danh sách và chi tiết trưởng nhóm, người dùng (vai trò, nhóm và
 * 360 thay đổi), số liệu tổng quan và nhật ký kiểm toán. Không có cập nhật lạc quan.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { adminKeys } from "@/pages/admin/core/hooks"

import { teamLeadsApi, type TeamLeadListParams, type TeamLeadMembersParams, type TeamLeadPolicyValue } from "./api"

const root = (adminId: string | null | undefined) => ["admin", adminId ?? "guest", "team-leads"] as const

export const teamLeadKeys = {
  all: root,
  list: (adminId: string | null | undefined, params: TeamLeadListParams) => [...root(adminId), "list", params] as const,
  detail: (adminId: string | null | undefined, leadId: string) => [...root(adminId), "detail", leadId] as const,
  members: (adminId: string | null | undefined, leadId: string, params: TeamLeadMembersParams) =>
    [...root(adminId), "detail", leadId, "members", params] as const,
}

function useTeamLeadInvalidate() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const adminId = user?.id
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: teamLeadKeys.all(adminId) }),
      queryClient.invalidateQueries({ queryKey: adminKeys.users(adminId) }),
      queryClient.invalidateQueries({ queryKey: adminKeys.metrics(adminId) }),
      queryClient.invalidateQueries({ queryKey: adminKeys.audit(adminId) }),
    ])
}

export function useTeamLeads(params: TeamLeadListParams) {
  const { user } = useAuth()
  return useQuery({
    queryKey: teamLeadKeys.list(user?.id, params),
    enabled: !!user,
    queryFn: () => teamLeadsApi.list(params),
    placeholderData: keepPreviousData,
  })
}

export function useTeamLead(leadId: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: teamLeadKeys.detail(user?.id, leadId),
    enabled: !!user && leadId.length > 0,
    queryFn: () => teamLeadsApi.detail(leadId),
  })
}

export function useTeamLeadMembers(leadId: string, params: TeamLeadMembersParams) {
  const { user } = useAuth()
  return useQuery({
    queryKey: teamLeadKeys.members(user?.id, leadId, params),
    enabled: !!user && leadId.length > 0,
    queryFn: () => teamLeadsApi.members(leadId, params),
    placeholderData: keepPreviousData,
  })
}

export function useAppointTeamLead() {
  const invalidate = useTeamLeadInvalidate()
  return useMutation({
    mutationFn: (input: TeamLeadPolicyValue & { userId: string; reason: string }) => teamLeadsApi.appoint(input),
    onSuccess: invalidate,
  })
}

export function useUpdateTeamLeadPolicy(leadId: string) {
  const invalidate = useTeamLeadInvalidate()
  return useMutation({
    mutationFn: (input: TeamLeadPolicyValue & { reason: string }) => teamLeadsApi.updatePolicy(leadId, input),
    onSuccess: invalidate,
  })
}

export function useRevokeTeamLead(leadId: string) {
  const invalidate = useTeamLeadInvalidate()
  return useMutation({
    mutationFn: (reason: string) => teamLeadsApi.revoke(leadId, reason),
    onSuccess: invalidate,
  })
}

export function useAddTeamLeadMember() {
  const invalidate = useTeamLeadInvalidate()
  return useMutation({
    mutationFn: (input: { leadId: string; userId: string; reason: string }) =>
      teamLeadsApi.addMember(input.leadId, input.userId, input.reason),
    onSuccess: invalidate,
  })
}

export function useRemoveTeamLeadMember() {
  const invalidate = useTeamLeadInvalidate()
  return useMutation({
    mutationFn: (input: { leadId: string; userId: string; reason: string }) =>
      teamLeadsApi.removeMember(input.leadId, input.userId, input.reason),
    onSuccess: invalidate,
  })
}
