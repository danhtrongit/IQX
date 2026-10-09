import type { ResultRow } from "./types"

/** Rows of a saved result are the server's stored result rows; anything else in the array is ignored. */
export function asResultRows(rows: readonly Record<string, unknown>[]): ResultRow[] {
  return rows.filter(
    (row): row is ResultRow =>
      typeof row.symbol === "string" && typeof row.metrics === "object" && row.metrics !== null && !Array.isArray(row.metrics),
  )
}
