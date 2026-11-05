/** Biểu đồ Flashback dùng IQLine trừ khi bị tắt bằng `VITE_IQLINE_OFF` hoặc `?iqline=0`. Không đọc URL ở nơi nào khác trong Flashback. */
import { iqlineEnabled } from "@/pages/charts/chart/iqline-flag"

/** `search` mặc định là chuỗi truy vấn của trang hiện tại (rỗng khi chưa có `window`, ví dụ lúc dựng sẵn trang). */
export function iqlineFlashbackEnabled(search: string = typeof window === "undefined" ? "" : window.location.search): boolean {
  return iqlineEnabled("flashback", new URLSearchParams(search))
}
