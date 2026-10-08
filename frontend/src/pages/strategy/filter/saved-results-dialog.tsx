import { useState } from "react"
import { Trash2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"

import { ConfirmDialog } from "../confirm-dialog"
import { ErrorLine } from "../shared/controls"
import { DialogShell } from "../shared/dialog-shell"
import { errorMessage } from "../shared/errors"
import { fmtDate, fmtDateTime } from "../shared/format"
import { getSnapshot } from "./api"
import { criteriaSummary } from "./definition"
import { useDeleteSnapshot, useSnapshots } from "./hooks"
import { asResultRows } from "./snapshot-rows"
import { SnapshotTable } from "./snapshot-table"
import type { ResultSnapshotSummary, ScreenerMetric } from "./types"

function SnapshotDetail({ summary, metrics, onClose }: { summary: ResultSnapshotSummary; metrics: readonly ScreenerMetric[]; onClose: () => void }) {
  const { user } = useAuth()
  const snapshot = useQuery({
    queryKey: ["strategy", "filter", "snapshot", user?.id, summary.id],
    queryFn: ({ signal }) => getSnapshot(summary.id, signal),
    staleTime: Infinity,
    retry: false,
  })
  return (
    <DialogShell
      title={summary.name}
      description={`Mốc dữ liệu ${fmtDateTime(summary.as_of)} · lưu ${fmtDate(summary.created_at)} · ${summary.row_count} mã`}
      size="lg"
      onClose={onClose}
      footer={<Button type="button" variant="outline" onClick={onClose}>Đóng</Button>}
    >
      {snapshot.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : snapshot.isError ? (
        <ErrorLine>{errorMessage(snapshot.error)}</ErrorLine>
      ) : (
        <>
          <p className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">{criteriaSummary(snapshot.data.definition, metrics)}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Số liệu, kỳ thực tế và nguồn của lần lọc tại thời điểm lưu ({snapshot.data.data_source} · {snapshot.data.calculation_version}). Không được tính lại bằng dữ liệu mới.
          </p>
          <SnapshotTable definition={snapshot.data.definition} rows={asResultRows(snapshot.data.rows)} metrics={metrics} />
        </>
      )}
    </DialogShell>
  )
}

/** "Kết quả đã lưu": immutable snapshots of a result, opened as they were saved. */
export function SavedResultsDialog({ metrics, onClose }: { metrics: readonly ScreenerMetric[]; onClose: () => void }) {
  const snapshots = useSnapshots(true)
  const remove = useDeleteSnapshot()
  const [open, setOpen] = useState<ResultSnapshotSummary | null>(null)
  const [deleting, setDeleting] = useState<ResultSnapshotSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <DialogShell
        title="Kết quả đã lưu"
        description="Mỗi kết quả giữ nguyên các dòng số liệu và nguồn tại lúc lưu. Mở lại không đổi bộ lọc hay Bot."
        size="lg"
        onClose={onClose}
        footer={<Button type="button" variant="outline" onClick={onClose}>Đóng</Button>}
      >
        {snapshots.isPending ? (
          <Skeleton className="h-20 w-full" aria-label="Đang tải kết quả đã lưu" />
        ) : snapshots.isError ? (
          <div className="space-y-2">
            <ErrorLine>{errorMessage(snapshots.error)}</ErrorLine>
            <Button type="button" variant="outline" size="sm" onClick={() => void snapshots.refetch()}>Thử lại</Button>
          </div>
        ) : snapshots.data.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Chưa có kết quả đã lưu.</p>
        ) : (
          <ul className="space-y-3">
            {snapshots.data.map((item) => (
              <li key={item.id} className="rounded-md border border-border bg-background/40 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold break-words">{item.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{item.row_count} mã · mốc dữ liệu {fmtDateTime(item.as_of)} · lưu {fmtDate(item.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(item)}>Xem<span className="sr-only"> {item.name}</span></Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Xóa kết quả ${item.name}`}
                      className="text-muted-foreground hover:text-price-down"
                      onClick={() => { setError(null); setDeleting(item) }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogShell>
      {open && <SnapshotDetail summary={open} metrics={metrics} onClose={() => setOpen(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(next) => { if (!next) setDeleting(null) }}
        title="Xóa kết quả đã lưu?"
        description={`Kết quả “${deleting?.name ?? ""}” sẽ bị xóa. Máy chủ từ chối nếu Bot đang mua theo danh mục tạo từ kết quả này.`}
        confirmLabel="Xóa kết quả"
        pending={remove.isPending}
        error={error}
        onConfirm={() => {
          if (!deleting) return
          setError(null)
          remove.mutate(deleting.id, {
            onSuccess: () => { toast.success("Đã xóa kết quả đã lưu."); setDeleting(null) },
            onError: (caught) => setError(errorMessage(caught)),
          })
        }}
      />
    </>
  )
}
