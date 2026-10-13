import { redirect, type LoaderFunctionArgs } from "react-router"

import { demoChrome, sectionOfTool } from "@/config/chrome"

/** The Học viện tool: default of the HỌC VIỆN section and the target of every retired "Hành trình" link. */
export const ACADEMY_VIEW = "academy"
export const VIEW_PARAM = "view"
/** Lesson to open inside the Học viện tool, e.g. `?view=academy&lesson=ch01-l01`. */
export const LESSON_PARAM = "lesson"

/** Rail tools of the retired journey; they all land on the Học viện tool now. */
const LEGACY_VIEWS: ReadonlySet<string> = new Set(["journey", "identity", "analysis"])
/** Retired main tabs: the journey, then the overview ("Tổng quan"); both land on the default tab. */
const RETIRED_CONTENT: ReadonlySet<string> = new Set(["journey", "overview"])
/** The retired "AI Phân Tích" tab: its market view is "Thị trường", its stock view is Insight, BCTC is hidden. */
const AI_ANALYSIS_CONTENT = "ai-analysis"
/** Hidden rail tools (Săn mã, Mẫu nến): their links open Demo Trading → Biểu đồ. */
const HIDDEN_VIEWS: ReadonlySet<string> = new Set(demoChrome.items.filter((item) => item.hidden).map((item) => item.id))

const LESSON_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/

/**
 * Rewrites retired URL state (journey tools, "Tổng quan", "AI Phân Tích", hidden tools) to the
 * layout v1.2 workspace without touching anything else (symbol, filters, tour state, hash...).
 * Pure; the same input always reports `changed: false` once it has been rewritten.
 */
export function normalizeWorkspaceSearch(search: string): { search: string; changed: boolean } {
  const params = new URLSearchParams(search)
  let changed = false
  const view = params.get(VIEW_PARAM)
  if (view !== null && LEGACY_VIEWS.has(view)) {
    params.set(VIEW_PARAM, ACADEMY_VIEW)
    changed = true
  }
  if (view !== null && HIDDEN_VIEWS.has(view)) {
    params.set(VIEW_PARAM, "trading")
    params.delete("content")
    params.delete("analysis")
    changed = true
  }
  const content = params.get("content")
  if (content !== null && RETIRED_CONTENT.has(content)) {
    params.delete("content")
    changed = true
  }
  if (content === AI_ANALYSIS_CONTENT) {
    // A tour request used to decide the view before `analysis`; the BCTC tour has nothing to show.
    const tour = params.get("tour")
    const stock = tour === "phantich" || (tour !== "bantin" && params.get("analysis") === "stock")
    params.set("content", stock ? "insight" : "market")
    params.delete("analysis")
    if (tour === "bctc") params.delete("tour")
    changed = true
  }
  // HỌC VIỆN has no main tabs: a link into one of its tools drops the DEMO TRADING tab.
  if (sectionOfTool(params.get(VIEW_PARAM)) === "academy" && (params.has("content") || params.has("analysis"))) {
    params.delete("content")
    params.delete("analysis")
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
