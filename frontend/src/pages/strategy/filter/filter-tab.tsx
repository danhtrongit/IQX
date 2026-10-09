/**
 * Tab "Bộ lọc": screen companies by fundamental metrics, each condition with its own period.
 *
 * Four things that never get mixed up:
 * - Lưu bộ lọc: the criteria (filter 3.0). Opening it later re-resolves "latest published".
 * - Lưu danh mục: the symbols and evidence of ONE stored result (a list).
 * - Lưu kết quả: the rows of that result frozen (a snapshot).
 * - Áp dụng cho Bot: replaces the buy universe of NEW buys from the next session (pending until
 *   then). It never sells what the Bot holds and VN30 stays the default.
 * Filtering, sorting, paging and saving never change the Bot.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Filter, FolderOpen, List, Play, SlidersHorizontal, Save, FileCheck, LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { useUniverseActions, useBotUniverse } from "@/pages/demo-trading/bot/universe/use-universe"
import { sourceName } from "@/pages/demo-trading/bot/universe/labels"

import { AlertForm } from "../alerts/alert-form"
import { ErrorLine, FeatureState } from "../shared/controls"
import { FEATURE_DISABLED_COPY } from "../shared/ui-text"
import { DialogShell } from "../shared/dialog-shell"
import { errorDetails, errorMessage, isApiError, isCapabilityLocked, isFeatureDisabled, newKey } from "../shared/errors"
import { RESULT_PAGE_SIZE, getResultPage, runScreener } from "./api"
import { ApplyBotDialog, type ApplySource } from "./apply-bot-dialog"
import { BotSourceCard } from "./bot-source"
import { CatalogDialog } from "./catalog-dialog"
import { RulesEditor, ScopeBar } from "./conditions"
import { buildDefinition, criteriaSignature, criteriaSummary, draftsFromFilter, isMetricUsable, newRuleId } from "./definition"
import { DataQualityDialog, MetricDetailDialog } from "./detail-dialogs"
import { filterKeys, useCreateList, useCreateSnapshot, useResultPage, useSaveFilter, useScreenerMetrics } from "./hooks"
import { MetricLibrary } from "./metric-library"
import { ResultsPanel } from "./results-panel"
import { SavedFiltersDialog } from "./saved-filters-dialog"
import { SavedListsDialog } from "./saved-lists-dialog"
import { SavedResultsDialog } from "./saved-results-dialog"
import { SaveFilterDialog, SaveResultDialog, type ResultSaveKind } from "./save-dialogs"
import {
  SCOPE_ALL,
  type DraftRule,
  type FilterDefinition,
  type FilterScope,
  type MetricId,
  type ResultHeader,
  type ResultPage,
  type ResultRow,
  type RunResult,
  type SavedList,
  type ScreenerMetric,
  type Selection,
} from "./types"

type Dialog =
  | { kind: "saved-filters" | "saved-lists" | "saved-results" | "catalog" | "save-filter" | "quality" | "apply-result" }
  | { kind: "save-result"; save: ResultSaveKind }
  | { kind: "cell"; row: ResultRow; metric: ScreenerMetric }
  | { kind: "apply-list"; list: SavedList }
  | { kind: "alert-list"; list: SavedList }
  | null

type Loaded = { id: string; name: string; version: number; signature: string }
type StoredRun = { resultId: string; header: ResultHeader }

const DEFAULT_SCOPE: FilterScope = { market: SCOPE_ALL, sector: SCOPE_ALL }

/** Everything about a run except its rows (those are read page by page from the stored result). */
function headerOf(run: RunResult): ResultHeader {
  const header: Record<string, unknown> = { ...run }
  delete header.results
  delete header.result_id
  return header as ResultHeader
}

/** Error of a run, in words: what is locked, not ready or invalid, never a blank "0 results". */
function runErrorText(error: unknown): string {
  if (isCapabilityLocked(error)) return "Có điều kiện dùng chỉ tiêu chưa mở. Hoàn thành bài học tương ứng trong Học viện rồi thử lại."
  if (isApiError(error, 422)) {
    const details = errorDetails(error)
    const lines = details.flatMap((item) => (typeof item.message === "string" ? [item.message] : typeof item.reason === "string" ? [item.reason] : []))
    return lines.length > 0 ? `${errorMessage(error)}\n${lines.join("\n")}` : errorMessage(error)
  }
  return errorMessage(error)
}

/** Every company that passed, on every page of the stored result, for the confirmation of "Áp dụng cho Bot". */
function ApplyFromResult({
  run,
  selection,
  criteria,
  linked,
  savedList,
  currentSource,
  actions,
  onApplied,
  onClose,
}: {
  run: StoredRun
  selection: ReadonlySet<string>
  criteria: string
  linked: Loaded | null
  savedList: SavedList | null
  currentSource: string
  actions: ReturnType<typeof useUniverseActions>
  onApplied: (count: number, session: string) => void
  onClose: () => void
}) {
  const { user } = useAuth()
  const passed = useQuery({
    queryKey: [...filterKeys.all, "passed", user?.id, run.resultId],
    queryFn: ({ signal }) => getResultPage(run.resultId, { offset: 0, limit: 500, passedOnly: true }, signal),
    staleTime: Infinity,
    retry: false,
  })
  if (passed.isPending || passed.isError) {
    return (
      <DialogShell
        title="Áp dụng danh mục cho Bot"
        size="sm"
        onClose={onClose}
        footer={<Button type="button" variant="outline" onClick={onClose}>Đóng</Button>}
      >
        {passed.isError ? (
          <div className="space-y-2">
            <ErrorLine>{errorMessage(passed.error)}</ErrorLine>
            <Button type="button" variant="outline" size="sm" onClick={() => void passed.refetch()}>Thử lại</Button>
          </div>
        ) : (
          <Skeleton className="h-24 w-full" aria-label="Đang tải danh sách mã đạt" />
        )}
      </DialogShell>
    )
  }
  const candidates = passed.data.results.map((row) => row.symbol)
  const source: ApplySource = {
    kind: "result",
    runId: run.resultId,
    criteria,
    asOf: run.header.as_of,
    ...(linked ? { filterId: linked.id, filterVersion: linked.version } : {}),
    savedList,
  }
  return <ApplyBotDialog source={source} candidates={candidates} defaultSelected={selection} currentSource={currentSource} actions={actions} onApplied={onApplied} onClose={onClose} />
}

export function FilterTab() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const metricsQuery = useScreenerMetrics()
  const universe = useBotUniverse()
  const actions = useUniverseActions()
  const saveFilter = useSaveFilter()
  const createList = useCreateList()
  const createSnapshot = useCreateSnapshot()

  const [rules, setRules] = useState<DraftRule[]>([])
  const [scope, setScope] = useState<FilterScope>(DEFAULT_SCOPE)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [run, setRun] = useState<StoredRun | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set())
  const [dialog, setDialog] = useState<Dialog>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [savedList, setSavedList] = useState<{ runId: string; list: SavedList } | null>(null)
  // One idempotency key per distinct save request: a retry of the same request reuses it, a changed name or selection does not.
  const saveKeys = useRef<{ fingerprint: string; key: string } | null>(null)
  const keyFor = (fingerprint: string): string => {
    if (saveKeys.current?.fingerprint !== fingerprint) saveKeys.current = { fingerprint, key: newKey() }
    return saveKeys.current.key
  }
  const abort = useRef<AbortController | null>(null)

  const metrics = useMemo<ScreenerMetric[]>(() => metricsQuery.data ?? [], [metricsQuery.data])
  const metricsById = useMemo(() => new Map<MetricId, ScreenerMetric>(metrics.map((metric) => [metric.id, metric])), [metrics])
  const addedIds = useMemo(() => new Set(rules.map((rule) => rule.metric_id)), [rules])

  const runMutation = useMutation({
    mutationFn: ({ definition, signal }: { definition: FilterDefinition; signal: AbortSignal }) => runScreener(definition, signal),
  })
  const resultPage = useResultPage(run?.resultId ?? null, page, !showAll)

  useEffect(() => () => abort.current?.abort(), [])

  const built = buildDefinition(rules, scope, loaded?.name ?? "", metrics)
  const currentSignature = built.ok ? criteriaSignature(built.definition) : null
  const stale = run !== null && (currentSignature === null || currentSignature !== criteriaSignature(run.header.definition))
  const sectors = useMemo(() => {
    const seen = new Set<string>()
    for (const row of resultPage.data?.results ?? []) if (row.sector) seen.add(row.sector)
    return [...seen].sort((a, b) => a.localeCompare(b, "vi"))
  }, [resultPage.data])

  if (isFeatureDisabled(metricsQuery.error)) return <FeatureState {...FEATURE_DISABLED_COPY} />
  if (metricsQuery.isPending) {
    return (
      <div className="flex min-h-0 flex-1 gap-4 p-4">
        <Skeleton className="hidden h-full w-[260px] lg:block" />
        <div className="flex-1 space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-32 w-full" /></div>
      </div>
    )
  }
  if (metricsQuery.isError) {
    return (
      <FeatureState
        title="Không tải được thư viện chỉ tiêu"
        description={errorMessage(metricsQuery.error)}
        action={{ label: "Thử lại", onClick: () => void metricsQuery.refetch() }}
      />
    )
  }

  const effectiveSource = universe.data ? sourceName(universe.data.pending ?? universe.data.effective) : "VN30"
  const closeDialog = () => { setDialog(null); setDialogError(null) }
  const openDialog = (next: Dialog) => { setDialogError(null); setDialog(next) }

  function addMetric(metric: ScreenerMetric) {
    if (addedIds.has(metric.id) || !isMetricUsable(metric)) return
    setRules((current) => [...current, { id: newRuleId(), metric_id: metric.id, period: metric.default_period, operator: ">", displayValue: "" }])
  }

  function onRun() {
    if (!built.ok) {
      setRunError(built.error)
      return
    }
    setRunError(null)
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    const definition = built.definition
    runMutation.mutate(
      { definition, signal: controller.signal },
      {
        onSuccess: (result) => {
          // Only the newest run may replace the table: a slower older answer is never shown.
          if (abort.current !== controller) return
          const header = headerOf(result)
          const passedRows = result.results.filter((row) => row.passed)
          queryClient.setQueryData<ResultPage>(filterKeys.page(user?.id, result.result_id, 0, true), {
            ...header,
            result_id: result.result_id,
            total: passedRows.length,
            offset: 0,
            limit: RESULT_PAGE_SIZE,
            results: passedRows.slice(0, RESULT_PAGE_SIZE),
          })
          setRun({ resultId: result.result_id, header })
          setPage(0)
          setShowAll(false)
          setSelection(new Set())
          setSavedList(null)
        },
        onError: (error) => {
          if (abort.current !== controller || (error instanceof DOMException && error.name === "AbortError")) return
          setRunError(runErrorText(error))
        },
      },
    )
  }

  function loadSavedFilter(filter: Parameters<typeof draftsFromFilter>[0]) {
    setRules(draftsFromFilter(filter))
    setScope({ market: filter.definition.scope.market, sector: filter.definition.scope.sector })
    setLoaded({ id: filter.id, name: filter.name, version: filter.current_version, signature: criteriaSignature(filter.definition) })
    setRunError(null)
    closeDialog()
    toast.success("Đã tải tiêu chí và kỳ tính của bộ lọc. Bot và danh mục mua mới không đổi; bấm Chạy bộ lọc để lấy dữ liệu mới nhất.")
  }

  function onSaveFilter(input: { name: string; newVersionOf: string | null }) {
    const result = buildDefinition(rules, scope, input.name, metrics)
    if (!result.ok) {
      setDialogError(result.error)
      return
    }
    setDialogError(null)
    saveFilter.mutate(
      { id: input.newVersionOf ?? undefined, name: input.name, definition: result.definition, idempotencyKey: keyFor(JSON.stringify(["filter", input.newVersionOf, input.name, result.definition])) },
      {
        onSuccess: (filter) => {
          setLoaded({ id: filter.id, name: filter.name, version: filter.current_version, signature: criteriaSignature(filter.definition) })
          closeDialog()
          toast.success(`Đã lưu bộ lọc “${filter.name}” (phiên bản ${filter.current_version}). Bot không đổi.`)
        },
        onError: (error) => setDialogError(errorMessage(error)),
      },
    )
  }

  const selectionOf = (): Selection => (selection.size > 0 ? { mode: "subset", symbols: [...selection] } : { mode: "all" })
  const linked = loaded && run && loaded.signature === criteriaSignature(run.header.definition) ? loaded : null
  const selectedCount = selection.size > 0 ? selection.size : (run?.header.counts.passed ?? 0)
  const criteriaText = run ? criteriaSummary(run.header.definition, metrics) : ""

  function onSaveResult(kind: ResultSaveKind, name: string) {
    if (!run) return
    setDialogError(null)
    const common = {
      name,
      runId: run.resultId,
      selection: selectionOf(),
      ...(linked ? { filterId: linked.id, filterVersion: linked.version } : {}),
      idempotencyKey: keyFor(JSON.stringify([kind, run.resultId, name, selectionOf()])),
    }
    if (kind === "list") {
      createList.mutate(
        { ...common, visibility: "saved" },
        {
          onSuccess: (list) => {
            setSavedList({ runId: run.resultId, list })
            closeDialog()
            toast.success(`Đã lưu danh mục “${list.name}” (${list.tickers.length} mã, mốc dữ liệu ${list.as_of}). Bot không đổi; áp dụng cho Bot là thao tác riêng.`)
          },
          onError: (error) => setDialogError(errorMessage(error)),
        },
      )
      return
    }
    createSnapshot.mutate(common, {
      onSuccess: (snapshot) => {
        closeDialog()
        toast.success(`Đã lưu kết quả “${snapshot.name}” (${snapshot.row_count} mã). Bot không đổi.`)
      },
      onError: (error) => setDialogError(errorMessage(error)),
    })
  }

  const applied = (count: number, session: string) => {
    closeDialog()
    toast.success(`Đã nhận danh mục ${count} mã, chờ hiệu lực ${session}. Không có lệnh nào được tạo và cổ phiếu đang giữ không bị bán.`)
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <MetricLibrary
        metrics={metrics}
        addedIds={addedIds}
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onAdd={addMetric}
        onOpenCatalog={() => openDialog({ kind: "catalog" })}
      />

      <ScrollArea className="min-h-0 min-w-0 flex-1" viewportClassName="[&>div]:!block">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <Filter aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{loaded ? <><b className="text-foreground">{loaded.name}</b> · phiên bản {loaded.version}</> : "Bộ lọc doanh nghiệp"}</span>
            </div>
            <Button type="button" variant="outline" className="lg:hidden" onClick={() => setLibraryOpen(true)}>
              <SlidersHorizontal aria-hidden="true" />
              Chỉ tiêu
            </Button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => openDialog({ kind: "saved-filters" })}><FolderOpen aria-hidden="true" />Bộ lọc đã lưu</Button>
              <Button type="button" variant="outline" onClick={() => openDialog({ kind: "saved-lists" })}><List aria-hidden="true" />Danh mục đã lưu</Button>
              <Button type="button" variant="outline" onClick={() => openDialog({ kind: "saved-results" })}><FileCheck aria-hidden="true" />Kết quả đã lưu</Button>
              <Button type="button" onClick={() => openDialog({ kind: "save-filter" })}><Save aria-hidden="true" />Lưu bộ lọc</Button>
            </div>
          </div>

          <BotSourceCard actions={actions} />

          <ScopeBar scope={scope} sectors={sectors} onChange={setScope} />
          <RulesEditor rules={rules} metricsById={metricsById} onChange={setRules} />

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={onRun}>
              {runMutation.isPending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Play aria-hidden="true" />}
              {runMutation.isPending ? "Đang lọc…" : "Chạy bộ lọc"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {rules.length === 0 ? "Chưa áp tiêu chí: xem toàn bộ doanh nghiệp trong phạm vi." : `${rules.length} điều kiện · AND`}
            </span>
          </div>
          {runError && <p role="alert" className="text-xs leading-5 whitespace-pre-line text-destructive">{runError}</p>}

          {run && (
            <ResultsPanel
              header={run.header}
              page={resultPage.data}
              loading={resultPage.isPending}
              error={resultPage.isError ? resultPage.error : null}
              onRetry={() => void resultPage.refetch()}
              metrics={metrics}
              pageIndex={page}
              onPage={setPage}
              showAll={showAll}
              onShowAll={(value) => { setShowAll(value); setPage(0) }}
              selection={selection}
              onSelection={setSelection}
              stale={stale}
              busy={createList.isPending || createSnapshot.isPending}
              onSaveList={() => openDialog({ kind: "save-result", save: "list" })}
              onSaveResult={() => openDialog({ kind: "save-result", save: "snapshot" })}
              onApply={() => openDialog({ kind: "apply-result" })}
              onCell={(row, metric) => openDialog({ kind: "cell", row, metric })}
              onQuality={() => openDialog({ kind: "quality" })}
            />
          )}
        </div>
      </ScrollArea>

      {dialog?.kind === "catalog" && <CatalogDialog metrics={metrics} onClose={closeDialog} />}
      {dialog?.kind === "saved-filters" && (
        <SavedFiltersDialog
          metrics={metrics}
          onUse={loadSavedFilter}
          onDeleted={(id) => { if (loaded?.id === id) setLoaded(null) }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "saved-results" && <SavedResultsDialog metrics={metrics} onClose={closeDialog} />}
      {dialog?.kind === "saved-lists" && (
        <SavedListsDialog
          metrics={metrics}
          actions={actions}
          onApply={(list) => openDialog({ kind: "apply-list", list })}
          onAlert={(list) => openDialog({ kind: "alert-list", list })}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "save-filter" && (
        <SaveFilterDialog
          initialName={loaded?.name ?? ""}
          loaded={loaded}
          criteria={built.ok ? criteriaSummary(built.definition, metrics) : built.error}
          pending={saveFilter.isPending}
          error={dialogError ?? (built.ok ? null : built.error)}
          onSave={onSaveFilter}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "save-result" && run && (
        <SaveResultDialog
          kind={dialog.save}
          initialName={`${loaded?.name ?? "Kết quả lọc"} ${run.header.as_of.slice(0, 10)}`}
          summary={criteriaText}
          count={selectedCount}
          pending={createList.isPending || createSnapshot.isPending}
          error={dialogError}
          onSave={(name) => onSaveResult(dialog.save, name)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "quality" && run && <DataQualityDialog header={run.header} metrics={metrics} onClose={closeDialog} />}
      {dialog?.kind === "cell" && run && <MetricDetailDialog header={run.header} row={dialog.row} metric={dialog.metric} onClose={closeDialog} />}
      {dialog?.kind === "apply-result" && run && (
        <ApplyFromResult
          run={run}
          selection={selection}
          criteria={criteriaText}
          linked={linked}
          savedList={savedList && savedList.runId === run.resultId ? savedList.list : null}
          currentSource={effectiveSource}
          actions={actions}
          onApplied={applied}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "apply-list" && (
        <ApplyBotDialog
          source={{ kind: "list", list: dialog.list, criteria: null }}
          candidates={dialog.list.tickers}
          defaultSelected={new Set()}
          currentSource={effectiveSource}
          actions={actions}
          onApplied={applied}
          onBack={() => openDialog({ kind: "saved-lists" })}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "alert-list" && (
        <AlertForm
          initialListId={dialog.list.id}
          onClose={closeDialog}
          onSaved={(alert) => {
            closeDialog()
            toast.success(`Đã tạo cảnh báo “${alert.name}” trên danh mục ${dialog.list.name}. Xem ở tab Cảnh báo.`)
          }}
        />
      )}
    </div>
  )
}
