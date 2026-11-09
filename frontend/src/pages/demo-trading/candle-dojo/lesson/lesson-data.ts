import type { CdLessonExercises } from "@/lib/candle-dojo/grading"

/**
 * Bộ bài tập của 27 bài (`exercises.json`, hơn 400 KB) chỉ tải khi người học mở một bài, để màn Dojo không
 * phải gánh dữ liệu này. Sau lần tải đầu, dữ liệu nằm trong bộ nhớ và các lần mở sau đọc đồng bộ.
 */
export type LessonBank = Readonly<Record<string, CdLessonExercises>>

let bank: LessonBank | null = null
let pending: Promise<LessonBank> | null = null

export function loadLessonBank(): Promise<LessonBank> {
  if (bank) return Promise.resolve(bank)
  pending ??= import("@/lib/candle-dojo/content/exercises.json")
    .then((module) => {
      bank = (module.default as unknown as { lessons: LessonBank }).lessons
      return bank
    })
    .catch((error: unknown) => {
      pending = null
      throw error
    })
  return pending
}

/** Bộ bài tập nếu đã tải xong, ngược lại null. */
export function peekLessonBank(): LessonBank | null {
  return bank
}
