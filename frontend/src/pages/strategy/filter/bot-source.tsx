import { useState } from "react"
import { Link } from "react-router"
import { ListFilter, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog as BotConfirmDialog } from "@/pages/demo-trading/bot/confirm-dialog"
import { sourceName, symbolCount, pendingSessionText } from "@/pages/demo-trading/bot/universe/labels"
import { SymbolsDialog, Vn30Dialog } from "@/pages/demo-trading/bot/universe/universe-dialogs"
import { useBotUniverse, type UniverseActions } from "@/pages/demo-trading/bot/universe/use-universe"

import { errorMessage } from "../shared/errors"
import { fmtDate } from "../shared/format"

type Dialog = "symbols" | "vn30" | "cancel" | null

/**
 * "DANH MỤC MUA MỚI CỦA BOT": the source the Bot may buy from now (effective) and the change waiting
 * for its session (pending), kept apart: a pending source is never shown as the one in use. Reading
 * this block or changing the filter never changes the Bot; only Áp dụng cho Bot, Về VN30 and Hủy
 * thay đổi do, each after a confirmation.
 */
export function BotSourceCard({ actions }: { actions: UniverseActions }) {
  const universe = useBotUniverse()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [error, setError] = useState<string | null>(null)
  const state = universe.data
  const effective = state?.effective
  const pending = state?.pending ?? null
  // The newest live request decides whether "Về VN30" still makes sense.
  const latestKind = pending ? pending.kind : effective?.kind
  const count = effective ? symbolCount(effective, effective.symbols.length) : null

  async function confirmVn30() {
    setError(null)
    const outcome = await actions.revertToVn30()
    if (outcome.ok) {
      setDialog(null)
      toast.success(`VN30 sẽ là nguồn mua mới ${pendingSessionText(outcome.request)}. Cổ phiếu đang giữ không bị bán.`)
    } else {
      setError(outcome.message)
    }
  }

  async function confirmCancel() {
    setError(null)
    const outcome = await actions.cancelPending()
    if (outcome.ok) {
      setDialog(null)
      toast.success("Đã hủy thay đổi chờ hiệu lực. Nguồn mua đang dùng được giữ nguyên.")
    } else {
      setError(outcome.message)
    }
  }

  return (
    <section aria-label="Danh mục mua mới của Bot" className="rounded-lg border border-primary/30 bg-primary/5 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            <ListFilter aria-hidden="true" className="size-3.5" />
            Danh mục mua mới của Bot
          </div>
          {universe.isPending ? (
            <Skeleton className="mt-2 h-6 w-32" aria-label="Đang tải nguồn mua" />
          ) : universe.isError || !state || !effective ? (
            <div className="mt-2 space-y-2">
              <p role="alert" className="text-xs text-destructive">Không tải được nguồn mua mới. {errorMessage(universe.error)}</p>
              <Button type="button" variant="outline" size="xs" onClick={() => void universe.refetch()}>Thử lại</Button>
            </div>
          ) : (
            <h3 className="mt-1.5 flex flex-wrap items-center gap-2 font-heading text-[15px] leading-snug font-bold">
              <span className="min-w-0 break-words">{sourceName(effective)}</span>
              {count !== null && <span className="rounded-sm border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">{count} mã</span>}
              {effective.kind === "custom" && effective.effective_session && (
                <span className="text-[11px] font-normal text-muted-foreground">đang dùng từ phiên {fmtDate(effective.effective_session)}</span>
              )}
            </h3>
          )}
        </div>
        {effective && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDialog("symbols")}>Xem danh sách</Button>
            <Button asChild variant="outline" size="sm"><Link to="/demo-trading?view=bot">Xem Bot</Link></Button>
            {latestKind === "custom" && <Button type="button" variant="ghost" size="sm" onClick={() => { setError(null); setDialog("vn30") }}>Về VN30</Button>}
          </div>
        )}
      </div>

      {effective?.unavailable_reason && (
        <p role="status" className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-destructive">
          <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          Chưa xác minh được nguồn mua: Bot không mua mới cho đến khi xác minh được.
        </p>
      )}

      {pending && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-2.5 text-[11px] leading-5 text-price-ref" role="status">
          <span>
            Chờ hiệu lực: <b>{sourceName(pending)}</b>
            {symbolCount(pending) !== null && <> · {symbolCount(pending)} mã</>} · {pendingSessionText(pending)}
          </span>
          <Button type="button" variant="link" size="xs" className="h-auto p-0 text-[11px]" disabled={actions.busy} onClick={() => { setError(null); setDialog("cancel") }}>
            Hủy thay đổi
          </Button>
        </div>
      )}

      {dialog === "symbols" && effective && (
        <SymbolsDialog effective={effective} onRevertVn30={latestKind === "custom" ? () => { setError(null); setDialog("vn30") } : undefined} onClose={() => setDialog(null)} />
      )}
      {dialog === "vn30" && <Vn30Dialog busy={actions.busy} error={error} onConfirm={() => void confirmVn30()} onCancel={() => setDialog(null)} />}
      {dialog === "cancel" && (
        <BotConfirmDialog
          open
          busy={actions.busy}
          title="Hủy thay đổi chờ hiệu lực?"
          description="Chỉ bản chưa có hiệu lực bị hủy. Nguồn mua đang dùng, các vị thế và danh mục đã lưu không đổi."
          confirmLabel="Hủy thay đổi"
          cancelLabel="Giữ lại"
          onConfirm={() => void confirmCancel()}
          onCancel={() => setDialog(null)}
        >
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </BotConfirmDialog>
      )}
    </section>
  )
}
