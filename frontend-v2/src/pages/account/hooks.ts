/**
 * React Query hooks cho khu vực tài khoản.
 *
 * Nguyên tắc:
 * - Dữ liệu riêng tư chỉ chạy khi đã đăng nhập và khoá luôn kèm `user.id`.
 * - Mọi thay đổi ảnh hưởng tới quyền Premium đều invalidate TIỀN TỐ
 *   `["premium"]` — bao trùm cả khoá `["premium", user.id]` mà AuthProvider
 *   đang giữ, nên `isPremium` trong header/đấu trường đổi theo ngay.
 * - Không hook nào tự suy ra "đã thanh toán": trạng thái đơn luôn đọc từ
 *   `GET /premium/my-orders` (chỉ SePay IPN mới đổi `pending → paid`).
 */
import { useEffect, useMemo, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { accountKeys, PREMIUM_KEY_PREFIX } from "./keys"
import {
  createPremiumCheckout,
  fetchAccountProfile,
  fetchPremiumOrders,
  fetchPremiumPlans,
  fetchPremiumSubscription,
  requestPasswordReset,
  resetPassword,
  saveAccountProfile,
  type PremiumOrder,
  type ProfilePatch,
} from "./api"

/* ── Hồ sơ ──────────────────────────────────────────────────────────────── */

/** `GET /users/me` — hồ sơ đầy đủ của người dùng hiện tại. */
export function useAccountProfile() {
  const { user, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: accountKeys.profile(user?.id ?? null),
    queryFn: ({ signal }) => fetchAccountProfile(signal),
    enabled: isAuthenticated,
    staleTime: 60_000,
  })
}

/**
 * `PATCH /users/me` — đồng bộ cache hồ sơ sau khi lưu.
 *
 * Việc làm mới `AuthContext` (`refreshUser`) do trang gọi riêng: nếu `/auth/me`
 * lỗi thì hồ sơ VẪN đã lưu thành công, nên không thể biến nó thành lỗi mutation.
 */
export function useUpdateAccountProfile() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: ProfilePatch) => saveAccountProfile(patch),
    onSuccess: async (profile) => {
      queryClient.setQueryData(accountKeys.profile(user?.id ?? null), profile)
      await queryClient.invalidateQueries({ queryKey: accountKeys.profile(user?.id ?? null) })
    },
  })
}

/* ── Premium ─────────────────────────────────────────────────────────────── */

/**
 * Trạng thái thuê bao thật (`GET /premium/me`).
 *
 * Dùng khoá riêng `["premium", "me", user.id]` chứ không dùng chung khoá với
 * AuthProvider: AuthProvider chỉ cache `{ is_premium }`, còn ở đây cần nguyên
 * `SubscriptionResponse` (gói, kỳ hạn, trial) — chung khoá sẽ ghi đè hình dạng.
 */
export function usePremiumSubscription() {
  const { user, isAuthenticated } = useAuth()
  return useQuery({
    queryKey: accountKeys.premiumStatus(user?.id ?? null),
    queryFn: ({ signal }) => fetchPremiumSubscription(signal),
    enabled: isAuthenticated,
    staleTime: 30_000,
  })
}

/** `GET /premium/plans` — dữ liệu công khai, cache lâu. */
export function usePremiumPlans() {
  return useQuery({
    queryKey: accountKeys.plans,
    queryFn: ({ signal }) => fetchPremiumPlans(signal),
    staleTime: 5 * 60_000,
  })
}

/** Trần của MỘT phiên dò: số lượt tối đa và thời lượng tối đa. */
const POLL_MAX_ATTEMPTS = 12
const POLL_MAX_WINDOW_MS = 2 * 60_000

export type PremiumPollSession = { key: string; startedAt: number }

/** Pure interval policy, kept separate so terminal and bounded polling are testable. */
export function premiumOrdersPollInterval(
  orders: PremiumOrder[] | undefined,
  options: { pollMs: number; pollKey: string | null; userId: string | null; now: number },
  session: { current: PremiumPollSession | null },
): number | false {
  const { pollMs, pollKey, userId, now } = options
  if (pollMs <= 0) {
    session.current = null
    return false
  }
  if (!orders) return pollMs
  const target = pollKey
    ? orders.find((order) => order.id === pollKey || order.invoiceNumber === pollKey)
    : null
  if (target ? target.status !== "pending" : !orders.some((order) => order.status === "pending")) {
    return false
  }
  const key = `${userId ?? ""}:${pollKey ?? ""}`
  const active = session.current
  if (!active || active.key !== key) {
    session.current = { key, startedAt: now }
    return pollMs
  }
  const budget = Math.min(POLL_MAX_WINDOW_MS, pollMs * POLL_MAX_ATTEMPTS)
  return now - active.startedAt < budget ? pollMs : false
}

/**
 * `GET /premium/my-orders` — 20 đơn gần nhất.
 *
 * `pollMs > 0` bật tự động đối chiếu lại trong một PHIÊN DÒ:
 * - chỉ dò khi danh sách còn đơn `pending`; đơn đã chốt (`paid`, `failed`,
 *   `cancelled`, `refunded`) thì dừng ngay;
 * - `pollMs` về 0 (đóng hộp thoại thanh toán) hoặc `pollKey` đổi (mã đơn của
 *   lần thanh toán mới) là kết thúc phiên cũ, nên lần mua sau có đủ lượt dò;
 * - mỗi phiên tự chặn trần `POLL_MAX_ATTEMPTS` lượt trong `POLL_MAX_WINDOW_MS`,
 *   không bắn request vô hạn.
 *
 * Trần KHÔNG đọc `query.state.dataUpdateCount`: đó là bộ đếm của cả vòng đời
 * cache, nên sau lần thanh toán đầu nó đã vượt trần và mọi phiên dò sau bị khoá.
 */
export function usePremiumOrders(options: { pollMs?: number; pollKey?: string | null } = {}) {
  const { user, isAuthenticated } = useAuth()
  const pollMs = options.pollMs ?? 0
  const pollKey = options.pollKey ?? null
  const session = useRef<{ key: string; startedAt: number } | null>(null)

  return useQuery({
    queryKey: accountKeys.premiumOrders(user?.id ?? null),
    queryFn: ({ signal }) => fetchPremiumOrders(signal),
    enabled: isAuthenticated,
    staleTime: 0,
    refetchInterval: (query) => {
      return premiumOrdersPollInterval(query.state.data, {
        pollMs,
        pollKey,
        userId: user?.id ?? null,
        now: Date.now(),
      }, session)
    },
  })
}

/** `POST /premium/checkout` — tạo đơn mới; danh sách đơn được làm mới để thấy đơn pending. */
export function useCreateCheckout() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (planId: string) => createPremiumCheckout(planId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: accountKeys.premiumOrders(user?.id ?? null) }),
  })
}

/* ── Đối chiếu thanh toán ───────────────────────────────────────────────── */

export type PaymentCheck =
  | { kind: "waiting" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "not-found" }
  | { kind: "pending"; order: PremiumOrder }
  | { kind: "paid"; order: PremiumOrder }
  | { kind: "closed"; order: PremiumOrder }

/**
 * Đối chiếu một đơn với backend.
 *
 * `reference` là mã hoá đơn (`IQX_...`) hoặc id đơn lấy từ URL/phiên checkout;
 * `null` nghĩa là "đơn gần nhất". Tham số trên URL KHÔNG quyết định kết quả —
 * chỉ `status` trong `my-orders` mới quyết định.
 */
export function usePaymentCheck(reference: string | null, options: { pollMs?: number } = {}) {
  const query = usePremiumOrders({ ...options, pollKey: reference })
  const check = useMemo<PaymentCheck>(() => {
    if (query.isPending) return { kind: "waiting" }
    if (query.isError) return { kind: "error", message: query.error.message }
    const orders = query.data ?? []
    if (orders.length === 0) return { kind: "empty" }
    const wanted = reference?.trim().toLowerCase()
    const order = wanted
      ? orders.find(
          (row) => row.invoiceNumber.toLowerCase() === wanted || row.id.toLowerCase() === wanted,
        )
      : orders[0]
    if (!order) return { kind: "not-found" }
    if (order.status === "paid") return { kind: "paid", order }
    if (order.status === "pending") return { kind: "pending", order }
    return { kind: "closed", order }
  }, [query.data, query.error, query.isError, query.isPending, reference])
  return { check, refresh: query.refetch, isRefreshing: query.isFetching }
}

/**
 * Khi một đơn vừa được xác nhận `paid`, làm mới TOÀN BỘ tiền tố `["premium"]` —
 * gồm `["premium", user.id]` mà AuthProvider đang giữ, nên `isPremium` (cổng
 * Premium ở đấu trường, phân tích danh mục…) đổi trạng thái ngay. Chỉ chạy một
 * lần cho mỗi lần chuyển sang `paid` vì phụ thuộc là boolean.
 */
export function usePremiumRefreshOnPaid(isPaid: boolean) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!isPaid) return
    void queryClient.invalidateQueries({ queryKey: PREMIUM_KEY_PREFIX })
  }, [isPaid, queryClient])
}

/* ── Khôi phục mật khẩu ─────────────────────────────────────────────────── */
/** `POST /auth/forgot-password` — luôn thành công, không tiết lộ email tồn tại. */
export function useRequestPasswordReset() {
  return useMutation({ mutationFn: (email: string) => requestPasswordReset(email) })
}

/** `POST /auth/reset-password` — token một lần, thành công sẽ thu hồi mọi phiên. */
export function useResetPassword() {
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      resetPassword(token, password),
  })
}
