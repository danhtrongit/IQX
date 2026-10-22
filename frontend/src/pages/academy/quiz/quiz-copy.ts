/** Copy and small pure rules of the quiz screens (spec v3.3 §2.1, §3.2, §3.3). */
import type { CatalogItem, LessonContent, SubmitResult, UnlockKind } from "../content-types"

export const QUIZ_START_LABEL = "Làm bài kiểm tra"
export const EXAM_START_LABEL = "Bắt đầu làm bài"
export const SCENARIO_GATE_LABEL = "Chọn cách xử lý ở phần Tình huống để làm bài kiểm tra"
export const DONE_LABEL = "Đã hoàn thành"
export const EXAM_RULE = "Cần trả lời đúng tất cả câu hỏi để hoàn thành."
export const NEXT_QUESTION_LABEL = "Câu tiếp theo"
export const SUBMIT_LABEL = "Nộp bài"

/**
 * The label above every question (spec §3.2-1): "Bài thi Chương c" for an exam, otherwise "Bài kiểm tra", the
 * practice room included (its name belongs in the locator, §2.4).
 */
export function quizLabel(item: Pick<CatalogItem, "kind" | "chapter">): string {
  return item.kind === "chapter_exam" ? `Bài thi Chương ${item.chapter}` : "Bài kiểm tra"
}

/** "Xem lại bài", or "Xem lại Chương c" for an exam (it leads to the first item of the chapter). */
export function reviewLabel(item: Pick<CatalogItem, "kind" | "chapter">): string {
  return item.kind === "chapter_exam" ? `Xem lại Chương ${item.chapter}` : "Xem lại bài"
}

/**
 * The pill of an opened capability: a technical lesson opens a chỉ báo (Bot, Backtest, Cảnh báo),
 * a fundamental lesson opens a chỉ tiêu (Bộ lọc). The label comes from the server, the kind from
 * the item's `unlock`.
 */
export const unlockedPill = (kind: UnlockKind, label: string) =>
  kind === "fundamental" ? `Đã mở chỉ tiêu ${label}` : `Đã mở chỉ báo ${label}`
export const chapterPill = (chapter: number) => `Đã hoàn thành Chương ${chapter}`

/** The coin toast of a first pass: only when the ledger confirmed the credit (never for exams). */
export function creditedToast(result: Pick<SubmitResult, "reward">): string | null {
  return result.reward?.status === "credited" ? `Hoàn thành bài học · +${result.reward.delta} xu` : null
}

export type GateState = "passed" | "scenario" | "ready"

/** Passed beats everything; a chapter 2-3 lesson without a stored scenario choice stays gated. */
export function gateState(lesson: Pick<LessonContent, "state" | "has_scenario" | "scenario_choice">): GateState {
  if (lesson.state === "passed") return "passed"
  if (lesson.has_scenario && !lesson.scenario_choice) return "scenario"
  return "ready"
}
