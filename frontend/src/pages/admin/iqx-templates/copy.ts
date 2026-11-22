/** Copy of Quản trị › Mẫu IQX (spec Tab IQX §5), shared by the list, the dialogs and the compose page. */
import type { IqxKind } from "@/pages/strategy/shared/iqx"

import type { IqxHistoryEntry } from "./api"

export const IQX_KIND_LABEL: Record<IqxKind, string> = { filter: "Bộ lọc IQX", strategy: "Chiến lược IQX" }

export const HIDE_BODY =
  "Mục này biến mất khỏi tab IQX của người dùng. Bộ lọc, bản nháp và cấu hình Bot người dùng đã tạo từ mục này không bị ảnh hưởng."
/** Ẩn a Chiến lược IQX (spec Bot và Chiến lược v2.0 §7.2). */
export const HIDE_STRATEGY_BODY =
  'Mục này biến mất khỏi tab IQX của Backtest và danh sách chọn của Bot. Bot đang chạy chiến lược này vẫn chạy tiếp phiên bản đã chọn, có nhãn "IQX đã ngừng cung cấp"; người dùng không chọn mới được.'
/** Always added to the publish dialog of a Chiến lược IQX (§7.2). */
export const PUBLISH_STRATEGY_BOT = "Bot của người dùng đang dùng phiên bản cũ không đổi theo; người dùng thấy thông báo có bản mới ở Lịch phiên."
export const SHOW_BODY = "Hiện lại với phiên bản hiện hành."

export const CONFLICT_MESSAGE = "Mục này vừa được người khác thay đổi. Tải lại để xem bản mới nhất."
export const DRAFT_SAVED_TOAST = "Đã lưu nháp. Người dùng chưa thấy thay đổi."
export const PUBLISH_ALWAYS = "Bộ lọc, bản nháp và cấu hình Bot người dùng đã tạo từ phiên bản cũ không đổi theo."
export const PUBLISH_BODY = {
  shown: "Người dùng thấy phiên bản mới ngay trong tab IQX.",
  hidden: "Mục đang ẩn: phiên bản mới được lưu, người dùng chỉ thấy khi bạn bấm Hiện.",
  new: "Mục mới hiện ngay trong tab IQX, ở cuối danh sách.",
} as const

export function iqxListPath(kind: IqxKind) {
  return `/admin/iqx-templates?tab=${kind}`
}

/** Lịch sử (§5.5): label of one action. */
export function historyActionLabel(entry: Pick<IqxHistoryEntry, "action" | "version">): string {
  switch (entry.action) {
    case "create":
      return "Tạo mục"
    case "draft_save":
      return "Lưu nháp"
    case "publish":
      return `Xuất bản v${entry.version ?? ""}`
    case "hide":
      return "Ẩn"
    case "show":
      return "Hiện"
    case "reorder":
      return "Đổi thứ tự"
    case "delete_draft":
      return "Xóa nháp"
    case "restore":
      return `Khôi phục v${entry.version ?? ""} làm bản nháp`
  }
}
