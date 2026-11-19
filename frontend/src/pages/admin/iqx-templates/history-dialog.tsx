import { LoaderCircle, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime } from "@/lib/format"
import { DialogShell } from "@/pages/strategy/shared/dialog-shell"
import { errorMessage } from "@/pages/strategy/shared/errors"
import { iqxTitle, type IqxKind } from "@/pages/strategy/shared/iqx"

import { useIqxAdminDetail, useRestoreIqxVersion } from "./api"
import { historyActionLabel } from "./copy"

/** Lịch sử (§5.5): every action with time, actor and reason; each version can be copied back to the draft. */
export function HistoryDialog({ id, kind, name, onClose }: { id: string; kind: IqxKind; name: string; onClose: () => void }) {
  const detail = useIqxAdminDetail(id)
  const restore = useRestoreIqxVersion()
  const data = detail.data

  function restoreVersion(version: number) {
    restore.mutate(
      { id, version },
      {
        onSuccess: () => {
          toast.success(`Đã khôi phục v${version} làm bản nháp.`)
          void detail.refetch()
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  return (
    <DialogShell title={`Lịch sử · ${iqxTitle(kind, name)}`} size="md" busy={restore.isPending} onClose={onClose}>
      {detail.isLoading ? (
        <div className="space-y-2" role="status" aria-label="Đang tải lịch sử">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      ) : detail.error ? (
        <p role="alert" className="text-sm text-destructive">{errorMessage(detail.error)}</p>
      ) : data ? (
        <>
          <section className="space-y-2" aria-labelledby="iqx-history-versions">
            <h3 id="iqx-history-versions" className="text-sm font-semibold">Phiên bản</h3>
            {data.versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa xuất bản phiên bản nào.</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {data.versions.map((version) => (
                  <li key={version.version} className="flex flex-wrap items-start justify-between gap-2 p-3">
                    <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                      <p className="font-medium">
                        v{version.version}
                        {data.current_version === version.version && <span className="ml-2 text-xs font-normal text-muted-foreground">(hiện hành)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(version.published_at)}
                        {version.published_by ? ` · ${version.published_by.name}` : ""}
                      </p>
                      {version.reason && <p className="text-xs break-words">{version.reason}</p>}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={restore.isPending}
                      onClick={() => restoreVersion(version.version)}
                    >
                      {restore.isPending && restore.variables?.version === version.version ? <LoaderCircle className="animate-spin" /> : <RotateCcw aria-hidden="true" />}
                      Khôi phục làm bản nháp
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2" aria-labelledby="iqx-history-actions">
            <h3 id="iqx-history-actions" className="text-sm font-semibold">Thao tác</h3>
            {data.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có thao tác nào.</p>
            ) : (
              <ol className="divide-y divide-border rounded-md border border-border">
                {data.history.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="space-y-0.5 p-3 text-sm">
                    <p className="font-medium">{historyActionLabel(entry)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatDateTime(entry.at)}
                      {entry.by ? ` · ${entry.by.name}` : ""}
                    </p>
                    {entry.reason && <p className="text-xs break-words">{entry.reason}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      ) : null}
    </DialogShell>
  )
}
