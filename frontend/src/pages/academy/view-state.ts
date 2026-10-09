/**
 * Session-only presentation state of the Học viện tool. None of it is a source of truth:
 * progress, completion, grants and coins always come from the server. Everything here is a
 * convenience (which chapters are open, where the panel was scrolled, which answer was
 * ticked) and survives a failing or missing `sessionStorage` through an in-memory copy.
 */

const PREFIX = "iqx.academy."
const memory = new Map<string, string>()

function read(key: string): string | null {
  try {
    const stored = sessionStorage.getItem(key)
    if (stored !== null) return stored
  } catch {
    /* private window or blocked storage: fall back to memory */
  }
  return memory.get(key) ?? null
}

function write(key: string, value: string): void {
  memory.set(key, value)
  try {
    sessionStorage.setItem(key, value)
  } catch {
    /* kept in memory only */
  }
}

function remove(key: string): void {
  memory.delete(key)
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* nothing to clear */
  }
}

/** Test seam: forget every session-only value of this tool. */
export function resetAcademyViewState(): void {
  memory.clear()
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX)) sessionStorage.removeItem(key)
  } catch {
    /* nothing to clear */
  }
}

function readJson<T>(key: string, guard: (value: unknown) => value is T): T | null {
  const raw = read(key)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return guard(parsed) ? parsed : null
  } catch {
    return null
  }
}

/* ── Panel: open chapters and scroll position ─────────────────────────────── */

export type PanelViewState = {
  /** `null` until the learner (or a deep link) has decided: the panel then opens Chương 1 only. */
  openChapters: number[] | null
  scrollTop: number
}

const panelKey = (userId: string | undefined) => `${PREFIX}panel.v1.${userId ?? "anonymous"}`

function isPanelState(value: unknown): value is PanelViewState {
  if (!value || typeof value !== "object") return false
  const candidate = value as { openChapters?: unknown; scrollTop?: unknown }
  const chapters = candidate.openChapters
  return (
    (chapters === null || (Array.isArray(chapters) && chapters.every((no) => Number.isInteger(no)))) &&
    typeof candidate.scrollTop === "number" &&
    Number.isFinite(candidate.scrollTop)
  )
}

export function loadPanelState(userId: string | undefined): PanelViewState {
  return readJson(panelKey(userId), isPanelState) ?? { openChapters: null, scrollTop: 0 }
}

/** Merges `patch` into the stored panel state (the open chapters and the scroll position are saved independently). */
export function savePanelState(userId: string | undefined, patch: Partial<PanelViewState>): void {
  write(panelKey(userId), JSON.stringify({ ...loadPanelState(userId), ...patch }))
}

/* ── Quiz: idempotency key per lesson attempt (ticked answers live on the server as a draft) ── */

export type AttemptKeyRecord = { key: string; done: boolean }

const attemptKeyKey = (userId: string | undefined, lessonId: string) => `${PREFIX}attempt-key.${userId ?? "anonymous"}.${lessonId}`
const guideRequestKey = (userId: string | undefined, lessonId: string) => `${PREFIX}guide-request.${userId ?? "anonymous"}.${lessonId}`

function isAttemptKeyRecord(value: unknown): value is AttemptKeyRecord {
  if (!value || typeof value !== "object") return false
  const candidate = value as { key?: unknown; done?: unknown }
  return typeof candidate.key === "string" && candidate.key.length >= 8 && typeof candidate.done === "boolean"
}

export function loadAttemptKey(userId: string | undefined, lessonId: string): AttemptKeyRecord | null {
  return readJson(attemptKeyKey(userId, lessonId), isAttemptKeyRecord)
}

export function saveAttemptKey(userId: string | undefined, lessonId: string, record: AttemptKeyRecord): void {
  write(attemptKeyKey(userId, lessonId), JSON.stringify(record))
}

/** The attempt behind the stored key has been graded: the next start must open a new one, not replay it. */
export function markAttemptDone(userId: string | undefined, lessonId: string): void {
  const record = loadAttemptKey(userId, lessonId)
  if (record && !record.done) saveAttemptKey(userId, lessonId, { ...record, done: true })
}

/** Request id of the pending completion of one guide lesson; reused by a retry so the replay is idempotent. */
export function loadGuideRequestId(userId: string | undefined, lessonId: string): string | null {
  const stored = read(guideRequestKey(userId, lessonId))
  return stored && stored.length >= 8 ? stored : null
}

export function saveGuideRequestId(userId: string | undefined, lessonId: string, requestId: string): void {
  write(guideRequestKey(userId, lessonId), requestId)
}

export function clearGuideRequestId(userId: string | undefined, lessonId: string): void {
  remove(guideRequestKey(userId, lessonId))
}
