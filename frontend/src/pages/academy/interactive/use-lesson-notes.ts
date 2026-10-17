/**
 * Workpads, checklists and roleplay scores of one item, saved to the account
 * (`GET/PUT /academy/lessons/{id}/notes`). The server copy is the source of truth; local edits are
 * merged on top by key, sent after 800 ms of quiet with the revision the client last saw, and
 * mirrored in `sessionStorage` until the server accepts them (a reload keeps unsent work).
 *
 * A 409 NOTES_REVISION_CONFLICT (another tab or device saved first) adopts the stored notes from
 * `details[0].notes` and re-applies only the keys edited here, then saves again. Notes never touch
 * progress, completion or coins.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { conflictNotes, saveNotes, type LessonContent, type NotesResponse, type NotesSaveBody } from "../api"
import { academyKeys, useAcademyNotes } from "../queries"
import { clearNotesDraft, loadNotesDraft, saveNotesDraft, type NotesDraft } from "../view-state"

export const NOTES_DEBOUNCE_MS = 800

export type NotesStatus = "idle" | "saving" | "saved" | "error"
type NotesMap = keyof NotesDraft

const emptyDraft = (): NotesDraft => ({ texts: {}, checks: {}, scores: {} })
const isEmpty = (draft: NotesDraft) =>
  Object.keys(draft.texts).length + Object.keys(draft.checks).length + Object.keys(draft.scores).length === 0

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Keys of `dirty` whose value is still exactly what was sent are settled; newer edits stay dirty. */
function settle(dirty: NotesDraft, sent: NotesDraft): NotesDraft {
  const next = emptyDraft()
  for (const map of ["texts", "checks", "scores"] as const) {
    for (const [key, value] of Object.entries(dirty[map])) {
      if (!(key in sent[map]) || !sameValue(sent[map][key], value)) (next[map] as Record<string, unknown>)[key] = value
    }
  }
  return next
}

export type LessonNotes = ReturnType<typeof useLessonNotes>

export function useLessonNotes(itemId: string, enabled: boolean) {
  const { user } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()
  const query = useAcademyNotes(itemId, enabled)
  const [dirty, setDirty] = useState<NotesDraft>(() => (enabled ? loadNotesDraft(userId, itemId) : null) ?? emptyDraft())
  const [status, setStatus] = useState<NotesStatus>("idle")
  const [lastKey, setLastKey] = useState<string | null>(null)
  const dirtyRef = useRef(dirty)
  const inFlight = useRef(false)
  const again = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const writeDirty = useCallback(
    (next: NotesDraft) => {
      dirtyRef.current = next
      setDirty(next)
      if (isEmpty(next)) clearNotesDraft(userId, itemId)
      else saveNotesDraft(userId, itemId, next)
    },
    [userId, itemId],
  )

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const notesKey = academyKeys.notes(userId, itemId)
    const server = () => queryClient.getQueryData<NotesResponse>(notesKey)
    if (!server() || isEmpty(dirtyRef.current)) return
    if (inFlight.current) {
      again.current = true
      return
    }
    inFlight.current = true
    setStatus("saving")
    let conflictRetried = false
    try {
      for (;;) {
        const sent: NotesDraft = JSON.parse(JSON.stringify(dirtyRef.current)) as NotesDraft
        const body: NotesSaveBody = { expected_revision: server()?.revision ?? 0 }
        if (Object.keys(sent.texts).length) body.texts = sent.texts
        if (Object.keys(sent.checks).length) body.checks = sent.checks
        if (Object.keys(sent.scores).length) body.scores = sent.scores as NonNullable<NotesSaveBody["scores"]>
        try {
          const saved = await saveNotes(itemId, body)
          queryClient.setQueryData(notesKey, saved)
          writeDirty(settle(dirtyRef.current, sent))
          setStatus("saved")
        } catch (error) {
          const stored = conflictNotes(error)
          if (stored && !conflictRetried) {
            // Another tab saved first: adopt its notes, keep the keys edited here, save once more.
            conflictRetried = true
            queryClient.setQueryData(notesKey, stored)
            continue
          }
          setStatus("error")
          return
        }
        if (again.current && !isEmpty(dirtyRef.current)) {
          again.current = false
          continue
        }
        again.current = false
        return
      }
    } finally {
      inFlight.current = false
    }
  }, [itemId, queryClient, userId, writeDirty])

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), NOTES_DEBOUNCE_MS)
  }, [flush])

  const edit = useCallback(
    <M extends NotesMap>(map: M, key: string, value: NotesDraft[M][string]) => {
      const next: NotesDraft = { ...dirtyRef.current, [map]: { ...dirtyRef.current[map], [key]: value } }
      writeDirty(next)
      setLastKey(map === "checks" ? key.split(":")[0] : key)
      setStatus((current) => (current === "error" ? "error" : "idle"))
      schedule()
    },
    [schedule, writeDirty],
  )

  // Unsent edits restored from the session are sent as soon as the server copy is known.
  const ready = query.data !== undefined
  useEffect(() => {
    if (ready && !isEmpty(dirtyRef.current)) schedule()
  }, [ready, schedule])

  // Leaving the lesson sends what is pending right away instead of dropping it.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
        void flush()
      }
    },
    [flush],
  )

  const merged = useMemo(() => {
    const server = query.data
    return {
      texts: { ...server?.texts, ...dirty.texts },
      checks: { ...server?.checks, ...dirty.checks },
      scores: { ...server?.scores, ...dirty.scores },
    }
  }, [query.data, dirty])

  return {
    ...merged,
    loading: query.isPending && enabled,
    loadError: query.isError ? query.error : null,
    reload: () => void query.refetch(),
    status,
    /** The block that was edited last shows the save status (one live line, not one per block). */
    lastKey,
    setText: (id: string, value: string) => edit("texts", id, value),
    setCheck: (key: string, value: boolean) => edit("checks", key, value),
    setScores: (id: string, values: number[]) => edit("scores", id, values),
    retry: () => void flush(),
  }
}

/** What the interactive blocks of the open lesson share: the lesson itself and its account notes. */
export type LessonInteractive = { lesson: LessonContent; notes: LessonNotes }

export const LessonInteractiveContext = createContext<LessonInteractive | null>(null)

export function useLessonInteractive(): LessonInteractive {
  const value = useContext(LessonInteractiveContext)
  if (!value) throw new Error("Interactive lesson blocks must render inside LessonInteractiveProvider")
  return value
}

/** Items whose lesson has a workpad, checklist, practice case or roleplay score keep notes; others have none (404). */
export function hasNotes(lesson: Pick<LessonContent, "sections">): boolean {
  return lesson.sections.some((section) =>
    section.blocks.some((block) => ["workpad", "checklist", "practice_case", "roleplay_score"].includes(block.type)),
  )
}
