/**
 * Tab Bộ lọc (bot-v2) của `/chien-luoc?tab=bo-loc` — `.pi/botv2/CONTRACTS.md` §5/§7.
 *
 * Thư viện chỉ tiêu bên trái (chỉ chỉ tiêu đã học mới thêm được), bên phải là
 * phạm vi (thị trường/ngành/kỳ), điều kiện `>`/`<` nối AND với ngưỡng theo đơn
 * vị hiển thị, nút chạy và bảng kết quả. Bộ lọc lưu theo phiên bản; danh sách
 * lưu là ảnh chụp tĩnh các mã đạt tại `as_of`.
 *
 * Backend tắt cờ → 404 `FEATURE_DISABLED` → trạng thái "Bộ lọc chưa được bật".
 * Điều kiện trên chỉ tiêu chưa học → 403 `CAPABILITY_LOCKED` → thông báo khoá.
 */
import { useMemo, useState } from "react"
import { ChevronDown, FolderOpen, List, LoaderCircle, Lock, Play, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api"
import { isFeatureDisabled } from "@/lib/shared-config"

import { ConfirmDialog } from "../confirm-dialog"
import { isCapabilityLocked } from "./api"
import { RulesEditor, ScopeBar } from "./conditions"
import { buildDefinition, draftsFromDefinition, newRuleId, sameDefinitionContent, staticListLabel } from "./definition"
import {
  useDeleteFilter,
  useDeleteList,
  useLoadFilter,
  useRunScreener,
  useSaveFilter,
  useSaveList,
  useSavedFilters,
  useSavedLists,
  useScreenerMetrics,
} from "./hooks"
import { MetricLibrary } from "./metric-library"
import { ResultsTable } from "./results-table"
import { SaveFilterDialog, SaveListDialog, SavedListDialog } from "./save-dialogs"
import {
  SCOPE_ALL,
  type DraftRule,
  type FilterDefinition,
  type FilterScope,
  type SavedList,
  type ScreenerMetric,
  type ScreenerRunResult,
} from "./types"

const DEFAULT_SCOPE: FilterScope = { market: SCOPE_ALL, sector: SCOPE_ALL, period: "TTM" }

const LOCK_MESSAGE =
  "Có điều kiện dùng chỉ tiêu chưa mở khoá. Hoàn thành bài học tương ứng trong Học viện rồi thử lại."

const DISABLED_MESSAGE = "Bộ lọc chưa được bật trên máy chủ."

/** Nguồn dữ liệu ghi vào danh sách khi server không trả `data_source`. */
const DEFAULT_DATA_SOURCE = "iqx-screener"

function actionError(error: unknown): string {
  if (isCapabilityLocked(error)) {
    const detail = error instanceof Error && error.message ? ` (${error.message})` : ""
    return `${LOCK_MESSAGE}${detail}`
  }
  if (isFeatureDisabled(error)) return DISABLED_MESSAGE
  return errorMessage(error)
}

type LoadedFilter = { id: string; name: string; version: number; definition: FilterDefinition }
type LastRun = { result: ScreenerRunResult; definition: FilterDefinition }

function FeatureDisabledState() {
  return (
    <div className="mx-auto w-full max-w-[960px] p-4 sm:p-6">
      <PanelState
        title="Bộ lọc chưa được bật"
        description="Tính năng Bộ lọc cổ phiếu theo chỉ tiêu cơ bản đang tắt trên máy chủ. Vui lòng quay lại sau."
      />
    </div>
  )
}

export function FilterTab() {
  const metricsQuery = useScreenerMetrics()
  const disabled = isFeatureDisabled(metricsQuery.error)
  const ready = metricsQuery.isSuccess
  const filtersQuery = useSavedFilters(ready)
  const listsQuery = useSavedLists(ready)
  const run = useRunScreener()
  const loadFilter = useLoadFilter()
  const saveFilter = useSaveFilter()
  const deleteFilter = useDeleteFilter()
  const saveList = useSaveList()
  const deleteList = useDeleteList()

  const [rules, setRules] = useState<DraftRule[]>([])
  const [scope, setScope] = useState<FilterScope>(DEFAULT_SCOPE)
  const [loaded, setLoaded] = useState<LoadedFilter | null>(null)
  const [lastRun, setLastRun] = useState<LastRun | null>(null)
  const [runError, setRunError] = useState<{ message: string; locked: boolean } | null>(null)
  const [runDisabled, setRunDisabled] = useState(false)
  const [saveFilterOpen, setSaveFilterOpen] = useState(false)
  const [saveFilterError, setSaveFilterError] = useState<string | null>(null)
  const [saveListOpen, setSaveListOpen] = useState(false)
  const [saveListError, setSaveListError] = useState<string | null>(null)
  const [viewList, setViewList] = useState<SavedList | null>(null)
  const [viewListError, setViewListError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const metrics = useMemo<ScreenerMetric[]>(() => metricsQuery.data ?? [], [metricsQuery.data])
  const metricsById = useMemo(() => new Map(metrics.map((metric) => [metric.id, metric])), [metrics])
  const addedIds = useMemo(() => new Set(rules.map((rule) => rule.metric_id)), [rules])
  const sectors = useMemo(() => {
    const seen = new Set<string>()
    for (const row of lastRun?.result.results ?? []) if (row.sector) seen.add(row.sector)
    return [...seen].sort((a, b) => a.localeCompare(b, "vi"))
  }, [lastRun])

  const built = buildDefinition(rules, scope, loaded?.name ?? "", metrics)
  const dirty = loaded !== null && (!built.ok || !sameDefinitionContent(built.definition, loaded.definition))

  if (disabled || runDisabled) return <FeatureDisabledState />

  if (metricsQuery.isPending) {
    return (
      <div className="flex min-h-0 flex-1 gap-4 p-4">
        <Skeleton className="h-full w-[300px]" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  if (metricsQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-[960px] p-4 sm:p-6">
        <PanelState
          title="Không tải được thư viện chỉ tiêu"
          description={actionError(metricsQuery.error)}
          action={{ label: "Thử lại", onClick: () => void metricsQuery.refetch() }}
        />
      </div>
    )
  }

  const addMetric = (metric: ScreenerMetric) => {
    if (addedIds.has(metric.id)) return
    setRules((current) => [...current, { id: newRuleId(), metric_id: metric.id, operator: ">", displayValue: "" }])
  }

  const onRun = () => {
    if (!built.ok) {
      setRunError({ message: built.error, locked: false })
      return
    }
    setRunError(null)
    const definition = built.definition
    run.mutate(definition, {
      onSuccess: (result) => setLastRun({ result, definition }),
      onError: (error) => {
        if (isFeatureDisabled(error)) {
          setRunDisabled(true)
          return
        }
        setRunError({ message: actionError(error), locked: isCapabilityLocked(error) })
      },
    })
  }

  const onLoadFilter = (id: string) => {
    loadFilter.mutate(id, {
      onSuccess: (filter) => {
        if (!filter.definition) {
          toast.error("Bộ lọc đã lưu không có định nghĩa hợp lệ.")
          return
        }
        setRules(draftsFromDefinition(filter.definition))
        setScope({
          market: filter.definition.scope.market,
          sector: filter.definition.scope.sector,
          period: filter.definition.scope.period,
        })
        setLoaded({ id: filter.id, name: filter.name, version: filter.current_version, definition: filter.definition })
        setLastRun(null)
        setRunError(null)
      },
      onError: (error) => toast.error(actionError(error)),
    })
  }

  const onSaveFilter = ({ name, asNewVersionOf }: { name: string; asNewVersionOf: string | null }) => {
    const result = buildDefinition(rules, scope, name, metrics)
    if (!result.ok) {
      setSaveFilterError(result.error)
      return
    }
    setSaveFilterError(null)
    saveFilter.mutate(
      { id: asNewVersionOf ?? undefined, name, definition: result.definition },
      {
        onSuccess: (filter) => {
          setLoaded({
            id: filter.id,
            name: filter.name,
            version: filter.current_version,
            definition: filter.definition ?? result.definition,
          })
          setSaveFilterOpen(false)
          toast.success(`Đã lưu “${filter.name}” — phiên bản ${filter.current_version}.`)
        },
        onError: (error) => setSaveFilterError(actionError(error)),
      },
    )
  }

  const onDeleteFilter = () => {
    if (!loaded) return
    setDeleteError(null)
    deleteFilter.mutate(loaded.id, {
      onSuccess: () => {
        setConfirmDelete(false)
        setLoaded(null)
        toast.success("Đã xoá bộ lọc.")
      },
      onError: (error) => setDeleteError(actionError(error)),
    })
  }

  const passedTickers = lastRun ? lastRun.result.results.filter((row) => row.passed).map((row) => row.symbol) : []

  const onSaveList = (name: string) => {
    if (!lastRun) return
    setSaveListError(null)
    const linked = loaded && sameDefinitionContent(lastRun.definition, loaded.definition) ? loaded : null
    saveList.mutate(
      {
        name,
        ...(linked ? { filter_id: linked.id, filter_version: linked.version } : {}),
        tickers: passedTickers,
        as_of: lastRun.result.as_of,
        data_source: lastRun.result.data_source ?? DEFAULT_DATA_SOURCE,
        scope: lastRun.result.scope ?? lastRun.definition.scope,
      },
      {
        onSuccess: (list) => {
          setSaveListOpen(false)
          toast.success(`Đã lưu “${list.name}”. ${staticListLabel(list.as_of)}.`)
        },
        onError: (error) => setSaveListError(actionError(error)),
      },
    )
  }

  const onDeleteList = (id: string) => {
    setViewListError(null)
    deleteList.mutate(id, {
      onSuccess: () => {
        setViewList(null)
        toast.success("Đã xoá danh sách.")
      },
      onError: (error) => setViewListError(actionError(error)),
    })
  }

  const savedFilters = filtersQuery.data ?? []
  const savedLists = listsQuery.data ?? []

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <MetricLibrary metrics={metrics} addedIds={addedIds} onAdd={addMetric} />

      <ScrollArea className="min-h-0 flex-1 bg-muted/30">
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 text-sm">
              {loaded ? (
                <span className="font-semibold">
                  {loaded.name}
                  <span className="ml-1.5 font-normal text-muted-foreground">· phiên bản {loaded.version}</span>
                  {dirty && (
                    <Badge variant="outline" className="ml-2">
                      Có thay đổi chưa lưu
                    </Badge>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">Bộ lọc mới</span>
              )}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={loadFilter.isPending}>
                    {loadFilter.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
                    Bộ lọc đã lưu
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Bộ lọc đã lưu</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {filtersQuery.isError ? (
                    <div className="px-2 py-1.5 text-xs text-destructive">{actionError(filtersQuery.error)}</div>
                  ) : savedFilters.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      {filtersQuery.isPending ? "Đang tải…" : "Chưa có bộ lọc nào."}
                    </div>
                  ) : (
                    savedFilters.map((filter) => (
                      <DropdownMenuItem key={filter.id} onSelect={() => onLoadFilter(filter.id)}>
                        <span className="min-w-0 flex-1 truncate">{filter.name}</span>
                        <span className="text-[11px] text-muted-foreground">v{filter.current_version}</span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5">
                    <List className="size-4" />
                    Danh sách đã lưu
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel>Danh sách tĩnh đã lưu</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {listsQuery.isError ? (
                    <div className="px-2 py-1.5 text-xs text-destructive">{actionError(listsQuery.error)}</div>
                  ) : savedLists.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      {listsQuery.isPending ? "Đang tải…" : "Chưa có danh sách nào."}
                    </div>
                  ) : (
                    savedLists.map((list) => (
                      <DropdownMenuItem
                        key={list.id}
                        onSelect={() => {
                          setViewListError(null)
                          setViewList(list)
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">{list.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {list.tickers.length} mã · {list.as_of}
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {loaded && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-destructive"
                  onClick={() => {
                    setDeleteError(null)
                    setConfirmDelete(true)
                  }}
                >
                  <Trash2 className="size-4" />
                  Xoá
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setSaveFilterError(null)
                  setSaveFilterOpen(true)
                }}
              >
                <Save className="size-4" />
                Lưu bộ lọc
              </Button>
            </div>
          </div>

          <ScopeBar scope={scope} sectors={sectors} onChange={setScope} />

          <RulesEditor rules={rules} metricsById={metricsById} onChange={setRules} />

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={onRun} disabled={run.isPending} className="gap-1.5">
              {run.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
              {run.isPending ? "Đang lọc…" : "Chạy bộ lọc"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {rules.length === 0 ? "Không có điều kiện: chỉ lọc theo phạm vi." : `${rules.length} điều kiện · AND`}
            </span>
          </div>

          {runError && (
            <Alert variant="destructive" role="alert">
              {runError.locked && <Lock />}
              <AlertTitle>{runError.locked ? "Chỉ tiêu chưa mở khoá" : "Không chạy được bộ lọc"}</AlertTitle>
              <AlertDescription>{runError.message}</AlertDescription>
            </Alert>
          )}

          {lastRun && (
            <ResultsTable
              result={lastRun.result}
              ruleMetricIds={lastRun.definition.rules.map((rule) => rule.metric_id)}
              metrics={metrics}
              onSaveList={() => {
                setSaveListError(null)
                setSaveListOpen(true)
              }}
            />
          )}
        </div>
      </ScrollArea>

      {saveFilterOpen && (
        <SaveFilterDialog
          open
          onOpenChange={setSaveFilterOpen}
          initialName={loaded?.name ?? ""}
          loadedFilter={loaded ? { id: loaded.id, name: loaded.name, version: loaded.version } : null}
          pending={saveFilter.isPending}
          error={saveFilterError}
          onSave={onSaveFilter}
        />
      )}

      {saveListOpen && lastRun && (
        <SaveListDialog
          open
          onOpenChange={setSaveListOpen}
          initialName={`${loaded?.name ?? "Danh sách lọc"} ${lastRun.result.as_of}`}
          asOf={lastRun.result.as_of}
          tickerCount={passedTickers.length}
          pending={saveList.isPending}
          error={saveListError}
          onSave={onSaveList}
        />
      )}

      <SavedListDialog
        list={viewList}
        onOpenChange={(open) => !open && setViewList(null)}
        pending={deleteList.isPending}
        error={viewListError}
        onDelete={onDeleteList}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Xoá bộ lọc?"
        description={loaded ? `Bộ lọc “${loaded.name}” sẽ bị xoá khỏi danh sách đã lưu.` : ""}
        confirmLabel="Xoá"
        pending={deleteFilter.isPending}
        error={deleteError}
        onConfirm={onDeleteFilter}
      />
    </div>
  )
}
