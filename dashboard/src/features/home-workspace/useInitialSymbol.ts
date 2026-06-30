import { useWatchlist } from "@/features/watchlist"
import { isIndexSymbol } from "@/features/stock"

export const LAST_VIEWED_KEY = "iqx:last-viewed-symbol"

/** Persist a non-index symbol as the user's last-viewed context. */
export function persistLastViewedSymbol(symbol: string): void {
  const s = symbol?.trim().toUpperCase()
  if (!s || isIndexSymbol(s)) return
  try {
    localStorage.setItem(LAST_VIEWED_KEY, s)
  } catch {
    /* ignore quota / unavailable storage */
  }
}

function readLastViewed(): string | null {
  try {
    return localStorage.getItem(LAST_VIEWED_KEY)
  } catch {
    return null
  }
}

/** Resolve the initial home-workspace context: last-viewed → first watchlist → VNINDEX. */
export function useInitialSymbol(): string {
  const { data } = useWatchlist()
  const lastViewed = readLastViewed()
  if (lastViewed) return lastViewed.toUpperCase()
  const first = data?.[0]?.symbol
  if (first) return first.toUpperCase()
  return "VNINDEX"
}
