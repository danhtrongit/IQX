import { api, unwrap } from "@/shared/http/client"
import type {
  Cap6Progress,
  GoiYCap6,
  KehoachInputCap6,
  OrderKehoachCap6,
  ThachThucCap6,
} from "./types"

/**
 * Cấp 6 «Đối chiếu» API — BE endpoints under `/cap6/*` (FREE, auth-only, same as
 * Cấp 1-5). Payloads are returned un-enveloped; `unwrap` is applied defensively
 * (a no-op for these shapes), matching `cap5/api.ts`.
 */
export const cap6Api = {
  /** GET /cap6/progress → the row, or null if the user hasn't entered yet. */
  getProgress: async (): Promise<Cap6Progress | null> => {
    const res = await api.get("cap6/progress").json<unknown>()
    return (unwrap(res as never) ?? null) as Cap6Progress | null
  },

  /** POST /cap6/enter — idempotent; requires Cấp 5 already graduated. */
  enter: async (): Promise<Cap6Progress> => {
    const res = await api.post("cap6/enter").json<unknown>()
    return unwrap(res as never) as Cap6Progress
  },

  /** PATCH /cap6/task { task_no } — idempotent recompute (all 3 nhiệm vụ are
   * derived server-side from order_kehoach/order_ketso). */
  markTask: async (taskNo: number): Promise<Cap6Progress> => {
    const res = await api.patch("cap6/task", { json: { task_no: taskNo } }).json<unknown>()
    return unwrap(res as never) as Cap6Progress
  },

  /**
   * GET /cap6/goi-y?symbol= — the symbol's kiểu cổ phiếu + which lớp to
   * prioritise for it + the "vì sao" the FE shows VERBATIM (§C12c).
   *
   * `kieu` comes back `null` (+ an honest note in `giai_thich`) when the server
   * cannot classify the ngành. **404s until a `Cap6Progress` row exists**, so
   * the page must `POST /cap6/enter` first; the block degrades gracefully rather
   * than blocking the user's decision.
   */
  getGoiY: async (symbol: string): Promise<GoiYCap6> => {
    const res = await api.get("cap6/goi-y", { searchParams: { symbol } }).json<unknown>()
    return unwrap(res as never) as GoiYCap6
  },

  /**
   * POST /cap6/kehoach — records the bước Đối chiếu (spec §4) onto the Cấp 1
   * kế hoạch row of a BUY fill (that row must already exist — always post
   * `/cap1/kehoach` first, plus Cấp 2/3/4's, since all five extend the SAME
   * `order_kehoach` row). The server derives `trong_so_goi_y` + `khop_goi_y`
   * itself and re-derives the kiểu from ngành.
   */
  recordKehoach: async (input: KehoachInputCap6): Promise<OrderKehoachCap6> => {
    const res = await api.post("cap6/kehoach", { json: input }).json<unknown>()
    return unwrap(res as never) as OrderKehoachCap6
  },

  /** GET /cap6/thach-thuc — 3 điều kiện của nhiệm vụ ③ + 2 nhóm khớp/lệch. */
  getThachThuc: async (): Promise<ThachThucCap6> => {
    const res = await api.get("cap6/thach-thuc").json<unknown>()
    return unwrap(res as never) as ThachThucCap6
  },

  /** POST /cap6/graduate — only succeeds when 3/3 nhiệm vụ are done. */
  graduate: async (): Promise<Cap6Progress> => {
    const res = await api.post("cap6/graduate").json<unknown>()
    return unwrap(res as never) as Cap6Progress
  },
}
