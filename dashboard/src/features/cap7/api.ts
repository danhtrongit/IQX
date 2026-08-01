import { api, unwrap } from "@/shared/http/client"
import type {
  Cap7Progress,
  KehoachDetailCap7,
  KehoachInputCap7,
  OrderKehoachCap7,
  PhienCap7,
  ThachThucCap7,
} from "./types"

/**
 * Cấp 7 «Đọc sổ lệnh» API — BE endpoints under `/cap7/*` (FREE, auth-only, same
 * as Cấp 1-6). Payloads are returned un-enveloped; `unwrap` is applied
 * defensively (a no-op for these shapes), matching `cap6/api.ts`.
 */
export const cap7Api = {
  /** GET /cap7/progress → the row, or null if the user hasn't entered yet. */
  getProgress: async (): Promise<Cap7Progress | null> => {
    const res = await api.get("cap7/progress").json<unknown>()
    return (unwrap(res as never) ?? null) as Cap7Progress | null
  },

  /** POST /cap7/enter — idempotent; requires Cấp 6 already graduated. */
  enter: async (): Promise<Cap7Progress> => {
    const res = await api.post("cap7/enter").json<unknown>()
    return unwrap(res as never) as Cap7Progress
  },

  /** PATCH /cap7/task { task_no } — idempotent recompute (all 3 nhiệm vụ are
   * derived server-side from order_kehoach/order_ketso). */
  markTask: async (taskNo: number): Promise<Cap7Progress> => {
    const res = await api.patch("cap7/task", { json: { task_no: taskNo } }).json<unknown>()
    return unwrap(res as never) as Cap7Progress
  },

  /**
   * GET /cap7/phien — đang trong giờ giao dịch hay không, **theo đồng hồ
   * SERVER**, + `quy_tac`: every threshold the reading block renders.
   *
   * ★ Two reasons this is its own endpoint rather than a field on `progress`:
   * the panel can stay open across the 11:30 boundary (so `trong_phien` must be
   * refreshable on its own), and the FE must never compute market-open from the
   * browser clock — a user in another timezone would get the wrong answer.
   *
   * 404s until a `Cap7Progress` row exists, so the page must `POST /cap7/enter`
   * first; the block degrades honestly rather than guessing the session state.
   */
  getPhien: async (): Promise<PhienCap7> => {
    const res = await api.get("cap7/phien").json<unknown>()
    return unwrap(res as never) as PhienCap7
  },

  /**
   * POST /cap7/kehoach — records the bước đọc lực (spec §4/§5) onto the Cấp 1
   * kế hoạch row of a BUY fill (that row must already exist — always post
   * `/cap1/kehoach` first, plus Cấp 2/3/4/6's, since all of them extend the SAME
   * `order_kehoach` row).
   *
   * The server validates `luc_chi_so` finite and > 0, and `hanh_vi_co` non-null
   * IFF `co_canh_giac_lenh_gia` — it rejects the inconsistent combination
   * instead of normalising it, so the FE sends both from ONE book snapshot.
   */
  recordKehoach: async (input: KehoachInputCap7): Promise<OrderKehoachCap7> => {
    const res = await api.post("cap7/kehoach", { json: input }).json<unknown>()
    return unwrap(res as never) as OrderKehoachCap7
  },

  /**
   * GET /cap7/kehoach/{order_id} — the đọc-lực block recorded on that order +
   * the scoring context (`dead_band_pct`, `han_cham_ngay`, `da_toi_han_cham`).
   *
   * ★ Reading it RUNS the server's lazy chấm pass, so an order past its
   * `so_phien_cham` window comes back SCORED — the whole reason the Kết sổ can
   * finally show a verdict instead of "chưa tới hạn chấm" forever. Because that
   * pass may fetch prices, the first call after a long absence can be slow; it
   * is idempotent, so repeats are cheap.
   *
   * **404s** for a foreign/unknown order, and for a user with no Cấp 7 progress
   * row — so callers gate it on `isCap7Active` and degrade silently. An order
   * that simply never recorded a reading is a normal 200 with `co_du_lieu:
   * false`.
   */
  getKehoach: async (orderId: string): Promise<KehoachDetailCap7> => {
    const res = await api.get(`cap7/kehoach/${orderId}`).json<unknown>()
    return unwrap(res as never) as KehoachDetailCap7
  },

  /**
   * ★ `POST /cap7/cham` KHÔNG được bọc ở đây, có chủ đích. Nó chỉ chạy lại đúng
   * cái lazy chấm pass mà MỌI read của Cấp 7 đã chạy — và `getKehoach` ở trên
   * chạy nó ngay trước khi Kết sổ đọc kết quả, nên không luồng FE nào cần một
   * request riêng cho nó.
   */

  /** GET /cap7/thach-thuc — 3 điều kiện của nhiệm vụ ③ (§C12c). */
  getThachThuc: async (): Promise<ThachThucCap7> => {
    const res = await api.get("cap7/thach-thuc").json<unknown>()
    return unwrap(res as never) as ThachThucCap7
  },

  /** POST /cap7/graduate — only succeeds when 3/3 nhiệm vụ are done. */
  graduate: async (): Promise<Cap7Progress> => {
    const res = await api.post("cap7/graduate").json<unknown>()
    return unwrap(res as never) as Cap7Progress
  },
}
