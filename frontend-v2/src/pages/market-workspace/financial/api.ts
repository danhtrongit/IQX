/**
 * BCTC storytelling dashboard endpoints. Paths are relative to `/api/v2`
 * (`@/lib/api` owns the base URL and the auth refresh).
 *
 *  - `GET /market-data/bctc-dashboard/{SYMBOL}?term_type=1` — deterministic
 *    compute layer (public): hero, radar, blocks, meta.
 *  - `GET /ai/bctc-dashboard/{SYMBOL}?term_type=1` — AI narrative (premium,
 *    authorized server-side; the client never renders prose it doesn't have).
 *
 * Both answers may arrive wrapped in a `{data: …}` envelope or bare — the legacy
 * client tolerated both, so the unwrap keeps that tolerance.
 */
import { api } from "@/lib/api"

import type { BctcDashboardData, BctcNarrative } from "./types"

/**
 * `{data: …}` envelope → inner payload; anything else → the payload itself.
 * The shape behind `T` is the backend contract documented in `types.ts`; every
 * consumer guards its optional fields at render time, so this boundary only
 * unwraps and never reads a field it hasn't checked.
 */
function unwrapEnvelope<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    // Envelope detected by the `in` guard above; the inner shape is `T` by contract.
    const inner: unknown = payload.data
    return inner as T
  }
  // Bare payload (no envelope): the endpoint answered with the body directly.
  return payload as T
}

function symbolQuery(symbol: string, termType: number): string {
  return `${encodeURIComponent(symbol.trim().toUpperCase())}?term_type=${termType}`
}

/** Deterministic dashboard for `symbol` (public). */
export function fetchBctcDashboard(
  symbol: string,
  termType = 1,
  signal?: AbortSignal,
): Promise<BctcDashboardData | null> {
  return api<unknown>(`/market-data/bctc-dashboard/${symbolQuery(symbol, termType)}`, {
    signal,
  }).then((payload) => unwrapEnvelope<BctcDashboardData | null>(payload) ?? null)
}

/** AI narrative for `symbol` (premium). */
export function fetchBctcNarrative(
  symbol: string,
  termType = 1,
  signal?: AbortSignal,
): Promise<BctcNarrative | null> {
  return api<unknown>(`/ai/bctc-dashboard/${symbolQuery(symbol, termType)}`, { signal }).then(
    (payload) => unwrapEnvelope<BctcNarrative | null>(payload) ?? null,
  )
}
