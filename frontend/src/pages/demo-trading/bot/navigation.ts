import { useCallback } from "react"
import { useSearchParams } from "react-router"

/** Chapter titles of the technical indicator lessons (Học viện v3.2 chapters 4, 7 and 8). */
export const CHAPTER_TITLES: Readonly<Record<number, string>> = {
  4: "Phương pháp kỹ thuật",
  7: "Chỉ báo xu hướng",
  8: "Chỉ báo động lượng và dòng tiền",
}

export function chapterTitle(chapter: number): string {
  return CHAPTER_TITLES[chapter] ?? `Chương ${chapter}`
}

/** `?view=bot&practice=<indicator>`; every other parameter is kept. */
export function practiceParams(current: URLSearchParams, indicatorId: string): URLSearchParams {
  const next = new URLSearchParams(current)
  next.set("view", "bot")
  next.set("practice", indicatorId)
  return next
}

/** `?view=academy&lesson=<lesson>`: the Học viện tool on that lesson; other parameters are kept. */
export function lessonParams(current: URLSearchParams, lessonId: string): URLSearchParams {
  const next = new URLSearchParams(current)
  next.set("view", "academy")
  next.set("lesson", lessonId)
  next.delete("practice")
  return next
}

/** Navigation out of the Bot tool, through the URL search params only. */
export function useBotNavigation() {
  const [params, setParams] = useSearchParams()
  const openPractice = useCallback((indicatorId: string) => setParams(practiceParams(params, indicatorId)), [params, setParams])
  const lessonSearch = useCallback((lessonId: string) => `?${lessonParams(params, lessonId)}`, [params])
  return { openPractice, lessonSearch }
}
