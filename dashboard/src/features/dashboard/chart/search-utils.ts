/**
 * Extract the result array from the `market-data/reference/symbols/search`
 * response. The endpoint answers with `{ items: [...] }` (it may also use
 * `{ data }` or a bare array), so accept all three — reading only `.data`
 * silently yielded zero TradingView chart search results.
 *
 * Kept dependency-free (no http client) so it stays unit-testable.
 */
export function extractSearchItems(json: unknown): unknown[] {
  if (Array.isArray(json)) return json
  const o = (json ?? {}) as { data?: unknown; items?: unknown }
  const arr = o.data ?? o.items ?? []
  return Array.isArray(arr) ? arr : []
}
