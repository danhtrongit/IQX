import {
  BookOpen,
  Bot,
  ChartCandlestick,
  Newspaper,
  ScanSearch,
  ShoppingCart,
  Store,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react"

export type RailItem = {
  id: string
  label: string
  icon: LucideIcon
  /** `sidebar` tools fill the context panel; a `left` tool replaces the main area (Insight). */
  affects: "left" | "sidebar"
  /** Workspace section whose rail lists the tool. */
  section?: WorkspaceSection
  /** Keep the tool's code and data without rendering it in the rail. */
  hidden?: boolean
}

/** The two top-level sections of the workspace: DEMO TRADING and HỌC VIỆN. */
export type WorkspaceSection = "demo" | "academy"

export type RouteChrome = {
  param: string
  defaultId: string
  items: RailItem[]
}

/** "Bài học" stays routable but is off the header unless `VITE_SHOW_LESSONS_NAV=true`. */
const SHOW_LESSONS_NAV = import.meta.env.VITE_SHOW_LESSONS_NAV === "true"

export const HEADER_NAV: readonly { to: string; label: string; hidden?: boolean }[] = [
  { to: "/", label: "Giới thiệu" },
  { to: "/demo-trading?view=trading", label: "Demo Trading" },
  { to: "/chien-luoc", label: "Chiến lược" },
  { to: "/bai-hoc", label: "Bài học", hidden: !SHOW_LESSONS_NAV },
  // The HỌC VIỆN section of the workspace (the old /hoc-vien route redirects here).
  { to: "/demo-trading?view=academy", label: "Học viện" },
]

/**
 * Workspace tools, top to bottom per section (layout v1.2). DEMO TRADING:
 * Đặt lệnh · Danh mục · Tin tức · Insight; HỌC VIỆN: Học viện · Bot · Shop.
 * Săn mã and Mẫu nến are hidden; their links land on Demo Trading → Biểu đồ.
 * A missing or unknown tool is "Đặt lệnh" (DEMO TRADING).
 */
export const demoChrome: RouteChrome = {
  param: "view",
  defaultId: "trading",
  items: [
    { id: "trading", label: "Đặt lệnh", icon: ShoppingCart, affects: "sidebar", section: "demo" },
    { id: "portfolio", label: "Danh mục", icon: Wallet, affects: "sidebar", section: "demo" },
    { id: "news", label: "Tin tức", icon: Newspaper, affects: "sidebar", section: "demo" },
    { id: "insight", label: "Insight", icon: TrendingUp, affects: "left", section: "demo" },
    { id: "hunt", label: "Săn mã", icon: ScanSearch, affects: "sidebar", section: "demo", hidden: true },
    { id: "patterns", label: "Mẫu nến", icon: ChartCandlestick, affects: "sidebar", section: "demo", hidden: true },
    { id: "academy", label: "Học viện", icon: BookOpen, affects: "sidebar", section: "academy" },
    { id: "bot", label: "Bot", icon: Bot, affects: "sidebar", section: "academy" },
    { id: "shop", label: "Shop", icon: Store, affects: "sidebar", section: "academy" },
  ],
}

/** Default panel tool of each section. */
export const SECTION_DEFAULT_TOOL: Record<WorkspaceSection, string> = { demo: "trading", academy: "academy" }

/** Section of a panel tool; anything that is not a HỌC VIỆN tool belongs to DEMO TRADING. */
export function sectionOfTool(id: string | null): WorkspaceSection {
  return demoChrome.items.some((item) => item.id === id && item.section === "academy") ? "academy" : "demo"
}

export const emptyChrome: RouteChrome = { param: "view", defaultId: "", items: [] }
