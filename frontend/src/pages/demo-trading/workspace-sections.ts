import { useSyncExternalStore } from "react"

import { PRACTICE_TOOL, SECTION_CHROME, TOOL_PARAM, type WorkspaceSection } from "@/config/chrome"
import {
  DEFAULT_TRADING_TAB,
  isMainTool,
  isTradingTab,
  parseDemoContent,
  parseTradingTab,
  TRADING_TAB_PARAM,
  withDemoContent,
  type DemoTab,
  type TradingTab,
} from "./content-tabs-state"

/** URL params owned by one section; everything else (symbol, tour...) is shared by both. */
const SECTION_PARAMS: Record<WorkspaceSection, readonly string[]> = {
  practice: [TOOL_PARAM, TRADING_TAB_PARAM, "content", "lesson", "practice"],
  flashback: [TOOL_PARAM],
}
const ALL_SECTION_PARAMS = [...new Set([...SECTION_PARAMS.practice, ...SECTION_PARAMS.flashback, "analysis", "view", "metric"])]

export type SectionMemory = {
  /** The section's own URL params when it was last on screen. */
  params?: string
  /** Panel tool whose panel was collapsed on a wide screen; another tool opens its panel. */
  collapsedTool?: string | null
  /** LUYỆN TẬP → Giao dịch: the last main-area tab (Biểu đồ, Bảng giá, Thị trường). */
  lastTab?: DemoTab
  /** LUYỆN TẬP → Giao dịch: the last panel tab (Đặt lệnh, Danh mục, Tin tức). */
  tradingTab?: TradingTab
}

export type WorkspaceMemory = Partial<Record<WorkspaceSection, SectionMemory>>

const STORAGE_KEY = "iqx.workspace.sections.v2"

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

/** Per-section state of the workspace for this browser session (layout v1.3 §2.4, v1.2 §5.3). */
export const workspaceMemory = {
  get: (): WorkspaceMemory => memory,
  /** Records the section's own params from the current URL (and the Giao dịch tabs of LUYỆN TẬP). */
  remember(section: WorkspaceSection, search: string) {
    const params = new URLSearchParams(search)
    const own = new URLSearchParams()
    for (const key of SECTION_PARAMS[section]) {
      const value = params.get(key)
      if (value !== null) own.set(key, value)
    }
    const patch: SectionMemory = { params: own.toString() }
    if (section === "practice" && params.get(TOOL_PARAM) === PRACTICE_TOOL.trading) {
      const content = parseDemoContent(params.get("content"))
      if (!isMainTool(content)) patch.lastTab = content
      patch.tradingTab = parseTradingTab(params.get(TRADING_TAB_PARAM))
    }
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

function isSectionTool(section: WorkspaceSection, tool: string | null): boolean {
  return SECTION_CHROME[section].items.some((item) => item.id === tool && !item.hidden)
}

/**
 * `current` with `tool` selected in its own section. Giao dịch gets its panel tab (`tab`, else the one
 * on screen, else the remembered one) and its remembered main tab; any other tool drops both.
 */
export function withTool(current: URLSearchParams, tool: string, saved: SectionMemory | undefined, tab?: TradingTab): URLSearchParams {
  let next = new URLSearchParams(current)
  next.set(TOOL_PARAM, tool)
  if (tool !== PRACTICE_TOOL.trading) {
    next.delete(TRADING_TAB_PARAM)
    next.delete("content")
    return next
  }
  const wasTrading = current.get(TOOL_PARAM) === PRACTICE_TOOL.trading
  const shownTab = current.get(TRADING_TAB_PARAM)
  next.set(TRADING_TAB_PARAM, tab ?? (wasTrading && isTradingTab(shownTab) ? shownTab : saved?.tradingTab ?? DEFAULT_TRADING_TAB))
  // Coming from another tool, or leaving Insight: the main area shows the tab it showed last.
  const content = parseDemoContent(current.get("content"))
  if (!wasTrading || isMainTool(content)) next = withDemoContent(next, saved?.lastTab ?? "chart")
  return next
}

/**
 * Search string that opens `section` the way it was left: the section's remembered params (or its
 * default tool) on top of the shared params of `currentSearch`. With `tool`, that tool opens instead
 * (its remembered params are kept when it is the remembered tool).
 */
export function sectionSearch(
  section: WorkspaceSection,
  currentSearch: string,
  saved: WorkspaceMemory,
  tool?: { id: string; tab?: TradingTab },
): string {
  const shared = new URLSearchParams(currentSearch)
  for (const key of ALL_SECTION_PARAMS) shared.delete(key)
  const remembered = new URLSearchParams(saved[section]?.params ?? "")
  const rememberedTool = remembered.get(TOOL_PARAM)
  let own: URLSearchParams
  if (tool) {
    own = rememberedTool === tool.id ? remembered : new URLSearchParams()
    own = withTool(own, tool.id, saved[section], tool.tab)
  } else if (isSectionTool(section, rememberedTool)) {
    own = remembered
  } else {
    own = withTool(new URLSearchParams(), SECTION_CHROME[section].defaultId, saved[section])
  }
  const next = new URLSearchParams(own)
  shared.forEach((value, key) => next.append(key, value))
  const query = next.toString()
  return query ? `?${query}` : ""
}
