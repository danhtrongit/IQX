/**
 * Starting the quiz of a lesson. Pure async logic, kept apart from the screens so the rules are
 * easy to read and to test:
 *
 * - `start`  resume the latest open attempt (with its saved draft) if the server has one, otherwise
 *            start a new attempt;
 * - `retake` always start a new attempt (new idempotency key);
 * - `review` read the committed review of a submitted attempt (history).
 *
 * The idempotency key of a started attempt is the only thing kept in `sessionStorage` (so a double
 * click or a retry replays the same attempt); the questions, their order and the ticked answers all
 * come from the server.
 */
import type { QueryClient } from "@tanstack/react-query"

import {
  createAttempt,
  fetchAttemptReview,
  newRequestId,
  resumeAttempt,
  type AcademyAttempt,
  type AcademySubmitResult,
  type DraftState,
} from "../api"
import { academyKeys, invalidateAfterSubmit } from "../queries"
import { loadAttemptKey, markAttemptDone, saveAttemptKey } from "../view-state"

export type QuizIntent = { kind: "start" } | { kind: "retake" } | { kind: "review"; attemptId: string }

export type BootResult =
  | { kind: "taking"; attempt: AcademyAttempt; draft: DraftState | null; resumed: boolean }
  | { kind: "result"; result: AcademySubmitResult }

/** Key of this run: a start reuses the pending key of the lesson, a retake or a first start gets a fresh one. */
export function pickAttemptKey(userId: string | undefined, lessonId: string, intent: QuizIntent): string {
  if (intent.kind === "start") {
    const stored = loadAttemptKey(userId, lessonId)
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
  if (intent.kind === "review") {
    return { kind: "result", result: await fetchAttemptReview(intent.attemptId, signal) }
  }
  if (intent.kind === "start") {
    const resume = await queryClient.fetchQuery({
      queryKey: academyKeys.resume(userId, lessonId),
      queryFn: ({ signal: querySignal }) => resumeAttempt(lessonId, querySignal ?? signal),
      staleTime: 0,
    })
    if (resume.attempt) return { kind: "taking", attempt: resume.attempt, draft: resume.attempt.draft, resumed: true }
  }
  saveAttemptKey(userId, lessonId, { key, done: false })
  const created = await createAttempt({ lesson_id: lessonId, catalog_version: catalogVersion, idempotency_key: key }, signal)
  if (created.status === "submitted") {
    // The key replays an attempt that was already graded (a lost response): its committed result is the answer.
    const result = await fetchAttemptReview(created.attempt_id, signal)
    markAttemptDone(userId, lessonId)
    invalidateAfterSubmit(queryClient, result.completion.completed)
    return { kind: "result", result }
  }
  return { kind: "taking", attempt: created, draft: null, resumed: false }
}
