import { api, unwrap } from "@/shared/http/client"
import type {
  Cap5Progress,
  ChamDungNgoaiResult,
  DungNgoaiInput,
  DungNgoaiList,
  KetsoInputCap5,
  OrderKetsoCap5,
  ThachThucCap5,
  VerdictGoiY,
} from "./types"

/**
 * Cấp 5 «Lão luyện» API — BE endpoints under `/cap5/*` (FREE, auth-only, same
 * as Cấp 1-4). Payloads are returned un-enveloped; `unwrap` is applied
 * defensively (a no-op for these shapes), matching `cap4/api.ts`.
 */
export const cap5Api = {
  /** GET /cap5/progress → the row, or null if the user hasn't entered yet. */
  getProgress: async (): Promise<Cap5Progress | null> => {
    const res = await api.get("cap5/progress").json<unknown>()
    return (unwrap(res as never) ?? null) as Cap5Progress | null
  },

  /** POST /cap5/enter — idempotent; requires Cấp 4 already graduated. */
  enter: async (): Promise<Cap5Progress> => {
    const res = await api.post("cap5/enter").json<unknown>()
    return unwrap(res as never) as Cap5Progress
  },

  /** PATCH /cap5/task { task_no } — idempotent recompute (all 3 nhiệm vụ are
   * derived server-side). */
  markTask: async (taskNo: number): Promise<Cap5Progress> => {
    const res = await api.patch("cap5/task", { json: { task_no: taskNo } }).json<unknown>()
    return unwrap(res as never) as Cap5Progress
  },

  /**
   * GET /cap5/verdict/{order_id} — verdict hệ GỢI Ý + every tín hiệu it was
   * derived from (spec §4/§C12c). The FE must render `signals` verbatim; a bare
   * verdict is not allowed.
   */
  getVerdict: async (orderId: string): Promise<VerdictGoiY> => {
    const res = await api.get(`cap5/verdict/${orderId}`).json<unknown>()
    return unwrap(res as never) as VerdictGoiY
  },

  /**
   * POST /cap5/ketso — user confirms/overrides the hệ verdict. The server
   * recomputes `verdict_he` + derives `o_4` itself; `ly_do_sua` is REQUIRED on
   * an override (422 otherwise — the FE gates for this in `isPhanLoaiSettled`).
   */
  recordKetso: async (input: KetsoInputCap5): Promise<OrderKetsoCap5> => {
    const res = await api.post("cap5/ketso", { json: input }).json<unknown>()
    return unwrap(res as never) as OrderKetsoCap5
  },

  /** POST /cap5/dung-ngoai — logs a non-trade decision (giá chốt ở server). */
  logDungNgoai: async (input: DungNgoaiInput): Promise<DungNgoaiList> => {
    const res = await api.post("cap5/dung-ngoai", { json: input }).json<unknown>()
    return unwrap(res as never) as DungNgoaiList
  },

  /** GET /cap5/dung-ngoai — nhật ký + counts; scores any due decision on read. */
  getDungNgoai: async (): Promise<DungNgoaiList> => {
    const res = await api.get("cap5/dung-ngoai").json<unknown>()
    return unwrap(res as never) as DungNgoaiList
  },

  /** POST /cap5/dung-ngoai/cham — same scoring routine, triggered explicitly. */
  chamDungNgoai: async (): Promise<ChamDungNgoaiResult> => {
    const res = await api.post("cap5/dung-ngoai/cham").json<unknown>()
    return unwrap(res as never) as ChamDungNgoaiResult
  },

  /** GET /cap5/thach-thuc — 3 điều kiện của nhiệm vụ ③ kèm giá trị + giải thích. */
  getThachThuc: async (): Promise<ThachThucCap5> => {
    const res = await api.get("cap5/thach-thuc").json<unknown>()
    return unwrap(res as never) as ThachThucCap5
  },

  /** POST /cap5/graduate — only succeeds when 3/3 nhiệm vụ are done. */
  graduate: async (): Promise<Cap5Progress> => {
    const res = await api.post("cap5/graduate").json<unknown>()
    return unwrap(res as never) as Cap5Progress
  },
}
