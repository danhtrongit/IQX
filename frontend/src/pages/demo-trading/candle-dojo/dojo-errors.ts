/** Lỗi của thi đai và nhập môn, đổi thành lời nói rõ việc cần làm tiếp (spec v1.2 §5.3; mã lỗi của backend). */
import { ApiError } from "@/lib/api"

export type DojoFailure = {
  code: string | null
  message: string
  /** Lượt thi hiện tại không dùng tiếp được: phải mở lượt thi mới thay vì gửi lại. */
  restart: boolean
  /** Không có gì để thử lại (ví dụ chưa học đủ bài): chỉ còn đường về Dojo. */
  blocked: boolean
}

const NETWORK = "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại."
const SERVER = "Máy chủ đang bận. Thử lại sau ít phút."

const RESTART: Record<string, string> = {
  EXAM_CLOSED: "Lượt thi này đã kết thúc. Hãy mở lượt thi mới.",
  EXAM_NOT_FOUND: "Không tìm thấy lượt thi này. Hãy mở lượt thi mới.",
  EXAM_ALREADY_ANSWERED: "Câu này đã được ghi nhận rồi. Hãy mở lượt thi mới để thi lại.",
  EXAM_QUESTION_INVALID: "Câu hỏi này không còn trong lượt thi. Hãy mở lượt thi mới.",
  EXAM_OPTION_INVALID: "Lựa chọn này không thuộc câu hỏi. Hãy mở lượt thi mới.",
}

/** Lý do bắt đầu (`start`) hoặc trả lời một câu (`answer`) của bài thi đai thất bại. */
export function describeExamError(error: unknown, step: "start" | "answer"): DojoFailure {
  if (error instanceof ApiError) {
    const code = error.code ?? null
    if (code === "EXAM_LOCKED") {
      return { code, message: "Học xong mọi bài của Dojo này để mở bài thi đai.", restart: false, blocked: true }
    }
    if (step === "start" && code === "EXAM_NOT_FOUND") {
      return { code, message: "Không có đề thi này.", restart: false, blocked: true }
    }
    if (code && RESTART[code]) return { code, message: RESTART[code], restart: true, blocked: false }
    if (error.status >= 500) return { code, message: SERVER, restart: false, blocked: false }
    return { code, message: error.message || NETWORK, restart: false, blocked: false }
  }
  return { code: null, message: NETWORK, restart: false, blocked: false }
}

/** Lý do lưu bài nhập môn thất bại (gọi lại được: server nhận lần đầu một lần duy nhất). */
export function describeIntroError(error: unknown): string {
  if (error instanceof ApiError) return error.status >= 500 ? SERVER : error.message || NETWORK
  return NETWORK
}
