/**
 * Starting the quiz of a lesson, the practice room or a chapter exam. Pure async logic, kept apart from the screens so the rules are
 * easy to read and to test:
 *
 * - `start`  resume the latest open attempt (with its saved draft) if the server has one, otherwise
 *            start a new attempt;
 * - `retake` always start a new attempt (new idempotency key).
 *
 * There is no review: results are score-only and a submitted attempt is never re-read.
 *
 * The idempotency key of a started attempt is the only thing kept in `sessionStorage` (so a double
 * click or a retry replays the same attempt); the questions, their order and the ticked answers all
 * come from the server.
 */
import type { QueryClient } from "@tanstack/react-query"

import {
  createAttempt,
  newRequestId,
  resumeAttempt,
  submitAttempt,
  type AttemptResponse,
  type DraftState,
  type SubmitResult,
} from "../api"
import { academyKeys, invalidateAfterSubmit } from "../queries"
import { loadAttemptKey, markAttemptDone, saveAttemptKey } from "../view-state"

export type QuizIntent = { kind: "start" } | { kind: "retake" }

export type BootResult =
  | { kind: "taking"; attempt: AttemptResponse; draft: DraftState | null; resumed: boolean }
  | { kind: "result"; result: SubmitResult }

/** Key of this run: a start reuses the pending key of the lesson, a retake or a first start gets a fresh one. */
export function pickAttemptKey(userId: string | undefined, catalogVersion: string, lessonId: string, intent: QuizIntent): string {
  if (intent.kind === "start") {
    const stored = loadAttemptKey(userId, catalogVersion, lessonId)
    if (stored && !stored.done) return stored.key
  }
  return newRequestId()
}

export async function bootQuiz({
  queryClient,
  userId,
  lessonId,
  catalogVersion,
  intent,
  key,
  signal,
}: {
  queryClient: QueryClient
  userId: string | undefined
  lessonId: string
  catalogVersion: string
  intent: QuizIntent
  key: string
  signal?: AbortSignal
}): Promise<BootResult> {
  if (intent.kind === "start") {
    const resume = await queryClient.fetchQuery({
      queryKey: academyKeys.resume(userId, lessonId),
      queryFn: ({ signal: querySignal }) => resumeAttempt(lessonId, querySignal ?? signal),
      staleTime: 0,
    })
    if (resume.attempt) return { kind: "taking", attempt: resume.attempt, draft: resume.attempt.draft, resumed: true }
  }
  saveAttemptKey(userId, catalogVersion, lessonId, { key, done: false })
  const created = await createAttempt({ lesson_id: lessonId, catalog_version: catalogVersion, idempotency_key: key }, signal)
  if (created.status === "submitted") {
    // The key replays an attempt that was already graded (a lost response): a submit replay returns its stored result.
    const result = await submitAttempt(created.attempt_id, [], key, signal)
    markAttemptDone(userId, catalogVersion, lessonId)
    invalidateAfterSubmit(queryClient, userId, lessonId, result)
    return { kind: "result", result }
  }
  return { kind: "taking", attempt: created, draft: null, resumed: false }
}
