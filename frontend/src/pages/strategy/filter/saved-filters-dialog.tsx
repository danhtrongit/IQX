import { useState } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import { ConfirmDialog } from "../confirm-dialog"
import { ErrorLine } from "../shared/controls"
import { DialogShell } from "../shared/dialog-shell"
import { errorMessage } from "../shared/errors"
import { criteriaSummary } from "./definition"
import { useDeleteFilter, useSavedFilters } from "./hooks"
import type { SavedFilter, ScreenerMetric } from "./types"

/**
 * "Bộ lọc đã lưu": criteria with the period of each condition. Using one only loads the criteria
 * into the editor; results are re-resolved at the latest published reports when it is run, and the
 * Bot is not touched.
 */
export function SavedFiltersDialog({
  metrics,
  onUse,
  onDeleted,
  onClose,
}: {
  metrics: readonly ScreenerMetric[]
  onUse: (filter: SavedFilter) => void
  onDeleted: (id: string) => void
  onClose: () => void
}) {
  const filters = useSavedFilters(true)
  const remove = useDeleteFilter()
  const [deleting, setDeleting] = useState<SavedFilter | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <DialogShell
        title="Bộ lọc đã lưu"
        description="Giữ tiêu chí và kỳ tính riêng của từng điều kiện. Mở lại sẽ lấy báo cáo mới nhất đã công bố tại thời điểm chạy."
        size="lg"
        onClose={onClose}
        footer={<Button type="button" variant="outline" onClick={onClose}>Đóng</Button>}
      >
        {filters.isPending ? (
          <div className="space-y-2" aria-label="Đang tải bộ lọc đã lưu"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        ) : filters.isError ? (
          <div className="space-y-2">
            <ErrorLine>{errorMessage(filters.error)}</ErrorLine>
            <Button type="button" variant="outline" size="sm" onClick={() => void filters.refetch()}>Thử lại</Button>
          </div>
        ) : filters.data.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Chưa có bộ lọc đã lưu.</p>
        ) : (
          <ul className="space-y-3">
            {filters.data.map((filter) => {
              const review = filter.legacy_review?.needs_review === true
              return (
                <li key={filter.id} className="rounded-md border border-border bg-background/40 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold break-words">{filter.name}</h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{criteriaSummary(filter.definition, metrics)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Phiên bản {filter.current_version}</p>
                      {review && (
                        <p role="status" className="mt-1.5 text-[11px] leading-4 text-price-ref">
                          Bộ lọc cũ có kỳ tính không còn được hỗ trợ cho một số điều kiện. Hệ thống không tự đổi kỳ: hãy chọn lại kỳ trước khi chạy.
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button type="button" variant="outline" size="sm" onClick={() => onUse(filter)}>Dùng<span className="sr-only"> {filter.name}</span></Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Xóa bộ lọc ${filter.name}`}
                        className="text-muted-foreground hover:text-price-down"
                        onClick={() => { setError(null); setDeleting(filter) }}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </DialogShell>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => { if (!open) setDeleting(null) }}
        title="Xóa bộ lọc?"
        description={`Bộ lọc “${deleting?.name ?? ""}” sẽ bị xóa. Danh mục và kết quả đã lưu từ bộ lọc này được giữ nguyên.`}
        confirmLabel="Xóa bộ lọc"
        pending={remove.isPending}
        error={error}
        onConfirm={() => {
          if (!deleting) return
          setError(null)
          remove.mutate(deleting.id, {
            onSuccess: () => { toast.success("Đã xóa bộ lọc."); onDeleted(deleting.id); setDeleting(null) },
            onError: (caught) => setError(errorMessage(caught)),
          })
        }}
      />
    </>
  )
}
