import { useCallback, useEffect, useState } from "react"

import { loadLessonBank, peekLessonBank } from "./lesson-data"
import { resolveLessonContent, type LessonContent } from "./lesson-model"

export type LessonContentState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "missing" }
  | { status: "ready"; content: LessonContent }

/** Nội dung một bài (thẻ, câu chuyện, bài tập). Đã tải sẵn thì có ngay ở lần vẽ đầu. */
export function useLessonContent(lessonId: string): LessonContentState {
  const [bank, setBank] = useState(peekLessonBank)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (bank) return
    let cancelled = false
    loadLessonBank().then(
      (loaded) => {
        if (!cancelled) setBank(loaded)
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [bank, attempt])

  const retry = useCallback(() => {
    setFailed(false)
    setAttempt((value) => value + 1)
  }, [])

  if (!bank) return failed ? { status: "error", retry } : { status: "loading" }
  const content = resolveLessonContent(lessonId, bank)
  return content ? { status: "ready", content } : { status: "missing" }
}
