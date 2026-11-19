import { INSIGHT_ENABLED } from "@/config/chrome"

/**
 * Main area of LUYỆN TẬP → Giao dịch: the three tabs ("Biểu đồ", "Bảng giá", "Thị trường") and Insight,
 * the main-area tool that replaces them while it is enabled. `chart` is the default and the only value
 * without a URL param.
 */
export type DemoContent = "chart" | "board" | "market" | "insight"
export type DemoTab = Exclude<DemoContent, "insight">

const VALID_CONTENT: DemoContent[] = ["chart", "board", "market", "insight"]

/** Insight replaces the main area of Giao dịch (only while it is enabled). */
export function isMainTool(value: string): value is "insight" {
  return value === "insight"
}

/** Unknown values fall back to the chart; so does Insight while it is hidden. */
export function parseDemoContent(value: string | null): DemoContent {
  if (value === "insight" && !INSIGHT_ENABLED) return "chart"
  return VALID_CONTENT.includes(value as DemoContent) ? (value as DemoContent) : "chart"
}

export function withDemoContent(params: URLSearchParams, content: DemoContent): URLSearchParams {
  const next = new URLSearchParams(params)
  if (content === "chart") next.delete("content")
  else next.set("content", content)
  return next
}

/** Panel tabs of the Giao dịch tool (layout v1.3 §3): Đặt lệnh · Danh mục · Tin tức, in the URL as `tab=`. */
export type TradingTab = "dat-lenh" | "danh-muc" | "tin-tuc"
export const TRADING_TAB_PARAM = "tab"
export const DEFAULT_TRADING_TAB: TradingTab = "dat-lenh"
export const TRADING_TABS: readonly { id: TradingTab; label: string }[] = [
  { id: "dat-lenh", label: "Đặt lệnh" },
  { id: "danh-muc", label: "Danh mục" },
  { id: "tin-tuc", label: "Tin tức" },
]

export function isTradingTab(value: string | null | undefined): value is TradingTab {
  return TRADING_TABS.some((tab) => tab.id === value)
}

export function parseTradingTab(value: string | null | undefined): TradingTab {
  return isTradingTab(value) ? value : DEFAULT_TRADING_TAB
}
