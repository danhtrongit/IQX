import { useMutation, useQuery } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { paymentsApi, premiumApi, type PlanInfo } from "./api"
import { premiumKeys } from "./keys"

export interface PremiumStatusResult {
  isPremium: boolean
  isTrial: boolean
  daysRemaining: number
  periodEnd: Date | null
  isLoading: boolean
}

/** Whole calendar days remaining until `end` (never negative). */
function daysBetween(end: Date | null): number {
  if (!end) return 0
  const ms = end.getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

/**
 * Premium subscription status, react-query backed.
 * Replaces the old manual cache + listener hook from dashboard-bak.
 * Enabled only when authenticated; invalidated via `premium.me` on auth change.
 */
export function usePremiumStatus(): PremiumStatusResult {
  const { isAuthenticated, user } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: premiumKeys.me,
    queryFn: premiumApi.getMe,
    enabled: isAuthenticated,
    staleTime: 60_000,
  })

  // Admins implicitly have full access (mirrors the backend admin bypass).
  const isAdmin = user?.role === "admin"

  return {
    isPremium: isAdmin || (data?.isPremium ?? false),
    isTrial: data?.isTrial ?? false,
    daysRemaining: daysBetween(data?.periodEnd ?? null),
    periodEnd: data?.periodEnd ?? null,
    isLoading: isAuthenticated && isLoading,
  }
}

/** Available subscription plans. */
export function usePlans() {
  return useQuery<PlanInfo[]>({
    queryKey: premiumKeys.plans,
    queryFn: paymentsApi.getPlans,
    staleTime: 5 * 60_000,
  })
}

/** Create a checkout session for a plan code; returns CheckoutData on success. */
export function useCheckout() {
  return useMutation({
    mutationFn: (planKey: string) => paymentsApi.createCheckout(planKey),
  })
}
