import { useState } from "react"
import { LoaderCircle } from "lucide-react"
import { Link } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

import { formatDate } from "../format"
import type { InvalidSymbol, SavedList, UniverseEffective } from "../types"
import { ConfirmDialog } from "../confirm-dialog"
import { CHANGE_NOTE, LIST_NOT_VERIFIED_NOTE, invalidReasonLabel, isListBotVerified, sourceName } from "./labels"
import type { UniverseActions } from "./use-universe"

const PILL = "inline-flex items-center rounded-sm border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium tabular-nums"

function Shell({
  title,
  description,
  onClose,
  footer,
  wide = false,
  children,
}: {
  title: string
  description?: string
  onClose: () => void
  footer: React.ReactNode
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className={`max-h-[calc(100dvh-1.5rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden bg-card p-0 text-card-foreground ${wide ? "sm:max-w-[680px]" : "sm:max-w-[520px]"}`}
      >
        <DialogHeader className="gap-1 border-b border-border p-4 pr-12">
          <DialogTitle className="font-heading text-base font-bold">{title}</DialogTitle>
          {description ? <DialogDescription className="text-xs leading-5">{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto p-4">{children}</div>
        <DialogFooter className="m-0 flex-row flex-wrap items-center justify-end gap-2 rounded-b-sm border-t border-border bg-card p-3">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-5">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-muted-foreground">{children}</p>
    </div>
  )
}

/* ── Xem danh sách ─────────────────────────────────────────────────────── */

export function SymbolsDialog({
  effective,
  onRevertVn30,
  onClose,
}: {
  effective: UniverseEffective
  onRevertVn30?: () => void
  onClose: () => void
}) {
  const custom = effective.kind === "custom"
  return (
    <Shell
      title={`Danh mục mua mới · ${sourceName(effective)}`}
      onClose={onClose}
      footer={
        <>
          {onRevertVn30 && <Button type="button" variant="outline" className="mr-auto" onClick={onRevertVn30}>Về VN30</Button>}
          <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
        </>
      }
    >
      {effective.unavailable_reason && (
        <Alert variant="destructive">
          <AlertTitle>Chưa xác minh được nguồn mua</AlertTitle>
          <AlertDescription>Bot không mua mới cho đến khi nguồn được xác minh. {effective.unavailable_reason}</AlertDescription>
        </Alert>
      )}
      {effective.symbols.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${effective.symbols.length} mã trong nguồn mua`}>
          {effective.symbols.map((item) => (
            <li key={item.symbol} className={PILL} title={item.name ?? undefined}>{item.symbol}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Chưa có mã nào để hiển thị.</p>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        {custom
          ? "Danh sách cố định tại lần áp dụng. Đổi tiêu chí lọc không tự thay các mã ở đây."
          : effective.membership_session
            ? `Thành phần VN30 theo phiên ${formatDate(effective.membership_session)}.`
            : "Thành phần VN30 theo phiên có hiệu lực của Bot."}
      </p>
      <Note title="Mua mới: chỉ trong danh mục này.">Các vị thế đang giữ ngoài danh mục vẫn được xét theo điều kiện Bán.</Note>
    </Shell>
  )
}

/* ── Danh mục đã lưu ───────────────────────────────────────────────────── */

const PREVIEW_SYMBOLS = 14

export function SavedListsDialog({
  lists,
  loading,
  error,
  onRetry,
  onPick,
  onClose,
}: {
  lists: SavedList[] | undefined
  loading: boolean
  error: string | null
  onRetry: () => void
  onPick: (list: SavedList) => void
  onClose: () => void
}) {
  return (
    <Shell
      wide
      title="Danh mục từ Bộ lọc"
      description="Các danh mục đã lưu để chọn nguồn mua mới cho Bot."
      onClose={onClose}
      footer={<Button type="button" variant="outline" onClick={onClose}>Đóng</Button>}
    >
      {loading ? (
        <div className="space-y-2" aria-label="Đang tải danh mục đã lưu"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Không tải được danh mục đã lưu</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <div className="col-start-2 mt-2"><Button type="button" variant="outline" size="sm" onClick={onRetry}>Thử lại</Button></div>
        </Alert>
      ) : !lists || lists.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-xs leading-5 text-muted-foreground">
          <p className="font-medium text-foreground">Chưa có danh mục đã lưu</p>
          <p className="mt-1">Lọc cổ phiếu ở Bộ lọc rồi lưu danh mục để dùng làm nguồn mua mới cho Bot.</p>
          <Button asChild variant="outline" size="sm" className="mt-3"><Link to="/chien-luoc?tab=bo-loc">Mở Bộ lọc</Link></Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {lists.map((list) => {
            const verified = isListBotVerified(list)
            return (
              <li key={list.id} className="rounded-md border border-border bg-background/40 p-3">
                <h3 className="text-sm font-semibold">{list.name}</h3>
                <ul className="mt-2 flex flex-wrap gap-1" aria-label={`Mã trong ${list.name}`}>
                  {list.tickers.slice(0, PREVIEW_SYMBOLS).map((symbol) => <li key={symbol} className={PILL}>{symbol}</li>)}
                  {list.tickers.length > PREVIEW_SYMBOLS && <li className={`${PILL} text-muted-foreground`}>+{list.tickers.length - PREVIEW_SYMBOLS} mã</li>}
                </ul>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {list.tickers.length} mã · dữ liệu đến {formatDate(list.as_of)}{list.filter_version ? ` · bộ lọc bản ${list.filter_version}` : ""}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    className="ml-auto"
                    disabled={list.tickers.length === 0 || !verified}
                    aria-describedby={verified ? undefined : `unverified-${list.id}`}
                    onClick={() => onPick(list)}
                  >
                    Chọn danh mục<span className="sr-only"> {list.name}</span>
                  </Button>
                </div>
                {!verified && (
                  <p id={`unverified-${list.id}`} className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{LIST_NOT_VERIFIED_NOTE}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Shell>
  )
}

/* ── Áp dụng cho Bot ───────────────────────────────────────────────────── */

export function ApplyListDialog({
  list,
  currentSource,
  actions,
  onBack,
  onApplied,
  onClose,
}: {
  list: SavedList
  currentSource: string
  actions: UniverseActions
  onBack: () => void
  onApplied: (count: number) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(list.tickers))
  const [invalid, setInvalid] = useState<InvalidSymbol[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const symbols = [...new Set(list.tickers)]
  const invalidSet = new Set(invalid.map((item) => item.symbol))
  const allSelected = selected.size === symbols.length
  const chosen = symbols.filter((symbol) => selected.has(symbol))

  function toggle(symbol: string, checked: boolean) {
    setSelected((previous) => {
      const next = new Set(previous)
      if (checked) next.add(symbol)
      else next.delete(symbol)
      return next
    })
  }

  async function submit() {
    if (chosen.length === 0) return
    setMessage(null)
    setInvalid([])
    const outcome = await actions.apply(list.id, chosen)
    if (outcome.ok) {
      onApplied(chosen.length)
      return
    }
    setMessage(outcome.message)
    if (outcome.reason === "invalid_symbols") setInvalid(outcome.invalid)
  }

  return (
    <Shell
      title="Áp dụng danh mục cho Bot"
      onClose={() => { if (!actions.busy) onClose() }}
      footer={
        <>
          <Button type="button" variant="outline" className="mr-auto" onClick={onBack} disabled={actions.busy}>Quay lại</Button>
          <Button type="button" onClick={() => void submit()} disabled={chosen.length === 0 || actions.busy}>
            {actions.busy && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            Áp dụng cho Bot
          </Button>
        </>
      }
    >
      <div>
        <h3 className="text-sm font-semibold">{list.name}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{list.tickers.length} mã · dữ liệu đến {formatDate(list.as_of)}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span aria-live="polite" className={chosen.length === 0 ? "text-destructive" : "text-muted-foreground"}>
          {chosen.length === 0 ? "Chọn ít nhất một mã để áp dụng." : `Đã chọn ${chosen.length}/${symbols.length} mã`}
        </span>
        <Button type="button" variant="ghost" size="xs" onClick={() => setSelected(allSelected ? new Set() : new Set(symbols))}>
          {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
        </Button>
      </div>

      {(message || invalid.length > 0) && (
        <Alert variant="destructive">
          <AlertTitle>{invalid.length > 0 ? "Một số mã không hợp lệ cho nguồn mua của Bot" : "Chưa áp dụng được"}</AlertTitle>
          <AlertDescription>
            {invalid.length > 0 ? (
              <>
                <p>Chưa có gì được áp dụng. Hãy bỏ chọn các mã dưới đây hoặc quay lại chọn danh mục khác, rồi xác nhận lại.</p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                  {invalid.map((item) => (
                    <li key={item.symbol}><strong>{item.symbol}</strong>: {invalidReasonLabel(item.reason)}</li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="mt-2"
                  onClick={() => setSelected((previous) => new Set([...previous].filter((symbol) => !invalidSet.has(symbol))))}
                >
                  Bỏ chọn các mã không hợp lệ
                </Button>
              </>
            ) : (
              message
            )}
          </AlertDescription>
        </Alert>
      )}

      <ul className="divide-y divide-border rounded-md border border-border" aria-label="Mã trong danh mục">
        {symbols.map((symbol) => {
          const id = `apply-${list.id}-${symbol}`
          return (
            <li key={symbol} className="flex items-center justify-between gap-3 px-3 py-2">
              <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm font-medium">
                {symbol}
                {invalidSet.has(symbol) && <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">Không hợp lệ</span>}
              </label>
              <Checkbox id={id} checked={selected.has(symbol)} onCheckedChange={(checked) => toggle(symbol, checked === true)} aria-label={`Chọn ${symbol}`} />
            </li>
          )
        })}
      </ul>

      <Note title={`Danh mục này thay nguồn mua mới ${currentSource}.`}>{CHANGE_NOTE}</Note>
    </Shell>
  )
}

/* ── Về VN30 ───────────────────────────────────────────────────────────── */

export function Vn30Dialog({
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  busy: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <ConfirmDialog
      open
      busy={busy}
      title="Quay về VN30"
      description="Bot sẽ chỉ xét mua mới trong VN30. Những cổ phiếu đang giữ tiếp tục được xét theo điều kiện Bán, không bị bán do thay danh mục. Thay đổi có hiệu lực từ phiên giao dịch tiếp theo."
      confirmLabel="Xác nhận"
      cancelLabel="Hủy"
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </ConfirmDialog>
  )
}
