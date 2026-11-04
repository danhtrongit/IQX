/**
 * Sorting of the result table (spec §4.3). The server orders the WHOLE stored result before it cuts a
 * page; the client only chooses the column and the direction.
 */
import type { SortState } from "./types"

/** Columns of text: the first click sorts A→Z. Every other column is a number: the first click sorts from the largest. */
const TEXT_SORT_KEYS: readonly string[] = ["symbol", "name", "exchange", "group"]

/** The order a column gets when it is clicked: a new column starts as the spec says, the same column reverses. */
export function nextSort(current: SortState, key: string): SortState {
  if (current.key === key) return { key, order: current.order === "asc" ? "desc" : "asc" }
  return { key, order: TEXT_SORT_KEYS.includes(key) ? "asc" : "desc" }
}
