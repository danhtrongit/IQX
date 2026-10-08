import { HUNT_FILTERS, type HuntFilterKey } from "./copy"

/** URL param shared by the hunt panel (group list) and the hunt main view (results). */
export const HUNT_PARAM = "hunt"

export const DEFAULT_HUNT_FILTER: HuntFilterKey = HUNT_FILTERS[0].ma

/** Unknown or missing values fall back to the first group instead of an empty screen. */
export function parseHuntFilter(value: string | null): HuntFilterKey {
  return HUNT_FILTERS.find((filter) => filter.ma === value)?.ma ?? DEFAULT_HUNT_FILTER
}

export function withHuntFilter(params: URLSearchParams, filter: HuntFilterKey): URLSearchParams {
  const next = new URLSearchParams(params)
  next.set(HUNT_PARAM, filter)
  return next
}
