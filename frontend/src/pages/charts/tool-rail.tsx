/**
 * Investment tool rail for the chart pages (`/bieu-do`, `/co-phieu/:symbol`).
 *
 * Owned by this slice rather than the app-wide `RailMenu`: these tools switch an
 * in-page panel and their set is chart-specific. Vertical on desktop, a bottom
 * bar on small screens (mirrors the legacy terminal toolbar geometry).
 */
import {
  ChartCandlestick,
  ChartNoAxesCombined,
  Newspaper,
  ShoppingCart,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type InvestTool = "watchlist" | "order" | "news" | "patterns" | "forecast"

export const TOOL_META: Record<
  InvestTool,
  { label: string; description: string; icon: LucideIcon }
> = {
  watchlist: {
    label: "Danh mục",
    description: "Theo dõi · Nắm giữ · Lịch sử",
    icon: Wallet,
  },
  order: { label: "Đặt lệnh", description: "Lệnh giao dịch mô phỏng", icon: ShoppingCart },
  news: { label: "Tin tức", description: "Tin AI theo mã", icon: Newspaper },
  patterns: {
    label: "AI Mẫu nến",
    description: "Mẫu nến & mẫu hình giá",
    icon: ChartCandlestick,
  },
  forecast: { label: "Dự báo", description: "Xếp hạng và dự báo theo mã", icon: ChartNoAxesCombined },
}

export const INVEST_TOOLS: InvestTool[] = ["watchlist", "order", "news", "patterns", "forecast"]

export function isInvestTool(value: string | null): value is InvestTool {
  return value === "watchlist" || value === "order" || value === "news" || value === "patterns" || value === "forecast"
}

export function ToolRail({
  tool,
  onSelect,
  onAiInsight,
}: {
  tool: InvestTool
  onSelect: (tool: InvestTool) => void
  onAiInsight: () => void
}) {
  return (
    <nav
      aria-label="Công cụ đầu tư"
      className="fixed inset-x-0 bottom-0 z-40 flex h-14 shrink-0 flex-row items-center justify-around border-t border-border bg-card px-1 pb-[env(safe-area-inset-bottom)] lg:static lg:h-full lg:w-(--rail-width) lg:flex-col lg:justify-start lg:gap-1 lg:border-t-0 lg:border-l lg:px-1.5 lg:py-2"
    >
      {INVEST_TOOLS.map((id) => {
        const Icon = TOOL_META[id].icon
        const active = id === tool
        return (
          <Button
            key={id}
            type="button"
            variant="ghost"
            aria-pressed={active}
            onClick={() => onSelect(id)}
            className={cn(
              "relative h-auto flex-col gap-1 px-2 py-1.5 text-center lg:min-h-20 lg:w-full lg:px-1 lg:py-3",
              active
                ? "bg-primary/15 text-foreground lg:before:absolute lg:before:inset-y-3 lg:before:left-0 lg:before:w-0.5 lg:before:rounded-full lg:before:bg-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn("size-4 lg:size-5", active && "text-primary")}
            />
            <span className="text-[10px] leading-4 font-medium lg:text-[11px]">
              {TOOL_META[id].label}
            </span>
          </Button>
        )
      })}

      <Button
        type="button"
        variant="ghost"
        onClick={onAiInsight}
        className="h-auto flex-col gap-1 px-2 py-1.5 text-center text-muted-foreground hover:bg-muted hover:text-foreground lg:min-h-20 lg:w-full lg:px-1 lg:py-3"
      >
        <Sparkles aria-hidden="true" className="size-4 lg:size-5" />
        <span className="text-[10px] leading-4 font-medium lg:text-[11px]">
          AI Phân tích
        </span>
      </Button>
    </nav>
  )
}
