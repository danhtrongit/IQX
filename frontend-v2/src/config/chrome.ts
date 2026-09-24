import {
  Bot,
  ChartNoAxesCombined,
  Compass,
  Flower2,
  BrainCircuit,
  Newspaper,
  ScanLine,
  ScanSearch,
  ShoppingCart,
  Wallet,
  type LucideIcon,
} from "lucide-react"

export type RailItem = {
  id: string
  label: string
  icon: LucideIcon
  affects: "left" | "sidebar"
}

export type RouteChrome = {
  param: string
  defaultId: string
  items: RailItem[]
}

export const HEADER_NAV = [
  { to: "/", label: "Giới thiệu" },
  { to: "/demo-trading", label: "Demo Trading" },
  { to: "/chien-luoc", label: "Chiến lược" },
  { to: "/bai-hoc", label: "Bài học" },
] as const

export const demoChrome: RouteChrome = {
  param: "view",
  defaultId: "journey",
  items: [
    { id: "journey", label: "Hành trình", icon: Compass, affects: "sidebar" },
    { id: "trading", label: "Đặt lệnh", icon: ShoppingCart, affects: "sidebar" },
    { id: "portfolio", label: "Danh mục", icon: Wallet, affects: "sidebar" },
    { id: "analysis", label: "Phân tích", icon: ChartNoAxesCombined, affects: "sidebar" },
    { id: "identity", label: "Linh thú", icon: Flower2, affects: "sidebar" },
    { id: "hunt", label: "Săn mã", icon: ScanSearch, affects: "sidebar" },
    { id: "news", label: "Tin tức", icon: Newspaper, affects: "sidebar" },
    { id: "patterns", label: "Mẫu nến", icon: ScanLine, affects: "sidebar" },
    { id: "bot", label: "Bot của tôi", icon: Bot, affects: "sidebar" },
    { id: "ai-analysis", label: "AI Phân Tích", icon: BrainCircuit, affects: "left" },
  ],
}


export const emptyChrome: RouteChrome = { param: "view", defaultId: "", items: [] }
