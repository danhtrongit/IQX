import { redirect, type LoaderFunctionArgs } from "react-router"

/** Workspace tool shown by default and the target of every retired "Hành trình" link. */
export const ACADEMY_VIEW = "academy"
export const VIEW_PARAM = "view"
/** Lesson to open inside the Học viện tool, e.g. `?view=academy&lesson=ch01-l01`. */
export const LESSON_PARAM = "lesson"

/** Rail tools of the retired journey; they all land on the Học viện tool now. */
const LEGACY_VIEWS: ReadonlySet<string> = new Set(["journey", "identity", "analysis"])
/** The retired journey main tab was the default content tab; it is the overview now. */
const LEGACY_CONTENT = "journey"

const LESSON_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/

/**
 * Rewrites retired journey URL state to the v4 workspace without touching
 * anything else (symbol, filters, tour state, hash...). Pure; the same input
 * always reports `changed: false` once it has been rewritten.
 */
export function normalizeWorkspaceSearch(search: string): { search: string; changed: boolean } {
  const params = new URLSearchParams(search)
  let changed = false
  const view = params.get(VIEW_PARAM)
  if (view !== null && LEGACY_VIEWS.has(view)) {
    params.set(VIEW_PARAM, ACADEMY_VIEW)
    changed = true
  }
  if (params.get("content") === LEGACY_CONTENT) {
    params.delete("content")
    changed = true
  }
  const query = params.toString()
  return { search: query ? `?${query}` : "", changed }
}

/**
 * Route loader for `/demo-trading`: an old journey link is redirected before the
 * workspace renders, so nothing of the old flow (placement, tour, hatch) can run.
 */
export function demoTradingLoader({ request }: LoaderFunctionArgs): null {
  const url = new URL(request.url)
  const normalized = normalizeWorkspaceSearch(url.search)
  // The router strips the fragment from a loader request, so there is none to carry over.
  if (normalized.changed) throw redirect(`${url.pathname}${normalized.search}`)
  return null
}

/** Where the legacy `/hoc-vien[/:lessonId]` routes now live: the workspace Học viện tool. */
export function academyWorkspaceLocation(lessonId: string | undefined, search = "", hash = "") {
  const params = new URLSearchParams(search)
  params.set(VIEW_PARAM, ACADEMY_VIEW)
  if (lessonId && LESSON_ID.test(lessonId)) params.set(LESSON_PARAM, lessonId)
  return { pathname: "/demo-trading", search: `?${params}`, hash }
}
