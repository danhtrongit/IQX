import { api, unwrap } from "@/shared/http/client"
import type { Cap0Gate, Cap0Progress, PlacementResult } from "./types"

/**
 * Cấp 0 onboarding API — BE1 endpoints under `/cap0/*` (all FREE, auth-only).
 * Payloads are returned un-enveloped; `unwrap` is applied defensively (a no-op
 * for these shapes) to match the app's `features/stock/api.ts` convention.
 */
export const cap0Api = {
  /** GET /cap0/progress → the row, or null if the user hasn't entered yet. */
  getProgress: async (): Promise<Cap0Progress | null> => {
    const res = await api.get("cap0/progress").json<unknown>()
    return (unwrap(res as never) ?? null) as Cap0Progress | null
  },

  /** POST /cap0/enter — idempotent; seeds a 250tr practice account. */
  enter: async (): Promise<Cap0Progress> => {
    const res = await api.post("cap0/enter").json<unknown>()
    return unwrap(res as never) as Cap0Progress
  },

  /** POST /cap0/placement { has_traded_before } → { placed_level }. */
  placement: async (hasTradedBefore: boolean): Promise<PlacementResult> => {
    const res = await api
      .post("cap0/placement", { json: { has_traded_before: hasTradedBefore } })
      .json<unknown>()
    return unwrap(res as never) as PlacementResult
  },

  /** PATCH /cap0/task { task_no, gate? } — mark a task done + optional gate. */
  completeTask: async (taskNo: number, gate?: Cap0Gate): Promise<Cap0Progress> => {
    const res = await api
      .patch("cap0/task", { json: { task_no: taskNo, ...(gate ? { gate } : {}) } })
      .json<unknown>()
    return unwrap(res as never) as Cap0Progress
  },

  /** POST /cap0/graduate — only succeeds when 6/6 tasks + both gates are met. */
  graduate: async (): Promise<Cap0Progress> => {
    const res = await api.post("cap0/graduate").json<unknown>()
    return unwrap(res as never) as Cap0Progress
  },
}
