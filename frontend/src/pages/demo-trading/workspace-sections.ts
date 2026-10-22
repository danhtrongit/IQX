import { useSyncExternalStore } from "react"

import { SECTION_DEFAULT_TOOL, sectionOfTool, type WorkspaceSection } from "@/config/chrome"
import { isMainTool, parseDemoContent, type DemoTab } from "./content-tabs-state"
import { normalizeWorkspaceSearch, VIEW_PARAM } from "./workspace-url"

/** URL params owned by one section; everything else (symbol, tour...) is shared by both. */
const SECTION_PARAMS: Record<WorkspaceSection, readonly string[]> = {
  demo: [VIEW_PARAM, "content"],
  academy: [VIEW_PARAM, "lesson", "practice"],
}
const ALL_SECTION_PARAMS = [...new Set([...SECTION_PARAMS.demo, ...SECTION_PARAMS.academy, "analysis"])]

export type SectionMemory = {
  /** The section's own URL params when it was last on screen. */
  params?: string
  /** Panel tool whose panel was collapsed on a wide screen; another tool opens its panel. */
  collapsedTool?: string | null
  /** DEMO TRADING: the tab a second click on Insight returns to. */
  lastTab?: DemoTab
}

export type WorkspaceMemory = Partial<Record<WorkspaceSection, SectionMemory>>

const STORAGE_KEY = "iqx.workspace.sections.v1"

function load(): WorkspaceMemory {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === "object" ? (parsed as WorkspaceMemory) : {}
  } catch {
    return {}
  }
}

let memory: WorkspaceMemory = typeof window === "undefined" ? {} : load()
const listeners = new Set<() => void>()

function update(section: WorkspaceSection, patch: SectionMemory) {
  const current = memory[section] ?? {}
  if (Object.entries(patch).every(([key, value]) => current[key as keyof SectionMemory] === value)) return
  memory = { ...memory, [section]: { ...current, ...patch } }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memory))
  } catch {
    // Private mode or a full quota: the memory still lasts until the page is reloaded.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function sectionOfSearch(search: string): WorkspaceSection {
  return sectionOfTool(new URLSearchParams(normalizeWorkspaceSearch(search).search).get(VIEW_PARAM))
}

/** Per-section state of the workspace for this browser session (layout v1.2 §5.3). */
export const workspaceMemory = {
  get: (): WorkspaceMemory => memory,
  /** Records the section's own params from the current URL (and the last main tab of DEMO TRADING). */
  remember(section: WorkspaceSection, search: string) {
    const params = new URLSearchParams(search)
    const own = new URLSearchParams()
    for (const key of SECTION_PARAMS[section]) {
      const value = params.get(key)
      if (value !== null) own.set(key, value)
    }
    const patch: SectionMemory = { params: own.toString() }
    const content = parseDemoContent(params.get("content"))
    if (section === "demo" && !isMainTool(content)) patch.lastTab = content
    update(section, patch)
  },
  setCollapsedTool(section: WorkspaceSection, tool: string | null) {
    update(section, { collapsedTool: tool })
  },
  /** Test hook: forget everything. */
  reset() {
    memory = {}
    try {
      window.sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // Nothing stored.
    }
    for (const listener of listeners) listener()
  },
}

export function useWorkspaceMemory(): WorkspaceMemory {
  return useSyncExternalStore(subscribe, workspaceMemory.get, workspaceMemory.get)
}

/**
 * Search string that opens `section` the way it was left: the section's remembered params (or
 * its default tool) on top of the shared params of `currentSearch`.
 */
export function sectionSearch(section: WorkspaceSection, currentSearch: string, saved: WorkspaceMemory): string {
  const next = new URLSearchParams(currentSearch)
  for (const key of ALL_SECTION_PARAMS) next.delete(key)
  const own = new URLSearchParams(saved[section]?.params ?? "")
  if (!own.has(VIEW_PARAM) || sectionOfTool(own.get(VIEW_PARAM)) !== section) own.set(VIEW_PARAM, SECTION_DEFAULT_TOOL[section])
  own.forEach((value, key) => next.set(key, value))
  const query = next.toString()
  return query ? `?${query}` : ""
}
