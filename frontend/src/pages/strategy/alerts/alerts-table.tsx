import { useState } from "react"
import { Bell, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"

import { ConfirmDialog } from "../confirm-dialog"
import { SideBadge } from "../shared/controls"
import { errorMessage } from "../shared/errors"
import { type StrategyAlert } from "./api"
import { useDeleteAlert, useUpdateAlert } from "./hooks"
import { lastCheckText, pinnedRevision, scopeTitle, sourceCaption, STATUS_HINT, STATUS_LABEL } from "./labels"

const TH = "px-3 py-2.5 text-left text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase"

/** Alerts being watched: name, scope, sides, pinned version, pause switch, last check, Chỉnh/Xóa. */
export function AlertsTable({
  alerts,
  loading,
  onEdit,
  onCreate,
}: {
  alerts: StrategyAlert[]
  loading: boolean
  onEdit: (alert: StrategyAlert) => void
  onCreate: () => void
}) {
  const update = useUpdateAlert()
  const remove = useDeleteAlert()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<StrategyAlert | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function toggle(alert: StrategyAlert, enabled: boolean) {
    setPendingId(alert.id)
    update.mutate(
      { id: alert.id, body: { enabled } },
      {
        onSuccess: () => toast.success(enabled ? "Đã bật theo dõi. Cảnh báo kiểm tra từ phiên hiện tại, không gửi lại tín hiệu thời gian tạm dừng." : "Đã tạm dừng cảnh báo. Cấu hình chỉ báo và Bot được giữ nguyên."),
        onError: (error) => toast.error(errorMessage(error)),
        onSettled: () => setPendingId(null),
      },
    )
  }

  function confirmDelete() {
    if (!deleting) return
    setDeleteError(null)
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast.success("Đã xóa cảnh báo. Lịch sử tín hiệu được giữ nguyên.")
        setDeleting(null)
      },
      onError: (error) => setDeleteError(errorMessage(error)),
    })
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm" aria-label="Cảnh báo đang theo dõi">
          <thead className="border-b border-border bg-muted/30">
            <tr>
              <th scope="col" className={TH}>Tên cảnh báo</th>
              <th scope="col" className={TH}>Phạm vi theo dõi</th>
              <th scope="col" className={TH}>Tín hiệu</th>
              <th scope="col" className={TH}>Trạng thái</th>
              <th scope="col" className={`${TH} text-right`}>Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              [0, 1].map((row) => (
                <tr key={row}><td colSpan={5} className="p-3"><Skeleton className="h-10 w-full" /></td></tr>
              ))
            ) : alerts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center">
                  <Bell aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
                  <p className="mt-2 text-sm font-semibold">Chưa có cảnh báo</p>
                  <p className="mt-1 text-xs text-muted-foreground">Tạo cảnh báo trên mã hoặc danh mục đã lưu.</p>
                  <Button type="button" size="sm" className="mt-3" onClick={onCreate}>Tạo cảnh báo</Button>
                </td>
              </tr>
            ) : (
              alerts.map((alert) => (
                <tr key={alert.id} className="align-top">
                  <td className="max-w-[300px] px-3 py-3">
                    <div className="font-semibold break-words">{alert.name}</div>
                    <div className="mt-1 text-xs break-words text-muted-foreground">{sourceCaption(alert.version)}</div>
                  </td>
                  <td className="max-w-[240px] px-3 py-3 text-xs">
                    <div className="text-muted-foreground">{scopeTitle(alert.version)}</div>
                    <div className="mt-0.5 font-medium break-words">{alert.version.symbols.slice(0, 12).join(" · ")}{alert.version.symbols.length > 12 ? ` · +${alert.version.symbols.length - 12} mã` : ""}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {alert.version.sides.map((side) => <SideBadge key={side} side={side} />)}
                    </div>
                    <div className="mt-1.5 text-xs text-muted-foreground">Cấu hình bản {pinnedRevision(alert.version)} · Cảnh báo v{alert.current_version}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={alert.enabled}
                        disabled={pendingId === alert.id}
                        aria-label={`Bật hoặc tạm dừng ${alert.name}`}
                        onCheckedChange={(checked) => toggle(alert, checked)}
                      />
                      <span className="text-xs font-medium" title={STATUS_HINT[alert.status]}>{STATUS_LABEL[alert.status]}</span>
                    </div>
                    <div className="mt-1.5 text-xs text-muted-foreground">{lastCheckText(alert)}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button type="button" variant="outline" size="sm" onClick={() => onEdit(alert)}>
                        <Pencil aria-hidden="true" />
                        Chỉnh<span className="sr-only"> {alert.name}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Xóa cảnh báo ${alert.name}`}
                        className="text-muted-foreground hover:text-price-down"
                        onClick={() => { setDeleteError(null); setDeleting(alert) }}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => { if (!open) setDeleting(null) }}
        title="Xóa cảnh báo?"
        description={
          <>
            Cảnh báo “{deleting?.name}” sẽ dừng phát sinh tín hiệu mới. Lịch sử tín hiệu và các phiên bản đã ghim được giữ lại.
            Cấu hình chỉ báo và Bot không bị ảnh hưởng.
          </>
        }
        confirmLabel="Xóa cảnh báo"
        pending={remove.isPending}
        error={deleteError}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
