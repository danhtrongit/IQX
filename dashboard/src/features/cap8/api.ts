import { api, unwrap } from "@/shared/http/client"
import type {
  Cap8Progress,
  KehoachInputCap8,
  KiemTraCap8,
  KiemTraInputCap8,
  OrderKehoachCap8,
  ThachThucCap8,
} from "./types"

/**
 * Cấp 8 «Quản trị rủi ro danh mục» API — BE endpoints under `/cap8/*` (FREE,
 * auth-only, same as Cấp 1-7). Payloads are returned un-enveloped; `unwrap` is
 * applied defensively (a no-op for these shapes), matching `cap7/api.ts`.
 */
export const cap8Api = {
  /** GET /cap8/progress → the row, or null if the user hasn't entered yet. */
  getProgress: async (): Promise<Cap8Progress | null> => {
    const res = await api.get("cap8/progress").json<unknown>()
    return (unwrap(res as never) ?? null) as Cap8Progress | null
  },

  /** POST /cap8/enter — idempotent; requires Cấp 7 already graduated. */
  enter: async (): Promise<Cap8Progress> => {
    const res = await api.post("cap8/enter").json<unknown>()
    return unwrap(res as never) as Cap8Progress
  },

  /** PATCH /cap8/task { task_no } — idempotent recompute (all 3 nhiệm vụ are
   * derived server-side from order_kehoach/order_ketso + the real portfolio). */
  markTask: async (taskNo: number): Promise<Cap8Progress> => {
    const res = await api.patch("cap8/task", { json: { task_no: taskNo } }).json<unknown>()
    return unwrap(res as never) as Cap8Progress
  },

  /**
   * GET /cap8/kiem-tra — the WHOLE pre-trade check in one response (spec §4):
   * dồn ngành sau lệnh · tương quan với vị thế đang giữ · tổng vốn ở rủi ro vs
   * trần khẩu vị, each with its own plain-Vietnamese `giai_thich`.
   *
   * ★ It is a pure READ and a CẢNH BÁO MỀM: it can never block a buy (spec §9,
   * §C8). If it fails, the caller degrades OPEN — the order still goes through.
   *
   * ★ EXPENSIVE (O(vị thế) price lookups + bounded O(n²) correlation fetches):
   * always reach it through the debounced `useKiemTraCap8`, never straight off
   * a keystroke in the volume field.
   *
   * `cat_lo` is omitted (not sent as 0) when Cấp 2's stop is not set yet — the
   * server then reports the candidate's contribution as CHƯA BIẾT rather than
   * quietly treating it as zero risk.
   */
  getKiemTra: async (input: KiemTraInputCap8): Promise<KiemTraCap8> => {
    const searchParams: Record<string, string | number> = {
      symbol: input.symbol,
      khoi_luong: input.khoiLuong,
      gia: input.gia,
    }
    if (input.catLo != null) searchParams.cat_lo = input.catLo
    const res = await api.get("cap8/kiem-tra", { searchParams }).json<unknown>()
    return unwrap(res as never) as KiemTraCap8
  },

  /**
   * POST /cap8/kehoach — records the bước Kiểm tra danh mục (spec §4/§8) onto
   * the Cấp 1 kế hoạch row of a BUY fill (that row must already exist — always
   * post `/cap1/kehoach` first, plus Cấp 2/3/4/6/7's, since all of them extend
   * the SAME `order_kehoach` row).
   *
   * ★ The server RE-DERIVES every measure from the real portfolio and stores its
   * own values; only `hanh_vi_canh_bao` is the client's to report. It is
   * cross-checked against what actually fired and the contradiction is rejected
   * with 400 rather than normalised — see `hanhViCanhBaoToSend`.
   *
   * ★★ **409 = WRITE-ONCE, not a transient failure** (backend `4b01918`). Once
   * `hanh_vi_canh_bao` is recorded the block is frozen: an **identical** re-post
   * returns the stored row untouched (a retried network call must not 409, and
   * must not re-price the snapshot against a newer portfolio either), and a
   * *different* `hanh_vi_canh_bao` raises `ConflictError` → HTTP 409. Its `detail`
   * already reads "Lệnh này đã ghi bước Kiểm tra danh mục rồi — ảnh chụp danh mục
   * LÚC MUA không sửa lại được…", which is exactly the sentence a user needs; it
   * must never be replaced by a generic error.
   *
   * ★ A 400/409 here is NON-FATAL for the caller: this call runs AFTER the buy has
   * already filled, so it must never surface as an error over a completed order
   * and must never abort the order-filled event chain.
   */
  recordKehoach: async (input: KehoachInputCap8): Promise<OrderKehoachCap8> => {
    const res = await api.post("cap8/kehoach", { json: input }).json<unknown>()
    return unwrap(res as never) as OrderKehoachCap8
  },

  /** GET /cap8/thach-thuc — 3 điều kiện của nhiệm vụ ③ + khối ⑱'s data. */
  getThachThuc: async (): Promise<ThachThucCap8> => {
    const res = await api.get("cap8/thach-thuc").json<unknown>()
    return unwrap(res as never) as ThachThucCap8
  },

  /**
   * POST /cap8/graduate — only succeeds when 3/3 nhiệm vụ are done.
   * ★ This is the LAST level of the program: there is no next level to enter.
   */
  graduate: async (): Promise<Cap8Progress> => {
    const res = await api.post("cap8/graduate").json<unknown>()
    return unwrap(res as never) as Cap8Progress
  },
}
