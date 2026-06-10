import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { watchlistApi, type SymbolInfo, type WatchlistItem } from "./api"
import { watchlistKeys } from "./keys"

/**
 * GET /watchlist — the user's flat favorites list.
 * Enabled only when authenticated; invalidated on login/logout via the shared key.
 */
export function useWatchlist() {
  const { isAuthenticated } = useAuth()
  return useQuery<WatchlistItem[]>({
    queryKey: watchlistKeys.all,
    queryFn: watchlistApi.list,
    enabled: isAuthenticated,
    staleTime: 30_000,
  })
}

/** POST /watchlist — add a symbol, then invalidate the list. */
export function useAddToWatchlist() {
  const queryClient = useQueryClient()
  return useMutation<WatchlistItem, unknown, string>({
    mutationFn: (symbol: string) => watchlistApi.add(symbol),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all })
    },
  })
}

/** DELETE /watchlist/{symbol} — remove a symbol, then invalidate the list. */
export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient()
  return useMutation<void, unknown, string>({
    mutationFn: (symbol: string) => watchlistApi.remove(symbol),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all })
    },
  })
}

/** PUT /watchlist/reorder — persist drag-and-drop order, then invalidate. */
export function useReorderWatchlist() {
  const queryClient = useQueryClient()
  return useMutation<WatchlistItem[], unknown, string[]>({
    mutationFn: (symbols: string[]) => watchlistApi.reorder(symbols),
    onSuccess: (items) => {
      queryClient.setQueryData(watchlistKeys.all, items)
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all })
    },
  })
}

/**
 * Convenience helpers around the watchlist: a `Set` of watched symbols plus a
 * `toggle` mutation that adds or removes depending on current membership.
 * Replaces the old manual optimistic hook (`dashboard-bak/src/hooks/use-watchlist.ts`).
 */
export function useWatchlistToggle() {
  const { data } = useWatchlist()
  const add = useAddToWatchlist()
  const remove = useRemoveFromWatchlist()

  const watched = new Set((data ?? []).map((i) => i.symbol.toUpperCase()))
  const isWatched = (symbol: string) => watched.has(symbol.toUpperCase())

  const toggle = async (symbol: string): Promise<boolean> => {
    const sym = symbol.toUpperCase()
    if (watched.has(sym)) {
      await remove.mutateAsync(sym)
      return false // now unwatched
    }
    await add.mutateAsync(sym)
    return true // now watched
  }

  return {
    isWatched,
    toggle,
    isPending: add.isPending || remove.isPending,
  }
}

/** Company metadata for a watchlist row (best-effort reference lookup). */
export function useSymbolInfo(symbol: string) {
  return useQuery<SymbolInfo | null>({
    queryKey: watchlistKeys.symbolInfo(symbol.toUpperCase()),
    queryFn: () => watchlistApi.getSymbolInfo(symbol),
    enabled: Boolean(symbol),
    staleTime: 60 * 60_000,
  })
}

/** 3-month daily-close sparkline for a watchlist row. */
export function useSparkline(symbol: string) {
  return useQuery<number[]>({
    queryKey: watchlistKeys.sparkline(symbol.toUpperCase()),
    queryFn: () => watchlistApi.getSparkline(symbol),
    enabled: Boolean(symbol),
    staleTime: 30 * 60_000,
  })
}
