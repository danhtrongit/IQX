/**
 * The demo-trading engine's heartbeat.
 *
 * `GET /virtual-trading/orders` is READ-ONLY: a pending LO order only fills,
 * a GFD order only expires and a T+ settlement only lands when something calls
 * `POST /virtual-trading/refresh`. Without this driver the UI can poll forever
 * and never see the fill — and a SELL that filled in the background never opens
 * its Kết sổ.
 *
 * Policy (deliberately modest, never overlapping):
 * - only for an authenticated account, only while the tab is visible;
 * - once on mount, on every window focus / tab-wake, and on a 30s interval;
 * - one request in flight at a time, each abortable — unmount or logout aborts;
 * - a failed refresh is USER-VISIBLE (state + explicit retry), never silent,
 *   because the whole session's state depends on it;
 * - cache invalidation happens when the engine reports a real change
 *   (`orders_filled` / `orders_expired` / `settlements_settled`).
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { useTradingAccount } from "@/hooks/use-trading"
import { api, errorMessage } from "@/lib/api"

export type EngineRefreshResult = {
  orders_filled: number
  orders_expired: number
  settlements_settled: number
  warnings: string[]
}

export type EngineRefreshState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; changed: number; warnings: string[] }
  | { status: "error"; message: string }

const REFRESH_INTERVAL_MS = 30_000
/** Focus + visibilitychange can both fire for one wake-up; don't double-post. */
const MIN_GAP_MS = 3_000

export function useEngineRefresh() {
  const { isAuthenticated, user } = useAuth()
  const { data: account } = useTradingAccount()
  const accountId = account?.id
  const queryClient = useQueryClient()
  const [state, setState] = useState<EngineRefreshState>({ status: "idle" })
  const inFlightRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  const lastRunAtRef = useRef(0)

  const run = useCallback(
    async (options: { force?: boolean } = {}) => {
      if (!isAuthenticated || !user || !accountId) return
      if (inFlightRef.current) return
      if (!options.force && Date.now() - lastRunAtRef.current < MIN_GAP_MS) return
      if (!options.force && typeof document !== "undefined" && document.visibilityState !== "visible") return

      const controller = new AbortController()
      controllerRef.current = controller
      inFlightRef.current = true
      lastRunAtRef.current = Date.now()
      setState({ status: "running" })
      try {
        const result = await api<EngineRefreshResult>("/virtual-trading/refresh", {
          method: "POST",
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        const changed =
          (result?.orders_filled ?? 0) + (result?.orders_expired ?? 0) + (result?.settlements_settled ?? 0)
        setState({ status: "ok", changed, warnings: result?.warnings ?? [] })
        if (changed > 0) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["trading"] }),
            queryClient.invalidateQueries({ queryKey: ["journey"] }),
            queryClient.invalidateQueries({ queryKey: ["identity"] }),
          ])
        }
      } catch (error) {
        if (controller.signal.aborted) return
        setState({ status: "error", message: errorMessage(error) })
      } finally {
        if (controllerRef.current === controller) {
          inFlightRef.current = false
          controllerRef.current = null
        }
      }
    },
    [accountId, isAuthenticated, queryClient, user],
  )

  useEffect(() => {
    if (!isAuthenticated || !accountId) return
    const initial = window.setTimeout(() => void run(), 0)
    const interval = window.setInterval(() => void run(), REFRESH_INTERVAL_MS)
    const onFocus = () => void run()
    const onVisibility = () => {
      if (document.visibilityState === "visible") void run()
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.clearTimeout(initial)
      clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
      controllerRef.current?.abort()
      controllerRef.current = null
      inFlightRef.current = false
      lastRunAtRef.current = 0
    }
  }, [accountId, isAuthenticated, run])

  return { state, refresh: run }
}
