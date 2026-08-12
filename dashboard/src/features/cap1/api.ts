import { api, unwrap } from "@/shared/http/client"
import type {
  Cap1Progress,
  KehoachInput,
  KetsoInput,
  OrderKehoach,
  OrderKetso,
} from "./types"

/**
 * Cấp 1 «Học việc» API — BE1 endpoints under `/cap1/*`. Cấp 1 is FREE (all
 * endpoints require only auth, not premium — see `backend/.../cap1.py`
 * docstring). Payloads are returned un-enveloped; `unwrap` is applied
 * defensively (a no-op for these shapes), matching `cap0/api.ts`'s convention.
 */
export const cap1Api = {
  /** GET /cap1/progress → the row, or null if the user hasn't entered yet. */
  getProgress: async (): Promise<Cap1Progress | null> => {
    const res = await api.get("cap1/progress").json<unknown>()
    return (unwrap(res as never) ?? null) as Cap1Progress | null
  },

  /** POST /cap1/enter — idempotent; requires Cấp 0 already graduated. */
  enter: async (): Promise<Cap1Progress> => {
    const res = await api.post("cap1/enter").json<unknown>()
    return unwrap(res as never) as Cap1Progress
  },

  /** PATCH /cap1/task { task_no } — nhiệm vụ ⑤ view-log (idempotent recompute). */
  markTask: async (taskNo: number): Promise<Cap1Progress> => {
    const res = await api.patch("cap1/task", { json: { task_no: taskNo } }).json<unknown>()
    return unwrap(res as never) as Cap1Progress
  },

  /** POST /cap1/kehoach — Form Kế hoạch (lý do mua + vùng mua) for a BUY fill. */
  recordKehoach: async (input: KehoachInput): Promise<OrderKehoach> => {
    const res = await api.post("cap1/kehoach", { json: input }).json<unknown>()
    return unwrap(res as never) as OrderKehoach
  },

  /** POST /cap1/ketso — Kết sổ for a filled SELL order. */
  recordKetso: async (input: KetsoInput): Promise<OrderKetso> => {
    const res = await api.post("cap1/ketso", { json: input }).json<unknown>()
    return unwrap(res as never) as OrderKetso
  },

  /** POST /cap1/graduate — only succeeds when 5/5 nhiệm vụ are done. */
  graduate: async (): Promise<Cap1Progress> => {
    const res = await api.post("cap1/graduate").json<unknown>()
    return unwrap(res as never) as Cap1Progress
  },
}
