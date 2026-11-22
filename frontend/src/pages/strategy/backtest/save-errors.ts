/** Sentences of the save / delete errors of tab Chỉ báo (spec v2.0 §4.3–§4.6). */
import { errorMessage, isApiError } from "../shared/errors"
import { STRATEGY_LIMIT } from "./api"
import { lockedNextSession, sessionLabel, type BotSchedule } from "../shared/bot-schedule"

export const NOT_RAN = "Bản nháp đã sửa sau lần chạy (hoặc chưa chạy). Bấm Chạy trước khi Lưu."
export const IN_USE_TEXT = "Đang dùng trên Bot. Đổi chiến lược của Bot trước khi xóa."
export const LIMIT_TEXT = `Đã đủ ${STRATEGY_LIMIT} chiến lược. Xóa bớt trước khi tạo mới.`
const NAME_TAKEN = "Tên này đã có trong chiến lược của bạn."
const VERSION_CONFLICT = "Chiến lược vừa được lưu ở nơi khác. Tải lại để xem bản mới nhất."

/** Every save error as the sentence the form shows. */
export function saveErrorText(error: unknown, schedule: BotSchedule | undefined): string {
  if (isApiError(error, 409, "STRATEGY_NAME_TAKEN")) return NAME_TAKEN
  if (isApiError(error, 409, "STRATEGY_LIMIT")) return LIMIT_TEXT
  if (isApiError(error, 409, "STRATEGY_VERSION_CONFLICT")) return VERSION_CONFLICT
  if (isApiError(error, 422, "RUN_REQUIRED")) return NOT_RAN
  if (isApiError(error, 422, "UNIVERSE_EMPTY")) return "Danh mục này không có mã nào thuộc VN100."
  if (isApiError(error, 409, "IQX_TEMPLATE_HIDDEN")) return "Chiến lược IQX này đã ngừng cung cấp, không chọn mới được."
  const locked = lockedNextSession(error)
  if (isApiError(error, 409, "SCHEDULE_SESSION_LOCKED")) {
    return `Phiên ${sessionLabel(schedule?.next.session_date)} vừa chốt. Thay đổi áp dụng từ phiên ${locked ? sessionLabel(locked) : "kế tiếp"}.`
  }
  return errorMessage(error)
}
