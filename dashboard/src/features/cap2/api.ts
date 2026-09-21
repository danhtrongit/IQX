import { api, unwrap } from "@/shared/http/client"
import type {
  Cap2ActiveAlerts,
  Cap2Analysis,
  Cap2AlertActionInput,
  Cap2AlertActionResult,
  Cap2PreBuyAlertInput,
  Cap2PreBuyAlertResult,
  Cap2Progress,
  Cap2TradeHistoryList,
  DiemKyLuat,
  DiemKyLuatHistory,
  KehoachInputCap2,
  KetsoInputCap2,
  OrderKehoachCap2,
  OrderKetsoCap2,
} from "./types"

/**
 * Cấp 2 «Kỷ luật» API — BE2 endpoints under `/cap2/*`. Cấp 2 is FREE (all
 * endpoints require only auth, not premium — see `backend/.../cap2.py`
 * docstring). Payloads are returned un-enveloped; `unwrap` is applied
 * defensively (a no-op for these shapes), matching `cap1/api.ts`'s convention.
 */
export const cap2Api = {
  /** GET /cap2/progress → the row, or null if the user hasn't entered yet. */
  getProgress: async (): Promise<Cap2Progress | null> => {
    const res = await api.get("cap2/progress").json<unknown>()
    return (unwrap(res as never) ?? null) as Cap2Progress | null
  },

  /** POST /cap2/enter — idempotent; requires Cấp 1 already graduated. */
  enter: async (): Promise<Cap2Progress> => {
    const res = await api.post("cap2/enter").json<unknown>()
    return unwrap(res as never) as Cap2Progress
  },

  /** PATCH /cap2/task { task_no } — idempotent recompute (nhiệm vụ ①, the only
   * one, is derived server-side from `order_kehoach`/`order_ketso`). */
  markTask: async (taskNo: number): Promise<Cap2Progress> => {
    const res = await api.patch("cap2/task", { json: { task_no: taskNo } }).json<unknown>()
    return unwrap(res as never) as Cap2Progress
  },

  /** POST /cap2/kehoach — records the SL/TP commitment (spec §5) onto the
   * Cấp 1 kế hoạch row of a BUY fill (that row must already exist — always
   * post `/cap1/kehoach` first). */
  recordKehoach: async (input: KehoachInputCap2): Promise<OrderKehoachCap2> => {
    const res = await api.post("cap2/kehoach", { json: input }).json<unknown>()
    return unwrap(res as never) as OrderKehoachCap2
  },

  /** POST /cap2/ketso — records the 4 vi phạm hành vi (+ 3 measurements) for
   * a filled SELL order. */
  recordKetso: async (input: KetsoInputCap2): Promise<OrderKetsoCap2> => {
    const res = await api.post("cap2/ketso", { json: input }).json<unknown>()
    return unwrap(res as never) as OrderKetsoCap2
  },

  /** GET /cap2/diem-ky-luat?ngay=YYYY-MM-DD — điểm kỷ luật 0-100 + breakdown
   * (spec §C12c). `ngay` defaults to today server-side when omitted. */
  getDiemKyLuat: async (ngay?: string): Promise<DiemKyLuat> => {
    const res = ngay
      ? await api.get("cap2/diem-ky-luat", { searchParams: { ngay } }).json<unknown>()
      : await api.get("cap2/diem-ky-luat").json<unknown>()
    return unwrap(res as never) as DiemKyLuat
  },

  getTrades: async (): Promise<Cap2TradeHistoryList> => {
    const res = await api.get("cap2/trades").json<unknown>()
    return unwrap(res as never) as Cap2TradeHistoryList
  },

  getAnalysis: async (): Promise<Cap2Analysis> => {
    const res = await api.get("cap2/analysis").json<unknown>()
    return unwrap(res as never) as Cap2Analysis
  },

  /** POST /cap2/alerts/pre-buy — authoritative averaging-down preflight. */
  checkPreBuyAlert: async (input: Cap2PreBuyAlertInput): Promise<Cap2PreBuyAlertResult> => {
    const res = await api.post("cap2/alerts/pre-buy", { json: input }).json<unknown>()
    return unwrap(res as never) as Cap2PreBuyAlertResult
  },

  /** Reading the inbox atomically claims pending impressions, so the strict
   * two-alert session budget must never be reproduced in browser state. */
  getActiveAlerts: async (sessionDate?: string): Promise<Cap2ActiveAlerts> => {
    const res = sessionDate
      ? await api
          .get("cap2/alerts/active", { searchParams: { session_date: sessionDate } })
          .json<unknown>()
      : await api.get("cap2/alerts/active").json<unknown>()
    return unwrap(res as never) as Cap2ActiveAlerts
  },

  actOnAlert: async ({
    alertId,
    action,
    confirmationPhrase,
  }: Cap2AlertActionInput): Promise<Cap2AlertActionResult> => {
    const res = await api
      .post(`cap2/alerts/${alertId}/action`, {
        json: {
          action,
          ...(confirmationPhrase ? { confirmation_phrase: confirmationPhrase } : {}),
        },
      })
      .json<unknown>()
    return unwrap(res as never) as Cap2AlertActionResult
  },

  getDiemKyLuatHistory: async (): Promise<DiemKyLuatHistory> => {
    const res = await api.get("cap2/diem-ky-luat/history").json<unknown>()
    return unwrap(res as never) as DiemKyLuatHistory
  },

  /** POST /cap2/graduate — only succeeds when 1/1 nhiệm vụ is done. */
  graduate: async (): Promise<Cap2Progress> => {
    const res = await api.post("cap2/graduate").json<unknown>()
    return unwrap(res as never) as Cap2Progress
  },
}
