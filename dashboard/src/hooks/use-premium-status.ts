import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { premiumApi, type PremiumSubscriptionStatus } from "@/lib/api"

export interface PremiumStatusResult {
  isPremium: boolean
  isTrial: boolean
  daysRemaining: number
  periodEnd: Date | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

const EMPTY: PremiumSubscriptionStatus = {
  isPremium: false,
  isTrial: false,
  status: null,
  planCode: null,
  planName: null,
  periodEnd: null,
}

let cachedStatus: PremiumSubscriptionStatus | null = null
const listeners = new Set<() => void>()

function notifyListeners() {
  for (const l of listeners) l()
}

export function invalidatePremiumStatus() {
  cachedStatus = null
  notifyListeners()
}

function daysBetween(end: Date | null): number {
  if (!end) return 0
  const ms = end.getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

export function usePremiumStatus(): PremiumStatusResult {
  const { isAuthenticated } = useAuth()
  const [status, setStatus] = useState<PremiumSubscriptionStatus>(cachedStatus ?? EMPTY)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!isAuthenticated) {
      setStatus(EMPTY)
      cachedStatus = EMPTY
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const fresh = await premiumApi.getMe()
      setStatus(fresh)
      cachedStatus = fresh
      notifyListeners()
    } catch (e) {
      setError(e as Error)
      setStatus(EMPTY)
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    const sync = () => setStatus(cachedStatus ?? EMPTY)
    listeners.add(sync)
    return () => {
      listeners.delete(sync)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  return {
    isPremium: status.isPremium,
    isTrial: status.isTrial,
    daysRemaining: daysBetween(status.periodEnd),
    periodEnd: status.periodEnd,
    isLoading,
    error,
    refetch: fetchStatus,
  }
}
