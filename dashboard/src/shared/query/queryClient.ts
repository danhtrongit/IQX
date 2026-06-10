import { QueryClient } from "@tanstack/react-query"

/**
 * Single shared QueryClient. Defaults tuned for a financial dashboard:
 * - staleTime 30s so navigation doesn't refetch constantly.
 * - refetchOnWindowFocus off for most data (real-time hooks opt into
 *   `refetchInterval` themselves); refetch on reconnect stays on.
 * - one retry, no aggressive backoff.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
})
