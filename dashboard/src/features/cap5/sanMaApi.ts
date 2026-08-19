import { api, unwrap } from "@/shared/http/client"
import type { HuntFilterKey, HuntResult, SanMaIndex } from "./sanMaTypes"
import type { Cap5WatchlistItem } from "./watchlistTypes"

/**
 * Cấp 5 «Lão luyện» — API màn Săn mã + Watchlist săn mã.
 *
 * ★ File RIÊNG (không nhét vào `cap5/api.ts`) vì `api.ts` đang được viết lại
 * song song cho phần Kết sổ/Hành trình — tách ra để hai luồng không giẫm nhau.
 *
 * ★ Đường dẫn/tên trường là GIẢ ĐỊNH (BE làm song song) — xem docstring
 * `sanMaTypes.ts`. Đây là NƠI DUY NHẤT phải sửa nếu BE chốt khác.
 */
export const sanMaApi = {
  /** GET /cap5/san-ma — điều kiện lọc sàn + tình trạng khả dụng của 5 bộ lọc. */
  getIndex: async (): Promise<SanMaIndex> => {
    const res = await api.get("cap5/san-ma").json<unknown>()
    return unwrap(res as never) as SanMaIndex
  },

  /** GET /cap5/san-ma/{ma} — top 10 mã của một bộ lọc + dòng minh bạch. */
  getResult: async (ma: HuntFilterKey): Promise<HuntResult> => {
    const res = await api.get(`cap5/san-ma/${ma}`).json<unknown>()
    return unwrap(res as never) as HuntResult
  },

  /** GET /cap5/watchlist — watchlist săn mã KÈM điểm đồng thuận 5 lớp. */
  getWatchlist: async (): Promise<Cap5WatchlistItem[]> => {
    const res = await api.get("cap5/watchlist").json<unknown>()
    const data = unwrap(res as never) as Cap5WatchlistItem[] | { items: Cap5WatchlistItem[] } | null
    if (data == null) return []
    return Array.isArray(data) ? data : (data.items ?? [])
  },

  /** POST /cap5/watchlist — thêm mã KÈM nguồn săn (spec §10 `hunt_filter`). */
  addToWatchlist: async (input: {
    symbol: string
    hunt_filter: HuntFilterKey
    hunt_signal: string | null
  }): Promise<Cap5WatchlistItem> => {
    const res = await api.post("cap5/watchlist", { json: input }).json<unknown>()
    return unwrap(res as never) as Cap5WatchlistItem
  },

  /** DELETE /cap5/watchlist/{symbol}. */
  removeFromWatchlist: async (symbol: string): Promise<void> => {
    await api.delete(`cap5/watchlist/${symbol}`)
  },
}

/** Query keys của riêng phần săn mã (dưới cùng gốc `["cap5"]`). */
export const sanMaKeys = {
  index: () => ["cap5", "san-ma"] as const,
  result: (ma: HuntFilterKey) => ["cap5", "san-ma", ma] as const,
  watchlist: () => ["cap5", "watchlist"] as const,
} as const
