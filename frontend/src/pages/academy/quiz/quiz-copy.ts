/** Copy and small pure rules of the quiz screens (content design §5, chapter specs §8-9). */
import { LESSON_REWARD_XU, QUIZ_QUESTION_COUNT, type AcademyLesson, type AcademySubmitResult } from "../api"

export const QUIZ_START_LABEL = `Làm bài kiểm tra · ${QUIZ_QUESTION_COUNT} câu`
export const QUIZ_RESUME_LABEL = "Tiếp tục bài kiểm tra"
export const RETAKE_CONFIRM = "Bắt đầu một lượt kiểm tra mới? Tiến độ, quyền và xu đã nhận được giữ nguyên."
export const REPASS_NOTE = "Bài đã hoàn thành. Làm lại không nhận thêm xu."

/** Option letters follow the order of the attempt the learner saw, never the order of the source. */
export const optionLetter = (index: number) => String.fromCharCode(65 + index)

export function resultHeadline(passed: boolean, chapter: number): string {
  if (passed) return "Đã hoàn thành bài kiểm tra"
  return chapter === 3 ? "Xem lại phần cần củng cố" : "Còn nội dung cần ôn lại"
}

/** The sentence under the score: what a pass opened (grants are not switches), or what is kept after a miss. */
export function resultNote(result: AcademySubmitResult, lesson: Pick<AcademyLesson, "kind" | "name">): string {
  if (result.passed) {
    if (lesson.kind === "concept") return "Đã ghi nhận tiến độ bài Hợp lưu."
    if (lesson.kind === "fundamental") return `Đã mở chỉ tiêu ${lesson.name} trong Bộ lọc.`
    return "Đã mở chỉ báo trong Bot, Backtest và Cảnh báo. Các điều kiện chưa tự bật."
  }
  return result.completion.completed
    ? "Quyền đã mở từ lần đạt trước vẫn được giữ."
    : "Đọc giải thích và xem lại phần liên quan trước khi làm lại."
}

export type RewardView =
  /** The ledger confirmed the coins of this first completion. */
  | { kind: "credited"; delta: number }
  /** Completion is saved, the coin ledger has not confirmed yet. */
  | { kind: "pending" }
  /** Completion created now, coins had already been granted for this lesson. */
  | { kind: "received" }
  /** Already completed earlier: a new attempt earns nothing more. */
  | { kind: "repass" }

/** Only the server's reward outcome counts; nothing is inferred from the score. */
export function rewardView(result: AcademySubmitResult): RewardView | null {
  if (result.completion.newly_completed) {
    const reward = result.reward
    if (reward?.status === "credited") return { kind: "credited", delta: reward.delta }
    if (reward?.status === "unavailable") return { kind: "pending" }
    if (reward?.status === "already_rewarded") return { kind: "received" }
    return null
  }
  return result.completion.completed ? { kind: "repass" } : null
}

export const creditedText = (delta: number) => `Hoàn thành bài học · +${delta} xu`
export const PENDING_COINS_TEXT = "Đang cập nhật xu"
export const RECEIVED_TEXT = `Đã nhận ${LESSON_REWARD_XU} xu`

/** Passed technical lessons lead to the Bot, passed fundamental lessons to the Bộ lọc; nothing else gets either button. */
export function nextToolFor(lesson: Pick<AcademyLesson, "kind">, completed: boolean): "bot" | "filter" | null {
  if (!completed) return null
  if (lesson.kind === "technical") return "bot"
  if (lesson.kind === "fundamental") return "filter"
  return null
}
