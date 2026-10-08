import { useId, useMemo, useRef, useState } from "react"
import { LoaderCircle } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { InvalidSymbol } from "@/pages/demo-trading/bot/types"
import { invalidReasonLabel, pendingSessionText } from "@/pages/demo-trading/bot/universe/labels"
import type { UniverseActions } from "@/pages/demo-trading/bot/universe/use-universe"

import { FIELD_LABEL } from "../shared/ui-text"
import { DialogShell } from "../shared/dialog-shell"
import { errorMessage, newKey } from "../shared/errors"
import { fmtDate } from "../shared/format"
import { useCreateList } from "./hooks"
import type { SavedList, Selection } from "./types"

const NAME_MAX = 120

export type ApplySource =
  /** The result the server holds (every page): a list is created for it only when the user did not save one. */
  | { kind: "result"; runId: string; criteria: string; asOf: string; filterId?: string; filterVersion?: number; savedList?: SavedList | null }
  /** A list the user saved, applied whole or in part. */
  | { kind: "list"; list: SavedList; criteria: string | null }

/**
 * "Áp dụng cho Bot": replaces the Bot's buy universe for NEW buys from the next session
 * (pending until then). It does not sell what the Bot holds; VN30 stays the default and can be
 * restored. From a result, the server first records a list (internal unless the user saved it), then
 * the Bot applies that list with the symbols chosen here: symbols are never invented by the page.
 */
export function ApplyBotDialog({
  source,
  candidates,
  defaultSelected,
  currentSource,
  actions,
  onApplied,
  onBack,
  onClose,
}: {
  source: ApplySource
  /** Every symbol the choice may include (all passed rows of the result, or the tickers of the list). */
  candidates: readonly string[]
  defaultSelected: ReadonlySet<string>
  /** Name of the source the Bot buys from now (or the pending one). */
  currentSource: string
  actions: UniverseActions
  onApplied: (count: number, session: string) => void
  onBack?: () => void
  onClose: () => void
}) {
  const baseId = useId()
  const createList = useCreateList()
  const symbols = useMemo(() => [...new Set(candidates)], [candidates])
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(symbols.filter((symbol) => defaultSelected.size === 0 || defaultSelected.has(symbol))))
  const [name, setName] = useState(source.kind === "list" ? source.list.name : `Danh mục từ bộ lọc ${fmtDate(source.asOf)}`)
  const [message, setMessage] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<InvalidSymbol[]>([])
  const [touched, setTouched] = useState(false)
  const created = useRef<{ fingerprint: string; list: SavedList; key: string } | null>(null)
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null)
  const busy = actions.busy || createList.isPending

  const chosen = symbols.filter((symbol) => selected.has(symbol))
  const invalidSet = new Set(invalid.map((item) => item.symbol))
  const allSelected = chosen.length === symbols.length
  const trimmed = name.trim()
  const canSubmit = chosen.length > 0 && !busy && (source.kind === "list" || trimmed !== "")

  function toggle(symbol: string, checked: boolean) {
    setTouched(true)
    setMessage(null)
    setSelected((previous) => {
      const next = new Set(previous)
      if (checked) next.add(symbol)
      else next.delete(symbol)
      return next
    })
  }

  async function submit() {
    if (!canSubmit) return
    setMessage(null)
    setInvalid([])
    let listId: string
    if (source.kind === "list") {
      listId = source.list.id
    } else {
      const selection: Selection = allSelected ? { mode: "all" } : { mode: "subset", symbols: chosen }
      const fingerprint = JSON.stringify([source.runId, trimmed, selection])
      const reuse = source.savedList && chosen.length === source.savedList.tickers.length && chosen.every((symbol) => source.savedList?.tickers.includes(symbol))
      if (reuse && source.savedList) {
        listId = source.savedList.id
      } else if (created.current?.fingerprint === fingerprint) {
        listId = created.current.list.id
      } else {
        if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newKey() }
        try {
          const list = await createList.mutateAsync({
            name: trimmed,
            runId: source.runId,
            selection,
            visibility: "internal",
            ...(source.filterId ? { filterId: source.filterId, ...(source.filterVersion ? { filterVersion: source.filterVersion } : {}) } : {}),
            idempotencyKey: attempt.current.key,
          })
          created.current = { fingerprint, list, key: attempt.current.key }
          listId = list.id
        } catch (error) {
          setMessage(errorMessage(error))
          return
        }
      }
    }
    const outcome = await actions.apply(listId, chosen)
    if (outcome.ok) {
      onApplied(chosen.length, pendingSessionText(outcome.request))
      return
    }
    setMessage(outcome.message)
    if (outcome.reason === "invalid_symbols") setInvalid(outcome.invalid)
  }

  return (
    <DialogShell
      title="Áp dụng danh mục cho Bot"
      size="md"
      dirty={touched && !busy}
      busy={busy}
      onClose={onClose}
      footer={({ requestClose }) => (
        <>
          {onBack && <Button type="button" variant="outline" className="mr-auto" disabled={busy} onClick={onBack}>Quay lại</Button>}
          <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>Hủy</Button>
          <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
            {busy && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            Áp dụng cho Bot
          </Button>
        </>
      )}
    >
      {source.kind === "result" ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${baseId}-name`} className={FIELD_LABEL}>Tên danh mục mua mới</Label>
          <Input id={`${baseId}-name`} value={name} maxLength={NAME_MAX} autoComplete="off" onChange={(event) => { setTouched(true); setName(event.target.value) }} />
        </div>
      ) : (
        <div>
          <h3 className="text-sm font-semibold">{source.list.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{source.list.tickers.length} mã · mốc dữ liệu {fmtDate(source.list.as_of)}</p>
        </div>
      )}
      {source.criteria && <p className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">{source.criteria}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span aria-live="polite" data-testid="apply-count" className={chosen.length === 0 ? "text-destructive" : "text-muted-foreground"}>
          {chosen.length === 0 ? "Chọn ít nhất một mã để áp dụng." : `${chosen.length} / ${symbols.length} mã`}
        </span>
        <Button type="button" variant="ghost" size="xs" onClick={() => { setTouched(true); setSelected(allSelected ? new Set() : new Set(symbols)) }}>
          {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
        </Button>
      </div>

      {(message || invalid.length > 0) && (
        <Alert variant="destructive">
          <AlertTitle>{invalid.length > 0 ? "Một số mã không hợp lệ cho nguồn mua của Bot" : "Chưa áp dụng được"}</AlertTitle>
          <AlertDescription>
            {invalid.length > 0 ? (
              <>
                <p>Chưa có gì được áp dụng. Hãy bỏ chọn các mã dưới đây rồi xác nhận lại.</p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                  {invalid.map((item) => <li key={item.symbol}><strong>{item.symbol}</strong>: {invalidReasonLabel(item.reason)}</li>)}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="mt-2"
                  onClick={() => { setSelected((previous) => new Set([...previous].filter((symbol) => !invalidSet.has(symbol)))); setInvalid([]); setMessage(null) }}
                >
                  Bỏ chọn các mã không hợp lệ
                </Button>
              </>
            ) : message}
          </AlertDescription>
        </Alert>
      )}

      <ul className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3" aria-label="Mã áp dụng cho Bot">
        {symbols.map((symbol) => {
          const id = `${baseId}-${symbol}`
          return (
            <li key={symbol}>
              <label htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background/40 px-2.5 py-1.5 text-sm font-medium">
                <Checkbox id={id} checked={selected.has(symbol)} onCheckedChange={(checked) => toggle(symbol, checked === true)} aria-label={`Chọn ${symbol}`} />
                {symbol}
                {invalidSet.has(symbol) && <span className="rounded-sm bg-destructive/10 px-1 text-[10px] font-semibold text-destructive">Không hợp lệ</span>}
              </label>
            </li>
          )
        })}
      </ul>

      <div className="space-y-1.5 rounded-md border border-border bg-muted/40 p-3 text-xs leading-5">
        <p className="font-semibold text-foreground">Danh mục này thay nguồn mua mới “{currentSource}” của Bot.</p>
        <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
          <li>Có hiệu lực từ phiên giao dịch tiếp theo. Trước đó nguồn hiện tại vẫn được dùng (đang chờ hiệu lực).</li>
          <li>Không bán cổ phiếu Bot đang giữ: mọi vị thế vẫn được xét theo điều kiện Bán.</li>
          <li>VN30 là nguồn mặc định. Bạn có thể quay lại VN30 bất cứ lúc nào.</li>
          <li>Tập mã được giữ cố định cho tới lần bạn áp dụng lại, không tự theo dõi thay đổi của bộ lọc.</li>
        </ul>
      </div>
    </DialogShell>
  )
}
