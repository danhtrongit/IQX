import type { ComponentType } from "react"
import { IconCompass, IconEye, IconSearch, IconStar } from "@arco-design/web-react/icon"
import { useSidebar, type SidebarPanel } from "@/shared/contexts/sidebar-context"
import { cn } from "@/shared/lib/cn"
import { IconBulb } from "@/shared/icons"
import { IconShoppingCart, IconNewspaper, IconCandlestick } from "../icons"
// Concrete-file imports (NOT the `@/features/cap0` barrel) — see
// `RightSidebar.tsx`'s comment: the barrel re-exports `Cap0TradingPage`,
// which imports `RightToolbar` back from `@/features/dashboard`.
import { useCap0Events } from "@/features/cap0/Cap0Context"
import { useCap0Progress } from "@/features/cap0/hooks"
import { cap0Visibility } from "@/features/cap0/cap0Visibility"
// Cùng lý do chống vòng module như các import cap0 ở trên (barrel `@/features/cap5`
// re-export `Cap5TradingPage`, file đó lại import `RightToolbar` về).
import { useCap5Events } from "@/features/cap5/Cap5Context"

interface ToolbarItem {
  icon: ComponentType<{ className?: string }>
  label: string
  id: string
  badge?: number
  panel?: SidebarPanel
  onClick?: () => void
}

function ToolbarButton({
  item,
  isActive,
  onClick,
}: {
  item: ToolbarItem
  isActive: boolean
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      id={`toolbar-${item.id}`}
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center justify-center gap-0.5 w-full py-2 px-1 rounded-md transition-colors",
        isActive
          ? "text-[rgb(var(--primary-6))] bg-[var(--color-primary-light-1)]"
          : "text-[var(--color-text-3)] hover:text-[var(--color-text-1)] hover:bg-[var(--color-fill-2)]",
      )}
    >
      <Icon className="text-[18px]" />
      <span className="text-[9px] font-medium leading-tight text-center md:whitespace-nowrap">
        {item.label}
      </span>
      {item.badge != null && item.badge > 0 && (
        <span className="absolute top-1 right-1 size-3.5 bg-[rgb(var(--danger-6))] text-white text-[7px] font-bold rounded-full flex items-center justify-center">
          {item.badge > 9 ? "9+" : item.badge}
        </span>
      )}
    </button>
  )
}

export function RightToolbar({
  onActionClick,
}: {
  onActionClick?: (id: string) => void
}) {
  const { activePanel, setActivePanel } =
    useSidebar()
  // Hide-by-level (spec §8) — "Tin tức" / "AI Mẫu nến" tab buttons stay
  // hidden until Cấp 1 (graduation) while in Cấp 0.
  // `useCap0Progress(isCap0Active)` only queries inside Cấp 0, so this has
  // zero effect on /bieu-do & /co-phieu (both flags default to visible).
  const { isCap0Active } = useCap0Events()
  const { data: cap0Progress } = useCap0Progress(isCap0Active)
  const visibility = cap0Visibility(cap0Progress)
  const showNewsTab = !isCap0Active || visibility.newsTab
  const showAiPatternsTab = !isCap0Active || visibility.aiPatternsTab
  // ★ Hai nút MỚI của Cấp 5 («Săn mã» §5 + «Watchlist» §6) chỉ mọc ra TRONG
  // shell Cấp 5. Ngoài `Cap5Provider` (/bieu-do, /co-phieu, Cấp 0-4) hook trả
  // bus no-op ⇒ `isCap5Active === false` ⇒ thanh công cụ giữ NGUYÊN hình dạng
  // cũ, không thừa một nút nào.
  const { isCap5Active } = useCap5Events()

  const handleClick = (item: ToolbarItem) => {
    if (item.panel) {
      setActivePanel(item.panel)
    } else if (item.onClick) {
      item.onClick()
    } else {
      onActionClick?.(item.id)
    }
  }

  const ITEMS: ToolbarItem[] = [
    // Cấp 0 «Nhập môn» onboarding tab (spec §7) — first item, only meaningful
    // on `/dau-truong`; harmless elsewhere (unmounted RightSidebar case is
    // handled by `panelNames`/the switch, not here).
    { icon: IconCompass, label: "Hành trình", id: "journey", panel: "journey" },
    { icon: IconShoppingCart, label: "Đặt lệnh", id: "order", panel: "trading" },
    { icon: IconEye, label: "Danh mục", id: "watchlist", panel: "watchlist" },
    ...(isCap5Active
      ? ([
          { icon: IconSearch, label: "Săn mã", id: "cap5-sanma", panel: "cap5-sanma" },
          {
            icon: IconStar,
            label: "Watchlist",
            id: "cap5-watchlist",
            panel: "cap5-watchlist",
          },
        ] as ToolbarItem[])
      : []),
    ...(showNewsTab
      ? [{ icon: IconNewspaper, label: "Tin tức", id: "news", panel: "news" } as ToolbarItem]
      : []),
    {
      icon: IconBulb,
      label: "AI Phân tích",
      id: "ai-insight",
      onClick: () => onActionClick?.("ai-insight"),
    },
    ...(showAiPatternsTab
      ? [
          {
            icon: IconCandlestick,
            label: "AI Mẫu nến",
            id: "ai-patterns",
            panel: "patterns",
          } as ToolbarItem,
        ]
      : []),
  ]

  return (
    <aside
      id="right-toolbar"
      data-tour-id="tour-bieudo-right-toolbar"
      className="fixed bottom-0 left-0 right-0 z-50 w-full h-[52px] bg-[var(--color-bg-2)] border-t border-[var(--color-border-2)] flex flex-row items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] md:static md:w-20 md:h-full md:flex-col md:border-l md:border-t-0 md:py-1 md:px-0.5 gap-0.5"
    >
      {ITEMS.map((item) => (
        <ToolbarButton
          key={item.id}
          item={item}
          isActive={item.panel === activePanel}
          onClick={() => handleClick(item)}
        />
      ))}

      <div className="hidden md:block flex-1" />
    </aside>
  )
}
