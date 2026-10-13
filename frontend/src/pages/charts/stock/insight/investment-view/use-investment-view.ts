import { useRef } from "react"
import { useQuery } from "@tanstack/react-query"

import { ApiError } from "@/lib/api"
import { useAuth } from "@/hooks/use-auth"

import { stockKeys } from "../../keys"

import { fetchInvestmentView, fetchInvestmentViewStatus } from "./api"
import type { InvestmentView } from "./types"

const FAST_POLL_MS = 3_000
const SLOW_POLL_MS = 10_000
const BACKOFF_AFTER_MS = 60_000

// 403 (premium) / 404 (flag off) are final answers; only retry transient failures, once.
function retryTransient(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
  return failureCount < 1
}

/**
 * Investment view for the stock insight. The first GET either returns the view
 * or a `processing` job, which is then polled via the status endpoint (3 s, 10 s
 * after one minute, no overall timeout) until it is ready/empty or errors.
 * `view` is `null` while there is nothing to show (initial load or failure).
 */
export function useInvestmentView(symbol: string, enabled = true) {
  const { user } = useAuth()
  const code = symbol.toUpperCase()
  const pollStartedAt = useRef<number | null>(null)

  const initial = useQuery<InvestmentView>({
    queryKey: stockKeys.investmentView(code, user?.id),
    queryFn: ({ signal }) => fetchInvestmentView(code, signal),
    enabled: enabled && code.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: retryTransient,
  })

  const jobId = initial.data?.status === "processing" ? initial.data.jobId : null

  const status = useQuery<InvestmentView>({
    queryKey: stockKeys.investmentViewStatus(code, jobId ?? "", user?.id),
    queryFn: ({ signal }) => fetchInvestmentViewStatus(code, jobId ?? "", signal),
    enabled: enabled && jobId !== null,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    retry: retryTransient,
    refetchInterval: (query) => {
      if (query.state.status === "error" || query.state.data?.status !== "processing") return false
      pollStartedAt.current ??= Date.now()
      return Date.now() - pollStartedAt.current >= BACKOFF_AFTER_MS ? SLOW_POLL_MS : FAST_POLL_MS
    },
  })

  if (initial.isError || status.isError) return { view: null, isProcessing: false }
  const view = status.data ?? initial.data ?? null
  return { view, isProcessing: view?.status === "processing" }
}
