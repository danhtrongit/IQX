import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { ApiError } from "@/lib/api"
import type { DraftStatus, PracticeContextValue, PracticePhase } from "./practice-context"
import {
  PRACTICE_INDICATORS,
  classifyPracticeError,
  fetchPracticePreview,
  fetchPracticeRun,
  fetchPracticeState,
  newIdempotencyKey,
  nextPracticeCase,
  practiceKeys,
  savePracticeDraft,
  startPracticeRun,
  type PracticeConfig,
  type PracticeFailure,
  type PracticeOp,
  type PracticeRun,
  type PracticeState,
  type Side,
} from "./practice-api"
import {
  configSignature,
  resetSide as resetSideForm,
  sideParams,
  toConfig,
  toFormState,
  validatePracticeForm,
  type PracticeFormState,
} from "./practice-model"
import {
  EMPTY_PLAYBACK,
  createPlaybackControls,
  createPlaybackStore,
  pausePlayback,
  usePlayback,
} from "./practice-playback"
import { useDebouncedValue } from "./use-debounced-value"

const DRAFT_DEBOUNCE_MS = 700
const PREVIEW_DEBOUNCE_MS = 450
/** How long the primary actions stay disarmed after the phase changed. */
export const ACTION_ARM_MS = 500

type PreviewParams = { buy_params: Record<string, number>; sell_params: Record<string, number> }

type Saver = {
  timer: ReturnType<typeof setTimeout> | null
  inFlight: boolean
  pending: PracticeConfig | null
  revision: number
  /** Set from Start until the next case: the draft is under a locked run and must not be written. */
  blocked: boolean
}

const retryWhenTransient = (count: number, error: unknown): boolean =>
  count < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500)

/**
 * State machine of the mini practice for one indicator (null = inactive, every query disabled).
 * Owns: the server state, the editable form and its debounced draft save, the chart preview, the
 * locked run, start/retry/next with idempotency keys, and the replay store.
 */
export function usePracticeController(indicatorId: string | null): PracticeContextValue | null {
  const queryClient = useQueryClient()
  const enabled = indicatorId !== null
  const id = indicatorId ?? ""

  // Local state is scoped to one indicator and starts over when it changes.
  const [scope, setScope] = useState(indicatorId)
  const [form, setForm] = useState<PracticeFormState | null>(null)
  const [seedKey, setSeedKey] = useState<string | null>(null)
  const [seedRevision, setSeedRevision] = useState(0)
  /** The viewer edited the form since it was seeded: a newer server draft must not overwrite it. */
  const [dirty, setDirty] = useState(false)
  const [side, setSide] = useState<Side>("buy")
  const [viewRunId, setViewRunId] = useState<string | null>(null)
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("idle")
  if (scope !== indicatorId) {
    setScope(indicatorId)
    setForm(null)
    setSeedKey(null)
    setSeedRevision(0)
    setDirty(false)
    setSide("buy")
    setViewRunId(null)
    setDraftStatus("idle")
  }

  const [playbackStore] = useState(createPlaybackStore)

  // ------------------------------------------------------------------ server state
  const stateQuery = useQuery({
    queryKey: practiceKeys.state(id),
    queryFn: ({ signal }) => fetchPracticeState(id, signal),
    enabled,
    refetchOnWindowFocus: false,
    retry: retryWhenTransient,
  })
  const state: PracticeState | null = stateQuery.data ?? null
  const spec = state?.form ?? null

  // Seed the editable form from the server draft: once per case, and again when a newer draft
  // arrives (another tab / a cached state) as long as this viewer has not edited anything yet.
  const caseKey = state && indicatorId ? `${indicatorId}:${state.case.case_id}` : null
  if (state && (caseKey !== seedKey || (!dirty && state.draft_revision !== seedRevision))) {
    setSeedKey(caseKey)
    setSeedRevision(state.draft_revision)
    setDirty(false)
    setForm(toFormState(state.draft))
  }

  // ------------------------------------------------------------------ draft autosave
  const saverRef = useRef<Saver>({ timer: null, inFlight: false, pending: null, revision: 1, blocked: false })

  const flush = useCallback(async (): Promise<void> => {
    const saver = saverRef.current
    if (!id || saver.inFlight || saver.blocked || !saver.pending) return
    const config = saver.pending
    saver.pending = null
    saver.inFlight = true
    setDraftStatus("saving")
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const saved = await savePracticeDraft(id, saver.revision, config)
          saver.revision = saved.draft_revision
          // Keep the cached state in step, so coming back to this screen starts from what was saved.
          queryClient.setQueryData<PracticeState>(practiceKeys.state(id), (old) =>
            old ? { ...old, draft: saved.draft, draft_revision: saved.draft_revision, validation: saved.validation } : old,
          )
          setDraftStatus("saved")
          break
        } catch (error) {
          const code = error instanceof ApiError ? error.code : undefined
          if (code === "DRAFT_REVISION_CONFLICT" && attempt < 2) {
            // Another tab saved first: take its revision and write this tab's latest edit on top of it.
            const fresh = await queryClient.fetchQuery({ queryKey: practiceKeys.state(id), queryFn: () => fetchPracticeState(id), staleTime: 0 })
            saver.revision = fresh.draft_revision
            continue
          }
          if (code === "PRACTICE_RUN_LOCKED") {
            saver.blocked = true
            setDraftStatus("idle")
            void queryClient.invalidateQueries({ queryKey: practiceKeys.state(id) })
          } else {
            setDraftStatus("error")
          }
          break
        }
      }
    } finally {
      saver.inFlight = false
      if (saver.pending) void flush()
    }
  }, [id, queryClient])

  const scheduleSave = useCallback(
    (next: PracticeFormState) => {
      if (!spec) return
      const config = toConfig(next, spec)
      // Half-typed values are not written; the last complete draft stays on the server.
      if (!config) return
      const saver = saverRef.current
      saver.pending = config
      if (saver.timer) clearTimeout(saver.timer)
      saver.timer = setTimeout(() => {
        saver.timer = null
        void flush()
      }, DRAFT_DEBOUNCE_MS)
    },
    [spec, flush],
  )

  const serverRevision = state?.draft_revision
  const serverCaseId = state?.case.case_id
  useEffect(() => {
    if (serverRevision !== undefined) saverRef.current.revision = Math.max(saverRef.current.revision, serverRevision)
  }, [serverRevision])
  useEffect(() => {
    const saver = saverRef.current
    saver.pending = null
    saver.blocked = false
    if (saver.timer) clearTimeout(saver.timer)
    saver.timer = null
  }, [serverCaseId])
  // Leaving the screen (or switching indicator) writes the last pending edit right away.
  useEffect(() => {
    const saver = saverRef.current
    return () => {
      if (saver.timer) clearTimeout(saver.timer)
      saver.timer = null
      if (saver.pending) void flush()
    }
  }, [flush])

  // ------------------------------------------------------------------ run
  const startKeyRef = useRef<{ signature: string; key: string } | null>(null)
  const startedRunRef = useRef<string | null>(null)

  const startMutation = useMutation<PracticeRun, unknown, { key: string; config: PracticeConfig }>({
    mutationFn: ({ key, config }) => {
      if (!state) return Promise.reject(new Error("practice state is not loaded"))
      return startPracticeRun(id, { idempotency_key: key, ordinal: state.case.ordinal, case_id: state.case.case_id, config })
    },
    onSuccess: (run) => {
      startKeyRef.current = null
      startedRunRef.current = run.run_id
      queryClient.setQueryData(practiceKeys.run(run.run_id), run)
      void queryClient.invalidateQueries({ queryKey: practiceKeys.state(id) })
    },
    onError: (error) => {
      const kind = classifyPracticeError(error).kind
      void queryClient.invalidateQueries({ queryKey: practiceKeys.state(id) })
      // Nothing was locked: let the draft be saved again.
      if (kind === "invalid" || kind === "data_unavailable" || kind === "network" || kind === "unknown") saverRef.current.blocked = false
    },
  })
  const { reset: resetStartMutation } = startMutation
  const startedRaw = startMutation.data ?? null
  // A start result only belongs to the screen while it is the run of the case being shown.
  const startedRun = startedRaw && startedRaw.indicator_id === indicatorId && state?.case.case_id === startedRaw.case_id ? startedRaw : null

  const currentBrief = state?.current_run ?? null
  const currentRunId = currentBrief?.run_id ?? startedRun?.run_id ?? null
  const displayedRunId = viewRunId ?? currentRunId
  const viewingPast = viewRunId !== null && viewRunId !== currentRunId

  const runQuery = useQuery({
    queryKey: practiceKeys.run(displayedRunId ?? ""),
    queryFn: ({ signal }) => fetchPracticeRun(displayedRunId ?? "", signal),
    enabled: enabled && displayedRunId !== null,
    refetchOnWindowFocus: false,
    // A succeeded run is immutable; a computing/failed one is re-read.
    staleTime: (query) => (query.state.data?.status === "succeeded" ? Infinity : 0),
    // A run another request is still computing is polled until it has its immutable result.
    refetchInterval: (query) => (query.state.data?.status === "computing" ? 2500 : false),
    retry: retryWhenTransient,
  })
  const run: PracticeRun | null = displayedRunId !== null ? (runQuery.data ?? (startedRun?.run_id === displayedRunId ? startedRun : null)) : null
  const succeeded = run?.status === "succeeded" && run.result !== null && run.chart !== null

  const lockedConfig: PracticeConfig | null = run?.config ?? (displayedRunId !== null && state ? state.draft : null)
  const locked = displayedRunId !== null || startMutation.isPending

  const runStatus = run?.status
  const briefStatus = currentBrief?.status
  useEffect(() => {
    // The run finished behind the server state's back (polled): refresh the state (can_next, counts).
    if (enabled && runStatus === "succeeded" && briefStatus !== undefined && briefStatus !== "succeeded") {
      void queryClient.invalidateQueries({ queryKey: practiceKeys.state(id) })
    }
  }, [enabled, runStatus, briefStatus, queryClient, id])

  // ------------------------------------------------------------------ replay
  useEffect(() => {
    if (!enabled || displayedRunId === null) {
      playbackStore.set(EMPTY_PLAYBACK)
      return
    }
    if (!run || run.status !== "succeeded" || !run.result) return
    if (playbackStore.get().runId === run.run_id) return
    const controls = createPlaybackControls(playbackStore, run.run_id, run.result.last_session)
    if (viewingPast) controls.attach("complete")
    else if (startedRunRef.current === run.run_id) controls.attach("fresh")
    else controls.attach("restore")
  }, [enabled, displayedRunId, run, viewingPast, playbackStore])

  const playbackControls = useMemo(
    () => (succeeded && run?.result ? createPlaybackControls(playbackStore, run.run_id, run.result.last_session) : null),
    [succeeded, run, playbackStore],
  )
  const attachedRunId = usePlayback(playbackStore, (value) => value.runId)
  const attachedDone = usePlayback(playbackStore, (value) => value.done)
  const replayDone = succeeded && attachedRunId === run?.run_id && attachedDone

  // ------------------------------------------------------------------ preview (observation window only)
  const shownForm = useMemo(() => (lockedConfig ? toFormState(lockedConfig) : form), [lockedConfig, form])
  const validation = useMemo(() => (shownForm && spec ? validatePracticeForm(shownForm, spec) : null), [shownForm, spec])
  const previewKey = useMemo(() => {
    if (!shownForm || !spec || !validation?.paramsValid) return ""
    const buy = sideParams(shownForm.buy, spec.buy.fields)
    const sell = sideParams(shownForm.sell, spec.sell.fields)
    return buy && sell ? JSON.stringify({ buy_params: buy, sell_params: sell }) : ""
  }, [shownForm, spec, validation])
  const debouncedPreviewKey = useDebouncedValue(previewKey, PREVIEW_DEBOUNCE_MS)
  const previewParams = useMemo(() => (debouncedPreviewKey ? (JSON.parse(debouncedPreviewKey) as PreviewParams) : null), [debouncedPreviewKey])
  const previewQuery = useQuery({
    queryKey: practiceKeys.preview(id, state?.case.case_id ?? "", debouncedPreviewKey),
    queryFn: ({ signal }) => fetchPracticePreview(id, previewParams ?? { buy_params: {}, sell_params: {} }, signal),
    enabled: enabled && !!state && previewParams !== null && !succeeded && viewRunId === null,
    placeholderData: keepPreviousData,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: retryWhenTransient,
  })

  // ------------------------------------------------------------------ actions
  const edit = useCallback(
    (update: (current: PracticeFormState) => PracticeFormState) => {
      if (!form || locked) return
      const next = update(form)
      setForm(next)
      setDirty(true)
      scheduleSave(next)
    },
    [form, locked, scheduleSave],
  )
  const editEnabled = useCallback(
    (target: Side, value: boolean) => edit((current) => ({ ...current, [target]: { ...current[target], enabled: value } })),
    [edit],
  )
  const editParam = useCallback(
    (target: Side, key: string, text: string) =>
      edit((current) => ({ ...current, [target]: { ...current[target], params: { ...current[target].params, [key]: text } } })),
    [edit],
  )
  const editOp = useCallback(
    (target: Side, ruleId: string, op: PracticeOp) =>
      edit((current) => ({ ...current, [target]: { ...current[target], ops: { ...current[target].ops, [ruleId]: op } } })),
    [edit],
  )
  const editHold = useCallback((text: string) => edit((current) => ({ ...current, hold: text })), [edit])
  const resetSide = useCallback(() => {
    if (spec) edit((current) => resetSideForm(current, spec, side))
  }, [edit, spec, side])

  const startGuard = useRef(false)
  const runStart = useCallback(
    async (config: PracticeConfig): Promise<boolean> => {
      if (!state || startGuard.current) return false
      startGuard.current = true
      const saver = saverRef.current
      if (saver.timer) clearTimeout(saver.timer)
      saver.timer = null
      saver.pending = null
      saver.blocked = true
      const signature = `${state.case.case_id}|${configSignature(config)}`
      if (startKeyRef.current?.signature !== signature) startKeyRef.current = { signature, key: newIdempotencyKey() }
      try {
        await startMutation.mutateAsync({ key: startKeyRef.current.key, config })
        return true
      } catch {
        return false
      } finally {
        startGuard.current = false
      }
    },
    [state, startMutation],
  )

  const start = useCallback(async (): Promise<boolean> => {
    if (!spec || !form || !validation?.valid || displayedRunId !== null) return false
    const config = toConfig(form, spec)
    return config ? runStart(config) : false
  }, [spec, form, validation, displayedRunId, runStart])

  const retryStart = useCallback(async (): Promise<boolean> => {
    if (!state?.can_retry) return false
    // The locked config of the failed run is re-sent unchanged (same case, same key while it is kept).
    const config = run?.config ?? state.draft
    return runStart(config)
  }, [state, run, runStart])

  const nextGuard = useRef(false)
  const nextKeyRef = useRef<{ ordinal: number; key: string } | null>(null)
  const nextMutation = useMutation<PracticeState, unknown, { ordinal: number; key: string }>({
    mutationFn: ({ ordinal, key }) => nextPracticeCase(id, ordinal, key),
    onSuccess: (fresh) => {
      nextKeyRef.current = null
      queryClient.setQueryData(practiceKeys.state(id), fresh)
      startMutation.reset()
      setViewRunId(null)
      playbackStore.set(EMPTY_PLAYBACK)
    },
    onError: (error) => {
      if (classifyPracticeError(error).kind === "stale") void queryClient.invalidateQueries({ queryKey: practiceKeys.state(id) })
    },
  })
  const canNext = !!state?.can_next && replayDone && !viewingPast
  const next = useCallback(async (): Promise<void> => {
    if (!state || !canNext || nextGuard.current) return
    nextGuard.current = true
    if (nextKeyRef.current?.ordinal !== state.ordinal) nextKeyRef.current = { ordinal: state.ordinal, key: newIdempotencyKey() }
    try {
      await nextMutation.mutateAsync({ ordinal: state.ordinal, key: nextKeyRef.current.key })
    } catch {
      // The failure is shown from nextMutation.error.
    } finally {
      nextGuard.current = false
    }
  }, [state, canNext, nextMutation])

  const { reset: resetNextMutation } = nextMutation
  useEffect(() => {
    resetStartMutation()
    resetNextMutation()
    startKeyRef.current = null
    nextKeyRef.current = null
  }, [indicatorId, resetStartMutation, resetNextMutation])

  const viewRun = useCallback(
    (runId: string | null) => {
      pausePlayback(playbackStore)
      setViewRunId(runId)
    },
    [playbackStore],
  )

  const startErrored = startMutation.isError
  const reload = useCallback(() => {
    // A stale-tab notice is answered by re-reading the server state; the notice itself is dropped.
    if (startErrored) resetStartMutation()
    resetNextMutation()
    void queryClient.invalidateQueries({ queryKey: practiceKeys.state(id) })
    void queryClient.invalidateQueries({ queryKey: ["practice", "run"] })
  }, [queryClient, id, startErrored, resetStartMutation, resetNextMutation])
  const refetchPreview = previewQuery.refetch
  const retryPreview = useCallback(() => {
    void refetchPreview()
  }, [refetchPreview])

  // ------------------------------------------------------------------ derived
  const phase: PracticePhase = !state
    ? stateQuery.isError
      ? "error"
      : "loading"
    : viewingPast
      ? "viewing_past"
      : startMutation.isPending
        ? "starting"
        : displayedRunId === null
          ? "ready"
          : run?.status === "failed" || (!run && currentBrief?.status === "failed")
            ? "failed"
            : succeeded
              ? replayDone
                ? state.status === "set_completed" || state.ordinal >= state.total
                  ? "set_completed"
                  : "completed"
                : "replaying"
              : run?.status === "computing" || currentBrief?.status === "computing"
                ? "computing"
                : "loading"

  const settledPhase = useDebouncedValue(phase, ACTION_ARM_MS)
  const actionsArmed = settledPhase === phase

  // An older run being opened never borrows the preview of the current case while it loads.
  const chart = succeeded ? run?.chart ?? null : viewRunId !== null ? null : (previewQuery.data?.chart ?? null)
  const startError = startMutation.error
  const nextError = nextMutation.error
  const startFailure = useMemo(() => (startError ? classifyPracticeError(startError) : null), [startError])
  const nextFailure = useMemo(() => (nextError ? classifyPracticeError(nextError) : null), [nextError])
  const runError = runQuery.error
  const runFailure = useMemo<PracticeFailure | null>(() => {
    if (runError) return classifyPracticeError(runError)
    if (run?.status === "failed") {
      return { kind: "compute_failed", message: "Không tính được kết quả lượt này. Lượt vẫn được giữ để thử lại." }
    }
    return null
  }, [runError, run?.status])
  const loadFailure = useMemo(() => (stateQuery.error ? classifyPracticeError(stateQuery.error) : null), [stateQuery.error])
  const previewError = previewQuery.error
  const previewFailure = useMemo(() => (previewError ? classifyPracticeError(previewError) : null), [previewError])

  return useMemo<PracticeContextValue | null>(() => {
    if (!indicatorId) return null
    return {
      indicatorId,
      indicatorName: state?.indicator.name ?? PRACTICE_INDICATORS[indicatorId]?.name ?? indicatorId,
      state,
      spec,
      phase,
      loadFailure,
      reload,
      side,
      setSide,
      form: shownForm,
      validation,
      locked,
      draftStatus,
      editEnabled,
      editParam,
      editOp,
      editHold,
      resetSide,
      preview: previewQuery.data ?? null,
      previewFetching: previewQuery.isFetching,
      previewFailure,
      retryPreview,
      run,
      runFailure,
      chart,
      lockedConfig,
      start,
      retryStart,
      startPending: startMutation.isPending,
      startFailure,
      next,
      nextPending: nextMutation.isPending,
      nextFailure,
      viewRun,
      viewingPast,
      replayDone,
      canNext,
      actionsArmed,
      playbackStore,
      playbackControls,
    }
  }, [
    indicatorId,
    state,
    spec,
    phase,
    loadFailure,
    reload,
    side,
    shownForm,
    validation,
    locked,
    draftStatus,
    editEnabled,
    editParam,
    editOp,
    editHold,
    resetSide,
    previewQuery.data,
    previewQuery.isFetching,
    previewFailure,
    retryPreview,
    run,
    runFailure,
    chart,
    lockedConfig,
    start,
    retryStart,
    startMutation.isPending,
    startFailure,
    next,
    nextMutation.isPending,
    nextFailure,
    viewRun,
    viewingPast,
    replayDone,
    canNext,
    actionsArmed,
    playbackStore,
    playbackControls,
  ])
}
