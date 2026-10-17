import { ArrowLeft, ListTree } from "lucide-react"

import { useWorkspaceFrame } from "@/components/layout/workspace-frame-context"
import { Button } from "@/components/ui/button"

/**
 * Top of the reader: "Về linh thú" on the left; the locator line ("Chương c · Bài n / m",
 * "Bài thi Chương c" or "Chương 3 · Phòng tập thực chiến") and, on a phone, "Danh sách bài" on the right.
 */
export function ReaderTopbar({ locator, onClose }: { locator: string | null; onClose: () => void }) {
  const frame = useWorkspaceFrame()
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <Button type="button" variant="ghost" size="sm" onClick={onClose}>
        <ArrowLeft aria-hidden="true" />
        Về linh thú
      </Button>
      <div className="flex min-w-0 items-center gap-2">
        {locator && (
          <span data-academy-locator className="text-xs font-medium text-academy-subtle tabular-nums">
            {locator}
          </span>
        )}
        {frame?.overlay && (
          <Button type="button" variant="outline" size="sm" onClick={() => frame.setOpen(true)}>
            <ListTree aria-hidden="true" />
            Danh sách bài
          </Button>
        )}
      </div>
    </div>
  )
}
