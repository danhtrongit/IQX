/**
 * Tab "Backtest" (spec Bot và Chiến lược v2.0 §4): a strategy = Rổ mã + Điều kiện Mua + Điều kiện Bán + Giữ tối
 * đa, simulated on the whole basket by the Bot's own rules (close fill, T+2, 12% NAV, 2 buys, 30% cap, fixed
 * 100.000.000 đ).
 *
 * - Tab IQX (§4.2): view and trial-run a Chiến lược IQX; nothing editable, nothing saved but the run.
 * - Tab Chỉ báo (§4.3): the bản nháp of a Chiến lược của tôi (or a new one); Lưu ▾ only after a successful run
 *   of exactly that draft (§4.4). The Bot changes only through Lưu/Dùng (from its next session).
 * - Both tabs keep their own state and result; Từ ngày / Đến ngày are shared. Every successful run is stored.
 * - Compose mode (Quản trị › Mẫu IQX §7.2): the same tab Chỉ báo form with Rổ VN30/VN100 and Giữ tối đa,
 *   without Lưu ▾, the strategy list or Lần chạy đã lưu; Chạy is a trial.
 *
 * Deep links (consumed once, see `backtestLink` in ../shared/bot-schedule): `?mode=iqx&iqx=<id>[&v=<n>]`,
 * `?mode=chi-bao&strategy=<id>`, `?mode=chi-bao&strategy=new` (or `new=1`);
 * router state `{ backtestBasket: { name, symbols } }` from "Backtest với rổ là kết quả này" (§13).
 */
import { useContext, useEffect, useEffectEvent, useMemo, useState } from "react"
import { UNSAFE_DataRouterContext, useBlocker, useLocation, useSearchParams } from "react-router"
import { FolderOpen, History, LoaderCircle, Lock, Play, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { IndicatorConfig, Side, TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"

import { ConfirmDialog } from "../confirm-dialog"
import { ErrorLine, FeatureState, Spinner } from "../shared/controls"
import { errorDetails, errorMessage, isApiError, newKey } from "../shared/errors"
import { fmtDate } from "../shared/format"
import { IQX_DISCLAIMER, iqxTitle, useIqxStrategies, type IqxStrategyContent, type StrategyComposeBinding } from "../shared/iqx"
import { IqxBadge, IqxStrip } from "../shared/iqx-ui"
import { FEATURE_DISABLED_COPY } from "../shared/ui-text"
import {
  fetchIqxVersion,
  fetchVersion,
  fetchVersions,
  restoreVersion,
  STRATEGY_LIMIT,
  type RunListItem,
  type RunRequest,
  type RunView,
  type StoreMeta,
  type StrategyContent,
  type StrategyItem,
  type Universe,
} from "./api"
import { hasStrategy, sessionLabel, useBotSchedule, type ScheduleImpact as DueImpact } from "../shared/bot-schedule"
import { dueImpactOf } from "./schedule"
import { BotRunningText, BotTags } from "./bot-tags"
import { SidePanel } from "./conditions"
import { ConfigDialog } from "./config-dialog"
import {
  composeErrors,
  contentFromDefinition,
  contentOf,
  draftFromContent,
  emptyDraft,
  hasSide,
  maxHoldingError,
  removeSide,
  sameContent,
  stampLabel,
  versionLabel,
  type Draft,
} from "./draft"
import { useDeleteStrategy, useRefreshAfterSave, useRegistry, useRunBacktest, useStoreMeta, useStrategies, useUniverseOptions } from "./hooks"
import { IqxStrategyLibrary } from "./iqx-library"
import { IndicatorLibrary, ModeSwitch, type Mode } from "./library"
import { BacktestResults } from "./results"
import { RunsDialog, type OpenStrategyRef } from "./runs-dialog"
import { IN_USE_TEXT, saveErrorText } from "./save-errors"
import { ApplyDialog, SaveControls, type UserOrigin } from "./save-flow"
import { StrategyMenu } from "./strategy-menu"
import { CAPITAL, DRAFT_LINE, IQX_FOOTER, LABEL, MAX_RANGE_DAYS, RULES_LINE, SUB_TEXT } from "./ui"
import { symbolsOf, symbolsUniverse } from "./universe"
import { UniverseLine, UniverseSelect } from "./universe-field"
import { IqxVersionsDialog, UserVersionsDialog } from "./versions-dialog"

type IqxSel = { id: string; version: number; content: IqxStrategyContent; hidden: boolean }
type Result = { run: RunView; label: string; content: StrategyContent }

type Modal =
  | { kind: "config"; indicator: TechnicalIndicator; side: Side; adding: boolean }
  | { kind: "runs" | "history" }
  | { kind: "replace"; name: string; go: () => void }
  | { kind: "delete"; item: StrategyItem }
  | { kind: "restore"; version: number; latest: number; impact: DueImpact | null }
  | null

export type BacktestBasketState = { backtestBasket?: { name: string; symbols: string[] } }

const NOT_RAN_HINT = "Bản nháp đã sửa sau lần chạy (hoặc chưa chạy). Bấm Chạy trước khi Lưu."

function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number]
  return `${String(y + years).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

const daysBetween = (start: string, end: string) => (Date.parse(end) - Date.parse(start)) / 86_400_000

/** §2.3: earliest = store session #451, latest = data_as_of, end after start, at most 3653 days. */
function rangeError(start: string, end: string, meta: StoreMeta | undefined): string | null {
  if (!start || !end || !(daysBetween(start, end) > 0)) return "Đến ngày phải sau Từ ngày."
  if (daysBetween(start, end) > MAX_RANGE_DAYS) return "Khoảng backtest tối đa 10 năm."
  if (meta?.earliest_start && start < meta.earliest_start) return `Từ ngày sớm nhất là ${fmtDate(meta.earliest_start)} (450 phiên đầu của kho dùng khởi động chỉ báo).`
  if (meta?.data_as_of && end > meta.data_as_of) return `Đến ngày muộn nhất là ${fmtDate(meta.data_as_of)} (phiên cuối có trong kho).`
  return null
}

function runErrorText(error: unknown): string {
  if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "Backtest chạy quá lâu nên đã dừng. Thu hẹp khoảng thời gian hoặc rổ mã rồi chạy lại; kết quả cũ không bị thay."
  }
  if (isApiError(error, 422, "UNIVERSE_EMPTY")) return "Danh mục này không có mã nào thuộc VN100."
  if (isApiError(error, 409, "IQX_TEMPLATE_HIDDEN")) return "Chiến lược IQX này đã ngừng cung cấp."
  if (isApiError(error, 422) || isApiError(error, 400)) {
    const lines = errorDetails(error).flatMap((item) => (typeof item.message === "string" ? [item.message] : []))
    return lines.length > 0 ? `${errorMessage(error)}\n${lines.join("\n")}` : errorMessage(error)
  }
  return errorMessage(error)
}

/** Runs `run` once when mounted (deep links are handled once their data is loaded). */
function OnMount({ run }: { run: () => void }) {
  const fire = useEffectEvent(run)
  useEffect(() => fire(), [])
  return null
}

/** Asks before leaving the page while the draft differs from what is saved (§4.3). Data routers only. */
function LeaveGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!when) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [when])
  if (blocker.state !== "blocked") return null
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => { if (!open) blocker.reset() }}
      title="Bỏ bản nháp?"
      description="Bản nháp của tab Chỉ báo khác bản đã lưu. Rời trang thì bản nháp mất."
      confirmLabel="Bỏ bản nháp và rời trang"
      onConfirm={() => blocker.proceed()}
    />
  )
}

export function BacktestTab({ compose }: { compose?: StrategyComposeBinding } = {}) {
  const registry = useRegistry()
  const meta = useStoreMeta()
  const options = useUniverseOptions()
  const schedule = useBotSchedule()
  const strategies = useStrategies(!compose)
  const iqxList = useIqxStrategies(!compose)
  const runIqx = useRunBacktest("iqx")
  const runInd = useRunBacktest("indicators")
  const remove = useDeleteStrategy()
  const refresh = useRefreshAfterSave()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const dataRouter = useContext(UNSAFE_DataRouterContext)

  const [mode, setMode] = useState<Mode>(() => (!compose && params.get("mode") === "iqx" ? "iqx" : "indicators"))
  const [range, setRange] = useState<{ start: string; end: string } | null>(null)
  const [iqx, setIqx] = useState<IqxSel | null>(null)
  const [iqxResult, setIqxResult] = useState<Result | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [excluded, setExcluded] = useState<string[]>([])
  const [origin, setOrigin] = useState<UserOrigin | null>(null)
  const [indResult, setIndResult] = useState<Result | null>(null)
  /** The content a fresh run was sent with (a run opened from the list uses its snapshot). */
  const [ranContent, setRanContent] = useState<{ runId: string; content: StrategyContent } | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [handledState, setHandledState] = useState<string | null>(null)

  const indicators = registry.indicators
  const library = useMemo(() => indicators.filter((indicator) => compose || indicator.learned), [indicators, compose])

  // The form starts once the registry is in: compose from the item, else a new strategy (rổ VN30, giữ 30).
  if (draft === null && registry.availability === "ready") {
    setDraft(compose?.initial ? draftFromContent(indicators, contentFromDefinition(compose.initial)) : emptyDraft(indicators))
  }
  if (range === null && meta.data?.data_as_of) {
    const end = meta.data.default_end ?? meta.data.data_as_of
    const earliest = meta.data.earliest_start
    const start = meta.data.default_start ?? addYears(end, -2)
    setRange({ start: earliest && start < earliest ? earliest : start, end })
  }
  // Default IQX selection: the first shown item.
  const firstIqx = iqxList.data?.[0]
  if (!compose && iqx === null && firstIqx && !params.get("iqx")) {
    setIqx({ id: firstIqx.id, version: firstIqx.current_version ?? firstIqx.version, content: firstIqx.content, hidden: false })
  }

  const holdingError = draft ? maxHoldingError(draft.holdingText) : null
  const draftContent = draft && !holdingError ? contentOf(draft, { sellOnly: !!origin?.content.sell_only && !hasSide(draft.indicators, "buy") }) : null
  const changed = origin ? !sameContent(origin.content, draftContent) : true
  const dirty = !compose && !!draft && (origin ? changed : hasSide(draft.indicators, "buy") || hasSide(draft.indicators, "sell"))

  const composeOnChange = compose?.onChange
  const composeKey = compose && draft ? JSON.stringify(draft) : null
  useEffect(() => {
    if (!composeOnChange || !composeKey) return
    const current = JSON.parse(composeKey) as Draft
    const errors = composeErrors(current)
    const content = maxHoldingError(current.holdingText) ? null : contentOf(current)
    composeOnChange({
      definition: content ? { universe: content.universe.type === "saved_list" ? { type: "vn30" } : content.universe, max_holding: content.max_holding, indicators: content.indicators } : null,
      errors,
    })
  }, [composeOnChange, composeKey])

  if (registry.availability === "disabled") return <FeatureState {...FEATURE_DISABLED_COPY} />
  if (registry.availability === "locked") {
    return <FeatureState title="Chưa có quyền dùng Backtest" description="Tài khoản chưa đủ điều kiện dùng Backtest (gói hoặc quyền học). Chiến lược và lịch sử của bạn không bị xóa." />
  }
  if (registry.availability === "error") {
    return <FeatureState title="Không tải được thư viện chỉ báo" description={errorMessage(registry.query.error)} action={{ label: "Thử lại", onClick: () => void registry.query.refetch() }} />
  }
  if (meta.isError) {
    return <FeatureState title="Không tải được kho dữ liệu giá" description={errorMessage(meta.error)} action={{ label: "Thử lại", onClick: () => void meta.refetch() }} />
  }
  if (!draft || !range) return <Spinner label="Đang tải Backtest" />

  const { start, end } = range
  const storeMeta = meta.data
  const botSchedule = compose ? undefined : schedule.data
  const iqxItems = iqxList.data ?? []

  /* ── Shared helpers ── */

  function confirmReplace(name: string, go: () => void) {
    if (dirty) setModal({ kind: "replace", name, go })
    else go()
  }

  function loadDraft(next: Draft, nextOrigin: UserOrigin | null, nextExcluded: string[] = []) {
    setDraft(next)
    setOrigin(nextOrigin)
    setExcluded(nextExcluded)
    setIndResult(null)
    setRanContent(null)
    setMode("indicators")
    setModal(null)
  }

  async function openUserStrategy(id: string, name: string, version?: number) {
    setBusy(true)
    try {
      const list = await fetchVersions(id)
      const latest = Math.max(...list.items.map((item) => item.version))
      const detail = await fetchVersion(id, version ?? latest)
      loadDraft(draftFromContent(indicators, detail.content), { id, name, version: detail.version, latest, content: detail.content, created_at: detail.created_at })
      toast.success(`Đã mở ${name} · ${versionLabel(detail.created_at)}`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function selectIqx(id: string, version?: number | null) {
    const item = iqxItems.find((entry) => entry.id === id)
    setMode("iqx")
    if (item && (version == null || version === (item.current_version ?? item.version))) {
      if (iqx?.id !== id || iqx.version !== (item.current_version ?? item.version)) setIqxResult(null)
      setIqx({ id, version: item.current_version ?? item.version, content: item.content, hidden: false })
      setLibraryOpen(false)
      return
    }
    // Hidden (or an older pinned version) the Bot runs: readable through its version (§4.2 last line).
    const pinned = [botSchedule?.last, botSchedule?.next].filter(hasStrategy).find((entry) => entry.source === "iqx" && entry.id === id)
    const wanted = version ?? pinned?.version ?? null
    if (wanted == null) {
      toast.error("Không tìm thấy chiến lược IQX này.")
      return
    }
    try {
      const detail = await fetchIqxVersion(id, wanted)
      setIqxResult(null)
      // `strategy_content` is the definition as the rules run it (v1 rows without a basket read as VN30).
      setIqx({ id, version: detail.version, content: { ...(detail.content as unknown as IqxStrategyContent), definition: detail.strategy_content }, hidden: detail.hidden || !item })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  function consumeParams() {
    const iqxId = params.get("iqx")
    const strategyParam = params.get("strategy")
    const isNew = strategyParam === "new" || params.get("new") === "1"
    const strategyId = isNew ? null : strategyParam
    const version = Number(params.get("v")) || null
    if (iqxId) void selectIqx(iqxId, version)
    else if (strategyId) {
      const item = strategies.data?.items.find((entry) => entry.id === strategyId)
      confirmReplace(item?.name ?? "chiến lược đã lưu", () => void openUserStrategy(strategyId, item?.name ?? "Chiến lược", version ?? undefined))
    } else if (isNew) confirmReplace("chiến lược mới", () => loadDraft(emptyDraft(indicators), null))
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      for (const key of ["mode", "iqx", "strategy", "new", "v"]) next.delete(key)
      return next
    }, { replace: true })
  }

  const basket = (location.state as BacktestBasketState | null)?.backtestBasket
  function consumeBasket() {
    setHandledState(location.key)
    if (!basket) return
    const vn100 = options.data?.vn100.symbols ?? []
    const next = symbolsUniverse(basket.name, basket.symbols, vn100)
    confirmReplace("chiến lược mới", () => {
      loadDraft(emptyDraft(indicators, next.universe), null, next.excluded)
      toast.success(`Đã mở chiến lược mới với rổ ${basket.name}. Bấm Chạy để xem kết quả.`)
    })
  }

  const wantsParams = !compose && (params.has("iqx") || params.has("strategy") || params.get("new") === "1")
  const paramsReady = wantsParams && (params.has("iqx") ? !iqxList.isPending && !schedule.isPending : params.has("strategy") ? !strategies.isPending : true)
  const basketReady = !compose && !!basket && handledState !== location.key && !!options.data

  /* ── Runs ── */

  const indRangeError = rangeError(start, end, storeMeta)
  const indSymbols = symbolsOf(draft.universe, options.data)
  const universeEmpty = !!options.data && indSymbols.length === 0
  const indBlocked =
    holdingError ??
    (!hasSide(draft.indicators, "buy") && !draftContent?.sell_only
      ? "Cần ít nhất một dòng Mua đang bật để chạy."
      : universeEmpty
        ? "Danh mục này không có mã nào thuộc VN100."
        : indRangeError)

  function startIndicatorRun() {
    if (indBlocked || !draftContent || runInd.isPending) return
    const sent = draftContent
    const asSaved = !!origin && !changed
    const body: RunRequest = {
      idempotency_key: newKey(),
      strategy: asSaved && origin ? { source: "user", id: origin.id, version: origin.version } : { source: "draft", content: sent, base: origin ? { id: origin.id, version: origin.version } : null },
      start,
      end,
      // Quản trị › Mẫu IQX "Chạy để thử" (§7.2): answered like any run, not stored.
      ...(compose ? { trial: true } : {}),
    }
    const label = compose ? "Bản nháp (chạy thử)" : asSaved && origin ? `${origin.name} · ${versionLabel(origin.created_at)}` : origin ? `Bản nháp · sửa từ ${origin.name}` : "Bản nháp"
    runInd.mutate(body, {
      onSuccess: (run) => {
        if (run.status === "failed") return
        setIndResult({ run, label, content: sent })
        setRanContent({ runId: run.run_id, content: sent })
      },
    })
  }

  const iqxContent = iqx ? contentFromDefinition(iqx.content.definition) : null
  const iqxBlocked = !iqx ? "Chọn một chiến lược IQX ở cột bên trái." : rangeError(start, end, storeMeta)
  function startIqxRun() {
    if (!iqx || !iqxContent || iqxBlocked || runIqx.isPending) return
    const label = `${iqxTitle("strategy", iqx.content.name)} v${iqx.version}`
    runIqx.mutate(
      { idempotency_key: newKey(), strategy: { source: "iqx", id: iqx.id, version: iqx.version }, start, end },
      { onSuccess: (run) => { if (run.status !== "failed") setIqxResult({ run, label, content: iqxContent }) } },
    )
  }

  const ran = indResult && ranContent && indResult.run.run_id === ranContent.runId && sameContent(ranContent.content, draftContent) ? { runId: ranContent.runId } : null
  const indStale = !!indResult && (!sameContent(indResult.content, draftContent) || indResult.run.snapshot.start !== start || indResult.run.snapshot.end !== end)
  const iqxStale = !!iqxResult && (!!iqx && (iqxResult.run.snapshot.strategy_ref.id !== iqx.id || iqxResult.run.snapshot.strategy_ref.version !== iqx.version || iqxResult.run.snapshot.start !== start || iqxResult.run.snapshot.end !== end))

  /* ── Draft edits ── */

  const setIndicators = (next: Record<string, IndicatorConfig>) => setDraft({ ...draft, indicators: next })
  function askRemove(indicator: TechnicalIndicator, side: Side) {
    const current = draft?.indicators[indicator.id]
    if (current) setIndicators({ ...draft.indicators, [indicator.id]: removeSide(current, side) })
  }
  function setUniverse(next: { universe: Universe; excluded: string[] }) {
    setDraft({ ...draft!, universe: next.universe })
    setExcluded(next.excluded)
  }

  /* ── Delete / restore ── */

  async function confirmDelete(item: StrategyItem) {
    setModalError(null)
    try {
      await remove.mutateAsync(item.id)
      const wasOpen = origin?.id === item.id
      if (wasOpen) setOrigin(null)
      setModal(null)
      toast.success(wasOpen ? `Đã xóa "${item.name}". Nội dung đang mở được giữ ở dạng bản nháp chưa lưu.` : `Đã xóa "${item.name}".`)
    } catch (error) {
      setModalError(isApiError(error, 409, "STRATEGY_IN_USE") ? IN_USE_TEXT : errorMessage(error))
    }
  }

  const isBotNext = !!origin && botSchedule?.next.source === "user" && botSchedule.next.id === origin.id

  async function doRestore(version: number, latest: number, apply: boolean, confirm?: string[]) {
    if (!origin) return
    setBusy(true)
    setModalError(null)
    try {
      const nextSession = botSchedule?.next.session_date
      const result = await restoreVersion(origin.id, version, {
        expected_latest_version: latest,
        ...(apply ? { apply_next: true, ...(nextSession ? { expected_next_session: nextSession } : {}), ...(confirm ? { confirm_due_positions: confirm } : {}) } : {}),
      })
      const created = result.version.version
      const detail = await fetchVersion(origin.id, created)
      refresh(origin.id)
      loadDraft(draftFromContent(indicators, detail.content), { ...origin, version: created, latest: created, content: detail.content, created_at: detail.created_at })
      toast.success(apply && nextSession ? `Đã lưu bản ${stampLabel(detail.created_at)}. Bot dùng bản này từ phiên ${sessionLabel(nextSession)}.` : `Đã lưu bản ${stampLabel(detail.created_at)}.`)
    } catch (error) {
      const due = dueImpactOf(error)
      if (due) setModal({ kind: "restore", version, latest, impact: { ...due, next_session: due.next_session || botSchedule?.next.session_date || "" } })
      else setModalError(saveErrorText(error, botSchedule))
    } finally {
      setBusy(false)
    }
  }

  function requestRestore(version: number, latest: number) {
    if (isBotNext) setModal({ kind: "restore", version, latest, impact: null })
    else void doRestore(version, latest, false)
  }

  function openFromRun(item: RunListItem) {
    setModal(null)
    if (item.strategy_source === "iqx" && item.strategy_id) void selectIqx(item.strategy_id)
    else if (item.strategy_source === "user" && item.strategy_id) {
      const id = item.strategy_id
      confirmReplace(item.strategy_label, () => void openUserStrategy(id, item.strategy_label))
    }
  }

  /* ── Render pieces ── */

  const title = origin ? origin.name : "Chiến lược mới"
  const runsRef: OpenStrategyRef = mode === "iqx" ? { source: "iqx", id: iqx?.id ?? null } : origin ? { source: "user", id: origin.id } : { source: "draft", id: null }
  const showIqx = mode === "iqx" && !compose
  const readOnly = showIqx
  const shownIndicators = showIqx ? (iqxContent?.indicators ?? {}) : draft.indicators
  const shownUniverse: Universe = showIqx ? (iqxContent?.universe ?? { type: "vn30" }) : draft.universe
  const pending = showIqx ? runIqx.isPending : runInd.isPending
  const blocked = showIqx ? iqxBlocked : indBlocked
  const runError = showIqx ? runIqx.error : runInd.error
  const failedRun = showIqx ? runIqx.data : runInd.data
  const result = showIqx ? iqxResult : indResult
  const stale = showIqx ? iqxStale : indStale

  const runHint = blocked
    ? blocked
    : showIqx
      ? iqxResult
        ? "Kết quả bên dưới là của chiến lược IQX đang xem."
        : "Bấm Chạy để xem hiệu quả chiến lược trên rổ mã."
      : compose
        ? "Chạy thử bản đang soạn trên rổ mã."
        : indResult && !indStale
          ? "Kết quả bên dưới là của bản nháp hiện tại."
          : indResult
            ? NOT_RAN_HINT
            : "Chưa chạy bản nháp này."

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {wantsParams && paramsReady && <OnMount key={params.toString()} run={consumeParams} />}
      {basketReady && <OnMount key={location.key} run={consumeBasket} />}
      {!compose && dataRouter && <LeaveGuard when={dirty} />}

      <IndicatorLibrary
        indicators={library}
        draft={draft.indicators}
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onOpen={(indicator, side) => setModal({ kind: "config", indicator, side, adding: !(draft.indicators[indicator.id]?.master_enabled && draft.indicators[indicator.id]?.[side].enabled) })}
        mode={compose ? "indicators" : mode}
        onMode={compose ? undefined : setMode}
        iqxFooter={IQX_FOOTER}
        iqx={
          compose ? undefined : (
            <IqxStrategyLibrary
              items={iqxItems}
              loading={iqxList.isPending}
              error={iqxList.isError ? iqxList.error : null}
              onRetry={() => void iqxList.refetch()}
              registry={indicators}
              activeId={iqx?.id ?? null}
              schedule={botSchedule}
              onSelect={(item) => { void selectIqx(item.id) }}
            />
          )
        }
      />

      <ScrollArea className="min-h-0 min-w-0 flex-1" viewportClassName="[&>div]:!block">
        <div className="mx-auto flex w-full max-w-[1280px] min-w-0 flex-col gap-4 p-3 sm:p-5">
          {!compose && <ModeSwitch mode={mode} count={library.length} onMode={setMode} className="lg:hidden" />}

          {/* 1. Thanh trên cùng */}
          <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="top-bar">
            {compose ? (
              <p className="min-w-0 text-xs" data-testid="compose-note">
                Soạn Chiến lược IQX: rổ VN30 hoặc VN100, điều kiện Mua và Bán, Giữ tối đa. Chạy thử để xem kết quả; không lưu chiến lược nào của bạn.
              </p>
            ) : showIqx ? (
              iqx && (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <IqxBadge />
                  <b className="min-w-0 text-sm break-words">{iqxTitle("strategy", iqx.content.name)}</b>
                  <span className="rounded-sm border border-border px-1.5 py-0.5 text-[11px] font-semibold">v{iqx.version}</span>
                  <span className="rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">Chỉ xem · chạy thử</span>
                  {iqx.hidden && <span className="rounded-sm border border-status-warning/50 bg-status-warning/10 px-1.5 py-0.5 text-[11px] font-semibold">IQX đã ngừng cung cấp</span>}
                  <BotTags schedule={botSchedule} source="iqx" id={iqx.id} />
                </div>
              )
            ) : (
              <div className="flex min-w-0 max-w-full items-center gap-2">
                <span className={LABEL}>Chiến lược</span>
                <StrategyMenu
                  title={title}
                  activeId={origin?.id ?? null}
                  schedule={botSchedule}
                  onOpen={(item) => confirmReplace(item.name, () => void openUserStrategy(item.id, item.name))}
                  onNew={() => confirmReplace("chiến lược mới", () => loadDraft(emptyDraft(indicators), null))}
                  onDelete={(item) => { setModalError(null); setModal({ kind: "delete", item }) }}
                />
                {busy && <LoaderCircle aria-label="Đang mở chiến lược" className="size-4 animate-spin" />}
              </div>
            )}
            <Button type="button" variant="outline" size="sm" className="lg:hidden" onClick={() => setLibraryOpen(true)}>
              <SlidersHorizontal aria-hidden="true" />
              {showIqx ? "Chiến lược IQX" : "Chỉ báo"}
            </Button>
            {!compose && (
              <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
                <BotRunningText schedule={botSchedule} />
                <Button type="button" variant="outline" size="sm" onClick={() => setModal({ kind: "runs" })}>
                  <FolderOpen aria-hidden="true" />
                  Lần chạy đã lưu
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={showIqx && !iqx} onClick={() => { setModalError(null); setModal({ kind: "history" }) }}>
                  <History aria-hidden="true" />
                  {showIqx ? "Lịch sử phiên bản" : "Lịch sử bản"}
                </Button>
              </div>
            )}
          </div>

          {/* 2. Dải thông tin IQX */}
          {showIqx && iqx && (
            <IqxStrip
              key={`${iqx.id}-${iqx.version}`}
              testId="iqx-strategy-strip"
              lead={<>{iqx.content.idea} <b>Chiến lược IQX không chỉnh được; bấm Chạy để xem hiệu quả.</b></>}
              origin={iqx.content.origin}
              whenWrong={iqx.content.when_wrong}
            />
          )}

          {/* 3. Ô thiết lập */}
          <section className="grid min-w-0 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1.2fr]" aria-label="Thiết lập backtest">
            <UniverseSelect
              id={showIqx ? "bt-universe-iqx" : "bt-universe"}
              universe={shownUniverse}
              options={options.data}
              readOnly={readOnly}
              basketsOnly={!!compose}
              onChange={setUniverse}
            />
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="bt-start" className={LABEL}>Từ ngày</label>
              <DatePicker id="bt-start" clearable={false} value={start} min={storeMeta?.earliest_start ?? undefined} max={end || undefined} onChange={(value) => setRange({ start: value ?? start, end })} aria-label="Từ ngày" className="h-9 w-full" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="bt-end" className={LABEL}>Đến ngày</label>
              <DatePicker id="bt-end" clearable={false} value={end} min={start || undefined} max={storeMeta?.data_as_of ?? undefined} onChange={(value) => setRange({ start, end: value ?? end })} aria-label="Đến ngày" className="h-9 w-full" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="bt-capital" className={LABEL}>Vốn ban đầu (VND)</label>
              <div className="relative" title="Cố định bằng vốn Bot">
                <Input id="bt-capital" value={CAPITAL.toLocaleString("vi-VN")} readOnly disabled aria-describedby="bt-capital-note" className="pr-8 font-mono tabular-nums" />
                <Lock aria-hidden="true" className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2" />
              </div>
              <span id="bt-capital-note" className={`block text-[11px] ${SUB_TEXT}`}>Cố định bằng vốn Bot</span>
            </div>
          </section>

          {/* 4. Dòng rổ */}
          <UniverseLine universe={shownUniverse} excluded={showIqx ? [] : excluded} options={options.data} />

          {/* 5. Điều kiện Mua · Bán */}
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <SidePanel side="buy" registry={indicators} indicators={shownIndicators} readOnly={readOnly} onEdit={(indicator) => setModal({ kind: "config", indicator, side: "buy", adding: false })} onRemove={(indicator) => askRemove(indicator, "buy")} />
            <SidePanel side="sell" registry={indicators} indicators={shownIndicators} readOnly={readOnly} onEdit={(indicator) => setModal({ kind: "config", indicator, side: "sell", adding: false })} onRemove={(indicator) => askRemove(indicator, "sell")} />
          </div>

          {/* 6. Giữ tối đa · Chạy · Lưu · dòng luật */}
          <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4" aria-label="Chạy backtest">
            <div className="flex min-w-0 flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <label htmlFor="bt-hold" className={LABEL}>Giữ tối đa</label>
                <div className="flex items-center gap-2 text-sm">
                  <Input
                    id="bt-hold"
                    inputMode="numeric"
                    value={showIqx ? String(iqxContent?.max_holding ?? "") : draft.holdingText}
                    readOnly={readOnly}
                    disabled={readOnly}
                    className="w-20 font-mono tabular-nums"
                    aria-invalid={!readOnly && !!holdingError}
                    aria-describedby="bt-hold-error"
                    onChange={(event) => setDraft({ ...draft, holdingText: event.target.value.replace(/[^\d]/g, "") })}
                  />
                  <span>phiên</span>
                </div>
              </div>
              <Button type="button" size="lg" disabled={!!blocked || pending} onClick={showIqx ? startIqxRun : startIndicatorRun} data-testid="run-button">
                {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Play aria-hidden="true" />}
                {pending ? "Đang chạy…" : "Chạy"}
              </Button>
              {!compose && !showIqx && (
                <SaveControls
                  content={draftContent}
                  ran={ran}
                  origin={origin}
                  changed={changed}
                  count={strategies.data?.items.length ?? 0}
                  limit={strategies.data?.limit ?? STRATEGY_LIMIT}
                  schedule={botSchedule}
                  onSaved={({ origin: saved }) => {
                    setOrigin(saved)
                    if (indResult && ran && indResult.run.run_id === ran.runId) setIndResult({ ...indResult, label: `${saved.name} · ${versionLabel(saved.created_at)}` })
                  }}
                />
              )}
            </div>
            {!readOnly && holdingError && <p id="bt-hold-error" role="alert" className="text-xs text-destructive">{holdingError}</p>}
            <p className="text-xs leading-5" data-testid="run-hint">{runHint}</p>
            <p className={`text-[11px] leading-4 ${SUB_TEXT}`} data-testid="rules-line">
              {RULES_LINE}
              {!showIqx && !compose ? ` ${DRAFT_LINE}` : ""}
            </p>
          </section>

          {runError && <p role="alert" className="text-xs leading-5 whitespace-pre-line text-destructive">{runErrorText(runError)}</p>}
          {failedRun?.status === "failed" && <ErrorLine>{failedRun.error?.message ?? "Lần chạy không thành công."}</ErrorLine>}

          {/* 7. Kết quả */}
          {result ? (
            <BacktestResults key={result.run.run_id} run={result.run} label={result.label} stale={stale} />
          ) : (
            <p className={`rounded-lg border border-dashed border-border p-6 text-center text-xs ${SUB_TEXT}`}>
              Bấm Chạy để mô phỏng chiến lược trên cả rổ mã, theo đúng luật Bot.
            </p>
          )}
          {showIqx && <p className={`text-[11px] ${SUB_TEXT}`}>{IQX_DISCLAIMER}</p>}
        </div>
      </ScrollArea>

      {modal?.kind === "config" && (
        <ConfigDialog
          indicator={modal.indicator}
          indicators={draft.indicators}
          initialSide={modal.side}
          adding={modal.adding}
          onSave={(id, config) => setIndicators({ ...draft.indicators, [id]: config })}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "replace" && (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setModal(null) }}
          title="Thay bản nháp đang chỉnh?"
          description={<>Rổ mã, Điều kiện Mua, Bán và Giữ tối đa của bản nháp sẽ được thay bằng <b>{modal.name}</b>. Chiến lược đã lưu và Bot không đổi.</>}
          confirmLabel="Thay"
          onConfirm={() => { setModal(null); modal.go() }}
        />
      )}
      {modal?.kind === "delete" && (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setModal(null) }}
          title="Xóa chiến lược?"
          description={
            <>
              Xóa <b>{modal.item.name}</b> và toàn bộ {modal.item.latest_version} bản của chiến lược này khỏi danh sách.{" "}
              Kết quả backtest đã chạy và lịch sử giao dịch, nhật ký của Bot vẫn giữ tên chiến lược để tra cứu. Không hoàn tác được.
            </>
          }
          confirmLabel="Xóa chiến lược"
          pending={remove.isPending}
          error={modalError}
          onConfirm={() => void confirmDelete(modal.item)}
        />
      )}
      {modal?.kind === "runs" && (
        <RunsDialog
          current={runsRef}
          onClose={() => setModal(null)}
          onOpenStrategy={openFromRun}
          onView={(run) => {
            const content = run.snapshot.content
            const label = [run.strategy_label, run.version_label].filter(Boolean).join(" · ") || "Lần chạy đã lưu"
            const viewed = { run, label: `${label} · chạy lúc ${stampLabel(run.created_at)}`, content }
            if (mode === "iqx") setIqxResult(viewed)
            else {
              setIndResult(viewed)
              setRanContent({ runId: run.run_id, content })
            }
            setRange({ start: run.snapshot.start, end: run.snapshot.end })
            setModal(null)
            toast.success("Đã nạp kết quả đã lưu; bản nháp không đổi.")
          }}
        />
      )}
      {modal?.kind === "history" && showIqx && iqx && (
        <IqxVersionsDialog id={iqx.id} name={iqx.content.name} current={iqxItems.find((item) => item.id === iqx.id)?.current_version ?? iqx.version} schedule={botSchedule} onClose={() => setModal(null)} />
      )}
      {modal?.kind === "history" && !showIqx && (
        <UserVersionsDialog
          id={origin?.id ?? null}
          name={origin?.name ?? ""}
          schedule={botSchedule}
          busy={busy}
          error={modalError}
          onClose={() => setModal(null)}
          onOpen={(version) => origin && confirmReplace(`${origin.name} (bản cũ)`, () => void openUserStrategy(origin.id, origin.name, version))}
          onRestore={requestRestore}
        />
      )}
      {modal?.kind === "restore" && origin && (
        <ApplyDialog
          title="Lưu bản mới cho chiến lược đang dùng trên Bot"
          impact={modal.impact}
          pending={busy}
          error={modalError}
          onClose={() => setModal(null)}
          actions={[{ label: "Lưu và áp dụng phiên tới", primary: true, onClick: (confirm) => void doRestore(modal.version, modal.latest, true, confirm) }]}
        >
          <p>Chiến lược <b>{origin.name}</b> đang được Bot dùng.</p>
          <p>
            Bản khôi phục sẽ được Bot dùng từ phiên <b>{sessionLabel(botSchedule?.next.session_date)}</b>. Phiên gần nhất
            {botSchedule?.last ? ` (${sessionLabel(botSchedule.last.session_date)})` : ""} vẫn ghi nhận bản cũ.
          </p>
          <p className="text-xs leading-5">
            Lưu trước giờ chốt dữ liệu của phiên {sessionLabel(botSchedule?.next.session_date)} thì áp dụng cho phiên đó. Mã đang giữ bán theo điều kiện Bán và Giữ tối đa của bản mới; số phiên đã giữ vẫn tính tiếp.
          </p>
        </ApplyDialog>
      )}
    </div>
  )
}
