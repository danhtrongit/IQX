import { useMemo, type ReactNode } from "react"

import type { LessonContent } from "../content-types"
import { hasNotes, LessonInteractiveContext, notesKeysOf, useLessonNotes } from "./use-lesson-notes"

/**
 * Gives the interactive blocks of one lesson (scenario, checklist, workpad, calculator, practice
 * case, roleplay score) the lesson and its account notes. Notes are read only for lessons that
 * have a notes block; the other lessons never call the notes endpoint.
 */
export function LessonInteractiveProvider({ lesson, children }: { lesson: LessonContent; children: ReactNode }) {
  const keys = useMemo(() => notesKeysOf(lesson), [lesson])
  const notes = useLessonNotes(lesson.id, hasNotes(lesson), keys)
  return <LessonInteractiveContext.Provider value={{ lesson, notes }}>{children}</LessonInteractiveContext.Provider>
}
