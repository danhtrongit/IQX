import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Bell, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"

import { ConfirmDialog } from "../confirm-dialog"
import { ErrorLine } from "../shared/controls"
import { DialogShell } from "../shared/dialog-shell"
import { errorMessage } from "../shared/errors"
import { fmtDate } from "../shared/format"
import { getSnapshot } from "./api"
import { criteriaSummary } from "./definition"
import { useDeleteList, useSavedLists } from "./hooks"
import { emptyMarket } from "./market"
import { asResultRows } from "./snapshot-rows"
import { SnapshotTable } from "./snapshot-table"
import type { FilterDefinition, SavedList, ScreenerMetric } from "./types"

const PILL = "inline-flex items-center rounded-sm border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium tabular-nums"
const PREVIEW = 14

/** Criteria recorded with a list made from a result (`provenance.criteria`: Thị trường, rules, enabled technical rows), when present. */
function listCriteria(list: SavedList, metrics: readonly ScreenerMetric[]): string | null {
  const criteria = list.provenance?.criteria
  if (!criteria || typeof criteria !== "object") return null
  const { rules, market, technical } = criteria as Partial<Pick<FilterDefinition, "rules" | "market" | "technical">>
  if (!Array.isArray(rules)) return null
  return criteriaSummary(
    { market: market && typeof market === "object" ? market : emptyMarket(), rules, technical: Array.isArray(technical) ? technical : [] },
    metrics,
  )
}

function ListDetailDialog({
  list,
  metrics,
  onAlert,
  onClose,
}: {
  list: SavedList
  metrics: readonly ScreenerMetric[]
  onAlert: () => void
  onClose: () => void
}) {
  const { user } = useAuth()
  const snapshotId = list.result_snapshot_id
  const snapshot = useQuery({
    queryKey: ["strategy", "filter", "snapshot", user?.id, snapshotId],
    enabled: !!snapshotId,
    queryFn: ({ signal }) => getSnapshot(snapshotId as string, signal),
    staleTime: Infinity,
    retry: false,
  })
  const criteria = snapshot.data ? criteriaSummary(snapshot.data.definition, metrics) : listCriteria(list, metrics)
  return (
    <DialogShell
      title={list.name}
      description={`Mốc dữ liệu ${fmtDate(list.as_of)} · ${list.tickers.length} mã · lưu ${fmtDate(list.created_at)}`}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
          <Button type="button" variant="outline" onClick={onAlert}><Bell aria-hidden="true" />Tạo cảnh báo</Button>
        </>
      }
    >
      <ul className="flex flex-wrap gap-1.5" aria-label="Mã trong danh mục">
        {list.tickers.map((symbol) => (
          <li key={symbol}>
            <span className={PILL}>{symbol}</span>
          </li>
        ))}
      </ul>
      {criteria && <p className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">{criteria}</p>}
      {snapshotId ? (
        snapshot.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : snapshot.isError ? (
          <ErrorLine>Không tải được số liệu đã lưu: {errorMessage(snapshot.error)}</ErrorLine>
        ) : (
          <>
            <p className="text-xs leading-5 text-muted-foreground">
              Số liệu thị trường, kỹ thuật và kỳ báo cáo được giữ tại lúc lưu{snapshot.data.session_date ? ` (phiên ${fmtDate(snapshot.data.session_date)})` : ""}, không lấy từ bộ lọc đang chỉnh hay dữ liệu mới.
            </p>
            <SnapshotTable definition={snapshot.data.definition} rows={asResultRows(snapshot.data.rows)} metrics={metrics} sessionDate={snapshot.data.session_date} />
          </>
        )
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">Danh mục cũ chưa có bằng chứng kỳ dữ liệu đã lưu: chỉ có tập mã tại ngày {fmtDate(list.as_of)}.</p>
      )}
      <p className="text-[11px]">Muốn Backtest cả danh mục: ở tab Backtest, chọn danh mục này trong ô Rổ mã. Không tạo lệnh giao dịch.</p>
    </DialogShell>
  )
}

/** "Danh mục đã lưu": saved lists, view, alert and delete (a list the Bot once used can be deleted, spec v2.0 §13). */
export function SavedListsDialog({
  metrics,
  onAlert,
  onClose,
}: {
  metrics: readonly ScreenerMetric[]
  onAlert: (list: SavedList) => void
  onClose: () => void
}) {
  const lists = useSavedLists(true)
  const remove = useDeleteList()
  const [detail, setDetail] = useState<SavedList | null>(null)
  const [deleting, setDeleting] = useState<SavedList | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function confirmDelete() {
    if (!deleting) return
    setDeleteError(null)
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast.success("Đã xóa danh mục. Kết quả đã lưu và lịch sử cảnh báo được giữ.")
        setDeleting(null)
      },
      onError: (error) => setDeleteError(errorMessage(error)),
    })
  }

  return (
    <>
      <DialogShell
        title="Danh mục đã lưu"
        description="Danh mục giữ đúng tập mã và số liệu tại lúc lưu."
        size="lg"
        onClose={onClose}
        footer={<Button type="button" variant="outline" onClick={onClose}>Đóng</Button>}
      >
        {lists.isPending ? (
          <div className="space-y-2" aria-label="Đang tải danh mục đã lưu"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
        ) : lists.isError ? (
          <div className="space-y-2">
            <ErrorLine>{errorMessage(lists.error)}</ErrorLine>
            <Button type="button" variant="outline" size="sm" onClick={() => void lists.refetch()}>Thử lại</Button>
          </div>
        ) : lists.data.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-xs leading-5 text-muted-foreground">
            Chưa có danh mục đã lưu. Lọc cổ phiếu rồi bấm Lưu danh mục để giữ lại tập mã cùng số liệu.
          </p>
        ) : (
          <ul className="space-y-3">
            {lists.data.map((list) => (
              <li key={list.id} className="rounded-md border border-border bg-background/40 p-3" data-testid={`list-${list.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span className="break-words">{list.name}</span>
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" variant="outline" size="sm" onClick={() => setDetail(list)}>Xem<span className="sr-only"> {list.name}</span></Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Xóa danh mục ${list.name}`}
                      className="text-muted-foreground hover:text-price-down"
                      onClick={() => { setDeleteError(null); setDeleting(list) }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{list.tickers.length} mã · mốc dữ liệu {fmtDate(list.as_of)}{list.filter_version ? ` · bộ lọc bản ${list.filter_version}` : ""}</p>
                <ul className="mt-2 flex flex-wrap gap-1" aria-label={`Mã trong ${list.name}`}>
                  {list.tickers.slice(0, PREVIEW).map((symbol) => <li key={symbol} className={PILL}>{symbol}</li>)}
                  {list.tickers.length > PREVIEW && <li className={`${PILL} text-muted-foreground`}>+{list.tickers.length - PREVIEW} mã</li>}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </DialogShell>

      {detail && (
        <ListDetailDialog
          list={detail}
          metrics={metrics}
          onClose={() => setDetail(null)}
          onAlert={() => { const list = detail; setDetail(null); onAlert(list) }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => { if (!open) setDeleting(null) }}
        title="Xóa danh mục?"
        description={`Danh mục “${deleting?.name ?? ""}” sẽ bị xóa khỏi danh sách đã lưu. Bộ lọc, kết quả đã lưu và lịch sử cảnh báo không bị xóa. Chiến lược đã lưu chép sẵn danh sách mã nên không bị ảnh hưởng.`}
        confirmLabel="Xóa danh mục"
        pending={remove.isPending}
        error={deleteError}
        onConfirm={confirmDelete}
      />
    </>
  )
}
