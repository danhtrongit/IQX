import type { ReactNode } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface DataTableBulkActionsProps {
  selectedCount: number
  onClearSelection: () => void
  children?: ReactNode
  className?: string
}

export function DataTableBulkActions({
  selectedCount,
  onClearSelection,
  children,
  className,
}: DataTableBulkActionsProps) {
  if (selectedCount === 0) return null

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-2",
        className,
      )}
    >
      <span className="text-sm font-medium">
        Đã chọn {selectedCount} mục
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={onClearSelection}
        title="Bỏ chọn tất cả"
      >
        <X className="size-3.5" />
      </Button>
      {children && (
        <>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">{children}</div>
        </>
      )}
    </div>
  )
}
