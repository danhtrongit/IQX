import { isKnownIndexSymbol } from "./market-symbols"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

export async function isSupportedStockRouteSymbol(
  symbol: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const normalizedSymbol = symbol.toUpperCase().trim()

  if (!normalizedSymbol) return false
  if (isKnownIndexSymbol(normalizedSymbol)) return true

  try {
    // New backend: GET /market-data/reference/symbols/{symbol}
    const response = await fetchImpl(
      `${API_BASE}/market-data/reference/symbols/${encodeURIComponent(normalizedSymbol)}`,
    )

    if (!response.ok) return true

    const payload = await response.json()
    // Backend returns { data: { symbol, ... } } or the symbol object directly
    const data = payload?.data || payload
    return Boolean(data?.symbol || data?.ticker)
  } catch {
    // Do not route to 404 on transient network failures.
    return true
  }
}
