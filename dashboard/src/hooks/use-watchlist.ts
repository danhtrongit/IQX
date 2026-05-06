import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/contexts/auth-context"
import { api } from "@/lib/api"

/**
 * Watchlist hook — connects to the backend /watchlist API.
 * Single flat favorites list per user.
 */

interface WatchlistItemData {
  id: string
  symbol: string
  sort_order: number
  created_at: string
}

interface UseWatchlistReturn {
  /** All watched symbols (lowercase-safe) */
  symbols: string[]
  isLoading: boolean
  /** Check if a symbol is in the watchlist */
  isSymbolWatched: (symbol: string) => boolean
  /** Toggle a symbol in/out of the watchlist */
  toggleSymbol: (symbol: string) => Promise<void>
  /** Refresh the watchlist from backend */
  refresh: () => Promise<void>
  /** True when backend watchlist endpoint is unavailable */
  isUnavailable: boolean
}

export function useWatchlist(): UseWatchlistReturn {
  const [items, setItems] = useState<WatchlistItemData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUnavailable, setIsUnavailable] = useState(false)
  const { isAuthenticated } = useAuth()
  const fetchedRef = useRef(false)

  const fetchList = useCallback(async () => {
    if (!isAuthenticated) {
      setItems([])
      return
    }
    setIsLoading(true)
    try {
      const res = await api.get("watchlist").json<{ items: WatchlistItemData[]; count: number }>()
      setItems(res.items || [])
      setIsUnavailable(false)
    } catch {
      setItems([])
      setIsUnavailable(true)
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  // Fetch on mount / auth change
  useEffect(() => {
    if (isAuthenticated && !fetchedRef.current) {
      fetchedRef.current = true
      fetchList()
    }
    if (!isAuthenticated) {
      fetchedRef.current = false
      setItems([])
    }
  }, [isAuthenticated, fetchList])

  // Build a Set for O(1) lookup
  const watchedSet = new Set(items.map((i) => i.symbol.toUpperCase()))

  const isSymbolWatched = useCallback(
    (symbol: string) => watchedSet.has(symbol.toUpperCase()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  )

  const toggleSymbol = useCallback(
    async (symbol: string) => {
      if (!isAuthenticated) return
      const sym = symbol.toUpperCase()
      const isWatched = watchedSet.has(sym)

      try {
        if (isWatched) {
          await api.delete(`watchlist/${sym}`)
          // Optimistic removal
          setItems((prev) => prev.filter((i) => i.symbol.toUpperCase() !== sym))
        } else {
          const item = await api.post("watchlist", { json: { symbol: sym } }).json<WatchlistItemData>()
          // Optimistic add
          setItems((prev) => [...prev, item])
        }
      } catch {
        // Revert on error — refetch
        fetchList()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAuthenticated, items, fetchList],
  )

  return {
    symbols: items.map((i) => i.symbol),
    isLoading,
    isSymbolWatched,
    toggleSymbol,
    refresh: fetchList,
    isUnavailable,
  }
}
