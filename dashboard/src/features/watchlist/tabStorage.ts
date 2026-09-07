/**
 * Tab đang hiện của panel "Danh mục" (`WatchlistPanel`), nhớ qua localStorage.
 *
 * Tách khỏi `WatchlistPanel.tsx` để nơi khác có thể CHỌN TRƯỚC tab mà panel sẽ
 * mở lên ở lần mount kế tiếp mà không phải import component (và cả cây
 * `@/features/watchlist` sau nó). Người dùng hiện tại: Cấp 0 `JourneyPanel` —
 * nhiệm vụ ② «Xem tab Nắm giữ» / ③ «Xem tab Theo dõi» hoàn thành bằng chính
 * việc tab đó hiện lên, nên nút "Làm ngay →" phải đưa user tới ĐÚNG tab. Trước
 * đây nó chỉ mở panel và panel tự khôi phục tab nhớ lần trước (mặc định Theo
 * dõi): "Làm ngay" trên ② mở ra Theo dõi, tick nhầm ③, còn ② thì kẹt — user
 * bán xong, 3/4 + cổng, màn tốt nghiệp không bao giờ mở.
 *
 * `RightSidebar` chỉ render MỘT panel một lúc, nên khi `JourneyPanel` gọi
 * `writeWatchlistTab` thì `WatchlistPanel` chưa mount; nó sẽ đọc giá trị này
 * trong `useState(readWatchlistTab)` ngay khi được chuyển tới.
 */
export const WATCHLIST_TAB_STORAGE_KEY = "iqx.watchlist.activeTab"

export type WatchlistTab = "watchlist" | "holdings" | "history"

export function readWatchlistTab(): WatchlistTab {
  if (typeof window === "undefined") return "watchlist"
  const stored = window.localStorage.getItem(WATCHLIST_TAB_STORAGE_KEY)
  return stored === "holdings" || stored === "history" ? stored : "watchlist"
}

export function writeWatchlistTab(tab: WatchlistTab): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(WATCHLIST_TAB_STORAGE_KEY, tab)
}
