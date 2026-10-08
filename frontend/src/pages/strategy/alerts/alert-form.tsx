import { useId, useMemo, useRef, useState } from "react"
import { LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useBotConfig } from "@/pages/demo-trading/bot/config/use-bot-config"

import { useSavedLists } from "../filter/hooks"
import { ErrorLine, NativeSelect } from "../shared/controls"
import { FIELD_LABEL } from "../shared/ui-text"
import { DialogShell } from "../shared/dialog-shell"
import { errorMessage, newKey } from "../shared/errors"
import { fmtDate } from "../shared/format"
import {
  type AlertDetail,
  type AlertScopeInput,
  type AlertSide,
  type AlertSourceInput,
  type AlertUpdateBody,
  type StrategyAlert,
} from "./api"
import { useConfigRevisions, useCreateAlert, useRunsForAlerts, useSourcePreview, useUpdateAlert } from "./hooks"

type SourceMode = "keep" | "shared" | "run"

const SYMBOL_PATTERN = /^[A-Z0-9._-]{1,20}$/
const MAX_SYMBOLS = 500
const NAME_MAX = 120

const SIDE_TEXT: Record<AlertSide, string> = { buy: "Điều kiện Mua", sell: "Điều kiện Bán" }

function parseSymbols(text: string): { symbols: string[]; invalid: string[] } {
  const tokens = text.split(/[\s,;]+/).map((token) => token.trim().toUpperCase()).filter(Boolean)
  return { symbols: tokens.filter((token) => SYMBOL_PATTERN.test(token)), invalid: tokens.filter((token) => !SYMBOL_PATTERN.test(token)) }
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|")

export type AlertFormProps = {
  /** An existing alert to edit; omitted when creating. */
  alert?: StrategyAlert
  /** Create from one backtest run: pins that run's own snapshot, never the current form. */
  initialRunId?: string
  initialSymbols?: readonly string[]
  /** Start with a saved list as the scope (e.g. "Tạo cảnh báo" from a saved list). */
  initialListId?: string
  onClose: () => void
  onSaved?: (alert: AlertDetail) => void
}

/**
 * Create or edit an alert. The form never writes the shared config. Saving pins exactly the
 * source chosen here; renaming or pausing never moves an alert to a newer config and never
 * creates a version.
 */
export function AlertForm({ alert, initialRunId, initialSymbols, initialListId, onClose, onSaved }: AlertFormProps) {
  const baseId = useId()
  const editing = !!alert
  const create = useCreateAlert()
  const update = useUpdateAlert()
  const config = useBotConfig()
  const lists = useSavedLists(true)
  const revisions = useConfigRevisions(true)
  const runs = useRunsForAlerts(true)

  const [touched, setTouched] = useState(false)
  const [name, setName] = useState<string | null>(alert?.name ?? null)
  const [sourceMode, setSourceMode] = useState<SourceMode>(editing ? "keep" : initialRunId ? "run" : "shared")
  const [revision, setRevision] = useState<number | null>(null)
  const [runId, setRunId] = useState<string | null>(initialRunId ?? null)
  const initialListScope = alert?.version.scope.kind === "saved_list" ? alert.version.scope.list_id : (initialListId ?? null)
  const [scopeMode, setScopeMode] = useState<string>(initialListScope ? `list:${initialListScope}` : "symbols")
  const [symbols, setSymbols] = useState<string[] | null>(alert && alert.version.scope.kind === "symbols" ? [...alert.version.symbols] : initialSymbols ? [...initialSymbols] : null)
  const [symbolText, setSymbolText] = useState("")
  const [listPick, setListPick] = useState<ReadonlySet<string> | null>(alert && alert.version.scope.kind === "saved_list" ? new Set(alert.version.symbols) : null)
  const [sideChoice, setSideChoice] = useState<Partial<Record<AlertSide, boolean>>>({})
  const [enabled, setEnabled] = useState(alert?.enabled ?? true)
  const [error, setError] = useState<string | null>(null)
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null)

  const savedLists = lists.data ?? []
  const revisionRows = useMemo(() => [...(revisions.data ?? [])].sort((a, b) => b.revision - a.revision), [revisions.data])
  const runRows = useMemo(() => (runs.data?.items ?? []).filter((run) => run.status === "succeeded" && run.kind === "single"), [runs.data])

  const selectedRevision = revision ?? revisionRows[0]?.revision ?? null
  const selectedRunId = runId ?? (sourceMode === "run" ? (runRows[0]?.run_id ?? null) : null)
  const selectedRun = runRows.find((run) => run.run_id === selectedRunId) ?? null

  const source: AlertSourceInput | null =
    sourceMode === "shared" && selectedRevision !== null
      ? { kind: "shared_config", revision: selectedRevision }
      : sourceMode === "run" && selectedRunId
        ? { kind: "backtest_run", run_id: selectedRunId }
        : null
  const preview = useSourcePreview(source)

  const sidesDetail = sourceMode === "keep" && alert ? alert.version.sides_detail : preview.data?.sides_detail
  const indicatorNames = useMemo(() => new Map(config.indicators.map((item) => [item.id, item.name])), [config.indicators])
  const nameOf = (id: string) => indicatorNames.get(id) ?? id.toUpperCase()

  const defaultName = selectedRun ? `${selectedRun.symbol} · Theo dõi tín hiệu` : ""
  const nameValue = name ?? defaultName
  const suggestedSymbol = preview.data?.suggested_symbol ?? selectedRun?.symbol ?? null
  const symbolList = symbols ?? (!editing && suggestedSymbol && !initialListScope ? [suggestedSymbol] : [])

  const activeList = scopeMode.startsWith("list:") ? savedLists.find((list) => `list:${list.id}` === scopeMode) ?? null : null
  const listGone = scopeMode.startsWith("list:") && !activeList && !lists.isPending
  const pinnedList = alert?.version.scope.kind === "saved_list" ? alert.version.scope : null
  const listSymbols = activeList
    ? (listPick ? activeList.tickers.filter((symbol) => listPick.has(symbol)) : [...activeList.tickers])
    : listGone && pinnedList && scopeMode === `list:${pinnedList.list_id}`
      ? [...(alert?.version.symbols ?? [])]
      : []

  const sideValid = (side: AlertSide) => sidesDetail?.[side].valid === true
  const sideChecked = (side: AlertSide) => sideValid(side) && (sideChoice[side] ?? (editing ? alert.version.sides.includes(side) : true))
  const chosenSides = (["buy", "sell"] as const).filter(sideChecked)

  const busy = create.isPending || update.isPending

  function touch() {
    setTouched(true)
    setError(null)
  }

  function addSymbols() {
    const { symbols: parsed, invalid } = parseSymbols(symbolText)
    if (invalid.length > 0) {
      setError(`Mã không hợp lệ: ${invalid.join(", ")}. Chỉ dùng chữ, số, dấu chấm, gạch ngang và gạch dưới.`)
      return
    }
    if (parsed.length === 0) return
    touch()
    setSymbols([...new Set([...symbolList, ...parsed])])
    setSymbolText("")
  }

  function scopePayload(): { ok: true; scope: AlertScopeInput } | { ok: false; message: string } {
    if (scopeMode === "symbols") {
      const pending = parseSymbols(symbolText)
      if (pending.invalid.length > 0) return { ok: false, message: `Mã không hợp lệ: ${pending.invalid.join(", ")}.` }
      const all = [...new Set([...symbolList, ...pending.symbols])]
      if (all.length === 0) return { ok: false, message: "Chọn ít nhất một mã cổ phiếu." }
      if (all.length > MAX_SYMBOLS) return { ok: false, message: `Tối đa ${MAX_SYMBOLS} mã mỗi cảnh báo.` }
      return { ok: true, scope: { kind: "symbols", symbols: all } }
    }
    const listId = scopeMode.slice("list:".length)
    if (listSymbols.length === 0) return { ok: false, message: "Chọn ít nhất một mã trong danh mục." }
    const wholeList = activeList ? sameSet(listSymbols, activeList.tickers) : false
    return { ok: true, scope: { kind: "saved_list", list_id: listId, ...(wholeList ? {} : { symbols: listSymbols }) } }
  }

  function scopeUnchanged(scope: AlertScopeInput): boolean {
    if (!alert) return false
    const version = alert.version
    if (scope.kind === "symbols") return version.scope.kind === "symbols" && sameSet(scope.symbols ?? [], version.symbols)
    const sameList = version.scope.kind === "saved_list" && version.scope.list_id === scope.list_id
    const nextSymbols = scope.symbols ?? activeList?.tickers ?? listSymbols
    return sameList && sameSet(nextSymbols, version.symbols)
  }

  async function submit() {
    setError(null)
    const trimmed = nameValue.trim()
    if (!trimmed) return setError("Nhập tên cảnh báo.")
    if (trimmed.length > NAME_MAX) return setError(`Tên cảnh báo tối đa ${NAME_MAX} ký tự.`)
    if (sourceMode !== "keep" && !source) return setError("Chọn nguồn cấu hình cho cảnh báo.")
    const scoped = scopePayload()
    if (!scoped.ok) return setError(scoped.message)
    if (chosenSides.length === 0) return setError("Chọn ít nhất một phía có điều kiện hợp lệ.")

    try {
      if (!editing) {
        const fingerprint = JSON.stringify([trimmed, source, scoped.scope, chosenSides, enabled])
        if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newKey() }
        const saved = await create.mutateAsync({
          name: trimmed,
          source: source as AlertSourceInput,
          scope: scoped.scope,
          sides: chosenSides,
          enabled,
          idempotency_key: attempt.current.key,
        })
        onSaved?.(saved)
        return
      }
      const body: AlertUpdateBody = {}
      if (trimmed !== alert.name) body.name = trimmed
      if (enabled !== alert.enabled) body.enabled = enabled
      if (sourceMode !== "keep" && source) body.source = source
      if (!scopeUnchanged(scoped.scope)) body.scope = scoped.scope
      if (!sameSet(chosenSides, alert.version.sides)) body.sides = chosenSides
      if (Object.keys(body).length === 0) return onClose()
      if (body.source || body.scope || body.sides) body.expected_version = alert.current_version
      const saved = await update.mutateAsync({ id: alert.id, body })
      onSaved?.(saved)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const sourceNote =
    sourceMode === "keep"
      ? "Giữ đúng bộ điều kiện đang theo dõi. Đổi tên hoặc bật/tạm dừng không chuyển sang bản mới nhất."
      : sourceMode === "run"
        ? "Ghim đúng cấu hình của kết quả đã chọn, không lấy form Backtest đang chỉnh."
        : "Ghim đúng bản đã lưu được chọn. Sửa cấu hình chung sau đó không đổi cảnh báo này."

  const previewLoading = sourceMode !== "keep" && !!source && preview.isPending
  const noPinnable = sourceMode === "shared" && !revisions.isPending && revisionRows.length === 0

  return (
    <DialogShell
      title={editing ? "Chỉnh cảnh báo" : "Tạo cảnh báo"}
      dirty={touched && !busy}
      busy={busy}
      onClose={onClose}
      footer={({ requestClose }) => (
        <>
          <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>Hủy</Button>
          <Button type="button" onClick={() => void submit()} disabled={busy || previewLoading}>
            {busy && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            Lưu cảnh báo
          </Button>
        </>
      )}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`${baseId}-name`} className={FIELD_LABEL}>Tên cảnh báo</Label>
        <Input
          id={`${baseId}-name`}
          value={nameValue}
          maxLength={NAME_MAX}
          autoComplete="off"
          placeholder="Ví dụ: Theo dõi xu hướng"
          onChange={(event) => { touch(); setName(event.target.value) }}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${baseId}-source`} className={FIELD_LABEL}>Nguồn cấu hình</Label>
          <NativeSelect
            id={`${baseId}-source`}
            value={sourceMode}
            onChange={(event) => { touch(); setSourceMode(event.target.value as SourceMode) }}
          >
            {editing && <option value="keep">Giữ cấu hình đang theo dõi</option>}
            <option value="run">Cấu hình của kết quả kiểm thử</option>
            <option value="shared">Cấu hình chung đã lưu</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${baseId}-scope`} className={FIELD_LABEL}>Phạm vi</Label>
          <NativeSelect
            id={`${baseId}-scope`}
            value={scopeMode}
            onChange={(event) => { touch(); setScopeMode(event.target.value); setListPick(null) }}
          >
            <option value="symbols">Chọn mã cổ phiếu</option>
            {pinnedList && !savedLists.some((list) => list.id === pinnedList.list_id) && (
              <option value={`list:${pinnedList.list_id}`}>{pinnedList.list_name} (danh mục đã ghim)</option>
            )}
            {savedLists.map((list) => (
              <option key={list.id} value={`list:${list.id}`}>{list.name} ({list.tickers.length} mã)</option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {sourceMode === "shared" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${baseId}-revision`} className={FIELD_LABEL}>Bản cấu hình chung</Label>
          <NativeSelect
            id={`${baseId}-revision`}
            value={selectedRevision ?? ""}
            disabled={revisionRows.length === 0}
            onChange={(event) => { touch(); setRevision(Number(event.target.value)) }}
          >
            {revisionRows.length === 0 && <option value="">Chưa có bản cấu hình đã lưu</option>}
            {revisionRows.map((row) => (
              <option key={row.revision} value={row.revision}>Bản {row.revision} · lưu {fmtDate(row.saved_at)}</option>
            ))}
          </NativeSelect>
          {noPinnable && <p className="text-[11px] text-muted-foreground">Lưu cấu hình Mua/Bán ở Backtest trước khi tạo cảnh báo.</p>}
        </div>
      )}

      {sourceMode === "run" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${baseId}-run`} className={FIELD_LABEL}>Kết quả kiểm thử</Label>
          <NativeSelect
            id={`${baseId}-run`}
            value={selectedRunId ?? ""}
            disabled={runRows.length === 0}
            onChange={(event) => { touch(); setRunId(event.target.value) }}
          >
            {runRows.length === 0 && <option value="">Chưa có kết quả kiểm thử nào</option>}
            {runRows.map((run) => (
              <option key={run.run_id} value={run.run_id}>
                {run.symbol} · {fmtDate(run.start)} đến {fmtDate(run.end)} · bản {run.shared_revision} · chạy {fmtDate(run.created_at)}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-5" aria-live="polite">
        {previewLoading ? (
          <span className="text-muted-foreground">Đang đọc điều kiện của nguồn đã chọn…</span>
        ) : preview.isError && sourceMode !== "keep" ? (
          <ErrorLine>{errorMessage(preview.error)}</ErrorLine>
        ) : sidesDetail ? (
          <>
            <strong className="block text-foreground">
              {sourceMode === "keep" && alert
                ? `Cấu hình đang ghim: cảnh báo v${alert.current_version}`
                : preview.data?.source.kind === "shared_config"
                  ? `Cấu hình chung bản ${preview.data.source.revision}`
                  : `Cấu hình của kết quả kiểm thử${preview.data?.suggested_symbol ? ` ${preview.data.suggested_symbol}` : ""}`}
            </strong>
            <span className="block text-muted-foreground">
              Mua: {sidesDetail.buy.valid ? sidesDetail.buy.indicator_ids.map(nameOf).join(" + ") : "chưa có điều kiện hợp lệ"}
            </span>
            <span className="block text-muted-foreground">
              Bán: {sidesDetail.sell.valid ? sidesDetail.sell.indicator_ids.map(nameOf).join(" + ") : "chưa có điều kiện hợp lệ"}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Chọn nguồn để xem các phía có điều kiện hợp lệ.</span>
        )}
      </div>

      {scopeMode === "symbols" ? (
        <div className="space-y-2">
          <Label htmlFor={`${baseId}-symbols`} className={FIELD_LABEL}>Mã theo dõi</Label>
          {symbolList.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Mã đã chọn">
              {symbolList.map((symbol) => (
                <li key={symbol} className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted/40 py-0.5 pr-0.5 pl-2 text-xs font-medium">
                  {symbol}
                  <button
                    type="button"
                    aria-label={`Bỏ mã ${symbol}`}
                    className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                    onClick={() => { touch(); setSymbols(symbolList.filter((item) => item !== symbol)) }}
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input
              id={`${baseId}-symbols`}
              value={symbolText}
              autoComplete="off"
              spellCheck={false}
              placeholder="Nhập mã, ví dụ FPT, VNM"
              className="font-mono uppercase"
              onChange={(event) => { setSymbolText(event.target.value); setError(null) }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addSymbols()
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addSymbols}>Thêm mã</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Một hoặc nhiều mã, tối đa {MAX_SYMBOLS}. Máy chủ kiểm tra mã có trong danh mục cổ phiếu.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className={FIELD_LABEL}>Mã trong danh mục</span>
            {activeList && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => { touch(); setListPick(listSymbols.length === activeList.tickers.length ? new Set() : new Set(activeList.tickers)) }}
              >
                {listSymbols.length === activeList.tickers.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
              </Button>
            )}
          </div>
          {activeList ? (
            <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-5" aria-label="Chọn mã trong danh mục">
              {activeList.tickers.map((symbol) => {
                const id = `${baseId}-list-${symbol}`
                return (
                  <li key={symbol}>
                    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background/40 px-2 py-1.5 text-xs font-medium">
                      <Checkbox
                        id={id}
                        checked={listSymbols.includes(symbol)}
                        onCheckedChange={(checked) => {
                          touch()
                          const next = new Set(listSymbols)
                          if (checked === true) next.add(symbol)
                          else next.delete(symbol)
                          setListPick(next)
                        }}
                      />
                      {symbol}
                    </label>
                  </li>
                )
              })}
            </ul>
          ) : listGone ? (
            <div className="space-y-1.5 rounded-md border border-border bg-muted/40 p-3 text-xs leading-5">
              <p className="text-muted-foreground">
                Danh mục nguồn đã bị xóa hoặc không còn trong danh sách. Cảnh báo giữ nguyên tập mã đã ghim:
              </p>
              <p className="font-medium">{listSymbols.join(" · ")}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Đang tải danh mục đã lưu…</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Cảnh báo giữ đúng tập mã được chọn lúc lưu. Đổi bộ lọc hoặc xóa danh mục nguồn không tự đổi phạm vi này.
          </p>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className={FIELD_LABEL}>Phía theo dõi</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["buy", "sell"] as const).map((side) => {
            const id = `${baseId}-side-${side}`
            const valid = sideValid(side)
            return (
              <label
                key={side}
                htmlFor={id}
                className={`flex items-start gap-2 rounded-md border border-border bg-background/40 p-2.5 text-sm ${valid ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
              >
                <Checkbox
                  id={id}
                  checked={sideChecked(side)}
                  disabled={!valid}
                  className="mt-0.5"
                  onCheckedChange={(checked) => { touch(); setSideChoice((previous) => ({ ...previous, [side]: checked === true })) }}
                />
                <span>
                  <span className="font-medium">{SIDE_TEXT[side]}</span>
                  {sidesDetail && !valid && <span className="block text-[11px] text-muted-foreground">Cấu hình đã chọn chưa có điều kiện {side === "buy" ? "Mua" : "Bán"} hợp lệ.</span>}
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2.5">
        <span className="text-xs text-muted-foreground">Cuối phiên · Tín hiệu mới thỏa điều kiện</span>
        <label className="flex items-center gap-2 text-sm font-medium">
          Theo dõi
          <Switch checked={enabled} aria-label="Theo dõi" onCheckedChange={(checked) => { touch(); setEnabled(checked) }} />
        </label>
      </div>

      <p className="text-[11px] leading-4 text-muted-foreground">{sourceNote} Cảnh báo chỉ ghi lịch sử trên web: không đặt lệnh, không thay cấu hình hay danh mục của Bot.</p>
      {error && <ErrorLine>{error}</ErrorLine>}
    </DialogShell>
  )
}
