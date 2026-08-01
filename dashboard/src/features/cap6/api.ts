import { api, unwrap } from "@/shared/http/client"
import type {
  Cap6Progress,
  GoiYCap6,
  KehoachDetailCap6,
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
   *
   * ★★ **409 = THE FREEZE, not a transient failure** (backend `4b01918`). Once the
   * BUY has FILLED the Đối chiếu block is frozen: an **identical** re-post is a
   * 200 no-op (so retry logic is unaffected), and a *changed* one raises
   * `ConflictError` → HTTP 409. Its `detail` already reads "Lệnh này đã khớp —
   * phần Đối chiếu không sửa được nữa…" and `getErrorMessage` surfaces that
   * string VERBATIM, so callers must NOT replace it with a generic "đặt lệnh thất
   * bại": the sentence explains *why* the freeze exists (the lớp must be committed
   * before the outcome is known, or the khớp-vs-lệch comparison means nothing).
   */
  recordKehoach: async (input: KehoachInputCap6): Promise<OrderKehoachCap6> => {
    const res = await api.post("cap6/kehoach", { json: input }).json<unknown>()
    return unwrap(res as never) as OrderKehoachCap6
  },

  /**
   * GET /cap6/kehoach/{order_id} — the Đối chiếu block **as recorded on that
   * order**, with every label + the §C12c provenance sentence.
   *
   * ★ This is NOT `getGoiY`: that one re-derives the kiểu from the symbol's
   * ngành *now*, so it keeps answering "chưa phân loại" for a symbol the server
   * cannot classify — even when the order's `khop_goi_y` WAS recorded. Only this
   * endpoint can tell the Kết sổ the truth for those orders.
   *
   * **404s** for a foreign/unknown order, and for a user with no Cấp 6 progress
   * row — so callers gate it on `isCap6Active` and degrade silently. An order
   * that simply has no Cấp 6 data is a normal 200 with `co_du_lieu: false`.
   */
  getKehoach: async (orderId: string): Promise<KehoachDetailCap6> => {
    const res = await api.get(`cap6/kehoach/${orderId}`).json<unknown>()
    return unwrap(res as never) as KehoachDetailCap6
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
