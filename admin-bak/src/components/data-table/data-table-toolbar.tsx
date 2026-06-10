import type { ReactNode } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface DataTableToolbarProps {
  children?: ReactNode
  onRefresh?: () => void
  isLoading?: boolean
}

export function DataTableToolbar({ children, onRefresh, isLoading }: DataTableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
      {onRefresh && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="shrink-0"
        >
          <RefreshCw className={`mr-1.5 size-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      )}
    </div>
  )
}
