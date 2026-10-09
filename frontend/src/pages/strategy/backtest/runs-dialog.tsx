import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import { ErrorLine } from "../shared/controls"
import { DialogShell } from "../shared/dialog-shell"
import { errorMessage } from "../shared/errors"
import { fmtDate, fmtDateTime, fmtSignedPercent, toneClass } from "../shared/format"
import type { RunResponse } from "./api"
import { useOpenRun, useRuns } from "./hooks"

/**
 * "Đã lưu": every run is stored when it is made and never changes. Opening one shows it as it
 * was; it does not touch the shared configuration, the form or the Bot.
 */
export function RunsDialog({ onOpen, onClose }: { onOpen: (run: RunResponse) => void; onClose: () => void }) {
  const runs = useRuns(true)
  const open = useOpenRun()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function view(id: string) {
    setError(null)
    setPendingId(id)
    open.mutate(id, {
      onSuccess: (run) => onOpen(run),
      onError: (caught) => setError(errorMessage(caught)),
      onSettled: () => setPendingId(null),
    })
  }

  return (
    <DialogShell
      title="Kết quả kiểm thử đã lưu"
      description="Mở kết quả không thay cấu hình chung của Bot và Backtest."
      size="lg"
      busy={open.isPending}
      onClose={onClose}
      footer={<Button type="button" variant="outline" onClick={onClose}>Đóng</Button>}
    >
      {runs.isPending ? (
        <div className="space-y-2" aria-label="Đang tải kết quả đã lưu"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      ) : runs.isError ? (
        <div className="space-y-2">
          <ErrorLine>{errorMessage(runs.error)}</ErrorLine>
          <Button type="button" variant="outline" size="sm" onClick={() => void runs.refetch()}>Thử lại</Button>
        </div>
      ) : runs.data.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Chưa có kết quả nào. Chạy backtest để tạo kết quả đầu tiên.</p>
      ) : (
        <ul className="space-y-2">
          {runs.data.map((run) => (
            <li key={run.run_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background/40 p-3" data-testid={`run-${run.run_id}`}>
              <div className="min-w-0 text-xs">
                <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {run.symbol}
                  <span className="font-normal text-muted-foreground">{fmtDate(run.start)} đến {fmtDate(run.end)}</span>
                  {run.status === "failed" && <Badge variant="destructive">Lỗi{run.error_code ? `: ${run.error_code}` : ""}</Badge>}
                </h3>
                <p className="mt-1 text-muted-foreground">
                  Cấu hình bản {run.shared_revision} · chạy {fmtDateTime(run.created_at)}
                  {run.kpis && <> · tổng lợi nhuận <span className={`font-semibold ${toneClass(run.kpis.total_return_pct)}`}>{fmtSignedPercent(run.kpis.total_return_pct, 1)}</span></>}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" disabled={run.status === "failed" || open.isPending} onClick={() => view(run.run_id)}>
                {pendingId === run.run_id ? "Đang mở…" : "Xem"}
                <span className="sr-only"> {run.symbol} {fmtDate(run.start)}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </DialogShell>
  )
}
