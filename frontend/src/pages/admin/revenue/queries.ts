/**
 * React Query hooks cho khu vực billing admin.
 *
 * - Khoá query được namespace theo `["admin", "revenue", <adminId>, <domain>, …]`
 *   để dữ liệu riêng tư không lẫn giữa các phiên đăng nhập (`AuthProvider` cũng
 *   xoá cache khi đăng nhập/đăng xuất).
 * - Mọi mutation invalidate theo *domain* bị ảnh hưởng, phủ cả danh sách lẫn chi
 *   tiết: gói → plans + subscriptions + payments (tên/giá gói hiện ở các bảng
 *   kia); thuê bao → subscriptions + payments (chi tiết đơn hiện thuê bao);
 *   thanh toán → payments + subscriptions (kích hoạt/huỷ thuê bao); IPN → ipn +
 *   payments + subscriptions (retry có thể chốt đơn và kích hoạt Premium).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import {
  cancelSubscription,
  createPlan,
  deactivatePlan,
  extendSubscription,
  getIpnLog,
  getPayment,
  getSubscription,
  grantPremium,
  listIpnLogs,
  listPayments,
  listPlans,
  listSubscriptions,
  markPaymentPaid,
  reconcilePayment,
  refundPayment,
  retryIpnLog,
  updatePlan,
  type IpnListParams,
  type PaymentListParams,
  type PlanCreateInput,
  type PlanUpdateInput,
  type SubscriptionListParams,
} from "./api"

export type RevenueDomain = "plans" | "subscriptions" | "payments" | "ipn"

export const revenueKeys = {
  all: (adminId: string | undefined) => ["admin", "revenue", adminId ?? "anonymous"] as const,
  domain: (adminId: string | undefined, domain: RevenueDomain) => [...revenueKeys.all(adminId), domain] as const,
  plans: (adminId: string | undefined) => revenueKeys.domain(adminId, "plans"),
  subscriptions: (adminId: string | undefined) => revenueKeys.domain(adminId, "subscriptions"),
  subscriptionList: (adminId: string | undefined, filters: SubscriptionListParams) =>
    [...revenueKeys.subscriptions(adminId), "list", filters] as const,
  subscription: (adminId: string | undefined, id: string) =>
    [...revenueKeys.subscriptions(adminId), "detail", id] as const,
  payments: (adminId: string | undefined) => revenueKeys.domain(adminId, "payments"),
  paymentList: (adminId: string | undefined, filters: PaymentListParams) =>
    [...revenueKeys.payments(adminId), "list", filters] as const,
  payment: (adminId: string | undefined, id: string) => [...revenueKeys.payments(adminId), "detail", id] as const,
  ipn: (adminId: string | undefined) => revenueKeys.domain(adminId, "ipn"),
  ipnList: (adminId: string | undefined, filters: IpnListParams) =>
    [...revenueKeys.ipn(adminId), "list", filters] as const,
  ipnLog: (adminId: string | undefined, id: string) => [...revenueKeys.ipn(adminId), "detail", id] as const,
}

/** Invalidate mọi query (danh sách + chi tiết) của các domain bị ảnh hưởng. */
function useInvalidateRevenue() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return (domains: RevenueDomain[]) =>
    Promise.all(
      domains.map((domain) => queryClient.invalidateQueries({ queryKey: revenueKeys.domain(user?.id, domain) })),
    )
}

/* ── Đọc ────────────────────────────────────────────────────────────────── */

export function usePlans() {
  const { user } = useAuth()
  return useQuery({
    queryKey: revenueKeys.plans(user?.id),
    enabled: !!user,
    queryFn: ({ signal }) => listPlans(signal),
  })
}

export function useSubscriptions(filters: SubscriptionListParams) {
  const { user } = useAuth()
  return useQuery({
    queryKey: revenueKeys.subscriptionList(user?.id, filters),
    enabled: !!user,
    queryFn: ({ signal }) => listSubscriptions(filters, signal),
  })
}

export function useSubscription(id: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: revenueKeys.subscription(user?.id, id),
    enabled: !!user && !!id,
    queryFn: ({ signal }) => getSubscription(id, signal),
  })
}

export function usePayments(filters: PaymentListParams) {
  const { user } = useAuth()
  return useQuery({
    queryKey: revenueKeys.paymentList(user?.id, filters),
    enabled: !!user,
    queryFn: ({ signal }) => listPayments(filters, signal),
  })
}

export function usePayment(id: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: revenueKeys.payment(user?.id, id),
    enabled: !!user && !!id,
    queryFn: ({ signal }) => getPayment(id, signal),
  })
}

export function useIpnLogs(filters: IpnListParams) {
  const { user } = useAuth()
  return useQuery({
    queryKey: revenueKeys.ipnList(user?.id, filters),
    enabled: !!user,
    queryFn: ({ signal }) => listIpnLogs(filters, signal),
  })
}

/** Chi tiết IPN (có `raw_body`/`raw_headers`) — chỉ tải khi mở hộp thoại. */
export function useIpnLog(id: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: revenueKeys.ipnLog(user?.id, id ?? ""),
    enabled: !!user && !!id,
    queryFn: ({ signal }) => getIpnLog(id as string, signal),
  })
}

/* ── Ghi ────────────────────────────────────────────────────────────────── */

export function useCreatePlan() {
  const invalidate = useInvalidateRevenue()
  return useMutation({
    mutationFn: (input: PlanCreateInput) => createPlan(input),
    onSuccess: () => invalidate(["plans", "subscriptions", "payments"]),
  })
}

export function useUpdatePlan() {
  const invalidate = useInvalidateRevenue()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PlanUpdateInput }) => updatePlan(id, input),
    onSuccess: () => invalidate(["plans", "subscriptions", "payments"]),
  })
}

export function useDeactivatePlan() {
  const invalidate = useInvalidateRevenue()
  return useMutation({
    mutationFn: (id: string) => deactivatePlan(id),
    onSuccess: () => invalidate(["plans", "subscriptions", "payments"]),
  })
}

export function useCancelSubscription() {
  const invalidate = useInvalidateRevenue()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelSubscription(id, reason),
    onSuccess: () => invalidate(["subscriptions", "payments"]),
  })
}

export function useExtendSubscription() {
  const invalidate = useInvalidateRevenue()
  return useMutation({
    mutationFn: ({ id, days, reason }: { id: string; days: number; reason?: string }) =>
      extendSubscription(id, days, reason),
    onSuccess: () => invalidate(["subscriptions", "payments"]),
  })
}

export function useRefundPayment() {
  const invalidate = useInvalidateRevenue()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => refundPayment(id, reason),
    onSuccess: () => invalidate(["payments", "subscriptions"]),
  })
}

export function useMarkPaymentPaid() {
  const invalidate = useInvalidateRevenue()
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => markPaymentPaid(id, note),
    onSuccess: () => invalidate(["payments", "subscriptions"]),
  })
}

export function useReconcilePayment() {
  const invalidate = useInvalidateRevenue()
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => reconcilePayment(id, note),
    onSuccess: () => invalidate(["payments", "subscriptions"]),
  })
}

export function useGrantPremium() {
  const invalidate = useInvalidateRevenue()
  return useMutation({
    mutationFn: ({ userId, planId, note }: { userId: string; planId: string; note: string }) =>
      grantPremium(userId, planId, note),
    onSuccess: () => invalidate(["payments", "subscriptions"]),
  })
}

export function useRetryIpnLog() {
  const invalidate = useInvalidateRevenue()
  return useMutation({
    mutationFn: (id: string) => retryIpnLog(id),
    onSuccess: () => invalidate(["ipn", "payments", "subscriptions"]),
  })
}
