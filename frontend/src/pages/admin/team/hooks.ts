/**
 * React Query hooks của khu vực trưởng nhóm. Key nằm dưới `["team", leadId, …]`, tách khỏi
 * `["admin", …]` của quản trị viên, nên hai vai trò dùng chung trình duyệt không thấy
 * cache của nhau. Loại khỏi nhóm làm mới toàn bộ `team` (danh sách, 360, số liệu, số đếm
 * lối tắt) và thẻ mã giới thiệu `team/me` (số người dùng trong nhóm). Không có cập nhật
 * lạc quan.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { fetchTeamReferralCode, referralKeys } from "@/pages/referral/api"

import { teamApi, type TeamUserListParams, type TeamUserSegment } from "./api"

const root = (leadId: string | null | undefined) => ["team", leadId ?? "guest"] as const

export const teamKeys = {
  all: root,
  metrics: (leadId: string | null | undefined) => [...root(leadId), "metrics"] as const,
  revenue: (leadId: string | null | undefined, days: number) => [...root(leadId), "metrics", "revenue", days] as const,
  segmentCount: (leadId: string | null | undefined, segment: TeamUserSegment) =>
    [...root(leadId), "metrics", "segment", segment] as const,
  users: (leadId: string | null | undefined) => [...root(leadId), "users"] as const,
  userList: (leadId: string | null | undefined, params: TeamUserListParams) =>
    [...root(leadId), "users", "list", params] as const,
  user: (leadId: string | null | undefined, userId: string) => [...root(leadId), "users", "detail", userId] as const,
  loginHistory: (leadId: string | null | undefined, userId: string, page: number, pageSize: number) =>
    [...root(leadId), "users", "detail", userId, "login-history", page, pageSize] as const,
}

const AUTO_REFRESH = { refetchInterval: 60_000, refetchIntervalInBackground: false } as const

/** `team/me`: dùng chung key và cache với ô mã giới thiệu cuối menu. */
export function useTeamMe() {
  const { user } = useAuth()
  return useQuery({
    queryKey: referralKeys.teamCode(user?.id),
    enabled: !!user,
    queryFn: ({ signal }) => fetchTeamReferralCode(signal),
    staleTime: 60_000,
    ...AUTO_REFRESH,
  })
}

export function useTeamMetricsOverview() {
  const { user } = useAuth()
  return useQuery({
    queryKey: teamKeys.metrics(user?.id),
    enabled: !!user,
    queryFn: () => teamApi.overview(),
    ...AUTO_REFRESH,
  })
}

export function useTeamDailyRevenue(days = 30) {
  const { user } = useAuth()
  return useQuery({
    queryKey: teamKeys.revenue(user?.id, days),
    enabled: !!user,
    queryFn: () => teamApi.revenue(days),
    ...AUTO_REFRESH,
  })
}

export function useTeamSegmentCount(segment: TeamUserSegment) {
  const { user } = useAuth()
  return useQuery({
    queryKey: teamKeys.segmentCount(user?.id, segment),
    enabled: !!user,
    queryFn: () => teamApi.segmentCount(segment),
    ...AUTO_REFRESH,
  })
}

export function useTeamUsers(params: TeamUserListParams) {
  const { user } = useAuth()
  return useQuery({
    queryKey: teamKeys.userList(user?.id, params),
    enabled: !!user,
    queryFn: () => teamApi.users(params),
    placeholderData: keepPreviousData,
  })
}

export function useTeamUser360(userId: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: teamKeys.user(user?.id, userId),
    enabled: !!user && userId.length > 0,
    queryFn: () => teamApi.user360(userId),
  })
}

export function useTeamUserLoginHistory(userId: string, page: number, pageSize: number) {
  const { user } = useAuth()
  return useQuery({
    queryKey: teamKeys.loginHistory(user?.id, userId, page, pageSize),
    enabled: !!user && userId.length > 0,
    queryFn: () => teamApi.loginHistory(userId, { page, pageSize }),
    placeholderData: keepPreviousData,
  })
}

export function useTeamRemoveMember() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { userId: string; reason: string }) => teamApi.removeMember(input.userId, input.reason),
    onSuccess: async (_result, input) => {
      // The removed member's 360 now answers 404 USER_NOT_FOUND. The page leaves it right
      // after this, so it is not refetched here; everything else in the group refreshes.
      const removedDetail = teamKeys.user(user?.id, input.userId)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: teamKeys.all(user?.id),
          predicate: (query) => !removedDetail.every((part, index) => query.queryKey[index] === part),
        }),
        queryClient.invalidateQueries({ queryKey: referralKeys.teamCode(user?.id) }),
      ])
    },
  })
}
