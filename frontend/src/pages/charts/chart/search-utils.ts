/**
 * Extract the result array from the canonical
 * `market-data/reference/symbols` response. The endpoint answers with a
 * `{ data: [...] }` envelope (accept legacy `{ items }` and bare arrays too so
 * cached fixtures do not break chart search).
 *
 * Kept dependency-free (no http client) so it stays unit-testable.
 */
export function extractSearchItems(json: unknown): unknown[] {
  if (Array.isArray(json)) return json
  const o = (json ?? {}) as { data?: unknown; items?: unknown }
  const arr = o.data ?? o.items ?? []
  return Array.isArray(arr) ? arr : []
}
