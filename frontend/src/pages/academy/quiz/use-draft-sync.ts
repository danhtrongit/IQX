import { useCallback, useRef, useState } from "react"

import { conflictDraft, isAlreadySubmitted, isDraftConflict, resumeAttempt, saveDraftAnswers, type DraftState } from "../api"

export type DraftStatus = "idle" | "saving" | "error"

/**
 * Keeps the ticked answers of an open attempt on the server (`PUT .../answers`, partial and merged),
 * so a reload or another device resumes them. Saves are queued one after another and carry the
 * revision the client last saw. A 409 means another tab saved first: the server draft is adopted
 * (the other answers stay), then this choice is applied on top once. A failed save never blocks the
 * quiz: the answers stay on screen and the submit sends all eight anyway.
 */
export function useDraftSync({
  attemptId,
  lessonId,
  initialRevision,
  onAdopt,
  onAlreadySubmitted,
}: {
  attemptId: string
  lessonId: string
  initialRevision: number
  /** Answers saved elsewhere, in the attempt's question order. */
  onAdopt: (answers: DraftState["answers"]) => void
  onAlreadySubmitted: () => void
}) {
  const revision = useRef(initialRevision)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const [status, setStatus] = useState<DraftStatus>("idle")
  const [adopted, setAdopted] = useState(false)

  const save = useCallback(
    (questionId: string, optionId: string) => {
      const answers = [{ question_id: questionId, option_id: optionId }]
      queue.current = queue.current.then(async () => {
        setStatus("saving")
        try {
          const saved = await saveDraftAnswers(attemptId, { answers, expected_revision: revision.current })
          revision.current = saved.revision
          setStatus("idle")
        } catch (error) {
          if (isAlreadySubmitted(error)) {
            setStatus("idle")
            onAlreadySubmitted()
            return
          }
          if (!isDraftConflict(error)) {
            setStatus("error")
            return
          }
          try {
            // The 409 carries the stored draft in `details[0].draft`; read the resume route only when it does not.
            let latestDraft = conflictDraft(error)
            if (!latestDraft) {
              const latest = await resumeAttempt(lessonId)
              if (latest.attempt?.attempt_id !== attemptId) {
                onAlreadySubmitted()
                return
              }
              latestDraft = latest.attempt.draft
            }
            revision.current = latestDraft.revision
            // Everything saved elsewhere stays; the choice just made wins for its own question.
            onAdopt([...latestDraft.answers.filter((answer) => answer.question_id !== questionId), ...answers])
            setAdopted(true)
            const saved = await saveDraftAnswers(attemptId, { answers, expected_revision: revision.current })
            revision.current = saved.revision
            setStatus("idle")
          } catch {
            setStatus("error")
          }
        }
      })
    },
    [attemptId, lessonId, onAdopt, onAlreadySubmitted],
  )

  return { save, status, adopted, dismissAdopted: () => setAdopted(false) }
}
