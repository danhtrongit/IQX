import { redirect, type LoaderFunctionArgs } from "react-router"

import {
  FLASHBACK_TOOL,
  INSIGHT_ENABLED,
  PRACTICE_TOOL,
  SECTION_PATH,
  TOOL_PARAM,
  sectionOfPath,
  type WorkspaceSection,
} from "@/config/chrome"
import { DEFAULT_TRADING_TAB, isTradingTab, TRADING_TAB_PARAM, type TradingTab } from "./content-tabs-state"

export { TOOL_PARAM } from "@/config/chrome"
/** The Học viện tool of LUYỆN TẬP: the target of every retired "Hành trình" link. */
export const ACADEMY_TOOL = PRACTICE_TOOL.academy
/** Lesson to open inside the Học viện tool, e.g. `?tool=hoc-vien&lesson=ch01-l01`. */
export const LESSON_PARAM = "lesson"
/**
 * Metric whose lesson the Học viện tool opens (spec v4 §6), e.g. `?tool=hoc-vien&metric=NIM` or
 * `metric=Tỷ lệ dự phòng / Dư nợ`. The tool resolves it through `GET /academy/link` once the account is
 * known, then replaces it with `lesson=<item id>`.
 */
export const METRIC_PARAM = "metric"
/** A metric key or name is free text; the server takes at most this many characters (`linkQuerySchema`). */
export const METRIC_MAX_LENGTH = 120

/** The retired DEMO TRADING / HỌC VIỆN route; it only redirects now (layout v1.3 §6). */
export const LEGACY_WORKSPACE_PATH = "/demo-trading"
/** Its tool param. */
const LEGACY_TOOL_PARAM = "view"

/** Where a tool id opens: its section, its slug and, for the Giao dịch tool, a panel tab. */
export type ToolTarget = {
  section: WorkspaceSection
  tool: string
  tab?: TradingTab
  /** The link names a panel of its own: the main-area tab it carried is dropped (hidden tools, Insight). */
  dropContent?: boolean
}

const practice = (tool: string, tab?: TradingTab, dropContent?: boolean): ToolTarget => ({ section: "practice", tool, tab, dropContent })
const flashback = (tool: string): ToolTarget => ({ section: "flashback", tool })

/**
 * Every tool id a URL or a panel link may name: the v1.3 slugs and the ids of the retired
 * layout (`view=trading`, `view=academy`...). Retired journey tools land on Học viện; hidden tools
 * (Săn mã, Mẫu nến) and Insight land on Giao dịch → Đặt lệnh.
 */
const TOOL_TARGETS: Record<string, ToolTarget> = {
  [PRACTICE_TOOL.dojo]: practice(PRACTICE_TOOL.dojo),
  [PRACTICE_TOOL.academy]: practice(PRACTICE_TOOL.academy),
  [PRACTICE_TOOL.bot]: practice(PRACTICE_TOOL.bot),
  [PRACTICE_TOOL.trading]: practice(PRACTICE_TOOL.trading),
  [PRACTICE_TOOL.dashboard]: practice(PRACTICE_TOOL.dashboard),
  [FLASHBACK_TOOL.flashback]: flashback(FLASHBACK_TOOL.flashback),
  [FLASHBACK_TOOL.shop]: flashback(FLASHBACK_TOOL.shop),
  trading: practice(PRACTICE_TOOL.trading, "dat-lenh"),
  portfolio: practice(PRACTICE_TOOL.trading, "danh-muc"),
  news: practice(PRACTICE_TOOL.trading, "tin-tuc"),
  insight: practice(PRACTICE_TOOL.trading, "dat-lenh", true),
  hunt: practice(PRACTICE_TOOL.trading, "dat-lenh", true),
  patterns: practice(PRACTICE_TOOL.trading, "dat-lenh", true),
  dashboard: practice(PRACTICE_TOOL.dashboard),
  academy: practice(PRACTICE_TOOL.academy),
  journey: practice(PRACTICE_TOOL.academy),
  identity: practice(PRACTICE_TOOL.academy),
  analysis: practice(PRACTICE_TOOL.academy),
}

/** Section, slug and tab of a tool id (current or retired); null for an unknown id. */
export function toolTarget(id: string | null | undefined): ToolTarget | null {
  return id && Object.hasOwn(TOOL_TARGETS, id) ? TOOL_TARGETS[id] : null
}

/** Retired main tabs: the journey, then the overview ("Tổng quan"); both land on the default tab. */
const RETIRED_CONTENT: ReadonlySet<string> = new Set(["journey", "overview"])
/** The retired "AI Phân Tích" tab: its market view is "Thị trường", its stock view is Insight, BCTC is hidden. */
const AI_ANALYSIS_CONTENT = "ai-analysis"

const LESSON_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/

/**
 * Canonical place of a workspace URL (layout v1.3 §6). `/demo-trading` always moves to
 * `/luyen-tap` or `/flashback`; a section route is rewritten only when it carries a retired or
 * unknown value (an old tool id, a tool of the other section, a stale main tab, a Giao dịch tab
 * without the Giao dịch tool...). Everything else (symbol, tour, lesson, practice, room...) is kept.
 * Pure and idempotent: a rewritten location reports `changed: false` the next time.
 */
export function resolveWorkspaceLocation(pathname: string, search: string): { pathname: string; search: string; changed: boolean } {
  const legacy = pathname === LEGACY_WORKSPACE_PATH
  const routeSection = sectionOfPath(pathname)
  const params = new URLSearchParams(search)
  let changed = legacy

  // The tool id: `view=` on the retired route (and on a section route that still carries it), else `tool=`.
  let rawTool = params.get(TOOL_PARAM)
  if (legacy) {
    // `tool=` on the old route belonged to the retired chart shell.
    rawTool = params.get(LEGACY_TOOL_PARAM)
    params.delete(TOOL_PARAM)
  } else if (params.has(LEGACY_TOOL_PARAM)) {
    rawTool ??= params.get(LEGACY_TOOL_PARAM)
    changed = true
  }
  params.delete(LEGACY_TOOL_PARAM)

  let target = toolTarget(rawTool)
  if (!target && legacy) target = practice(PRACTICE_TOOL.trading, DEFAULT_TRADING_TAB)
  if (rawTool !== null && (!target || target.tool !== rawTool)) changed = true

  let tab: TradingTab | undefined = target?.tab
  if (target?.tool === PRACTICE_TOOL.trading) {
    if (target.dropContent && params.has("content")) {
      changed = true
      params.delete("content")
    }
    const content = params.get("content")
    let nextContent: string | null = content
    // `chart` is the default main tab; a moved link drops it.
    if (content !== null && (RETIRED_CONTENT.has(content) || (legacy && content === "chart"))) nextContent = null
    if (content === AI_ANALYSIS_CONTENT) {
      // A tour request used to decide the view before `analysis`; the BCTC tour has nothing to show.
      const tour = params.get("tour")
      const stock = tour === "phantich" || (tour !== "bantin" && params.get("analysis") === "stock")
      nextContent = stock ? "insight" : "market"
      if (tour === "bctc") params.delete("tour")
    }
    if (nextContent === "insight" && !INSIGHT_ENABLED) {
      // Insight is hidden: its links open Giao dịch → Đặt lệnh with the same symbol.
      nextContent = null
      tab = "dat-lenh"
    }
    if (nextContent === "dashboard") {
      target = practice(PRACTICE_TOOL.dashboard)
      nextContent = null
    }
    if (nextContent !== content) {
      changed = true
      if (nextContent === null) params.delete("content")
      else params.set("content", nextContent)
    }
  }

  if (target?.tool === PRACTICE_TOOL.trading) {
    const current = params.get(TRADING_TAB_PARAM)
    const nextTab = tab ?? (isTradingTab(current) ? current : DEFAULT_TRADING_TAB)
    if (current !== nextTab) changed = true
    params.set(TRADING_TAB_PARAM, nextTab)
  } else {
    // Only Giao dịch has main-area tabs and panel tabs.
    if (params.has("content") || params.has(TRADING_TAB_PARAM)) changed = true
    params.delete("content")
    params.delete(TRADING_TAB_PARAM)
  }
  if (params.has("analysis")) {
    changed = true
    params.delete("analysis")
  }

  const section = target?.section ?? routeSection ?? "practice"
  if (section !== routeSection) changed = true
  if (!changed) return { pathname, search, changed: false }

  // Canonical order: tool, tab, then the rest as it came.
  const next = new URLSearchParams()
  if (target) next.set(TOOL_PARAM, target.tool)
  const nextTab = params.get(TRADING_TAB_PARAM)
  if (nextTab !== null) next.set(TRADING_TAB_PARAM, nextTab)
  params.forEach((value, key) => {
    if (key !== TOOL_PARAM && key !== TRADING_TAB_PARAM) next.append(key, value)
  })
  const query = next.toString()
  return { pathname: SECTION_PATH[section], search: query ? `?${query}` : "", changed: true }
}

/**
 * Route loader of `/luyen-tap`, `/flashback` and the retired `/demo-trading`: an old or stale link is
 * redirected before the workspace renders, so nothing of a retired flow can run.
 */
export function workspaceLoader({ request }: LoaderFunctionArgs): null {
  const url = new URL(request.url)
  const resolved = resolveWorkspaceLocation(url.pathname, url.search)
  // The router strips the fragment from a loader request, so there is none to carry over.
  if (resolved.changed) throw redirect(`${resolved.pathname}${resolved.search}`)
  return null
}

/** Loader of a retired path that meant the old workspace (`/dau-truong`): read it as `/demo-trading`. */
export function legacyWorkspaceLoader({ request }: LoaderFunctionArgs): never {
  const resolved = resolveWorkspaceLocation(LEGACY_WORKSPACE_PATH, new URL(request.url).search)
  throw redirect(`${resolved.pathname}${resolved.search}`)
}

/** A usable metric key or name: trimmed, not empty, within the server's limit; otherwise null. */
export function parseMetricParam(value: string | null | undefined): string | null {
  const name = value?.trim()
  return name && name.length <= METRIC_MAX_LENGTH ? name : null
}

/**
 * Where the `/hoc-vien[/:lessonId]` and `/hoc-vien/bai/:metric` routes live: LUYỆN TẬP → Học viện.
 * A lesson id is kept when it looks like one; a metric (argument, else the `metric` query parameter) is
 * kept when it is usable, and anything else is dropped.
 */
export function academyWorkspaceLocation(lessonId: string | undefined, search = "", hash = "", metric?: string) {
  const params = new URLSearchParams(search)
  params.delete(LEGACY_TOOL_PARAM)
  params.set(TOOL_PARAM, ACADEMY_TOOL)
  if (lessonId && LESSON_ID.test(lessonId)) params.set(LESSON_PARAM, lessonId)
  const name = parseMetricParam(metric ?? params.get(METRIC_PARAM))
  if (name) params.set(METRIC_PARAM, name)
  else params.delete(METRIC_PARAM)
  return { pathname: SECTION_PATH.practice, search: `?${params}`, hash }
}
