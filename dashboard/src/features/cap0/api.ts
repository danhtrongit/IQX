import { api, unwrap } from "@/shared/http/client"
import type { Cap0Gate, Cap0Kehoach, Cap0Progress, PlacementResult } from "./types"

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

  /**
   * POST /cap0/kehoach { order_id, ly_do_doi_thuong } — persist the Kế hoạch
   * chip for a Cấp 0 BUY (spec §10). The endpoint accepts EITHER the slug
   * (`thu_cho_biet`) or the verbatim §4 label (`Thử cho biết`), so
   * `PlanBlock`'s own chip strings go up unmapped. Repeat calls for the same
   * order UPSERT (never 409), so a retry can't dead-end the user.
   */
  recordKehoach: async (orderId: string, lyDoDoiThuong: string): Promise<Cap0Kehoach> => {
    const res = await api
      .post("cap0/kehoach", { json: { order_id: orderId, ly_do_doi_thuong: lyDoDoiThuong } })
      .json<unknown>()
    return unwrap(res as never) as Cap0Kehoach
  },

  /**
   * GET /cap0/kehoach?order_id= → the chip recorded for THAT BUY order, or
   * **null** when there is none. Never a fabricated row — the Kết sổ leaves
   * those cells blank rather than inventing a reason.
   *
   * ★ Keyed on the order, not the symbol. `…/latest?symbol=` used to answer
   * with the mã's most recent buy, which after a re-entry is a different,
   * still-open order — so the Kết sổ printed one round trip's `Lý do mua` next
   * to another's `Giá vào`.
   */
  kehoachByOrder: async (orderId: string): Promise<Cap0Kehoach | null> => {
    const res = await api
      .get("cap0/kehoach", { searchParams: { order_id: orderId } })
      .json<unknown>()
    return (unwrap(res as never) ?? null) as Cap0Kehoach | null
  },

  /** POST /cap0/graduate — only succeeds when 4/4 tasks + the debrief gate are met. */
  graduate: async (): Promise<Cap0Progress> => {
    const res = await api.post("cap0/graduate").json<unknown>()
    return unwrap(res as never) as Cap0Progress
  },
}
