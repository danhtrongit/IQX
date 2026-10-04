/**
 * Data layer of Học viện (bot-v2 Academy) — authenticated, not Premium.
 *
 * - `GET  /academy/curriculum` — 18 chapters, per-lesson progress and granted capabilities
 * - `GET  /academy/lessons/{id}` — lesson content (never questions or answers)
 * - `POST /academy/attempts` — 8 shuffled questions without answer keys
 * - `POST /academy/attempts/{id}/submit` — server-side grading + review + grants
 *
 * Correctness is only ever decided by the server; the client never sees answer
 * keys before submitting. Contract: .pi/botv2/CONTRACTS.md §3.
 */
import { api as sharedApi, ApiError } from "@/lib/api"

export type LessonKind = "technical" | "fundamental" | "tool" | "system"

export type CurriculumLesson = {
  id: string
  order: number
  name: string
  kind: LessonKind
  config_id: string | null
  passed: boolean
  best_score: number | null
  attempts: number
  capabilities: string[]
}

export type CurriculumChapter = {
  no: number
  title: string
  type: LessonKind
  bot: string | null
  lessons: CurriculumLesson[]
}

export type Curriculum = {
  content_version: string
  chapters: CurriculumChapter[]
  granted_capabilities: string[]
}

export type LessonSection = { title: string; html: string }

export type LessonFixture = {
  type: string
  label?: string
  prompt?: string
  expected?: number
  unit?: string
  formula?: string
  tolerance?: number
  synthetic?: boolean
}

export type LessonDetail = {
  id: string
  chapter: number
  order: number
  name: string
  kind: LessonKind
  content_version: string
  config_id: string | null
  sections: LessonSection[]
  fixture: LessonFixture | null
  prerequisites: string[]
  sources: string[]
  review_status: string
  passed: boolean
}

export type AttemptOption = { id: string; text: string }
export type AttemptQuestion = { id: string; question: string; options: AttemptOption[] }

export type Attempt = {
  attempt_id: string
  lesson_id: string
  content_version: string
  questions_version: string
  questions: AttemptQuestion[]
}

export type CreateAttemptBody = { lesson_id: string; content_version: string; idempotency_key: string }
export type AttemptAnswer = { question_id: string; option_id: string }

export type QuestionResult = {
  question_id: string
  option_id: string
  correct: boolean
  correct_option_id: string
  explanation: string
}

export type AttemptResult = {
  attempt_id: string
  score: number
  total: number
  passed: boolean
  results: QuestionResult[]
  granted_capabilities: string[]
  newly_granted: string[]
}

/** A quiz is passed only with every question correct. */
export const QUIZ_QUESTION_COUNT = 8

/** v2 routes may wrap the resource in `{ data }`; accept both shapes. */
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const payload = await sharedApi<unknown>(path, options)
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

function jsonBody(body: unknown, signal?: AbortSignal): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal }
}

export function getCurriculum(contentVersion?: string, signal?: AbortSignal): Promise<Curriculum> {
  return api<Curriculum>(
    `/academy/curriculum${contentVersion ? `?content_version=${encodeURIComponent(contentVersion)}` : ""}`,
    { signal },
  )
}

export function getLesson(lessonId: string, signal?: AbortSignal): Promise<LessonDetail> {
  return api<LessonDetail>(`/academy/lessons/${encodeURIComponent(lessonId)}`, { signal })
}

export function createAttempt(body: CreateAttemptBody, signal?: AbortSignal): Promise<Attempt> {
  return api<Attempt>("/academy/attempts", jsonBody(body, signal))
}

export function submitAttempt(
  attemptId: string,
  answers: AttemptAnswer[],
  idempotencyKey?: string,
  signal?: AbortSignal,
): Promise<AttemptResult> {
  const body = idempotencyKey ? { answers, idempotency_key: idempotencyKey } : { answers }
  return api<AttemptResult>(`/academy/attempts/${encodeURIComponent(attemptId)}/submit`, jsonBody(body, signal))
}

/** `ACADEMY_ENABLED=false` → every academy route answers 404 FEATURE_DISABLED. */
export function isAcademyDisabled(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404 && error.code === "FEATURE_DISABLED"
}

export function isContentVersionMismatch(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === "CONTENT_VERSION_MISMATCH"
}
