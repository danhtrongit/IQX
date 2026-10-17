/**
 * A small in-memory Học viện v3.2 backend for the tests. Plug `handler` into the mocked `api()` of
 * `@/lib/api`; every call is recorded in `calls` ("GET /academy/catalog") and `bodies`.
 * Locks follow the server's prefix rule; answers are graded here and never sent to the client.
 */
import { ApiError } from "@/lib/api"
import type { AttemptResponse, CatalogItem, LessonContent, NotesResponse, ResumeResponse } from "./content-types"
import {
  ATTEMPT_ID,
  buildAttempt,
  buildCatalog,
  buildItem,
  buildProgress,
  buildSubmitResult,
  catalogItemsOf,
  CATALOG_VERSION,
  gradeAnswers,
  statesOf,
} from "./test-fixtures"

type Route = "catalog" | "progress" | "lesson" | "scenario" | "notes" | "resume" | "history" | "create" | "draft" | "submit"
type Answer = { question_id: string; option_id: string }
type Draft = { revision: number; selections: Record<string, string> }
type AttemptRecord = { attempt: AttemptResponse; item: CatalogItem; key: string; answers?: Answer[]; newly?: boolean }

export type FakeOptions = {
  /** Lesson keys already completed (e.g. "concept:ch01_l01", "technical:rsi"). */
  completed?: string[]
  lessons?: Record<string, Partial<LessonContent>>
  /** An open attempt of ch01-l01 the server can resume, with its saved draft. */
  openAttempt?: { draft: Record<string, string>; revision?: number }
}

const notFound = () => new ApiError("Không tìm thấy bài học.", 404, "LESSON_NOT_FOUND")
const locked = () => new ApiError("Bài này chưa mở.", 403, "ACADEMY_ITEM_LOCKED")

export function createFakeAcademyApi(options: FakeOptions = {}) {
  const catalog = buildCatalog()
  const byId = new Map(catalogItemsOf(catalog).map((item) => [item.id, item] as const))
  const completed = new Set(options.completed ?? [])
  const calls: string[] = []
  const bodies: { call: string; body: unknown }[] = []
  const failures = new Map<Route, { error: unknown; times: number }>()
  const holds = new Map<string, Promise<void>>()
  const attempts = new Map<string, AttemptRecord>()
  const drafts = new Map<string, Draft>()
  const scenarios = new Map<string, number>()
  const notes = new Map<string, NotesResponse>()
  let sequence = 0
  let open: string | null = null
  const state = { rewardStatus: "credited" as "credited" | "unavailable" | "already_rewarded" }

  if (options.openAttempt) {
    const item = byId.get("ch01-l01")!
    attempts.set(ATTEMPT_ID, { attempt: buildAttempt(item), item, key: "seeded-key-0001" })
    drafts.set(ATTEMPT_ID, { revision: options.openAttempt.revision ?? 1, selections: { ...options.openAttempt.draft } })
    open = ATTEMPT_ID
  }

  const draftState = (record: AttemptRecord, draft: Draft | undefined) => {
    const answers = record.attempt.questions.flatMap((question) =>
      draft?.selections[question.id] ? [{ question_id: question.id, option_id: draft.selections[question.id] }] : [],
    )
    return { revision: draft?.revision ?? 0, answers, answered_count: answers.length, total: record.attempt.total, updated_at: draft ? "2026-10-08T01:05:00.000Z" : null }
  }

  function check(route: Route) {
    const failure = failures.get(route)
    if (failure && failure.times > 0) {
      failure.times -= 1
      throw failure.error
    }
  }

  function requireOpenItem(id: string): CatalogItem {
    const item = byId.get(id)
    if (!item) throw notFound()
    if (statesOf(catalog, completed).get(id) === "locked") throw locked()
    return item
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
    if (path === "/academy/progress") return check("progress"), buildProgress(completed, catalog)

    let match = /^\/academy\/lessons\/(ch\d{2}-(?:l\d{2}|exam|practice))$/.exec(path)
    if (match) {
      check("lesson")
      const item = requireOpenItem(match[1])
      const choice = scenarios.get(item.id)
      const response = buildItem(item, statesOf(catalog, completed).get(item.id) ?? "open", options.lessons?.[item.id])
      return response.kind === "chapter_exam" || choice === undefined
        ? response
        : { ...response, scenario_choice: { choice, chosen_at: "2026-10-08T00:40:00.000Z" } }
    }
    match = /^\/academy\/lessons\/(ch\d{2}-(?:l\d{2}|exam|practice))\/scenario$/.exec(path)
    if (match) {
      check("scenario")
      const item = requireOpenItem(match[1])
      if (!item.has_scenario) throw new ApiError("Bài này không có tình huống.", 422, "NO_SCENARIO")
      const created = !scenarios.has(item.id)
      if (created) scenarios.set(item.id, Number(body?.choice))
      return { lesson_id: item.id, choice: scenarios.get(item.id)!, chosen_at: "2026-10-08T00:40:00.000Z", created }
    }
    match = /^\/academy\/lessons\/(ch\d{2}-(?:l\d{2}|exam|practice))\/notes$/.exec(path)
    if (match) {
      check("notes")
      const item = requireOpenItem(match[1])
      const stored = notes.get(item.id) ?? { lesson_id: item.id, revision: 0, texts: {}, checks: {}, scores: {}, updated_at: null }
      if (method === "GET") return stored
      if (body?.expected_revision !== undefined && body.expected_revision !== stored.revision)
        throw new ApiError("Ghi chú đã được lưu ở nơi khác.", 409, { code: "NOTES_REVISION_CONFLICT", details: [{ notes: stored }] })
      const next: NotesResponse = {
        lesson_id: item.id,
        revision: stored.revision + 1,
        texts: { ...stored.texts, ...(body?.texts as Record<string, string> | undefined) },
        checks: { ...stored.checks, ...(body?.checks as Record<string, boolean> | undefined) },
        scores: { ...stored.scores, ...(body?.scores as Record<string, number[]> | undefined) },
        updated_at: "2026-10-08T01:10:00.000Z",
      }
      notes.set(item.id, next)
      return next
    }
    match = /^\/academy\/lessons\/(ch\d{2}-(?:l\d{2}|exam|practice))\/attempt$/.exec(path)
    if (match) {
      check("resume")
      const item = byId.get(match[1])
      if (!item) throw notFound()
      const record = open ? attempts.get(open) : undefined
      const current = record && record.item.id === item.id ? record : undefined
      const result: ResumeResponse = {
        lesson_id: item.id,
        lesson_key: item.lesson_key,
        catalog_version: CATALOG_VERSION,
        attempt: current ? { ...current.attempt, created_at: "2026-10-08T00:50:00.000Z", draft: draftState(current, drafts.get(current.attempt.attempt_id)) } : null,
      }
      return result
    }
    match = /^\/academy\/lessons\/(ch\d{2}-(?:l\d{2}|exam|practice))\/attempts$/.exec(path)
    if (match) {
      check("history")
      const item = byId.get(match[1])
      if (!item) throw notFound()
      const items = [...attempts.entries()]
        .filter(([, record]) => record.answers && record.item.id === item.id)
        .map(([id, record]) => {
          const score = gradeAnswers(record.item, record.answers!)
          return { attempt_id: id, submitted_at: "2026-10-08T01:00:00.000Z", score, total: record.attempt.total, passed: score === record.attempt.total }
        })
      return { lesson_id: item.id, lesson_key: item.lesson_key, catalog_version: CATALOG_VERSION, items, total: items.length, limit: 5, offset: 0, next_offset: null }
    }
    if (path === "/academy/attempts" && method === "POST") {
      check("create")
      if (body?.catalog_version !== CATALOG_VERSION) throw new ApiError("Danh mục đã thay đổi.", 409, "CATALOG_VERSION_MISMATCH")
      const key = String(body?.idempotency_key)
      const existing = [...attempts.values()].find((record) => record.key === key)
      if (existing) return { ...existing.attempt, status: existing.answers ? "submitted" : "open" }
      const item = requireOpenItem(String(body?.lesson_id))
      if (item.has_scenario && !scenarios.has(item.id))
        throw new ApiError("Chọn cách xử lý ở phần Tình huống trước.", 403, "ACADEMY_SCENARIO_REQUIRED")
      sequence += 1
      const id = sequence === 1 && !options.openAttempt ? ATTEMPT_ID : `2222222${sequence}-2222-4222-8222-222222222222`
      const attempt = buildAttempt(item, id)
      attempts.set(id, { attempt, item, key })
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
      if (body?.expected_revision !== undefined && body.expected_revision !== draft.revision)
        throw new ApiError("Bản nháp đã được lưu ở nơi khác.", 409, { code: "DRAFT_REVISION_CONFLICT", details: [{ draft: draftState(record, draft) }] })
      for (const answer of (body?.answers as Answer[]) ?? []) draft.selections[answer.question_id] = answer.option_id
      draft.revision += 1
      drafts.set(match[1], draft)
      return { attempt_id: match[1], ...draftState(record, draft) }
    }
    match = /^\/academy\/attempts\/([0-9a-f-]+)\/submit$/.exec(path)
    if (match) {
      check("submit")
      const record = attempts.get(match[1])
      if (!record) throw new ApiError("Không tìm thấy lượt làm bài.", 404, "ATTEMPT_NOT_FOUND")
      if (!record.answers) {
        const answers = (body?.answers as Answer[]) ?? []
        if (answers.length !== record.attempt.total) throw new ApiError("Cần trả lời đủ các câu.", 422, "INVALID_ANSWERS")
        record.answers = answers
        if (open === match[1]) open = null
        if (gradeAnswers(record.item, answers) === record.attempt.total && !completed.has(record.item.lesson_key)) {
          completed.add(record.item.lesson_key)
          record.newly = true
        }
      }
      const score = gradeAnswers(record.item, record.answers)
      const passed = score === record.attempt.total
      const reward =
        record.newly && record.item.kind !== "chapter_exam"
          ? state.rewardStatus === "credited"
            ? { status: "credited" as const, delta: 100, balance_after: 100 }
            : state.rewardStatus === "unavailable"
              ? { status: "unavailable" as const }
              : { status: "already_rewarded" as const, balance_after: 100 }
          : null
      const items = catalogItemsOf(catalog)
      const at = items.findIndex((item) => item.id === record.item.id)
      return buildSubmitResult(record.item, score, {
        attempt_id: match[1],
        completion: { completed: completed.has(record.item.lesson_key), newly_completed: Boolean(record.newly), completed_at: passed ? "2026-10-08T01:00:00.000Z" : null },
        next_item_id: passed ? (items.slice(at + 1).find((item) => !item.optional)?.id ?? null) : null,
        progress_revision: completed.size,
        reward,
      })
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
