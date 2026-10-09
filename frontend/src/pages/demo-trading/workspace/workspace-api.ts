/**
 * Workspace bootstrap + state.
 *
 * `POST /workspace/ensure` finds or creates the caller's accounts and default
 * mascot (idempotent server-side) and `GET /workspace/state` only reads. The
 * contract types are local until the generated client is regenerated; both
 * routes may be missing while the backend is not deployed, which the UI treats
 * as "nothing to show yet", never as an error.
 */
import { api, ApiError } from "@/lib/api"
import type { MascotId } from "../journey/types"

export type WorkspaceState = {
  /** `GET /api/v2/workspace/state`: the active mascot is `mascot.active_mascot_id`. */
  mascot?: { active_mascot_id?: string | null; revision?: number } | null
  /** Older local shape, still accepted. */
  active_mascot?: { mascot_id?: string | null } | null
}

export const DEFAULT_MASCOT_ID: MascotId = "bach_ho"

const MASCOT_IDS: readonly MascotId[] = ["bach_ho", "thanh_long", "loc_huou", "phung_hoang", "kim_quy"]

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

/** `null` when the route is not deployed yet. */
export async function fetchWorkspaceState(signal?: AbortSignal): Promise<WorkspaceState | null> {
  try {
    return unwrap<WorkspaceState | null | undefined>(await api<unknown>("/workspace/state", { signal })) ?? null
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

/** The mascot to draw: the account's active one, else the default. Unknown ids never reach the renderer. */
export function resolveActiveMascotId(state: WorkspaceState | null | undefined): MascotId {
  const id = state?.mascot?.active_mascot_id ?? state?.active_mascot?.mascot_id
  return MASCOT_IDS.find((candidate) => candidate === id) ?? DEFAULT_MASCOT_ID
}

const ensured = new Map<string, Promise<void>>()

/**
 * Calls `POST /workspace/ensure` at most once per user in this page session.
 * A 404 (backend not deployed) counts as done; any other failure is forgotten so
 * the next workspace mount can try again.
 */
export function ensureWorkspaceOnce(userId: string): Promise<void> {
  const existing = ensured.get(userId)
  if (existing) return existing
  const request = api<unknown>("/workspace/ensure", { method: "POST" }).then(
    () => undefined,
    (error: unknown) => {
      if (isNotFound(error)) return
      ensured.delete(userId)
      throw error
    },
  )
  ensured.set(userId, request)
  return request
}

/** Test seam: forget what this page session already ensured. */
export function resetEnsuredWorkspaces(): void {
  ensured.clear()
}
