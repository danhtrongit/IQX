import { useState } from "react"
import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { Bell, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { ConfirmDialog as BotConfirmDialog } from "@/pages/demo-trading/bot/confirm-dialog"
import { Vn30Dialog } from "@/pages/demo-trading/bot/universe/universe-dialogs"
import { useBotUniverse, type UniverseActions } from "@/pages/demo-trading/bot/universe/use-universe"

import { ConfirmDialog } from "../confirm-dialog"
import { ErrorLine } from "../shared/controls"
import { DialogShell } from "../shared/dialog-shell"
import { errorDetails, errorMessage, isApiError } from "../shared/errors"
import { fmtDate } from "../shared/format"
import { getSnapshot } from "./api"
import { criteriaSummary } from "./definition"
import { useDeleteList, useSavedLists } from "./hooks"
import { asResultRows } from "./snapshot-rows"
import { SnapshotTable } from "./snapshot-table"
import type { FilterDefinition, SavedList, ScreenerMetric } from "./types"

const PILL = "inline-flex items-center rounded-sm border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium tabular-nums"
const PREVIEW = 14

type InUseDetail = { role: string; source_name: string; effective_session: string | null }

function inUseDetails(error: unknown): InUseDetail[] {
  return errorDetails(error).map((item) => ({
    role: typeof item.role === "string" ? item.role : "effective",
    source_name: typeof item.source_name === "string" ? item.source_name : "",
    effective_session: typeof item.effective_session === "string" ? item.effective_session : null,
  }))
}

/** Criteria recorded with a list made from a result (`provenance.criteria`), when present. */
function listCriteria(list: SavedList, metrics: readonly ScreenerMetric[]): string | null {
  const criteria = list.provenance?.criteria
  if (!criteria || typeof criteria !== "object") return null
  const { rules, scope } = criteria as Partial<Pick<FilterDefinition, "rules" | "scope">>
  if (!Array.isArray(rules) || !scope) return null
  return criteriaSummary({ rules, scope }, metrics)
}

/**
 * The Bot uses this list as its buy source (effective) or will from the next session (pending).
 * Deleting it would leave the Bot without a verified source, so the server refuses (409) and the
 * user chooses: go back to VN30, or cancel the pending change. Nothing is deleted or sold here.
 */
function ListInUseDialog({
  list,
  details,
  actions,
  onClose,
}: {
  list: SavedList
  details: InUseDetail[]
  actions: UniverseActions
  onClose: () => void
}) {
  const [step, setStep] = useState<"vn30" | "cancel" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = details.some((item) => item.role === "pending")
  const effective = details.some((item) => item.role === "effective")

  async function run(kind: "vn30" | "cancel") {
    setError(null)
    const outcome = kind === "vn30" ? await actions.revertToVn30() : await actions.cancelPending()
    if (outcome.ok) {
      toast.success(kind === "vn30" ? "VN30 sẽ là nguồn mua mới từ phiên giao dịch tiếp theo. Vị thế đang giữ không bị bán." : "Đã hủy thay đổi chờ hiệu lực. Nguồn mua đang dùng được giữ nguyên.")
      setStep(null)
      onClose()
    } else {
      setError(outcome.message)
    }
  }

  return (
    <>
      <DialogShell
        title="Danh mục đang được Bot sử dụng"
        size="sm"
        onClose={onClose}
        footer={
          <>
            {pending && <Button type="button" variant="outline" className="mr-auto" onClick={() => { setError(null); setStep("cancel") }}>Hủy thay đổi chờ</Button>}
            {effective && <Button type="button" variant="outline" className={pending ? "" : "mr-auto"} onClick={() => { setError(null); setStep("vn30") }}>Về VN30</Button>}
            <Button type="button" onClick={onClose}>Đóng</Button>
          </>
        }
      >
        <p className="text-sm leading-6">
          “{list.name}” {effective && pending ? "đang là nguồn mua mới của Bot và còn một thay đổi chờ hiệu lực dùng danh mục này" : effective ? "đang là nguồn mua mới của Bot" : "đang chờ hiệu lực làm nguồn mua mới của Bot"}, nên chưa thể xóa.
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          Hãy chuyển Bot sang danh mục khác hoặc về VN30 và chờ có hiệu lực trước khi xóa. Danh mục, kết quả đã lưu và các vị thế đang giữ chưa thay đổi; Bot không tự bán và không tự đổi nguồn.
        </p>
        <ul className="space-y-1 text-xs">
          {details.map((item, index) => (
            <li key={`${item.role}-${index}`} className="rounded-md border border-border bg-muted/40 px-3 py-2">
              {item.role === "pending" ? "Chờ hiệu lực" : "Đang dùng"}: <b>{item.source_name || list.name}</b>
              {item.effective_session ? ` · từ phiên ${fmtDate(item.effective_session)}` : ""}
            </li>
          ))}
        </ul>
        {error && step === null && <ErrorLine>{error}</ErrorLine>}
      </DialogShell>
      {step === "vn30" && <Vn30Dialog busy={actions.busy} error={error} onConfirm={() => void run("vn30")} onCancel={() => setStep(null)} />}
      {step === "cancel" && (
        <BotConfirmDialog
          open
          busy={actions.busy}
          title="Hủy thay đổi chờ hiệu lực?"
          description="Chỉ bản chưa có hiệu lực bị hủy. Nguồn mua đang dùng và các vị thế không đổi."
          confirmLabel="Hủy thay đổi"
          cancelLabel="Giữ lại"
          onConfirm={() => void run("cancel")}
          onCancel={() => setStep(null)}
        >
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </BotConfirmDialog>
      )}
    </>
  )
}

function ListDetailDialog({
  list,
  metrics,
  onApply,
  onAlert,
  onClose,
}: {
  list: SavedList
  metrics: readonly ScreenerMetric[]
  onApply: () => void
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
          <Button type="button" onClick={onApply}>Áp dụng cho Bot</Button>
        </>
      }
    >
      <ul className="flex flex-wrap gap-1.5" aria-label="Mã trong danh mục">
        {list.tickers.map((symbol) => (
          <li key={symbol}>
            <Link to={`/chien-luoc?tab=backtest&symbol=${encodeURIComponent(symbol)}`} className={`${PILL} text-primary hover:bg-muted`} onClick={onClose}>
              {symbol}
              <span className="sr-only"> mở Backtest</span>
            </Link>
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
            <p className="text-xs leading-5 text-muted-foreground">Số liệu và kỳ báo cáo được giữ tại lúc lưu, không lấy từ bộ lọc đang chỉnh hay dữ liệu mới.</p>
            <SnapshotTable definition={snapshot.data.definition} rows={asResultRows(snapshot.data.rows)} metrics={metrics} />
          </>
        )
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">Danh mục cũ chưa có bằng chứng kỳ dữ liệu đã lưu: chỉ có tập mã tại ngày {fmtDate(list.as_of)}.</p>
      )}
      <p className="text-[11px] text-muted-foreground">Bấm một mã để mở Backtest một mã. Không tạo lệnh giao dịch.</p>
    </DialogShell>
  )
}

/** "Danh mục đã lưu": saved lists with the Bot usage flags, view, apply, alert and delete. */
export function SavedListsDialog({
  metrics,
  actions,
  onApply,
  onAlert,
  onClose,
}: {
  metrics: readonly ScreenerMetric[]
  actions: UniverseActions
  onApply: (list: SavedList) => void
  onAlert: (list: SavedList) => void
  onClose: () => void
}) {
  const lists = useSavedLists(true)
  const universe = useBotUniverse()
  const remove = useDeleteList()
  const [detail, setDetail] = useState<SavedList | null>(null)
  const [deleting, setDeleting] = useState<SavedList | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [inUse, setInUse] = useState<{ list: SavedList; details: InUseDetail[] } | null>(null)

  const effectiveId = universe.data?.effective.saved_list_id ?? null
  const pendingId = universe.data?.pending?.saved_list_id ?? null

  function confirmDelete() {
    if (!deleting) return
    setDeleteError(null)
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast.success("Đã xóa danh mục. Kết quả đã lưu và lịch sử cảnh báo được giữ.")
        setDeleting(null)
      },
      onError: (error) => {
        if (isApiError(error, 409, "LIST_IN_USE_BY_BOT")) {
          setInUse({ list: deleting, details: inUseDetails(error) })
          setDeleting(null)
          return
        }
        setDeleteError(errorMessage(error))
      },
    })
  }

  return (
    <>
      <DialogShell
        title="Danh mục đã lưu"
        description="Danh mục giữ đúng tập mã và số liệu tại lúc lưu. Áp dụng cho Bot là thao tác riêng."
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
                    {effectiveId === list.id && <Badge variant="secondary">Bot đang dùng</Badge>}
                    {pendingId === list.id && <Badge variant="outline" className="border-price-ref/50 text-price-ref">Chờ hiệu lực</Badge>}
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" variant="outline" size="sm" onClick={() => setDetail(list)}>Xem<span className="sr-only"> {list.name}</span></Button>
                    <Button type="button" size="sm" disabled={list.tickers.length === 0} onClick={() => onApply(list)}>Áp dụng cho Bot<span className="sr-only"> {list.name}</span></Button>
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
          onApply={() => { const list = detail; setDetail(null); onApply(list) }}
          onAlert={() => { const list = detail; setDetail(null); onAlert(list) }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => { if (!open) setDeleting(null) }}
        title="Xóa danh mục?"
        description={`Danh mục “${deleting?.name ?? ""}” sẽ bị xóa khỏi danh sách đã lưu. Bộ lọc, kết quả đã lưu và lịch sử cảnh báo không bị xóa. Cổ phiếu Bot đang giữ không bị bán.`}
        confirmLabel="Xóa danh mục"
        pending={remove.isPending}
        error={deleteError}
        onConfirm={confirmDelete}
      />
      {inUse && <ListInUseDialog list={inUse.list} details={inUse.details} actions={actions} onClose={() => setInUse(null)} />}
    </>
  )
}
