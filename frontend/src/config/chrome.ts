import {
  ArrowLeftRight,
  BookOpen,
  Bot,
  ChartCandlestick,
  History,
  LayoutDashboard,
  ScanSearch,
  Store,
  Swords,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"

export type RailItem = {
  id: string
  label: string
  icon: LucideIcon
  /** `sidebar` tools fill the context panel; a `left` tool replaces the main area (Insight). */
  affects: "left" | "sidebar"
  /** Keep the tool's code and data without rendering it in the rail. */
  hidden?: boolean
}

/** The two top-level sections of the workspace (layout v1.3): LUYỆN TẬP and FLASHBACK. */
export type WorkspaceSection = "practice" | "flashback"

export type RouteChrome = {
  param: string
  defaultId: string
  items: RailItem[]
}

/** URL param of the workspace tool, e.g. `/luyen-tap?tool=giao-dich`. */
export const TOOL_PARAM = "tool"

/** Route of each workspace section. */
export const SECTION_PATH: Record<WorkspaceSection, string> = { practice: "/luyen-tap", flashback: "/flashback" }

/** Workspace section served at `pathname`, if any. */
export function sectionOfPath(pathname: string): WorkspaceSection | null {
  if (pathname === SECTION_PATH.practice) return "practice"
  if (pathname === SECTION_PATH.flashback) return "flashback"
  return null
}

/** "Bài học" stays routable but is off the header unless `VITE_SHOW_LESSONS_NAV=true`. */
const SHOW_LESSONS_NAV = import.meta.env.VITE_SHOW_LESSONS_NAV === "true"

export const HEADER_NAV: readonly { to: string; label: string; hidden?: boolean }[] = [
  { to: "/", label: "Giới thiệu" },
  { to: SECTION_PATH.practice, label: "Luyện tập" },
  { to: SECTION_PATH.flashback, label: "Flashback" },
  { to: "/chien-luoc", label: "Chiến lược" },
  { to: "/bai-hoc", label: "Bài học", hidden: !SHOW_LESSONS_NAV },
  { to: "/khu-giao-dich", label: "Khu giao dịch" },
]

/** Tool slugs of LUYỆN TẬP. */
export const PRACTICE_TOOL = {
  dojo: "candle-dojo",
  academy: "hoc-vien",
  bot: "bot",
  trading: "giao-dich",
  dashboard: "phan-tich",
  insight: "insight",
} as const

/** Tool slugs of FLASHBACK. */
export const FLASHBACK_TOOL = { flashback: "flashback", shop: "shop" } as const

/**
 * LUYỆN TẬP rail, top to bottom (layout v1.3 §2.2): Candle Dojo · Học viện · Bot · Giao dịch ·
 * Dashboard phân tích. Candle Dojo is the default tool. Insight is hidden (code, route and data kept;
 * `hidden: false` brings it back as a main-area tool of Giao dịch). Săn mã and Mẫu nến stay hidden and
 * their links land on Giao dịch.
 */
export const practiceChrome: RouteChrome = {
  param: TOOL_PARAM,
  defaultId: PRACTICE_TOOL.dojo,
  items: [
    { id: PRACTICE_TOOL.dojo, label: "Candle Dojo", icon: Swords, affects: "sidebar" },
    { id: PRACTICE_TOOL.academy, label: "Học viện", icon: BookOpen, affects: "sidebar" },
    { id: PRACTICE_TOOL.bot, label: "Bot", icon: Bot, affects: "sidebar" },
    { id: PRACTICE_TOOL.trading, label: "Giao dịch", icon: ArrowLeftRight, affects: "sidebar" },
    { id: PRACTICE_TOOL.dashboard, label: "Dashboard phân tích", icon: LayoutDashboard, affects: "sidebar" },
    { id: PRACTICE_TOOL.insight, label: "Insight", icon: TrendingUp, affects: "left", hidden: true },
    { id: "hunt", label: "Săn mã", icon: ScanSearch, affects: "sidebar", hidden: true },
    { id: "patterns", label: "Mẫu nến", icon: ChartCandlestick, affects: "sidebar", hidden: true },
  ],
}

/** FLASHBACK rail (layout v1.3 §4): Flashback (default, the lobby) · Shop. */
export const flashbackChrome: RouteChrome = {
  param: TOOL_PARAM,
  defaultId: FLASHBACK_TOOL.flashback,
  items: [
    { id: FLASHBACK_TOOL.flashback, label: "Flashback", icon: History, affects: "sidebar" },
    { id: FLASHBACK_TOOL.shop, label: "Shop", icon: Store, affects: "sidebar" },
  ],
}

export const SECTION_CHROME: Record<WorkspaceSection, RouteChrome> = { practice: practiceChrome, flashback: flashbackChrome }

/** Insight is off the rail while its rail item is hidden; its links then open Giao dịch → Đặt lệnh. */
export const INSIGHT_ENABLED = practiceChrome.items.some((item) => item.id === PRACTICE_TOOL.insight && !item.hidden)

/** Section whose rail lists `tool` (visible or hidden), or null for an unknown tool. */
export function sectionOfTool(tool: string | null): WorkspaceSection | null {
  if (tool === null) return null
  if (practiceChrome.items.some((item) => item.id === tool)) return "practice"
  if (flashbackChrome.items.some((item) => item.id === tool)) return "flashback"
  return null
}

export const emptyChrome: RouteChrome = { param: "view", defaultId: "", items: [] }
