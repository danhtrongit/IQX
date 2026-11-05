/**
 * Công tắc bật IQLine cho biểu đồ Flashback (docs/iqline-design.md GĐ 5). Mặc định vẫn là biểu đồ SVG cũ; chỉ khi URL có
 * `?iqline=1` mới dùng IQLine. Dùng chung công tắc của `/bieu-do` (`iqlineMarketEnabled`) để Giai đoạn 7 (đổi mặc định, cờ
 * quay lại bản cũ) chỉ sửa một hàm. Không đọc URL ở nơi nào khác trong Flashback.
 */
import { iqlineMarketEnabled } from "@/pages/charts/chart/iqline-flag"

/** `search` mặc định là chuỗi truy vấn của trang hiện tại (rỗng khi chưa có `window`, ví dụ lúc dựng sẵn trang). */
export function iqlineFlashbackEnabled(search: string = typeof window === "undefined" ? "" : window.location.search): boolean {
  return iqlineMarketEnabled(new URLSearchParams(search))
}
