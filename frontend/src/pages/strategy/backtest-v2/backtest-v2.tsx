/**
 * Backtest v2 (bot-v2 retrofit inside Chiến lược → Backtest).
 *
 * Editor over the ONE shared Buy/Sell configuration (learned indicators only),
 * draft → saved revision with optimistic concurrency (expected_revision; 409
 * keeps the draft), and runs that always use the SAVED revision. Risk UI is
 * phase 1: only execution timing and fee preset — no ATR stop / TP / max
 * holding. Results show return % from a 0% initial point and the full ledger.
 *
 * Contract: .pi/botv2/CONTRACTS.md §4, §7; spec BACKTEST-RETROFIT, EXECUTION-PROFILE.
 */
import { useMemo, useReducer, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, LoaderCircle, Play, RotateCcw, Save, Undo2 } from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/api"
import {
  isRevisionConflict,
  newIdempotencyKey,
  saveSharedConfig,
  type SharedConfigState,
  type Side,
  type TechnicalIndicator,
  type TechnicalRegistry,
} from "@/lib/shared-config"

import { ConfigBar } from "../backtest/config-bar"
import { SymbolInfoBox } from "../backtest/symbol-info-box"
import { getBacktestRun, runBacktestV2 } from "./api"
import {
  changedIndicators,
  draftErrors,
  draftReducer,
  hasBuyRules,
  initialDraft,
  isDirty,
  isSideActive,
  type SideTemplate,
} from "./draft"
import { IndicatorLibrary, SideEditor } from "./editor"
import { fmtDate, SIDE_LABEL } from "./format"
import { backtestV2Keys, useBacktestRunsQuery, useSharedConfigQuery, useTechnicalRegistryQuery } from "./hooks"
import { ResearchPanel } from "./research-panel"
import { BacktestResults } from "./results"
import { SystemPanel } from "./system-panel"
import type { BacktestRunRequest, BacktestRunResponse, Execution, FeePreset, ParamPath } from "./types"

const SELECT_CLASS = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
const LABEL_CLASS = "text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase"

function grantedIds(state: SharedConfigState): Set<string> {
  return new Set(state.granted_indicators.map((id) => id.replace(/^indicator:/, "")))
}

function effectiveLabel(state: SharedConfigState): string {
  if (state.saved_revision === 0) return "Chưa lưu cấu hình nào — đang hiển thị mặc định của registry."
  if (state.status === "calendar_unavailable") return "Chưa xác minh lịch phiên: Bot chưa có phiên hiệu lực cho cấu hình này."
  if (state.status === "effective") return `Bot đang áp dụng cấu hình #${state.effective_revision ?? state.saved_revision}.`
  return state.effective_session
    ? `Bot áp dụng từ phiên ${fmtDate(state.effective_session)}.`
    : "Đang chờ phiên hiệu lực của Bot."
}

export function BacktestV2({ initialSymbol }: { initialSymbol?: string }) {
  const configQuery = useSharedConfigQuery()
  const registryQuery = useTechnicalRegistryQuery()

  if (configQuery.isLoading || registryQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6" role="status" aria-label="Đang tải cấu hình">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (configQuery.isError || registryQuery.isError || !configQuery.data || !registryQuery.data) {
    return (
      <div className="mx-auto w-full max-w-[1100px] p-4 sm:p-6">
        <PanelState
          title="Không tải được cấu hình chiến lược"
          description={errorMessage(configQuery.error ?? registryQuery.error)}
          action={{
            label: "Thử lại",
            onClick: () => {
              void configQuery.refetch()
              void registryQuery.refetch()
            },
          }}
        />
      </div>
    )
  }

  return (
    <BacktestV2Workspace
      state={configQuery.data}
      registry={registryQuery.data}
      initialSymbol={initialSymbol}
      reload={async () => (await configQuery.refetch()).data}
    />
  )
}

function BacktestV2Workspace({
  state,
  registry,
  initialSymbol,
  reload,
}: {
  state: SharedConfigState
  registry: TechnicalRegistry
  initialSymbol?: string
  reload: () => Promise<SharedConfigState | undefined>
}) {
  const queryClient = useQueryClient()
  const runsQuery = useBacktestRunsQuery()
  const [draftState, dispatch] = useReducer(draftReducer, state, (initial) =>
    initialDraft(initial.saved_revision, initial.config.indicators),
  )
  const [conflict, setConflict] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [symbol, setSymbol] = useState(initialSymbol?.trim().toUpperCase() || "FPT")
  const [start, setStart] = useState("2020-01-01")
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10))
  const [capital, setCapital] = useState(0)
  const [execution, setExecution] = useState<Execution>("next_open")
  const [feePreset, setFeePreset] = useState<FeePreset>("standard")
  const [last, setLast] = useState<{ response: BacktestRunResponse; symbol: string } | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  const registryById = useMemo<Record<string, TechnicalIndicator>>(
    () => Object.fromEntries(registry.indicators.map((item) => [item.id, item])),
    [registry],
  )
  const learned = useMemo(() => {
    const granted = grantedIds(state)
    return registry.indicators.filter((item) => granted.has(item.id) && !!draftState.draft[item.id])
  }, [registry, state, draftState.draft])
  const templates = useMemo<Record<string, SideTemplate>>(
    () => Object.fromEntries(learned.map((item) => [item.id, { buy: item.buy, sell: item.sell }])),
    [learned],
  )

  const dirty = isDirty(draftState)

  // Another tab/page saved a newer revision: adopt it when there is no draft,
  // otherwise keep the draft and flag the conflict (never last-write-wins).
  const [seenRevision, setSeenRevision] = useState(state.saved_revision)
  if (state.saved_revision !== seenRevision) {
    setSeenRevision(state.saved_revision)
    if (state.saved_revision !== draftState.revision) {
      if (dirty) setConflict(true)
      else dispatch({ type: "load", revision: state.saved_revision, indicators: state.config.indicators })
    }
  }
  const errors = useMemo(() => draftErrors(draftState, registryById), [draftState, registryById])
  const hasErrors = Object.keys(errors).length > 0
  const savedRevision = draftState.revision

  const saveMutation = useMutation({
    mutationFn: () =>
      saveSharedConfig({
        expected_revision: draftState.revision,
        idempotency_key: newIdempotencyKey(),
        indicators: changedIndicators(draftState),
      }),
    onSuccess: (result) => {
      setConflict(false)
      setSaveError(null)
      dispatch({ type: "load", revision: result.revision, indicators: result.config.indicators })
      queryClient.setQueriesData<SharedConfigState>({ queryKey: backtestV2Keys.sharedConfigAll }, (previous) =>
        previous
          ? {
              ...previous,
              saved_revision: result.revision,
              config: result.config,
              config_hash: result.config_hash,
              effective_session: result.effective_session,
              status: result.status,
            }
          : previous,
      )
      toast.success(`Đã lưu cấu hình #${result.revision}`)
    },
    onError: (error) => {
      if (isRevisionConflict(error)) {
        setConflict(true)
        setSaveError(null)
      } else {
        setSaveError(errorMessage(error))
      }
    },
  })

  const runMutation = useMutation({
    mutationFn: (body: BacktestRunRequest) => runBacktestV2(body),
    onSuccess: (response, body) => {
      setLast({ response, symbol: body.symbol })
      void queryClient.invalidateQueries({ queryKey: backtestV2Keys.runsAll })
    },
  })

  const openRun = useMutation({
    mutationFn: (id: string) => getBacktestRun(id),
    onSuccess: (response, id) => {
      const summary = runsQuery.data?.find((run) => run.run_id === id)
      setLast({ response, symbol: summary?.symbol ?? symbol })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const buyReady = hasBuyRules(draftState.saved)
  const savedBuyIds = useMemo(
    () => Object.keys(draftState.saved).filter((id) => isSideActive(draftState.saved[id]!, "buy")),
    [draftState.saved],
  )
  const blockedReason = dirty
    ? `Bản nháp chưa lưu. Backtest chạy trên cấu hình đã lưu #${savedRevision} — hãy Lưu trước khi chạy.`
    : !buyReady
      ? "Cấu hình đã lưu chưa có chỉ báo Mua nào được bật."
      : !symbol
        ? "Nhập mã cổ phiếu."
        : !start || !end || start > end
          ? "Khoảng ngày chưa hợp lệ."
          : null

  const buildRequest = (extra: Pick<BacktestRunRequest, "research" | "system"> = {}): BacktestRunRequest => ({
    idempotency_key: newIdempotencyKey(),
    shared_revision: savedRevision,
    symbol,
    start,
    end,
    assumptions: { ...(capital > 0 ? { capital } : {}), fee_preset: feePreset, execution },
    ...extra,
  })

  const onReloadLatest = async (keepDraft: boolean) => {
    const latest = await reload()
    if (!latest) return
    dispatch({
      type: keepDraft ? "rebase" : "load",
      revision: latest.saved_revision,
      indicators: latest.config.indicators,
    })
    setConflict(false)
  }

  const applyCandidate = (path: ParamPath, value: number) => {
    dispatch({ type: "tab", side: path.side })
    dispatch({ type: "param", id: path.indicator, side: path.side, key: path.key, value })
    editorRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" })
    toast.info("Đã đưa giá trị vào bản nháp. Bấm Lưu để ghi vào cấu hình.")
  }

  const tab = draftState.tab

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-[260px_1fr]">
          <div className="lg:sticky lg:top-0 lg:self-start">
            <IndicatorLibrary indicators={learned} draft={draftState.draft} dispatch={dispatch} />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {(runsQuery.data?.length ?? 0) > 0 && (
              <div className="flex justify-end">
                <select
                  className="h-9 w-[280px] rounded-md border border-input bg-background px-2 text-sm"
                  aria-label="Lần chạy gần đây"
                  value=""
                  onChange={(event) => event.target.value && openRun.mutate(event.target.value)}
                >
                  <option value="">Lần chạy gần đây…</option>
                  {runsQuery.data!.map((run) => (
                    <option key={run.run_id} value={run.run_id}>
                      {[run.symbol ?? "—", run.kind, run.shared_revision != null ? `#${run.shared_revision}` : null, run.created_at?.slice(0, 10)]
                        .filter(Boolean)
                        .join(" · ")}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <ConfigBar
              symbol={symbol}
              start={start}
              end={end}
              capital={capital}
              onSymbol={setSymbol}
              onStart={setStart}
              onEnd={setEnd}
              onCapital={setCapital}
            />
            <p className="-mt-2 px-1 text-[11px] text-muted-foreground">Để trống vốn ban đầu để dùng mặc định 100.000.000 đ.</p>
            <SymbolInfoBox symbol={symbol} meta={null} />

            <section ref={editorRef} className="flex flex-col gap-3 rounded-lg bg-card p-4" aria-label="Cấu hình Mua/Bán">
              <div
                className={`flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-xs ${
                  dirty ? "bg-amber-500/10 text-foreground" : "bg-muted/60 text-muted-foreground"
                }`}
                data-testid="revision-banner"
              >
                {dirty ? (
                  <span>
                    <strong>Bản nháp chưa lưu</strong> · dựa trên cấu hình đã lưu #{savedRevision}. Backtest chỉ dùng cấu hình đã lưu.
                  </span>
                ) : (
                  <span>
                    Đang dùng cấu hình đã lưu <strong>#{savedRevision}</strong>. {effectiveLabel(state)}
                  </span>
                )}
              </div>

              {conflict && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-price-down/40 bg-price-down/10 px-3 py-2 text-xs" role="alert" data-testid="conflict-banner">
                  <AlertTriangle className="size-3.5 text-price-down" />
                  <span>Cấu hình đã được lưu ở nơi khác. Bản nháp của bạn vẫn được giữ — tải bản mới nhất trước khi lưu.</span>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void onReloadLatest(true)}>
                      Tải bản mới, giữ thay đổi
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void onReloadLatest(false)}>
                      Bỏ bản nháp
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <div role="tablist" aria-label="Phía tín hiệu" className="inline-flex rounded-md border border-border p-0.5">
                  {(["buy", "sell"] as Side[]).map((side) => (
                    <button
                      key={side}
                      type="button"
                      role="tab"
                      aria-selected={tab === side}
                      onClick={() => dispatch({ type: "tab", side })}
                      className={`rounded px-4 py-1.5 text-xs font-semibold transition-colors ${
                        tab === side
                          ? side === "buy"
                            ? "bg-price-up/15 text-price-up"
                            : "bg-price-down/15 text-price-down"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {side === "buy" ? "MUA" : "BÁN"}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => dispatch({ type: "cancel" })} disabled={!dirty}>
                    <Undo2 className="size-3.5" />
                    Hủy
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => dispatch({ type: "reset_tab", templates })}
                    title={`Đặt lại tham số và toán tử phía ${SIDE_LABEL[tab]} về mặc định`}
                  >
                    <RotateCcw className="size-3.5" />
                    Đặt lại
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => saveMutation.mutate()}
                    disabled={!dirty || hasErrors || saveMutation.isPending}
                  >
                    {saveMutation.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                    Lưu
                  </Button>
                </div>
              </div>
              {saveError && (
                <p className="text-xs text-price-down" role="alert">
                  {saveError}
                </p>
              )}

              <SideEditor side={tab} indicators={learned} draft={draftState.draft} errors={errors} dispatch={dispatch} />
            </section>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_260px]">
              <section className="rounded-lg bg-card p-4" aria-label="Giả định backtest">
                <h3 className={LABEL_CLASS}>Giả định backtest</h3>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">Khớp lệnh</span>
                    <select className={SELECT_CLASS} value={execution} onChange={(event) => setExecution(event.target.value as Execution)} aria-label="Khớp lệnh">
                      <option value="next_open">Khớp mở cửa phiên sau</option>
                      <option value="same_close">Khớp đóng cửa cùng phiên · giả định demo</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">Phí giao dịch</span>
                    <select className={SELECT_CLASS} value={feePreset} onChange={(event) => setFeePreset(event.target.value as FeePreset)} aria-label="Phí giao dịch">
                      <option value="standard">Chuẩn · 0,15% / 0,25%</option>
                      <option value="none">Không phí</option>
                    </select>
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Hồ sơ CLEAN_TECH_2.0: 100% tiền mặt khả dụng, lô 100, một vị thế; không ATR stop, không chốt lời, không giới hạn thời gian giữ.
                </p>
              </section>

              <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-card p-4">
                <Button
                  size="lg"
                  className="w-full gap-1.5"
                  onClick={() => runMutation.mutate(buildRequest())}
                  disabled={!!blockedReason || runMutation.isPending}
                >
                  {runMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
                  Chạy backtest
                </Button>
                <span className="text-center text-[11px] text-muted-foreground" data-testid="run-hint">
                  {blockedReason ?? `Chạy trên cấu hình đã lưu #${savedRevision}`}
                </span>
                {dirty && (
                  <Button size="sm" variant="outline" onClick={() => saveMutation.mutate()} disabled={hasErrors || saveMutation.isPending}>
                    Lưu bản nháp
                  </Button>
                )}
              </div>
            </div>

            {runMutation.isError && (
              <p className="rounded-lg bg-card p-3 text-xs text-price-down" role="alert">
                {errorMessage(runMutation.error)}
              </p>
            )}

            {last && (
              <BacktestResults result={last.response.result} symbol={last.symbol} currentRevision={savedRevision} />
            )}

            <ResearchPanel
              saved={draftState.saved}
              registry={registryById}
              buildRequest={buildRequest}
              blockedReason={blockedReason}
              onApply={applyCandidate}
            />
            <SystemPanel buyIndicatorIds={savedBuyIds} buildRequest={buildRequest} blockedReason={blockedReason} />
          </div>
        </div>
      </div>
    </div>
  )
}
