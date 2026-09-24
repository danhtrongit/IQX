import { FileText, LayoutDashboard, TrendingUp, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type WorkspaceView = "market" | "stock" | "financial"

export const WORKSPACE_VIEWS: { id: WorkspaceView; icon: LucideIcon; label: string; short: string }[] = [
  { id: "market", icon: LayoutDashboard, label: "Thị trường", short: "Thị trường" },
  { id: "stock", icon: TrendingUp, label: "Cổ phiếu", short: "Cổ phiếu" },
  { id: "financial", icon: FileText, label: "BCTC", short: "BCTC" },
]

export const WORKSPACE_VIEW_META: Record<WorkspaceView, { title: string; description: string }> = {
  market: {
    title: "Phân tích thị trường",
    description: "Bản tin trước phiên, giữa phiên và cuối phiên — cập nhật theo từng phiên giao dịch.",
  },
  stock: {
    title: "Phân tích cổ phiếu",
    description: "6 lớp dữ liệu cho một mã: xu hướng, thanh khoản, dòng tiền, nội bộ, tin tức và định giá.",
  },
  financial: {
    title: "Phân tích BCTC",
    description: "Báo cáo tài chính doanh nghiệp — kết quả kinh doanh, cân đối kế toán và chỉ số quan trọng.",
  },
}

function isWorkspaceView(value: string | null): value is WorkspaceView {
  return value === "market" || value === "stock" || value === "financial"
}

/** `?view=` → active view; unknown/absent falls back to the market brief. */
export function parseWorkspaceView(value: string | null): WorkspaceView {
  return isWorkspaceView(value) ? value : "market"
}

/**
 * Segmented view switcher (header on desktop, fixed bottom bar on mobile).
 * Selection lives in the `view` search param so a reload or a shared deep link
 * lands on the same view.
 */
export function WorkspaceViewNav({
  active,
  onSelect,
  variant,
}: {
  active: WorkspaceView
  onSelect: (view: WorkspaceView) => void
  variant: "header" | "bottom"
}) {
  if (variant === "bottom") {
    return (
      <nav
        aria-label="Loại phân tích"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {WORKSPACE_VIEWS.map((view) => {
          const Icon = view.icon
          const isActive = active === view.id
          return (
            <button
              key={view.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => onSelect(view.id)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 border-b-2 py-2 text-[11px] font-semibold transition-colors duration-150",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {view.short}
            </button>
          )
        })}
      </nav>
    )
  }

  return (
    <nav aria-label="Loại phân tích" className="flex items-center overflow-hidden rounded-sm border border-input">
      {WORKSPACE_VIEWS.map((view) => {
        const Icon = view.icon
        const isActive = active === view.id
        return (
          <button
            key={view.id}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelect(view.id)}
            className={cn(
              "flex h-8 items-center gap-1.5 px-3 text-xs font-semibold transition-colors duration-150",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {view.label}
          </button>
        )
      })}
    </nav>
  )
}
