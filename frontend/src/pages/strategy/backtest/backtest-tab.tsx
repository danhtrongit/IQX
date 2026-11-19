/**
 * Tab "Backtest": test the saved Mua/Bán conditions on ONE symbol's daily history.
 *
 * - The conditions are the ONE shared configuration the Bot uses too. Saving in the config dialog (or
 *   removing a side) changes the Bot from its effective session and the page says so; running and
 *   opening results never write the configuration.
 * - A run always uses the SAVED revision, once per click, and is stored immutably. The result on
 *   screen never follows later edits: it is flagged "cần chạy lại" instead.
 * - No stop, take-profit, trailing or max holding, no "Mô phỏng Bot".
 * - Bản nháp (tab IQX §3.3): "Dùng" on a Chiến lược IQX fills a DRAFT of the cards. While a draft is open,
 *   Chỉnh / ✕ / + Mua / + Bán edit the draft only, a run sends the draft (the saved revision is its base)
 *   and "Lưu cho Bot" (after a run of that exact draft) writes it as ONE new revision. "Về cấu hình đã lưu"
 *   drops it. Compose mode of Quản trị › Mẫu IQX is the same draft, started from the registry defaults.
 */
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Bell, Bot, FolderOpen, Link2, LoaderCircle, Play, RotateCcw, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { effectiveText, activeConditions } from "@/pages/demo-trading/bot/config/summary"
import type { IndicatorConfig, Side, TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"
import { useBotConfig } from "@/pages/demo-trading/bot/config/use-bot-config"
import { SymbolPicker } from "@/pages/demo-trading/market"
import { botKeys } from "@/pages/demo-trading/bot/api"
import { useAuth } from "@/hooks/use-auth"

import { AlertForm } from "../alerts/alert-form"
import { ConfirmDialog } from "../confirm-dialog"
import { ErrorLine, FeatureState, NativeSelect, Spinner } from "../shared/controls"
import { FEATURE_DISABLED_COPY, FIELD_LABEL } from "../shared/ui-text"
import { DialogShell } from "../shared/dialog-shell"
import { errorDetails, errorMessage, isApiError, newKey } from "../shared/errors"
import { fmtDate, fmtVnd, todayInVietnam } from "../shared/format"
import { isCatalogIndicator } from "../shared/indicators"
import { saveDraftForBot, type Execution, type FeePreset, type RunRequest, type RunResponse } from "./api"
import { SidePanel } from "./conditions"
import { ConfigDialog } from "./config-dialog"
import { useRunBacktest } from "./hooks"
import { IndicatorLibrary } from "./library"
import { isSideUsed } from "./sides"
import { BacktestResults } from "./results"
import { RunsDialog } from "./runs-dialog"
import { SymbolStrip } from "./symbol-strip"
import { iqxTitle, recordIqxUsed, useIqxStrategies, type IqxStrategyItem, type StrategyComposeBinding } from "../shared/iqx"
import { IqxStrip } from "../shared/iqx-ui"
import {
  applyIqxStrategy,
  changedIndicators,
  defaultIndicators,
  maxHoldingError,
  removeSide,
  strategyDefinitionOf,
  strategyErrors,
  withIndicators,
  type Indicators,
} from "./draft"
import { IqxStrategyLibrary } from "./iqx-library"

type Modal =
  | { kind: "config"; indicator: TechnicalIndicator; side: Side; adding: boolean }
  | { kind: "remove"; indicator: TechnicalIndicator; side: Side }
  | { kind: "runs" | "alert" | "context" | "save-bot" | "back" }
  | null

const MIN_CAPITAL = 1_000_000
const MAX_CAPITAL = 1_000_000_000_000
const MAX_RANGE_DAYS = 3653
const DEFAULT_CAPITAL = 100_000_000

const EXECUTION_COPY: Record<Execution, string> = {
  next_open:
    "Tín hiệu tính sau giá đóng cửa phiên T tạo lệnh chờ; giá khớp là giá mở cửa của phiên giao dịch kế tiếp. Tín hiệu ở phiên cuối khoảng chưa có phiên khớp thì giữ là chưa khớp.",
  same_close:
    "Quy ước mô phỏng: tín hiệu tính trên dữ liệu đã hoàn tất tới giá đóng cửa và khớp đúng giá đóng cửa đó. Thực tế không thể biết đủ giá đóng cửa và khối lượng rồi đặt lệnh khớp chính giá đó.",
}

function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number]
  return `${String(y + years).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

function daysBetween(start: string, end: string): number {
  return (Date.parse(end) - Date.parse(start)) / 86_400_000
}

function runErrorText(error: unknown): string {
  if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "Backtest chạy quá lâu nên đã dừng. Thu hẹp khoảng thời gian hoặc bớt điều kiện rồi chạy lại; kết quả cũ không bị thay."
  }
  if (isApiError(error, 422) || isApiError(error, 400)) {
    const lines = errorDetails(error).flatMap((item) => (typeof item.message === "string" ? [item.message] : []))
    return lines.length > 0 ? `${errorMessage(error)}\n${lines.join("\n")}` : errorMessage(error)
  }
  return errorMessage(error)
}

/** Runs `run` once when mounted (a `?iqx=` link is handled once the config and the list are loaded). */
function OnMount({ run }: { run: () => void }) {
  const fire = useEffectEvent(run)
  useEffect(() => fire(), [])
  return null
}

const DRAFT_STALE = "Bản nháp đã sửa sau lần chạy. Bấm Chạy trước khi Lưu cho Bot."

export function BacktestTab({ initialSymbol, compose }: { initialSymbol?: string; compose?: StrategyComposeBinding }) {
  const config = useBotConfig()
  const run = useRunBacktest()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [symbol, setSymbol] = useState(() => initialSymbol?.trim().toUpperCase() || "FPT")
  // A new `?symbol=` (e.g. a symbol of the Bộ lọc) changes the symbol without dropping the draft.
  const [symbolProp, setSymbolProp] = useState(initialSymbol)
  if (symbolProp !== initialSymbol) {
    setSymbolProp(initialSymbol)
    if (initialSymbol?.trim()) setSymbol(initialSymbol.trim().toUpperCase())
  }
  /** Bản nháp: every indicator of the form, or `null` when the form shows the saved config. */
  const [draft, setDraft] = useState<Indicators | null>(null)
  const [maxHolding, setMaxHolding] = useState(() => (compose?.initial ? String(compose.initial.max_holding) : ""))
  const [iqx, setIqx] = useState<IqxStrategyItem | null>(null)
  const [confirmIqx, setConfirmIqx] = useState<{ item: IqxStrategyItem; lead?: string } | null>(null)
  /** Bumped by every draft edit: a run of an older draft cannot be saved for the Bot. */
  const [draftRev, setDraftRev] = useState(0)
  const [ranDraft, setRanDraft] = useState<{ runId: string; rev: number; draft: boolean } | null>(null)
  const [savedFromRun, setSavedFromRun] = useState<{ runId: string; revision: number } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveKey = useRef<string | null>(null)
  const [end, setEnd] = useState(() => todayInVietnam())
  const [start, setStart] = useState(() => addYears(todayInVietnam(), -2))
  const [capitalText, setCapitalText] = useState(() => DEFAULT_CAPITAL.toLocaleString("vi-VN"))
  const [execution, setExecution] = useState<Execution>("next_open")
  const [fee, setFee] = useState<FeePreset>("standard")
  const [viewed, setViewed] = useState<RunResponse | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const state = config.state
  const savedConfig = state?.config
  const library = useMemo(
    () => config.indicators.filter((indicator) => (compose || config.granted.has(indicator.id)) && isCatalogIndicator(indicator.id)),
    [config.indicators, config.granted, compose],
  )
  // Compose mode never starts from the admin's own Bot config: registry defaults, then the item.
  if (compose && draft === null && config.indicators.length > 0) {
    const base = defaultIndicators(config.indicators)
    setDraft(compose.initial ? applyIqxStrategy(base, compose.initial) : base)
  }
  const iqxStrategies = useIqxStrategies(!compose)
  const saveForBot = useMutation({ mutationFn: saveDraftForBot })

  const composeOnChange = compose?.onChange
  const composeKey = compose && draft ? JSON.stringify([draft, maxHolding]) : null
  useEffect(() => {
    if (!composeOnChange || !composeKey) return
    const [indicators, holding] = JSON.parse(composeKey) as [Indicators, string]
    const errors = strategyErrors(indicators, holding)
    const value = Number(holding)
    composeOnChange({ definition: maxHoldingError(holding) ? null : strategyDefinitionOf(indicators, value), errors })
  }, [composeOnChange, composeKey])

  // `?iqx=<id>` from a symbol of a Bộ lọc IQX: fill its paired Chiến lược IQX (asking first if the draft differs).
  const iqxParam = compose ? null : params.get("iqx")

  if (config.availability === "loading") return <Spinner label="Đang tải cấu hình chiến lược" />
  if (config.availability === "disabled") return <FeatureState {...FEATURE_DISABLED_COPY} />
  if (config.availability === "locked") {
    return <FeatureState title="Chưa có quyền dùng Backtest" description="Tài khoản chưa đủ điều kiện dùng Backtest (gói hoặc quyền học). Cấu hình và lịch sử của bạn không bị xóa." />
  }
  if (config.availability === "error" || !state || !savedConfig) {
    return <FeatureState title="Không tải được cấu hình chiến lược" description={config.errorMessage ?? "Vui lòng thử lại."} action={{ label: "Thử lại", onClick: config.retry }} />
  }

  const savedRevision = state.saved_revision
  const shown = draft ? withIndicators(savedConfig, draft) : savedConfig
  const changed = draft ? changedIndicators(savedConfig.indicators, draft) : {}
  const draftOpen = !!compose || (draft !== null && (Object.keys(changed).length > 0 || iqx !== null))
  const capital = Number(capitalText.replace(/[^\d]/g, ""))
  const buyReady = library.some((indicator) => isSideUsed(shown, indicator.id, "buy"))
  const rangeDays = daysBetween(start, end)
  const blocked =
    !buyReady
      ? "Chưa có điều kiện Mua đang dùng. Thêm chỉ báo vào Mua từ thư viện rồi lưu."
      : !symbol
        ? "Chọn mã cổ phiếu."
        : !start || !end || !(rangeDays > 0)
          ? "Đến ngày phải sau Từ ngày."
          : rangeDays > MAX_RANGE_DAYS
            ? "Khoảng backtest tối đa 10 năm."
            : !(capital >= MIN_CAPITAL && capital <= MAX_CAPITAL)
              ? `Vốn ban đầu từ ${fmtVnd(MIN_CAPITAL)} đến ${fmtVnd(MAX_CAPITAL)}.`
              : null

  const snapshot = viewed?.result?.snapshot
  const viewedIsThisDraft = !!viewed && ranDraft?.runId === viewed.run_id && ranDraft.rev === draftRev && ranDraft.draft === draftOpen
  const revisionMoved = !!snapshot && snapshot.shared_revision !== savedRevision && !(savedFromRun?.runId === viewed?.run_id && savedFromRun?.revision === savedRevision)
  const stale =
    !!snapshot &&
    (snapshot.symbol !== symbol || snapshot.requested_start !== start || snapshot.requested_end !== end || snapshot.capital !== capital || snapshot.execution !== execution || snapshot.fee_preset !== fee || revisionMoved || (!!ranDraft && ranDraft.runId === viewed?.run_id && !viewedIsThisDraft))
  const holdingError = draftOpen ? maxHoldingError(maxHolding) : null
  const botSaveBlocked = !viewed?.result || !viewedIsThisDraft ? (viewed?.result && ranDraft?.runId === viewed.run_id ? DRAFT_STALE : "Bấm Chạy trước khi Lưu cho Bot.") : stale ? DRAFT_STALE : Object.keys(changed).length === 0 ? "Bản nháp đang giống cấu hình đã lưu." : null

  function bumpDraft(next: Indicators) {
    setDraft(next)
    setDraftRev((value) => value + 1)
  }

  function startRun() {
    if (blocked || run.isPending) return
    const sendDraft = draftOpen && Object.keys(changed).length > 0
    const rev = draftRev
    const body: RunRequest = {
      idempotency_key: newKey(),
      shared_revision: savedRevision,
      symbol,
      start,
      end,
      assumptions: { capital, fee_preset: fee, execution },
      ...(sendDraft ? { draft: { indicators: changed } } : {}),
      ...(sendDraft && iqx && !compose ? { origin: { type: "iqx_strategy" as const, id: iqx.id, version: iqx.version } } : {}),
      ...(sendDraft && compose ? { trial: true } : {}),
    }
    run.mutate(body, {
      onSuccess: (response) => {
        if (response.status === "failed" || !response.result) return
        setViewed(response)
        setRanDraft({ runId: response.run_id, rev, draft: draftOpen })
      },
    })
  }

  /** "Dùng" (§3.3): replaces every card and Giữ tối đa of the draft; Cổ phiếu, dates and capital stay. */
  function applyIqx(item: IqxStrategyItem, lead?: string) {
    if (!savedConfig) return
    bumpDraft(applyIqxStrategy(draft ?? savedConfig.indicators, item.content.definition))
    setMaxHolding(String(item.content.definition.max_holding))
    setIqx(item)
    setConfirmIqx(null)
    setLibraryOpen(false)
    recordIqxUsed(item.id, item.version)
    toast.success(`${lead ? `${lead} ` : ""}Đã điền sẵn ${iqxTitle("strategy", item.content.name)} vào bản nháp. Bot chưa thay đổi.`)
  }

  function requestIqx(item: IqxStrategyItem, lead?: string) {
    if (draftOpen) setConfirmIqx({ item, lead })
    else applyIqx(item, lead)
  }
  function consumeIqxParam() {
    const item = iqxStrategies.data?.find((entry) => entry.id === iqxParam)
    if (item) requestIqx(item, `Mở Backtest ${symbol}.`)
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete("iqx")
      return next
    }, { replace: true })
  }

  function backToSaved() {
    setDraft(null)
    setIqx(null)
    setMaxHolding("")
    setDraftRev((value) => value + 1)
    setModal(null)
    toast.success(`Bản nháp đã về cấu hình Bot bản ${savedRevision}.`)
  }

  function confirmSaveForBot() {
    if (!viewed || botSaveBlocked) return
    setSaveError(null)
    saveKey.current ??= newKey()
    saveForBot.mutate(
      { expected_revision: savedRevision, idempotency_key: saveKey.current, indicators: changed, source: { backtest_run_id: viewed.run_id } },
      {
        onSuccess: (result) => {
          saveKey.current = null
          void queryClient.invalidateQueries({ queryKey: botKeys.sharedConfig(user?.id) })
          setSavedFromRun({ runId: viewed.run_id, revision: result.revision })
          setDraft(null)
          setIqx(null)
          setMaxHolding("")
          setRanDraft(null)
          setModal(null)
          const when = effectiveText(result.status, result.effective_session)
          toast.success(`Đã lưu cho Bot (bản ${result.revision}).${when ? ` ${when}.` : ""}`)
        },
        onError: (error) => {
          saveKey.current = null
          setSaveError(isApiError(error, 409) ? "Cấu hình Bot vừa được lưu ở nơi khác. Về cấu hình đã lưu hoặc chạy lại trên bản mới rồi lưu." : runErrorText(error))
        },
      },
    )
  }

  const effective = (() => {
    if (savedRevision === 0) return "Chưa lưu cấu hình nào"
    if (state.status === "calendar_unavailable") return "Chưa xác định phiên hiệu lực của Bot (thiếu lịch giao dịch)"
    const when = effectiveText(state.status, state.effective_session)
    if (state.status === "effective") return `Bot đang dùng bản ${state.effective_revision ?? savedRevision}`
    return `Bot đang dùng bản ${state.effective_revision ?? "—"}${when ? ` · bản ${savedRevision}: ${when.toLowerCase()}` : ""}`
  })()

  async function confirmRemove(indicator: TechnicalIndicator, side: Side) {
    if (draftOpen && draft) {
      const current = draft[indicator.id]
      if (current) bumpDraft({ ...draft, [indicator.id]: removeSide(current, side) })
      setModal(null)
      return
    }
    const saved: IndicatorConfig | undefined = savedConfig?.indicators[indicator.id]
    if (!saved) return
    setRemoveError(null)
    const nextSide = { ...saved[side], enabled: false }
    const other = side === "buy" ? saved.sell : saved.buy
    const next: IndicatorConfig = { ...saved, [side]: nextSide, master_enabled: other.enabled ? saved.master_enabled : false }
    const outcome = await config.save(indicator.id, next)
    if (outcome.ok) {
      const when = effectiveText(outcome.result.status, outcome.result.effective_session)
      toast.success(`Đã bỏ ${indicator.name} khỏi ${side === "buy" ? "Mua" : "Bán"} (bản ${outcome.result.revision}). Bot cũng bỏ điều kiện này${when ? `: ${when}` : " từ phiên hiệu lực"}. Tham số được giữ.`)
      setModal(null)
      return
    }
    setRemoveError(outcome.message)
  }

  const used = (side: Side) => library.filter((indicator) => isSideUsed(savedConfig, indicator.id, side))
  const askRemove = (indicator: TechnicalIndicator, side: Side) => {
    setRemoveError(null)
    if (draftOpen) void confirmRemove(indicator, side)
    else setModal({ kind: "remove", indicator, side })
  }
  const draftController = draftOpen ? { ...config, state: { ...state, config: shown } } : config
  const onDraftSave = draftOpen
    ? (indicatorId: string, next: IndicatorConfig) => bumpDraft({ ...(draft ?? savedConfig.indicators), [indicatorId]: next })
    : undefined

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {iqxParam && iqxStrategies.data && <OnMount key={iqxParam} run={consumeIqxParam} />}
      <IndicatorLibrary
        indicators={library}
        config={shown}
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onOpen={(indicator, side) => setModal({ kind: "config", indicator, side, adding: !isSideUsed(shown, indicator.id, side) })}
        iqx={compose ? undefined : <IqxStrategyLibrary indicators={library} activeId={iqx?.id ?? null} onUse={(item) => requestIqx(item)} />}
      />

      <ScrollArea className="min-h-0 min-w-0 flex-1" viewportClassName="[&>div]:!block">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            {compose ? (
              <p className="min-w-0 text-xs text-muted-foreground" data-testid="compose-note">
                Soạn Chiến lược IQX: bắt đầu từ mặc định của các chỉ báo, không dùng và không ghi cấu hình Bot của bạn. Chạy thử không được lưu.
              </p>
            ) : (
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Link2 aria-hidden="true" className="size-4 shrink-0" />
                <span>Cấu hình chung</span>
                <Button type="button" variant="secondary" size="xs" onClick={() => setModal({ kind: "context" })} aria-label={`Cấu hình chung bản ${savedRevision}: xem trạng thái`}>
                  {savedRevision === 0 ? "Chưa lưu" : `Bản ${savedRevision}`}
                </Button>
                <span data-testid="config-effective">{effective}</span>
                {draftOpen && (
                  <span className="rounded-sm border border-price-ref/50 px-1.5 py-0.5 font-semibold text-price-ref" data-testid="draft-badge">
                    Bản nháp · chưa lưu cho Bot
                  </span>
                )}
              </div>
            )}
            <Button type="button" variant="outline" className="lg:hidden" onClick={() => setLibraryOpen(true)}>
              <SlidersHorizontal aria-hidden="true" />
              Chỉ báo
            </Button>
            {!compose && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {draftOpen && (
                  <Button type="button" variant="outline" onClick={() => setModal({ kind: "back" })}><RotateCcw aria-hidden="true" />Về cấu hình đã lưu</Button>
                )}
                <Button type="button" variant="outline" onClick={() => setModal({ kind: "runs" })}><FolderOpen aria-hidden="true" />Đã lưu</Button>
                <Button type="button" variant="outline" disabled={!viewed?.result} onClick={() => setModal({ kind: "alert" })}><Bell aria-hidden="true" />Tạo cảnh báo</Button>
              </div>
            )}
          </div>

          {iqx && draftOpen && !compose && (
            <IqxStrip
              key={iqx.id}
              testId="iqx-strategy-strip"
              lead={<>Bản nháp bắt đầu từ <b>{iqxTitle("strategy", iqx.content.name)}</b>. {iqx.content.idea} <b>Bot chưa thay đổi.</b></>}
              origin={iqx.content.origin}
              whenWrong={iqx.content.when_wrong}
            />
          )}

          <section className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1.2fr]" aria-label="Thông tin kiểm thử">
            <div className="min-w-0 space-y-1.5">
              <span className={FIELD_LABEL} id="bt-symbol-label">Cổ phiếu</span>
              <SymbolPicker symbol={symbol} onSymbolChange={setSymbol} className="w-full" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bt-start" className={FIELD_LABEL}>Từ ngày</Label>
              <DatePicker id="bt-start" clearable={false} value={start} max={end || undefined} onChange={setStart} aria-label="Từ ngày" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bt-end" className={FIELD_LABEL}>Đến ngày</Label>
              <DatePicker id="bt-end" clearable={false} value={end} min={start || undefined} onChange={setEnd} aria-label="Đến ngày" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bt-capital" className={FIELD_LABEL}>Vốn ban đầu (VND)</Label>
              <Input
                id="bt-capital"
                inputMode="numeric"
                value={capitalText}
                className="font-mono tabular-nums"
                onChange={(event) => {
                  const digits = event.target.value.replace(/[^\d]/g, "")
                  setCapitalText(digits === "" ? "" : Number(digits).toLocaleString("vi-VN"))
                }}
              />
            </div>
          </section>

          <SymbolStrip symbol={symbol} />

          <div className="grid gap-4 lg:grid-cols-2">
            <SidePanel side="buy" indicators={library} config={shown} onEdit={(indicator) => setModal({ kind: "config", indicator, side: "buy", adding: false })} onRemove={(indicator) => askRemove(indicator, "buy")} />
            <SidePanel side="sell" indicators={library} config={shown} onEdit={(indicator) => setModal({ kind: "config", indicator, side: "sell", adding: false })} onRemove={(indicator) => askRemove(indicator, "sell")} />
          </div>

          {draftOpen && (
            <section className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4" aria-label="Giữ tối đa">
              <div className="space-y-1.5">
                <Label htmlFor="bt-hold" className={FIELD_LABEL}>Giữ tối đa (phiên)</Label>
                <Input
                  id="bt-hold"
                  inputMode="numeric"
                  value={maxHolding}
                  className="w-28 font-mono tabular-nums"
                  aria-invalid={!!holdingError}
                  onChange={(event) => { setMaxHolding(event.target.value.replace(/[^\d]/g, "")); setDraftRev((value) => value + 1) }}
                />
              </div>
              <p className="min-w-0 flex-1 text-[11px] leading-4 text-muted-foreground" data-testid="hold-note">
                {holdingError ?? "Ghi theo chiến lược. Chưa áp dụng khi chạy: Backtest và Bot hiện chưa giới hạn thời gian giữ."}
              </p>
            </section>
          )}

          <section className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_auto] md:items-end" aria-label="Giả định backtest">
            <div className="min-w-0 space-y-3">
              <h2 className={FIELD_LABEL}>Giả định backtest</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bt-execution" className={FIELD_LABEL}>Khớp lệnh</Label>
                  <NativeSelect id="bt-execution" value={execution} onChange={(event) => setExecution(event.target.value as Execution)}>
                    <option value="same_close">Đóng cửa cùng phiên</option>
                    <option value="next_open">Mở cửa phiên kế tiếp</option>
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bt-fee" className={FIELD_LABEL}>Phí giao dịch</Label>
                  <NativeSelect id="bt-fee" value={fee} onChange={(event) => setFee(event.target.value as FeePreset)}>
                    <option value="standard">Phí chuẩn của hồ sơ mô phỏng</option>
                    <option value="none">Không tính phí</option>
                  </NativeSelect>
                </div>
              </div>
              <p className="text-[11px] leading-4 text-muted-foreground" data-testid="execution-caveat">
                {EXECUTION_COPY[execution]} Một mã, một vị thế, mua tối đa tiền khả dụng; không stop, chốt lời hay giới hạn thời gian giữ.
              </p>
            </div>
            <div className="flex flex-col gap-2 md:w-52">
              <Button type="button" size="lg" disabled={!!blocked || run.isPending} onClick={startRun}>
                {run.isPending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Play aria-hidden="true" />}
                {run.isPending ? "Đang chạy…" : "Chạy backtest"}
              </Button>
              <span className="text-[11px] leading-4 text-muted-foreground" data-testid="run-hint">
                {blocked ??
                  (compose
                    ? "Chạy thử bản đang soạn. Không lưu kết quả, không ghi cấu hình."
                    : draftOpen
                      ? `Chạy trên bản nháp${iqx ? ` (từ ${iqxTitle("strategy", iqx.content.name)})` : ""}. Bot chưa thay đổi.`
                      : `Chạy trên cấu hình chung đã lưu bản ${savedRevision}. Không ghi cấu hình.`)}
              </span>
              {draftOpen && !compose && (
                <>
                  <Button type="button" variant="outline" disabled={!!botSaveBlocked} onClick={() => { setSaveError(null); setModal({ kind: "save-bot" }) }}>
                    <Bot aria-hidden="true" />
                    Lưu cho Bot
                  </Button>
                  {botSaveBlocked && <span className="text-[11px] leading-4 text-muted-foreground" data-testid="bot-save-hint">{botSaveBlocked}</span>}
                </>
              )}
            </div>
          </section>

          {run.isError && <p role="alert" className="text-xs leading-5 whitespace-pre-line text-destructive">{runErrorText(run.error)}</p>}
          {run.data && (run.data.status === "failed" || !run.data.result) && (
            <p role="alert" className="text-xs leading-5 text-destructive">{run.data.error?.message ?? "Lần chạy không thành công."}</p>
          )}

          {viewed && <BacktestResults run={viewed} indicators={library} stale={stale} />}
          {viewed?.result && <p className="text-[11px] text-muted-foreground">Kết quả quá khứ không bảo đảm kết quả tương lai.</p>}
        </div>
      </ScrollArea>

      {modal?.kind === "config" && (
        <ConfigDialog indicator={modal.indicator} controller={draftController} initialSide={modal.side} adding={modal.adding} onDraftSave={onDraftSave} onClose={() => setModal(null)} />
      )}
      {modal?.kind === "remove" && (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setModal(null) }}
          title={`Bỏ ${modal.indicator.name} khỏi ${modal.side === "buy" ? "Mua" : "Bán"}?`}
          description={
            <>
              Thao tác này được lưu vào cấu hình chung: Bot cũng không dùng {modal.indicator.name} cho phía {modal.side === "buy" ? "Mua" : "Bán"} từ phiên hiệu lực kế tiếp. Tham số và phía còn lại được giữ nguyên.
            </>
          }
          confirmLabel="Bỏ và lưu"
          pending={config.saving}
          error={removeError}
          onConfirm={() => void confirmRemove(modal.indicator, modal.side)}
        />
      )}
      {confirmIqx && (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setConfirmIqx(null) }}
          title="Thay bản nháp đang chỉnh?"
          description={<>Điều kiện Mua, Bán và Giữ tối đa của bản nháp sẽ được thay bằng <b>{iqxTitle("strategy", confirmIqx.item.content.name)}</b>. Cấu hình Bot đang dùng không đổi.</>}
          confirmLabel="Thay bằng chiến lược IQX"
          onConfirm={() => applyIqx(confirmIqx.item, confirmIqx.lead)}
        />
      )}
      {modal?.kind === "back" && (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setModal(null) }}
          title="Về cấu hình đã lưu?"
          description={`Bản nháp sẽ được thay bằng cấu hình Bot bản ${savedRevision}.`}
          confirmLabel="Về cấu hình đã lưu"
          onConfirm={backToSaved}
        />
      )}
      {modal?.kind === "save-bot" && viewed?.result && (
        <DialogShell
          title="Lưu cho Bot"
          size="md"
          busy={saveForBot.isPending}
          onClose={() => setModal(null)}
          footer={
            <>
              <Button type="button" variant="outline" disabled={saveForBot.isPending} onClick={() => setModal(null)}>Hủy</Button>
              <Button type="button" disabled={saveForBot.isPending || !!botSaveBlocked} onClick={confirmSaveForBot}>{saveForBot.isPending ? "Đang lưu…" : "Lưu cho Bot"}</Button>
            </>
          }
        >
          <dl className="space-y-1 rounded-md border border-border bg-muted/40 p-3 text-xs leading-5" data-testid="save-bot-summary">
            <div><dt className="inline font-semibold">Cấu hình: </dt><dd className="inline">Lần chạy lúc {new Date(viewed.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}{iqx ? ` · từ ${iqxTitle("strategy", iqx.content.name)}` : ""}</dd></div>
            <div><dt className="inline font-semibold">Chỉ báo bật: </dt><dd className="inline">Mua {activeConditions(shown, "buy", library).map((item) => item.name).join(", ") || "—"} · Bán {activeConditions(shown, "sell", library).map((item) => item.name).join(", ") || "—"}</dd></div>
            {maxHolding && <div><dt className="inline font-semibold">Giữ tối đa: </dt><dd className="inline">{maxHolding} phiên (Bot chưa áp dụng)</dd></div>}
          </dl>
          <p className="text-xs leading-5 text-muted-foreground">Cấu hình này sẽ thay cấu hình Bot từ phiên giao dịch hợp lệ kế tiếp. Không tạo lệnh ngay.</p>
          {saveError && <ErrorLine>{saveError}</ErrorLine>}
        </DialogShell>
      )}
      {modal?.kind === "runs" && (
        <RunsDialog
          onOpen={(opened) => {
            setViewed(opened)
            const opts = opened.result?.snapshot
            if (opts) {
              setSymbol(opts.symbol)
              setStart(opts.requested_start)
              setEnd(opts.requested_end)
              setCapitalText(opts.capital.toLocaleString("vi-VN"))
              setExecution(opts.execution)
              setFee(opts.fee_preset)
            }
            setModal(null)
            toast.success("Đã mở kết quả đã lưu; cấu hình chung của Bot và Backtest không đổi.")
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "alert" && viewed?.result && (
        <AlertForm
          initialRunId={viewed.run_id}
          initialSymbols={[viewed.result.snapshot.symbol]}
          onClose={() => setModal(null)}
          onSaved={(alert) => {
            setModal(null)
            toast.success(`Đã tạo cảnh báo “${alert.name}” từ kết quả này. Xem ở tab Cảnh báo.`)
          }}
        />
      )}
      {modal?.kind === "context" && (
        <DialogShell
          title="Cấu hình chung của Bot và Backtest"
          description="Một cấu hình đã lưu dùng chung. Lưu ở Backtest hay ở Bot đều đổi cùng một bản."
          size="md"
          onClose={() => setModal(null)}
          footer={
            <>
              <Button asChild variant="outline"><Link to="/demo-trading?view=bot">Xem Bot</Link></Button>
              <Button type="button" onClick={() => setModal(null)}>Đóng</Button>
            </>
          }
        >
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            <div className="rounded-md border border-border bg-muted/40 p-3"><dt className="font-semibold">Đã lưu</dt><dd className="mt-1">{savedRevision === 0 ? "Chưa lưu cấu hình nào" : `Bản ${savedRevision}`}</dd></div>
            <div className="rounded-md border border-border bg-muted/40 p-3"><dt className="font-semibold">Bot</dt><dd className="mt-1">{effective}</dd></div>
          </dl>
          {(["buy", "sell"] as const).map((side) => (
            <div key={side} className="rounded-md border border-border p-3 text-xs">
              <div className={`font-semibold ${side === "buy" ? "text-price-up" : "text-price-down"}`}>{side === "buy" ? "MUA" : "BÁN"} · AND</div>
              <div className="mt-1 text-muted-foreground">
                {used(side).length > 0 ? activeConditions(savedConfig, side, library).map((item) => item.name).join(" + ") : "Chưa có điều kiện đang dùng"}
              </div>
            </div>
          ))}
          <p className="text-[11px] leading-4 text-muted-foreground">
            Bản mới chỉ được Bot dùng từ phiên giao dịch hợp lệ đầu tiên có ngày sau ngày lưu. Cấu hình hiệu lực của Bot, tiền và vị thế không đổi khi bạn chạy backtest.{" "}
            {state.effective_session ? `Phiên hiệu lực gần nhất: ${fmtDate(state.effective_session)}.` : ""}
          </p>
          {removeError && <ErrorLine>{removeError}</ErrorLine>}
        </DialogShell>
      )}
    </div>
  )
}
