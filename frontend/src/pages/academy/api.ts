/**
 * Data layer of the Học viện tool (v3.2: 14 chapters, chapters 1-5 published), authenticated.
 *
 * 1  `GET  /academy/catalog`                    published chapters, items (lesson / exam / practice), retired names
 * 2  `GET  /academy/progress`                   server-computed item states, course and chapter counts, grants
 * 3  `GET  /academy/lessons/{id}`               lesson or practice content (typed blocks + chart models), or exam intro
 * 4  `POST /academy/lessons/{id}/scenario`      store the scenario choice once
 * 5  `GET  /academy/lessons/{id}/notes`         workpads, checklists, roleplay scores of the account
 * 6  `PUT  /academy/lessons/{id}/notes`         merge notes by key (revision guarded)
 * 7  `GET  /academy/lessons/{id}/attempt`       resume: the latest open attempt + its saved draft answers
 * 8  `GET  /academy/lessons/{id}/attempts`      score-only history of submitted attempts
 * 9  `POST /academy/attempts`                   every question of the bank in a server-shuffled order, no key
 * 10 `PUT  /academy/attempts/{id}/answers`      save draft selections (partial, merged, revisioned)
 * 11 `POST /academy/attempts/{id}/submit`       server grading: score only, completion, grants, reward
 *
 * Correctness, locks, completion, grants and coins are only ever decided by the server; the client
 * never sends a score, a pass flag or a capability, and never receives an answer key.
 */
import { ApiError } from "@/lib/api"
import { requestOperation } from "@/lib/contract-client"
import type { ApiRequestFor } from "@/lib/contract-types"
import type {
  AttemptResponse,
  CatalogResponse,
  DraftSaveResponse,
  DraftState,
  HistoryResponse,
  ItemResponse,
  NotesResponse,
  ProgressResponse,
  ResumeResponse,
  ScenarioChoiceResponse,
  SubmitResult,
} from "./content-types"

export type * from "./content-types"

export type DraftAnswer = { question_id: string; option_id: string }
export type NotesSaveBody = NonNullable<ApiRequestFor<"PUT /api/v2/academy/lessons/{lessonId}/notes">["body"]>

/** First-completion reward of one lesson or practice, in learning coins (xu). Display fallback only. */
export const LESSON_REWARD_XU = 100

/** v2 routes may wrap the resource in `{ data }`; accept both shapes. */
function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

export async function fetchCatalog(signal?: AbortSignal): Promise<CatalogResponse> {
  return unwrap<CatalogResponse>(await requestOperation("GET /api/v2/academy/catalog", {}, { signal }))
}

export async function fetchProgress(signal?: AbortSignal): Promise<ProgressResponse> {
  return unwrap<ProgressResponse>(await requestOperation("GET /api/v2/academy/progress", {}, { signal }))
}

export async function fetchItem(lessonId: string, signal?: AbortSignal): Promise<ItemResponse> {
  return unwrap<ItemResponse>(
    await requestOperation("GET /api/v2/academy/lessons/{lessonId}", { path: { lessonId } }, { signal }),
  )
}

export async function chooseScenario(
  lessonId: string,
  choice: 0 | 1 | 2,
  signal?: AbortSignal,
): Promise<ScenarioChoiceResponse> {
  return unwrap<ScenarioChoiceResponse>(
    await requestOperation(
      "POST /api/v2/academy/lessons/{lessonId}/scenario",
      { path: { lessonId }, body: { choice } },
      { signal },
    ),
  )
}

export async function fetchNotes(lessonId: string, signal?: AbortSignal): Promise<NotesResponse> {
  return unwrap<NotesResponse>(
    await requestOperation("GET /api/v2/academy/lessons/{lessonId}/notes", { path: { lessonId } }, { signal }),
  )
}

export async function saveNotes(lessonId: string, body: NotesSaveBody, signal?: AbortSignal): Promise<NotesResponse> {
  return unwrap<NotesResponse>(
    await requestOperation("PUT /api/v2/academy/lessons/{lessonId}/notes", { path: { lessonId }, body }, { signal }),
  )
}

export async function resumeAttempt(lessonId: string, signal?: AbortSignal): Promise<ResumeResponse> {
  return unwrap<ResumeResponse>(
    await requestOperation("GET /api/v2/academy/lessons/{lessonId}/attempt", { path: { lessonId } }, { signal }),
  )
}

export async function fetchAttemptHistory(lessonId: string, limit = 5, signal?: AbortSignal): Promise<HistoryResponse> {
  return unwrap<HistoryResponse>(
    await requestOperation(
      "GET /api/v2/academy/lessons/{lessonId}/attempts",
      { path: { lessonId }, query: { limit } },
      { signal },
    ),
  )
}

export async function createAttempt(
  body: { lesson_id: string; catalog_version: string; idempotency_key: string },
  signal?: AbortSignal,
): Promise<AttemptResponse> {
  return unwrap<AttemptResponse>(await requestOperation("POST /api/v2/academy/attempts", { body }, { signal }))
}

export async function saveDraftAnswers(
  attemptId: string,
  body: { answers: DraftAnswer[]; expected_revision?: number },
  signal?: AbortSignal,
): Promise<DraftSaveResponse> {
  return unwrap<DraftSaveResponse>(
    await requestOperation(
      "PUT /api/v2/academy/attempts/{attemptId}/answers",
      { path: { attemptId }, body },
      { signal },
    ),
  )
}

export async function submitAttempt(
  attemptId: string,
  answers: DraftAnswer[],
  idempotencyKey?: string,
  signal?: AbortSignal,
): Promise<SubmitResult> {
  const body = idempotencyKey ? { answers, idempotency_key: idempotencyKey } : { answers }
  return unwrap<SubmitResult>(
    await requestOperation("POST /api/v2/academy/attempts/{attemptId}/submit", { path: { attemptId }, body }, { signal }),
  )
}

/** New id for one logical attempt request (replays of it are idempotent server-side). */
export function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

function hasCode(error: unknown, status: number, code: string): boolean {
  return error instanceof ApiError && error.status === status && error.code === code
}

/** The catalog or question bank moved on while the learner was working: reload, then start over. */
export function isCatalogMismatch(error: unknown): boolean {
  return hasCode(error, 409, "CATALOG_VERSION_MISMATCH") || hasCode(error, 409, "ASSESSMENT_VERSION_MISMATCH")
}

export const isItemLocked = (error: unknown) => hasCode(error, 403, "ACADEMY_ITEM_LOCKED")
export const isScenarioRequired = (error: unknown) => hasCode(error, 403, "ACADEMY_SCENARIO_REQUIRED")
export const isNotesConflict = (error: unknown) => hasCode(error, 409, "NOTES_REVISION_CONFLICT")
export const isDraftConflict = (error: unknown) => hasCode(error, 409, "DRAFT_REVISION_CONFLICT")
export const isAlreadySubmitted = (error: unknown) => hasCode(error, 409, "ATTEMPT_ALREADY_SUBMITTED")
export const isInvalidAnswers = (error: unknown) => hasCode(error, 422, "INVALID_ANSWERS")
export const isAttemptNotFound = (error: unknown) => hasCode(error, 404, "ATTEMPT_NOT_FOUND")
/** Unknown or unpublished item (LESSON_NOT_FOUND) or an item without notes (NOTES_NOT_AVAILABLE). */
export const isNotFound = (error: unknown) =>
  hasCode(error, 404, "LESSON_NOT_FOUND") || hasCode(error, 404, "NOTES_NOT_AVAILABLE")

/**
 * The stored draft a 409 DRAFT_REVISION_CONFLICT carries in `details[0].draft` (the error filter only
 * forwards array `details`). Null when absent or malformed, so the caller can fall back to a re-read.
 */
export function conflictDraft(error: unknown): DraftState | null {
  if (!isDraftConflict(error)) return null
  const details = (error as ApiError).details
  const draft = Array.isArray(details) ? (details[0] as { draft?: Partial<DraftState> } | undefined)?.draft : undefined
  if (!draft || typeof draft.revision !== "number" || !Array.isArray(draft.answers)) return null
  const valid = draft.answers.every(
    (answer) => answer && typeof answer.question_id === "string" && typeof answer.option_id === "string",
  )
  return valid ? (draft as DraftState) : null
}

/** The stored notes a 409 NOTES_REVISION_CONFLICT carries in `details[0].notes`; null when absent or malformed. */
export function conflictNotes(error: unknown): NotesResponse | null {
  if (!isNotesConflict(error)) return null
  const details = (error as ApiError).details
  const notes = Array.isArray(details) ? (details[0] as { notes?: Partial<NotesResponse> } | undefined)?.notes : undefined
  if (!notes || typeof notes.revision !== "number" || !notes.texts || !notes.checks || !notes.scores) return null
  return notes as NotesResponse
}
