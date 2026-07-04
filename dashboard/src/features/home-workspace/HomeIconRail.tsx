import type { ComponentType } from "react"
import { IconEye, IconFile } from "@arco-design/web-react/icon"
import { IconBulb } from "@/shared/icons"
import { IconShoppingCart, IconNewspaper, IconCandlestick } from "@/features/dashboard/icons"
import { cn } from "@/shared/lib/cn"
import { HOME_TABS, type HomeTab } from "./types"

const ICONS: Record<HomeTab, ComponentType<{ className?: string }>> = {
  order: IconShoppingCart,
  watchlist: IconEye,
  news: IconNewspaper,
  "phan-tich": IconBulb,
  bctc: IconFile,
  patterns: IconCandlestick,
}

export function HomeIconRail({
  active,
  onSelect,
  isIndex,
}: {
  active: HomeTab
  onSelect: (t: HomeTab) => void
  isIndex: boolean
}) {
  return (
    <nav
      aria-label="Bảng công cụ mã CK"
      className="flex h-full w-16 flex-col items-center gap-0.5 border-l border-[var(--color-border-2)] bg-[var(--color-bg-2)] py-2"
    >
      {HOME_TABS.map((tab) => {
        const Icon = ICONS[tab.id]
        const disabled = isIndex && !!tab.indexDisabled
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            aria-label={tab.label}
            aria-current={isActive ? "true" : undefined}
            disabled={disabled}
            onClick={() => !disabled && onSelect(tab.id)}
            title={disabled ? "Chọn mã CK cụ thể để đặt lệnh" : tab.label}
            className={cn(
              "flex w-full flex-col items-center gap-0.5 border-l-2 px-1 py-2 transition-colors",
              disabled
                ? "cursor-not-allowed border-transparent text-[var(--color-text-4)] opacity-50"
                : isActive
                  ? "border-[rgb(var(--primary-6))] bg-[var(--color-primary-light-1)] text-[rgb(var(--primary-6))]"
                  : "border-transparent text-[var(--color-text-3)] hover:bg-[var(--color-fill-2)] hover:text-[var(--color-text-1)]",
            )}
          >
            <Icon className="text-[18px]" />
            <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
