import {
  BookOpen,
  Bot,
  BrainCircuit,
  ChartCandlestick,
  Newspaper,
  ScanSearch,
  ShoppingCart,
  Store,
  Wallet,
  type LucideIcon,
} from "lucide-react"

export type RailItem = {
  id: string
  label: string
  icon: LucideIcon
  affects: "left" | "sidebar"
  /** Keep URL-addressable tools available without rendering them in the rail. */
  hidden?: boolean
}

export type RouteChrome = {
  param: string
  defaultId: string
  items: RailItem[]
}

export const HEADER_NAV = [
  { to: "/", label: "Giới thiệu" },
  { to: "/demo-trading?view=trading", label: "Demo Trading" },
  { to: "/chien-luoc", label: "Chiến lược" },
  { to: "/bai-hoc", label: "Bài học" },
  // Opens the workspace's Học viện tool (the old /hoc-vien route redirects here).
  { to: "/demo-trading?view=academy", label: "Học viện" },
] as const

/**
 * Workspace tools, top to bottom as on the approved v4 rail. Every tool is
 * always available: nothing is locked by level or progress. "Học viện" is the
 * default tool; "Shop" sits directly under "Bot".
 */
export const demoChrome: RouteChrome = {
  param: "view",
  defaultId: "academy",
  items: [
    { id: "academy", label: "Học viện", icon: BookOpen, affects: "sidebar" },
    { id: "trading", label: "Đặt lệnh", icon: ShoppingCart, affects: "sidebar" },
    { id: "portfolio", label: "Danh mục", icon: Wallet, affects: "sidebar" },
    { id: "bot", label: "Bot", icon: Bot, affects: "sidebar" },
    { id: "shop", label: "Shop", icon: Store, affects: "sidebar" },
    { id: "hunt", label: "Săn mã", icon: ScanSearch, affects: "sidebar" },
    { id: "news", label: "Tin tức", icon: Newspaper, affects: "sidebar" },
    { id: "patterns", label: "Mẫu nến", icon: ChartCandlestick, affects: "sidebar" },
    { id: "ai-analysis", label: "AI Phân Tích", icon: BrainCircuit, affects: "left", hidden: true },
  ],
}

export const emptyChrome: RouteChrome = { param: "view", defaultId: "", items: [] }
