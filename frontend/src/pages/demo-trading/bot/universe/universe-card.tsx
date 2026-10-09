import { useState } from "react"
import { ListFilter, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import { messageOf } from "../api"
import { formatDate } from "../format"
import type { SavedList } from "../types"
import { pendingSessionText, sourceName, symbolCount } from "./labels"
import { ApplyListDialog, SavedListsDialog, SymbolsDialog, Vn30Dialog } from "./universe-dialogs"
import { useBotUniverse, useSavedLists, useUniverseActions } from "./use-universe"

type Dialog = { kind: "symbols" } | { kind: "lists" } | { kind: "apply"; list: SavedList } | { kind: "vn30" }

const LINK = "h-auto rounded-sm p-0 text-[11px] font-medium text-primary hover:underline"

/**
 * «DANH MỤC MUA MỚI»: the source the Bot may buy from (effective), the change waiting
 * for its session (pending) and the flows that change it. Nothing here places an order.
 */
export function UniverseCard() {
  const universe = useBotUniverse()
  const actions = useUniverseActions()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [vn30Error, setVn30Error] = useState<string | null>(null)
  const lists = useSavedLists(dialog?.kind === "lists")

  const state = universe.data
  const effective = state?.effective
  const pending = state?.pending ?? null
  // The newest live request decides whether "Về VN30" still makes sense.
  const latestKind = pending ? pending.kind : effective?.kind
  const effectiveCount = effective ? symbolCount(effective, effective.symbols.length) : null

  async function cancelPending() {
    const outcome = await actions.cancelPending()
    if (outcome.ok) toast.success("Đã hủy thay đổi chờ hiệu lực. Nguồn mua đang dùng được giữ nguyên.")
    else toast.error(outcome.message)
  }

  async function confirmVn30() {
    setVn30Error(null)
    const outcome = await actions.revertToVn30()
    if (outcome.ok) {
      setDialog(null)
      toast.success("VN30 sẽ là nguồn mua mới từ phiên giao dịch tiếp theo.")
    } else {
      setVn30Error(outcome.message)
    }
  }

  return (
    <section aria-label="Danh mục mua mới" className="rounded-lg border border-primary/30 bg-primary/5 p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        <ListFilter aria-hidden="true" className="size-3.5" />
        Danh mục mua mới
      </div>

      {universe.isPending ? (
        <div className="mt-2 space-y-2" aria-label="Đang tải nguồn mua"><Skeleton className="h-6 w-28" /><Skeleton className="h-4 w-44" /></div>
      ) : universe.isError || !state || !effective ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-destructive">Không tải được nguồn mua mới. {messageOf(universe.error, "")}</p>
          <Button type="button" variant="outline" size="xs" onClick={() => void universe.refetch()}>Thử lại</Button>
        </div>
      ) : (
        <>
          <h3 className="mt-2 flex flex-wrap items-center gap-2 font-heading text-[15px] leading-snug font-bold">
            <span className="min-w-0 break-words">{sourceName(effective)}</span>
            {effectiveCount !== null && (
              <span className="rounded-sm border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">{effectiveCount} mã</span>
            )}
          </h3>
          {effective.kind === "custom" && effective.effective_session && (
            <p className="mt-1 text-[11px] text-muted-foreground">Danh mục cố định từ phiên {formatDate(effective.effective_session)}.</p>
          )}
          {effective.unavailable_reason && (
            <p role="status" className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-destructive">
              <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              Chưa xác minh được nguồn mua: Bot không mua mới cho đến khi xác minh được.
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button type="button" variant="link" className={LINK} onClick={() => setDialog({ kind: "symbols" })}>Xem danh sách</Button>
            <Button type="button" variant="link" className={LINK} onClick={() => setDialog({ kind: "lists" })}>Danh mục đã lưu</Button>
            {latestKind === "custom" && (
              <Button type="button" variant="link" className={LINK} onClick={() => { setVn30Error(null); setDialog({ kind: "vn30" }) }}>Về VN30</Button>
            )}
          </div>

          {pending && (
            <div className="mt-2.5 border-t border-border pt-2.5 text-[11px] leading-5 text-price-ref" role="status">
              <p>
                Chờ hiệu lực: <b>{sourceName(pending)}</b>
                {symbolCount(pending) !== null && <> · {symbolCount(pending)} mã</>} · {pendingSessionText(pending)}
              </p>
              <Button type="button" variant="link" className={`${LINK} mt-0.5 text-[10px]`} disabled={actions.busy} onClick={() => void cancelPending()}>Hủy thay đổi</Button>
            </div>
          )}
        </>
      )}

      {dialog?.kind === "symbols" && effective && (
        <SymbolsDialog
          effective={effective}
          onRevertVn30={latestKind === "custom" ? () => { setVn30Error(null); setDialog({ kind: "vn30" }) } : undefined}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "lists" && (
        <SavedListsDialog
          lists={lists.data}
          loading={lists.isPending}
          error={lists.isError ? messageOf(lists.error) : null}
          onRetry={() => void lists.refetch()}
          onPick={(list) => setDialog({ kind: "apply", list })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "apply" && effective && (
        <ApplyListDialog
          list={dialog.list}
          currentSource={sourceName(pending ?? effective)}
          actions={actions}
          onBack={() => setDialog({ kind: "lists" })}
          onApplied={(count) => {
            setDialog(null)
            toast.success(`Đã nhận danh mục ${count} mã. Chờ phiên giao dịch tiếp theo.`)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "vn30" && (
        <Vn30Dialog busy={actions.busy} error={vn30Error} onConfirm={() => void confirmVn30()} onCancel={() => setDialog(null)} />
      )}
    </section>
  )
}
