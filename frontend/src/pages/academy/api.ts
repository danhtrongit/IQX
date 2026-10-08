/**
 * Data layer of the Học viện tool (13 chapters / 71 lessons), authenticated.
 *
 * - `GET  /academy/catalog`                    catalog metadata, never answers
 * - `GET  /academy/progress`                   completed lessons, per-chapter counts, grants
 * - `GET  /academy/lessons/{id}`               typed sections/blocks + chart models
 * - `POST /academy/attempts`                   8 questions in the attempt's own order, no key
 * - `GET  /academy/lessons/{id}/attempt`       resume: the latest open attempt + its saved draft answers
 * - `PUT  /academy/attempts/{id}/answers`      save draft selections (partial, merged, revisioned)
 * - `POST /academy/attempts/{id}/submit`       server grading + review + completion + reward
 * - `GET  /academy/lessons/{id}/attempts`      history of submitted attempts
 * - `GET  /academy/attempts/{id}`              committed review of a submitted attempt
 * - `POST /academy/lessons/{id}/complete`      guide lessons ("Hoàn thành bài học")
 *
 * Correctness, completion, grants and coins are only ever decided by the server;
 * the client never sends a score, a pass flag or a capability.
 */
import { ApiError } from "@/lib/api"
import { requestOperation } from "@/lib/contract-client"
import type { ApiResponseFor } from "@/lib/contract-types"

export type AcademyCatalog = ApiResponseFor<"GET /api/v2/academy/catalog">
export type AcademyProgress = ApiResponseFor<"GET /api/v2/academy/progress">
export type AcademyLesson = ApiResponseFor<"GET /api/v2/academy/lessons/{lessonId}">
export type AcademyAttempt = ApiResponseFor<"POST /api/v2/academy/attempts">
export type AcademySubmitResult = ApiResponseFor<"POST /api/v2/academy/attempts/{attemptId}/submit">
export type AcademyGuideResult = ApiResponseFor<"POST /api/v2/academy/lessons/{lessonId}/complete">

export type AcademyResume = ApiResponseFor<"GET /api/v2/academy/lessons/{lessonId}/attempt">
export type AcademyDraft = ApiResponseFor<"PUT /api/v2/academy/attempts/{attemptId}/answers">
export type AcademyHistory = ApiResponseFor<"GET /api/v2/academy/lessons/{lessonId}/attempts">
export type ResumableAttempt = NonNullable<AcademyResume["attempt"]>
export type DraftState = ResumableAttempt["draft"]

export type CatalogChapter = AcademyCatalog["chapters"][number]
export type CatalogLesson = CatalogChapter["lessons"][number]
export type LessonSection = AcademyLesson["sections"][number]
export type LessonBlock = LessonSection["blocks"][number]
export type ChartModel = AcademyLesson["charts"][string]
export type AttemptQuestion = AcademyAttempt["questions"][number]
export type QuestionFigure = NonNullable<AttemptQuestion["figure"]>
export type ReviewItem = AcademySubmitResult["results"][number]
export type RewardResult = AcademySubmitResult["reward"]

/** A quiz is passed only with every question correct (spec §6.2). */
export const QUIZ_QUESTION_COUNT = 8
/** First-completion reward of one lesson, in learning coins (xu). Display fallback only. */
export const LESSON_REWARD_XU = 100

/** v2 routes may wrap the resource in `{ data }`; accept both shapes. */
function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

export async function fetchCatalog(signal?: AbortSignal): Promise<AcademyCatalog> {
  return unwrap<AcademyCatalog>(await requestOperation("GET /api/v2/academy/catalog", {}, { signal }))
}

export async function fetchProgress(signal?: AbortSignal): Promise<AcademyProgress> {
  return unwrap<AcademyProgress>(await requestOperation("GET /api/v2/academy/progress", {}, { signal }))
}

export async function fetchLesson(lessonId: string, signal?: AbortSignal): Promise<AcademyLesson> {
  return unwrap<AcademyLesson>(
    await requestOperation("GET /api/v2/academy/lessons/{lessonId}", { path: { lessonId } }, { signal }),
  )
}

export async function createAttempt(
  body: { lesson_id: string; catalog_version: string; idempotency_key: string },
  signal?: AbortSignal,
): Promise<AcademyAttempt> {
  return unwrap<AcademyAttempt>(await requestOperation("POST /api/v2/academy/attempts", { body }, { signal }))
}

export async function resumeAttempt(lessonId: string, signal?: AbortSignal): Promise<AcademyResume> {
  return unwrap<AcademyResume>(
    await requestOperation("GET /api/v2/academy/lessons/{lessonId}/attempt", { path: { lessonId } }, { signal }),
  )
}

export async function saveDraftAnswers(
  attemptId: string,
  body: { answers: { question_id: string; option_id: string }[]; expected_revision?: number },
  signal?: AbortSignal,
): Promise<AcademyDraft> {
  return unwrap<AcademyDraft>(
    await requestOperation("PUT /api/v2/academy/attempts/{attemptId}/answers", { path: { attemptId }, body }, { signal }),
  )
}

export async function fetchAttemptHistory(lessonId: string, limit = 5, signal?: AbortSignal): Promise<AcademyHistory> {
  return unwrap<AcademyHistory>(
    await requestOperation("GET /api/v2/academy/lessons/{lessonId}/attempts", { path: { lessonId }, query: { limit } }, { signal }),
  )
}

export async function fetchAttemptReview(attemptId: string, signal?: AbortSignal): Promise<AcademySubmitResult> {
  return unwrap<AcademySubmitResult>(
    await requestOperation("GET /api/v2/academy/attempts/{attemptId}", { path: { attemptId } }, { signal }),
  )
}

export async function submitAttempt(
  attemptId: string,
  answers: { question_id: string; option_id: string }[],
  idempotencyKey?: string,
  signal?: AbortSignal,
): Promise<AcademySubmitResult> {
  const body = idempotencyKey ? { answers, idempotency_key: idempotencyKey } : { answers }
  return unwrap<AcademySubmitResult>(
    await requestOperation("POST /api/v2/academy/attempts/{attemptId}/submit", { path: { attemptId }, body }, { signal }),
  )
}

export async function completeGuide(
  lessonId: string,
  body: { catalog_version: string; content_version: string; request_id: string },
  signal?: AbortSignal,
): Promise<AcademyGuideResult> {
  return unwrap<AcademyGuideResult>(
    await requestOperation("POST /api/v2/academy/lessons/{lessonId}/complete", { path: { lessonId }, body }, { signal }),
  )
}

/** New id for one logical attempt / completion request (replays of it are idempotent server-side). */
export function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

function hasCode(error: unknown, status: number, code: string): boolean {
  return error instanceof ApiError && error.status === status && error.code === code
}

/** The catalog / content / question bank moved on while the learner was working: reload, then start over. */
export function isVersionConflict(error: unknown): boolean {
  return (
    hasCode(error, 409, "CATALOG_VERSION_MISMATCH") ||
    hasCode(error, 409, "CONTENT_VERSION_MISMATCH") ||
    hasCode(error, 409, "ASSESSMENT_VERSION_MISMATCH")
  )
}

export const isDraftConflict = (error: unknown) => hasCode(error, 409, "DRAFT_REVISION_CONFLICT")
export const isAlreadySubmitted = (error: unknown) => hasCode(error, 409, "ATTEMPT_ALREADY_SUBMITTED")
export const isAttemptNotFound = (error: unknown) => hasCode(error, 404, "ATTEMPT_NOT_FOUND")
export const isLessonNotFound = (error: unknown) => hasCode(error, 404, "LESSON_NOT_FOUND")
export const isInvalidAnswers = (error: unknown) => hasCode(error, 422, "INVALID_ANSWERS")
export const isNotPublished = (error: unknown) => hasCode(error, 409, "NOT_PUBLISHED")
