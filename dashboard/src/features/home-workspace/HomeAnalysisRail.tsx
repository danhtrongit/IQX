import type { ComponentType } from "react"
import { IconDashboard, IconArrowRise, IconFile } from "@arco-design/web-react/icon"
import { cn } from "@/shared/lib/cn"

export type HomeView = "market" | "stock" | "financial"

const TABS: { id: HomeView; icon: ComponentType; label: [string, string] }[] = [
  { id: "market", icon: IconDashboard, label: ["Phân tích", "thị trường"] },
  { id: "stock", icon: IconArrowRise, label: ["Phân tích", "cổ phiếu"] },
  { id: "financial", icon: IconFile, label: ["Phân tích", "BCTC"] },
]

export function HomeAnalysisRail({
  active, onSelect, variant,
}: {
  active: HomeView
  onSelect: (v: HomeView) => void
  variant: "side" | "bottom"
}) {
  return (
    <nav
      role="tablist"
      aria-label="Loại phân tích"
      className={cn(
        variant === "side"
          ? "sticky top-0 flex h-full w-[88px] flex-col gap-1 border-l border-[var(--color-border-2)] bg-[var(--color-bg-2)] py-4"
          : "fixed inset-x-0 bottom-0 z-40 flex flex-row border-t border-[var(--color-border-2)] bg-[var(--color-bg-2)]",
      )}
    >
      {TABS.map((t) => {
        const Icon = t.icon
        const isActive = active === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(t.id)}
            className={cn(
              "flex flex-col items-center gap-2 border-transparent transition-colors",
              variant === "side"
                ? "w-full border-l-[3px] px-1.5 py-[18px]"
                : "flex-1 border-b-[3px] py-2.5",
              isActive
                ? "border-[rgb(var(--primary-6))] bg-[var(--color-primary-light-1)] text-[rgb(var(--primary-6))]"
                : "text-[var(--color-text-3)] hover:bg-[var(--color-fill-2)] hover:text-[var(--color-text-1)]",
            )}
          >
            <span className="text-[22px]"><Icon /></span>
            <span className="text-center text-[10px] font-bold uppercase leading-[1.2] tracking-[0.3px]">
              {t.label[0]}<br />{t.label[1]}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
