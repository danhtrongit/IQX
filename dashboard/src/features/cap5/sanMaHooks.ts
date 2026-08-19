import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { sanMaApi, sanMaKeys } from "./sanMaApi"
import type { HuntFilterKey, HuntResult, SanMaIndex } from "./sanMaTypes"
import type { Cap5WatchlistItem } from "./watchlistTypes"

/**
 * Hooks của màn Săn mã + Watchlist Cấp 5.
 *
 * Mọi query đều nhận `enabled` để chỗ gọi truyền `isCap5Active` — ngoài shell
 * Cấp 5 (kể cả khi `activePanel` lỡ trỏ vào panel Cấp 5) KHÔNG một request nào
 * được bắn ra.
 */

/** GET /cap5/san-ma. */
export function useSanMaIndex(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<SanMaIndex>({
    queryKey: sanMaKeys.index(),
    queryFn: sanMaApi.getIndex,
    enabled: isAuthenticated && enabled,
    staleTime: 60_000,
    retry: false,
  })
}

/** GET /cap5/san-ma/{ma} — chỉ chạy khi popup của đúng bộ lọc đó đang mở. */
export function useHuntResult(ma: HuntFilterKey | null, enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<HuntResult>({
    queryKey: sanMaKeys.result(ma ?? "ngoai"),
    queryFn: () => sanMaApi.getResult(ma as HuntFilterKey),
    enabled: isAuthenticated && enabled && ma != null,
    staleTime: 60_000,
    retry: false,
  })
}

/** GET /cap5/watchlist. */
export function useCap5Watchlist(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap5WatchlistItem[]>({
    queryKey: sanMaKeys.watchlist(),
    queryFn: sanMaApi.getWatchlist,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** POST /cap5/watchlist. */
export function useAddToCap5Watchlist() {
  const queryClient = useQueryClient()
  return useMutation<
    Cap5WatchlistItem,
    unknown,
    { symbol: string; hunt_filter: HuntFilterKey; hunt_signal: string | null }
  >({
    mutationFn: sanMaApi.addToWatchlist,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sanMaKeys.watchlist() }),
  })
}

/** DELETE /cap5/watchlist/{symbol}. */
export function useRemoveFromCap5Watchlist() {
  const queryClient = useQueryClient()
  return useMutation<void, unknown, string>({
    mutationFn: sanMaApi.removeFromWatchlist,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sanMaKeys.watchlist() }),
  })
}
