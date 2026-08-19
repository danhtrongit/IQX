import { api, unwrap } from "@/shared/http/client"
import type {
  Cap4Progress,
  KehoachInputCap4,
  OrderKehoachCap4,
  VuKhiDiemMuCap4,
} from "./types"

/**
 * Cấp 4 «Thuần thục» API — BE endpoints under `/cap4/*`. Cấp 4 is FREE (all
 * endpoints require only auth, not premium — see
 * `backend/.../api/v1/endpoints/cap4.py`'s module docstring). Payloads are
 * returned un-enveloped; `unwrap` is applied defensively (a no-op for these
 * shapes), matching `cap3/api.ts`'s convention.
 */
export const cap4Api = {
  /** GET /cap4/progress → the row, or null if the user hasn't entered yet. */
  getProgress: async (): Promise<Cap4Progress | null> => {
    const res = await api.get("cap4/progress").json<unknown>()
    return (unwrap(res as never) ?? null) as Cap4Progress | null
  },

  /** POST /cap4/enter — idempotent; requires Cấp 3 already graduated. */
  enter: async (): Promise<Cap4Progress> => {
    const res = await api.post("cap4/enter").json<unknown>()
    return unwrap(res as never) as Cap4Progress
  },

  /** PATCH /cap4/task { task_no } — idempotent recompute (nhiệm vụ duy nhất
   * được suy ra server-side từ order_kehoach; `task_no` hợp lệ = 1). */
  markTask: async (taskNo: number): Promise<Cap4Progress> => {
    const res = await api.patch("cap4/task", { json: { task_no: taskNo } }).json<unknown>()
    return unwrap(res as never) as Cap4Progress
  },

  /** POST /cap4/kehoach — records the khối "Đọc 5 lớp" (spec §5/§8) onto the
   * Cấp 1 kế hoạch row of a BUY fill (that row must already exist — always
   * post `/cap1/kehoach` first, plus `/cap2/kehoach` + `/cap3/kehoach` inside
   * their cấp, since all four extend the SAME `order_kehoach` row). */
  recordKehoach: async (input: KehoachInputCap4): Promise<OrderKehoachCap4> => {
    const res = await api.post("cap4/kehoach", { json: input }).json<unknown>()
    return unwrap(res as never) as OrderKehoachCap4
  },

  /** GET /cap4/vu-khi-diem-mu — per-lớp REAL win rate when self-rated Ủng hộ
   * (spec §7 khối ⑨) kèm counts + giải thích (§C12c). */
  getVuKhiDiemMu: async (): Promise<VuKhiDiemMuCap4> => {
    const res = await api.get("cap4/vu-khi-diem-mu").json<unknown>()
    return unwrap(res as never) as VuKhiDiemMuCap4
  },

  /** POST /cap4/graduate — chỉ thành công khi xong nhiệm vụ duy nhất (20 lệnh). */
  graduate: async (): Promise<Cap4Progress> => {
    const res = await api.post("cap4/graduate").json<unknown>()
    return unwrap(res as never) as Cap4Progress
  },
}
