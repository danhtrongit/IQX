/**
 * A small in-memory Học viện backend for the tests. Plug `handler` into the mocked `api()` of
 * `@/lib/api`; every call is recorded in `calls` ("GET /academy/catalog") and `bodies`.
 */
import { ApiError } from "@/lib/api"
import type { AcademyAttempt, AcademyLesson, AcademyResume, AcademySubmitResult } from "./api"
import {
  ATTEMPT_ID,
  buildAttempt,
  buildBank,
  buildCatalog,
  buildLesson,
  buildProgress,
  buildSubmitResult,
  CATALOG_VERSION,
  gradeAnswers,
  NO_METHOD,
} from "./test-fixtures"

type Route = "catalog" | "progress" | "lesson" | "resume" | "history" | "create" | "draft" | "submit" | "review" | "complete"

type Draft = { revision: number; selections: Record<string, string> }

export type FakeOptions = {
  completed?: string[]
  lessons?: Record<string, Partial<AcademyLesson>>
  /** An open attempt of ch01-l01 the server can resume, with its saved draft. */
  openAttempt?: { draft: Record<string, string>; revision?: number }
}

export function createFakeAcademyApi(options: FakeOptions = {}) {
  const catalog = buildCatalog()
  const bank = buildBank()
  const completed = new Set(options.completed ?? [])
  const calls: string[] = []
  const bodies: { call: string; body: unknown }[] = []
  const failures = new Map<Route, { error: unknown; times: number }>()
  const holds = new Map<string, Promise<void>>()
  const attempts = new Map<string, { attempt: AcademyAttempt; key: string; answers?: { question_id: string; option_id: string }[]; newly?: boolean; reward?: AcademySubmitResult["reward"] }>()
  const drafts = new Map<string, Draft>()
  let sequence = 0
  let open: string | null = null
  const state = { draftConflict: false, conflictWithoutDraft: false, rewardStatus: "credited" as "credited" | "unavailable" | "already_rewarded", submittedReplay: false }

  if (options.openAttempt) {
    attempts.set(ATTEMPT_ID, { attempt: buildAttempt({}, bank), key: "seeded-key-0001" })
    drafts.set(ATTEMPT_ID, { revision: options.openAttempt.revision ?? 1, selections: { ...options.openAttempt.draft } })
    open = ATTEMPT_ID
  }

  const draftState = (draft: Draft | undefined) => {
    const answers = bank.flatMap((question) => (draft?.selections[question.id] ? [{ question_id: question.id, option_id: draft.selections[question.id] }] : []))
    return { revision: draft?.revision ?? 0, answers, answered_count: answers.length, total: 8 as const, updated_at: draft ? "2026-10-08T01:05:00.000Z" : null }
  }

  function check(route: Route) {
    const failure = failures.get(route)
    if (failure && failure.times > 0) {
      failure.times -= 1
      throw failure.error
    }
  }

  function lessonOf(id: string): AcademyLesson {
    const scores = [...attempts.values()].filter((record) => record.attempt.lesson_id === id && record.answers).map((record) => gradeAnswers(record.answers!, bank))
    return buildLesson(id, {
      completed: completed.has(id),
      completion_method: completed.has(id) ? "quiz" : NO_METHOD,
      best_score: scores.length ? Math.max(...scores) : null,
      attempts_submitted: scores.length,
      ...options.lessons?.[id],
    })
  }

  function resultOf(id: string): AcademySubmitResult {
    const record = attempts.get(id)
    if (!record?.answers) throw new ApiError("Lượt làm bài chưa được nộp", 409, "ATTEMPT_NOT_SUBMITTED")
    const lessonKey = record.attempt.lesson_id
    return buildSubmitResult(record.answers, {
      attempt_id: id,
      lesson_id: lessonKey,
      completion: {
        completed: completed.has(lessonKey),
        completion_method: completed.has(lessonKey) ? "quiz" : NO_METHOD,
        completed_at: completed.has(lessonKey) ? "2026-10-08T01:00:00.000Z" : null,
        newly_completed: Boolean(record.newly),
      },
      reward: record.newly ? record.reward ?? null : null,
    }, bank)
  }

  async function handler(rawPath: string, init: RequestInit = {}): Promise<unknown> {
    const path = rawPath.split("?")[0]
    const method = init.method ?? "GET"
    const call = `${method} ${path}`
    calls.push(call)
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined
    if (body) bodies.push({ call, body })
    const hold = holds.get(path) ?? holds.get(call)
    if (hold) await hold

    if (path === "/academy/catalog") return check("catalog"), catalog
    if (path === "/academy/progress") return check("progress"), buildProgress([...completed], catalog)

    let match = /^\/academy\/lessons\/(ch\d{2}-l\d{2})$/.exec(path)
    if (match) {
      check("lesson")
      if (!catalog.chapters.some((chapter) => chapter.lessons.some((lesson) => lesson.id === match![1]))) throw new ApiError("Không tìm thấy bài học.", 404, "LESSON_NOT_FOUND")
      return lessonOf(match[1])
    }
    match = /^\/academy\/lessons\/(ch\d{2}-l\d{2})\/attempt$/.exec(path)
    if (match) {
      check("resume")
      const record = open ? attempts.get(open) : undefined
      const result: AcademyResume = {
        lesson_id: match[1],
        lesson_key: "technical:rsi",
        catalog_version: CATALOG_VERSION,
        attempt: record ? { ...record.attempt, created_at: "2026-10-08T00:50:00.000Z", draft: draftState(drafts.get(record.attempt.attempt_id)) } : null,
      }
      return result
    }
    match = /^\/academy\/lessons\/(ch\d{2}-l\d{2})\/attempts$/.exec(path)
    if (match) {
      check("history")
      const items = [...attempts.entries()].filter(([, record]) => record.answers).map(([id, record]) => ({ attempt_id: id, submitted_at: "2026-10-08T01:00:00.000Z", score: gradeAnswers(record.answers!, bank), total: 8 as const, passed: gradeAnswers(record.answers!, bank) === 8, review_available: true }))
      return { lesson_id: match[1], lesson_key: "technical:rsi", catalog_version: CATALOG_VERSION, items, total: items.length, limit: 5, offset: 0, next_offset: null }
    }
    if (path === "/academy/attempts" && method === "POST") {
      check("create")
      const key = String(body?.idempotency_key)
      const existing = [...attempts.values()].find((record) => record.key === key)
      if (existing) {
        const submitted = existing.answers !== undefined
        return { ...existing.attempt, status: submitted ? "submitted" : "open" }
      }
      sequence += 1
      const id = sequence === 1 && !options.openAttempt ? ATTEMPT_ID : `2222222${sequence}-2222-4222-8222-222222222222`
      const attempt = buildAttempt({ attempt_id: id, lesson_id: String(body?.lesson_id) }, bank)
      attempts.set(id, { attempt, key })
      open = id
      return attempt
    }
    match = /^\/academy\/attempts\/([0-9a-f-]+)\/answers$/.exec(path)
    if (match) {
      check("draft")
      const record = attempts.get(match[1])
      if (!record) throw new ApiError("Không tìm thấy lượt làm bài.", 404, "ATTEMPT_NOT_FOUND")
      if (record.answers) throw new ApiError("Lượt làm bài đã được nộp.", 409, "ATTEMPT_ALREADY_SUBMITTED")
      const draft = drafts.get(match[1]) ?? { revision: 0, selections: {} }
      if (state.draftConflict || (body?.expected_revision !== undefined && body.expected_revision !== draft.revision)) {
        state.draftConflict = false
        // Another device saved first: its answer for q1 is now on the server.
        draft.selections.q1 = "q1d"
        draft.revision += 1
        drafts.set(match[1], draft)
        // The real server forwards the stored draft in `details[0].draft`; `conflictWithoutDraft` models an old server.
        throw new ApiError(
          "Bản nháp đã được lưu ở nơi khác.",
          409,
          state.conflictWithoutDraft ? "DRAFT_REVISION_CONFLICT" : { code: "DRAFT_REVISION_CONFLICT", details: [{ draft: draftState(draft) }] },
        )
      }
      for (const answer of (body?.answers as { question_id: string; option_id: string }[]) ?? []) draft.selections[answer.question_id] = answer.option_id
      draft.revision += 1
      drafts.set(match[1], draft)
      return { attempt_id: match[1], ...draftState(draft) }
    }
    match = /^\/academy\/attempts\/([0-9a-f-]+)\/submit$/.exec(path)
    if (match) {
      check("submit")
      const record = attempts.get(match[1])
      if (!record) throw new ApiError("Không tìm thấy lượt làm bài.", 404, "ATTEMPT_NOT_FOUND")
      if (!record.answers) {
        const answers = (body?.answers as { question_id: string; option_id: string }[]) ?? []
        if (answers.length !== 8) throw new ApiError("Cần trả lời đủ 8 câu.", 422, "INVALID_ANSWERS")
        record.answers = answers
        open = open === match[1] ? null : open
        const lessonKey = record.attempt.lesson_id
        if (gradeAnswers(answers, bank) === 8 && !completed.has(lessonKey)) {
          completed.add(lessonKey)
          record.newly = true
          record.reward = state.rewardStatus === "credited" ? { status: "credited", delta: 100, balance_after: 100 } : state.rewardStatus === "unavailable" ? { status: "unavailable" } : { status: "already_rewarded", balance_after: 100 }
        }
      }
      return resultOf(match[1])
    }
    match = /^\/academy\/attempts\/([0-9a-f-]+)$/.exec(path)
    if (match) {
      check("review")
      return resultOf(match[1])
    }
    match = /^\/academy\/lessons\/(ch\d{2}-l\d{2})\/complete$/.exec(path)
    if (match) {
      check("complete")
      const first = !completed.has(match[1])
      completed.add(match[1])
      return {
        lesson_id: match[1],
        lesson_key: `guide:${match[1]}`,
        catalog_version: CATALOG_VERSION,
        completion: { completed: true, completion_method: "guide", completed_at: "2026-10-08T01:00:00.000Z", newly_completed: first },
        granted_capabilities: [],
        progress_revision: completed.size,
        reward: first ? (state.rewardStatus === "credited" ? { status: "credited", delta: 100, balance_after: 100 } : state.rewardStatus === "unavailable" ? { status: "unavailable" } : { status: "already_rewarded", balance_after: 100 }) : null,
      }
    }
    throw new ApiError(`unexpected ${call}`, 404, "NOT_FOUND")
  }

  return {
    handler,
    calls,
    bodies,
    state,
    completed,
    fail(route: Route, error: unknown, times = 1) {
      failures.set(route, { error, times })
    },
    /** Holds every response for `path` (or "METHOD path") until the returned function is called. */
    hold(key: string) {
      let release = () => {}
      holds.set(key, new Promise<void>((resolve) => { release = () => { holds.delete(key); resolve() } }))
      return release
    },
    count: (prefix: string) => calls.filter((call) => call.startsWith(prefix)).length,
  }
}
