import type { InviteResult, PostStatus } from "@/pages/trading-floor/net/types"
import type { Tone } from "@/pages/admin/revenue/display"

/** Kết quả lời mời (chat spec "Nhật ký lời mời"). */
export const INVITE_RESULT: Record<InviteResult, { label: string; tone: Tone }> = {
  accept: { label: "Đồng ý", tone: "success" },
  decline: { label: "Từ chối", tone: "danger" },
  timeout: { label: "Hết 5 giây", tone: "warning" },
  "skip-off": { label: "Bỏ qua · vắng", tone: "neutral" },
  "skip-busy": { label: "Bỏ qua · đang có lời mời khác", tone: "neutral" },
  cancel: { label: "Người dùng huỷ", tone: "neutral" },
  auto: { label: "Tự chuyển theo thứ hạng", tone: "warning" },
}

export const POST_STATUS: Record<PostStatus, { label: string; tone: Tone }> = {
  draft: { label: "Nháp", tone: "neutral" },
  published: { label: "Đã đăng", tone: "success" },
  hidden: { label: "Đã ẩn", tone: "warning" },
  withdrawn: { label: "Đã thu hồi", tone: "neutral" },
}

const POST_LOG_ACTION: Record<string, string> = {
  publish: "Đăng",
  hide: "Ẩn",
  unhide: "Bỏ ẩn",
  edit: "Sửa bài",
  withdraw: "Thu hồi",
  republish: "Đăng lại",
}

const ACTOR_ROLE: Record<string, string> = {
  admin: "Quản trị viên",
  team_lead: "Trưởng nhóm",
  saco: "SACO",
}

export const postLogAction = (action: string) => POST_LOG_ACTION[action] ?? action
export const actorRoleLabel = (role: string) => ACTOR_ROLE[role] ?? role

/** Nút đủ cao để chạm trên điện thoại (từ 44px), gọn lại trên màn hình rộng. */
export const TOUCH_BUTTON = "h-auto min-h-11 px-3 sm:min-h-8 sm:px-2.5 pointer-coarse:min-h-11"
