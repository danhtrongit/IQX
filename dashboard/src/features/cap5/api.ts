import { api, unwrap } from "@/shared/http/client"
import type { Cap5Progress } from "./types"

/**
 * Cấp 5 «Lão luyện» API — BE endpoints under `/cap5/*` (FREE, auth-only, same
 * as Cấp 1-4). Payloads are returned un-enveloped; `unwrap` is applied
 * defensively (a no-op for these shapes), matching `cap4/api.ts`.
 *
 * ★★ ĐÃ GỠ cùng Cấp 5 cũ: `GET /cap5/verdict/{id}` · `POST /cap5/ketso` ·
 * `POST|GET /cap5/dung-ngoai` · `POST /cap5/dung-ngoai/cham` ·
 * `GET /cap5/thach-thuc`. Cấp 5 mới không có bước phân loại 4 ô, không có nhật
 * ký đứng ngoài, và 2 nhiệm vụ đều được server suy ra từ `watchlist` +
 * `order_kehoach.from_watchlist` nên chỉ còn 4 endpoint.
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

  /** PATCH /cap5/task { task_no } — idempotent recompute (cả 2 nhiệm vụ đều
   *  được suy ra server-side từ watchlist + lệnh mua). */
  markTask: async (taskNo: number): Promise<Cap5Progress> => {
    const res = await api.patch("cap5/task", { json: { task_no: taskNo } }).json<unknown>()
    return unwrap(res as never) as Cap5Progress
  },

  /** POST /cap5/graduate — only succeeds when 2/2 nhiệm vụ are done. */
  graduate: async (): Promise<Cap5Progress> => {
    const res = await api.post("cap5/graduate").json<unknown>()
    return unwrap(res as never) as Cap5Progress
  },
}
