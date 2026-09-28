/**
 * React Query hooks for the admin core routes.
 *
 * Keys live under `["admin", adminId, …]` so two admins sharing a browser never
 * see each other's cached pages. Writes invalidate the view they changed plus
 * `admin/audit` (every write appends an audit row) and, for role/status changes,
 * `admin/metrics`. No mutation writes an optimistic patch: role, status and
 * entitlement state on screen always comes from the server response.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"

import {
  alertsApi,
  auditApi,
  metricsApi,
  systemApi,
  usersApi,
  type AdminUserPatch,
  type AlertSignalUpsert,
  type AuditLogParams,
  type BulkOp,
  type UserExportFilters,
  type UserListParams,
} from "./api"

const scope = (adminId: string | null | undefined) => ["admin", adminId ?? "guest"] as const

export const adminKeys = {
  metrics: (adminId: string | null | undefined) => [...scope(adminId), "metrics"] as const,
  revenue: (adminId: string | null | undefined, days: number) =>
    [...scope(adminId), "metrics", "revenue", days] as const,
  users: (adminId: string | null | undefined) => [...scope(adminId), "users"] as const,
  userList: (adminId: string | null | undefined, params: UserListParams) =>
    [...scope(adminId), "users", "list", params] as const,
  user: (adminId: string | null | undefined, userId: string) =>
    [...scope(adminId), "users", "detail", userId] as const,
  userProfile: (adminId: string | null | undefined, userId: string) =>
    [...scope(adminId), "users", "detail", userId, "profile"] as const,
  loginHistory: (
    adminId: string | null | undefined,
    userId: string,
    page: number,
    pageSize: number,
  ) => [...scope(adminId), "users", "detail", userId, "login-history", page, pageSize] as const,
  system: (adminId: string | null | undefined) => [...scope(adminId), "system"] as const,
  audit: (adminId: string | null | undefined) => [...scope(adminId), "audit"] as const,
  auditList: (adminId: string | null | undefined, params: AuditLogParams) =>
    [...scope(adminId), "audit", "list", params] as const,
  alertSignals: (adminId: string | null | undefined) =>
    [...scope(adminId), "alerts", "signals"] as const,
  alertIndicators: (adminId: string | null | undefined) =>
    [...scope(adminId), "alerts", "indicators"] as const,
}

/** Invalidation shared by every admin write: the audit trail moves with them. */
function useAdminInvalidate() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const adminId = user?.id

  return {
    audit: () => queryClient.invalidateQueries({ queryKey: adminKeys.audit(adminId) }),
    users: () => queryClient.invalidateQueries({ queryKey: adminKeys.users(adminId) }),
    metrics: () => queryClient.invalidateQueries({ queryKey: adminKeys.metrics(adminId) }),
    system: () => queryClient.invalidateQueries({ queryKey: adminKeys.system(adminId) }),
    alerts: () => queryClient.invalidateQueries({ queryKey: adminKeys.alertSignals(adminId) }),
  }
}

/* ── Metrics ────────────────────────────────────────────────────────────── */

export function useMetricsOverview() {
  const { user } = useAuth()
  return useQuery({
    queryKey: adminKeys.metrics(user?.id),
    enabled: !!user,
    queryFn: () => metricsApi.overview(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
}

export function useDailyRevenue(days = 30) {
  const { user } = useAuth()
  return useQuery({
    queryKey: adminKeys.revenue(user?.id, days),
    enabled: !!user,
    queryFn: () => metricsApi.revenue(days),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
}

/* ── Users ──────────────────────────────────────────────────────────────── */

export function useAdminUsers(params: UserListParams) {
  const { user } = useAuth()
  return useQuery({
    queryKey: adminKeys.userList(user?.id, params),
    enabled: !!user,
    queryFn: () => usersApi.list(params),
    placeholderData: keepPreviousData,
  })
}

export function useAdminUser360(userId: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: adminKeys.user(user?.id, userId),
    enabled: !!user && userId.length > 0,
    queryFn: () => usersApi.get360(userId),
  })
}

export function useAdminUserDetail(userId: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: adminKeys.userProfile(user?.id, userId),
    enabled: !!user && userId.length > 0,
    queryFn: () => usersApi.get(userId),
  })
}

export function useUserLoginHistory(userId: string, page: number, pageSize: number) {
  const { user } = useAuth()
  return useQuery({
    queryKey: adminKeys.loginHistory(user?.id, userId, page, pageSize),
    enabled: !!user && userId.length > 0,
    queryFn: () => usersApi.loginHistory(userId, { page, pageSize }),
    placeholderData: keepPreviousData,
  })
}

export function useBulkUpdateUsers() {
  const invalidate = useAdminInvalidate()
  return useMutation({
    mutationFn: (input: { userIds: string[]; op: BulkOp; value?: string | null }) =>
      usersApi.bulk(input),
    onSuccess: async () => {
      await Promise.all([invalidate.users(), invalidate.metrics(), invalidate.audit()])
    },
  })
}

export function useUpdateAdminUser(userId: string) {
  const invalidate = useAdminInvalidate()
  return useMutation({
    mutationFn: (patch: AdminUserPatch) => usersApi.update(userId, patch),
    onSuccess: async () => {
      await Promise.all([invalidate.users(), invalidate.metrics(), invalidate.audit()])
    },
  })
}

export function useSoftDeleteUser() {
  const invalidate = useAdminInvalidate()
  return useMutation({
    mutationFn: (userId: string) => usersApi.softDelete(userId),
    onSuccess: async () => {
      await Promise.all([invalidate.users(), invalidate.metrics(), invalidate.audit()])
    },
  })
}

export function useResetUserPassword() {
  const invalidate = useAdminInvalidate()
  return useMutation({
    mutationFn: (userId: string) => usersApi.resetPassword(userId),
    onSuccess: async () => {
      await Promise.all([invalidate.users(), invalidate.audit()])
    },
  })
}

export function useResendUserVerification() {
  const invalidate = useAdminInvalidate()
  return useMutation({
    mutationFn: (userId: string) => usersApi.resendVerification(userId),
    onSuccess: async () => {
      await Promise.all([invalidate.users(), invalidate.audit()])
    },
  })
}

export function useExportUsersCsv() {
  return useMutation({ mutationFn: (filters: UserExportFilters) => usersApi.exportCsv(filters) })
}

/* ── System ─────────────────────────────────────────────────────────────── */

export function useSystemStatus() {
  const { user } = useAuth()
  return useQuery({
    queryKey: adminKeys.system(user?.id),
    enabled: !!user,
    queryFn: () => systemApi.status(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
}

export function useRunSystemJob() {
  const invalidate = useAdminInvalidate()
  return useMutation({
    mutationFn: (jobId: string) => systemApi.runJob(jobId),
    onSuccess: async () => {
      await Promise.all([invalidate.system(), invalidate.audit()])
    },
  })
}

/* ── Audit ──────────────────────────────────────────────────────────────── */

export function useAuditLogs(params: AuditLogParams) {
  const { user } = useAuth()
  return useQuery({
    queryKey: adminKeys.auditList(user?.id, params),
    enabled: !!user,
    queryFn: () => auditApi.list(params),
    placeholderData: keepPreviousData,
  })
}

/* ── Alert signals ──────────────────────────────────────────────────────── */

export function useAlertSignals() {
  const { user } = useAuth()
  return useQuery({
    queryKey: adminKeys.alertSignals(user?.id),
    enabled: !!user,
    queryFn: () => alertsApi.list(),
  })
}

/** Falls back to the built-in catalog when the indicator endpoint fails. */
export function useAlertIndicators() {
  const { user } = useAuth()
  return useQuery({
    queryKey: adminKeys.alertIndicators(user?.id),
    enabled: !!user,
    queryFn: () => alertsApi.indicators(),
    staleTime: 30 * 60_000,
    retry: 1,
  })
}

export function useSaveAlertSignal() {
  const invalidate = useAdminInvalidate()
  return useMutation({
    mutationFn: (input: { key: string; body: AlertSignalUpsert; create: boolean }) =>
      input.create ? alertsApi.create(input.key, input.body) : alertsApi.update(input.key, input.body),
    onSuccess: async () => {
      await Promise.all([invalidate.alerts(), invalidate.audit()])
    },
  })
}

export function useDeleteAlertSignal() {
  const invalidate = useAdminInvalidate()
  return useMutation({
    mutationFn: (key: string) => alertsApi.remove(key),
    onSuccess: async () => {
      await Promise.all([invalidate.alerts(), invalidate.audit()])
    },
  })
}

export function useSeedAlertSignals() {
  const invalidate = useAdminInvalidate()
  return useMutation({
    mutationFn: (overwrite: boolean) => alertsApi.seed(overwrite),
    onSuccess: async () => {
      await Promise.all([invalidate.alerts(), invalidate.audit()])
    },
  })
}
