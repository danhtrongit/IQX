import { api, unwrap } from "@/shared/http/client"
import type {
  Cap3Progress,
  KehoachInputCap3,
  KhauViLoai,
  OrderKehoachCap3,
} from "./types"

/**
 * Cấp 3 «Bản lĩnh» API — BE endpoints under `/cap3/*`. Cấp 3 is FREE (all
 * endpoints require only auth, not premium — see
 * `backend/.../api/v1/endpoints/cap3.py`'s module docstring). Payloads are
 * returned un-enveloped; `unwrap` is applied defensively (a no-op for these
 * shapes), matching `cap2/api.ts`'s convention.
 */
export const cap3Api = {
  /** GET /cap3/progress → the row, or null if the user hasn't entered yet. */
  getProgress: async (): Promise<Cap3Progress | null> => {
    const res = await api.get("cap3/progress").json<unknown>()
    return (unwrap(res as never) ?? null) as Cap3Progress | null
  },

  /** POST /cap3/enter — idempotent; requires Cấp 2 already graduated. */
  enter: async (): Promise<Cap3Progress> => {
    const res = await api.post("cap3/enter").json<unknown>()
    return unwrap(res as never) as Cap3Progress
  },

  /** POST /cap3/khau-vi { khau_vi } — đặt/đổi khẩu vị rủi ro (hồ sơ, áp mọi
   * lệnh sau — spec §5). Changeable any time, not just on first entry. */
  setKhauVi: async (khauVi: KhauViLoai): Promise<Cap3Progress> => {
    const res = await api.post("cap3/khau-vi", { json: { khau_vi: khauVi } }).json<unknown>()
    return unwrap(res as never) as Cap3Progress
  },

  /** PATCH /cap3/task { task_no } — server-side recomputation of either
   * sizing-confidence task from persisted plans. */
  markTask: async (taskNo: 1 | 2): Promise<Cap3Progress> => {
    const res = await api.patch("cap3/task", { json: { task_no: taskNo } }).json<unknown>()
    return unwrap(res as never) as Cap3Progress
  },

  /** POST /cap3/kehoach — records the quản lý vốn block (khẩu vị + mức tự
   * tin + cách/khối lượng, spec §6) onto the Cấp 1 kế hoạch row of a BUY
   * fill (that row must already exist — always post `/cap1/kehoach` first,
   * and `/cap2/kehoach` too when inside Cấp 2). */
  recordKehoach: async (input: KehoachInputCap3): Promise<OrderKehoachCap3> => {
    const res = await api.post("cap3/kehoach", { json: input }).json<unknown>()
    return unwrap(res as never) as OrderKehoachCap3
  },


  /** POST /cap3/graduate — only succeeds when both concurrent tasks are done. */
  graduate: async (): Promise<Cap3Progress> => {
    const res = await api.post("cap3/graduate").json<unknown>()
    return unwrap(res as never) as Cap3Progress
  },
}
