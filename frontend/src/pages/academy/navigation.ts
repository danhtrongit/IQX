import { useCallback } from "react"
import { useNavigate, useSearchParams } from "react-router"

import { withDemoContent } from "@/pages/demo-trading/content-tabs-state"
import { ACADEMY_VIEW, LESSON_PARAM, VIEW_PARAM } from "@/pages/demo-trading/workspace-url"

/** Lesson ids are `chNN-lMM`; anything else in the URL is ignored (no lesson open). */
const LESSON_ID = /^ch\d{2}-l\d{2}$/

export function parseLessonParam(value: string | null): string | null {
  return value && LESSON_ID.test(value) ? value : null
}

/**
 * The open lesson lives in the URL (`?view=academy&lesson=ch01-l01`): a reload or a direct link
 * (for example from a locked Bot indicator) restores it, and the panel and the reader read the
 * same value. Navigation only rewrites the parameters of this tool and keeps the rest (symbol...).
 */
export function useAcademyNavigation() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const lessonId = parseLessonParam(params.get(LESSON_PARAM))

  const openLesson = useCallback(
    (id: string) => {
      const next = withDemoContent(params, "overview")
      next.set(VIEW_PARAM, ACADEMY_VIEW)
      next.set(LESSON_PARAM, id)
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  /** "Về linh thú": close the reader, keep everything else. */
  const closeLesson = useCallback(() => {
    const next = new URLSearchParams(params)
    next.delete(LESSON_PARAM)
    setParams(next, { replace: true })
  }, [params, setParams])

  /** "Về Bot": the Bot tool of the same workspace (only the tool changes). */
  const openBot = useCallback(() => {
    const next = new URLSearchParams(params)
    next.set(VIEW_PARAM, "bot")
    setParams(next, { replace: true })
  }, [params, setParams])

  /** "Mở Bộ lọc": Chiến lược → Bộ lọc, without parameters and without applying anything. */
  const openFilter = useCallback(() => navigate("/chien-luoc?tab=bo-loc"), [navigate])

  return { lessonId, openLesson, closeLesson, openBot, openFilter }
}
