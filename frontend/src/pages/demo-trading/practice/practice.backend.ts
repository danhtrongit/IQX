/**
 * In-memory stand-in for the /api/v2/practice routes used by the tests: it follows the controller
 * rules that matter to the UI (locked config after start, idempotent start and next, revision
 * conflicts, one step at a time, 30 cases and no wrap, a draft in the wrong shape refused, a run
 * locked before SPEC V3 that never finished replaced by a new start).
 */
import { ApiError } from "@/lib/api"
import type { PracticeConfig, PracticeRowConfig, PracticeRun, PracticeState } from "./practice-api"
import { CASE_ID, OUTDATED_RUN_ERROR, briefOf, makeChart, makeHistory, makeRun, makeState, type TradePlan } from "./practice.fixtures"

type Call = { method: string; path: string; body: unknown }
type Failure = { status: number; code: string; message: string; details?: unknown }

export type FakeBackend = {
  state: PracticeState
  runs: Map<string, PracticeRun>
  calls: Call[]
  /** Failures served (once each, in order) by the next start requests. */
  startFailures: Failure[]
  /** Fail the first start with a compute error after locking the run (retry with the same key succeeds). */
  failComputeOnce: boolean
  stateFailure: Failure | null
  plan: TradePlan[] | undefined
  valuation: "ok" | "missing"
  api: (path: string, init?: RequestInit) => Promise<unknown>
  callsTo: (method: string, pattern: RegExp) => Call[]
}

const caseIdFor = (ordinal: number) => (ordinal === 1 ? CASE_ID : `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`)
const runIdFor = (ordinal: number) => `00000000-0000-4000-9000-${String(ordinal).padStart(12, "0")}`

const fail = (failure: Failure): never => {
  throw new ApiError(failure.message, failure.status, { code: failure.code, details: failure.details })
}

type PreviewBody = {
  buy_rows?: PracticeRowConfig[]
  sell_rows?: PracticeRowConfig[]
  buy_params?: Record<string, number>
  sell_params?: Record<string, number>
}

/** The saved draft with the rows / params of a preview applied on top; the tab switches are the draft's. */
function previewSide(current: PracticeConfig["buy"], rows: PracticeRowConfig[] | undefined, params: Record<string, number> | undefined): PracticeConfig["buy"] {
  if (rows) {
    if (!("rules" in current)) fail({ status: 422, code: "PRACTICE_CONFIG_INVALID", message: "Chỉ báo này dùng tham số chung của từng phía, không có điều kiện theo dòng." })
    return { ...(current as { enabled: boolean }), rules: rows }
  }
  if (params) {
    if ("rules" in current) fail({ status: 422, code: "PRACTICE_CONFIG_INVALID", message: "Chỉ báo này dùng điều kiện theo dòng, không có tham số chung của một phía." })
    return { ...(current as PracticeConfig["buy"] & { params: Record<string, number> }), params }
  }
  return current
}

/** A draft has the shape of the indicator's form (rows or params), as the server's draft save requires. */
function hasFormShape(state: PracticeState, draft: PracticeConfig): boolean {
  const rowsForm = state.form.model === "rows"
  return (["buy", "sell"] as const).every((side) => ("rules" in draft[side]) === rowsForm)
}

export function createBackend(options: { state?: Partial<PracticeState>; runs?: PracticeRun[]; indicatorId?: string } = {}): FakeBackend {
  const backend: FakeBackend = {
    state: makeState(options.state, options.indicatorId),
    runs: new Map((options.runs ?? []).map((run) => [run.run_id, run])),
    calls: [],
    startFailures: [],
    failComputeOnce: false,
    stateFailure: null,
    plan: undefined,
    valuation: "ok",
    api: async () => undefined,
    callsTo: (method, pattern) => backend.calls.filter((call) => call.method === method && pattern.test(call.path)),
  }
  const idempotentRuns = new Map<string, string>()
  const advanceKeys = new Map<string, number>()
  /** A run locked before SPEC V3 that never finished: it does not lock the draft and a new start replaces it. */
  const outdated = () => backend.state.current_run?.error?.code === OUTDATED_RUN_ERROR.code

  const lockRun = (config: PracticeConfig, status: "succeeded" | "failed", key: string): PracticeRun => {
    const state = backend.state
    const indicatorId = state.indicator.id
    const run: PracticeRun =
      status === "succeeded"
        ? makeRun({ indicatorId, runId: runIdFor(state.ordinal), ordinal: state.ordinal, caseId: state.case.case_id, config, plan: backend.plan, valuation: backend.valuation })
        : {
            ...makeRun({ indicatorId, runId: runIdFor(state.ordinal), ordinal: state.ordinal, caseId: state.case.case_id, config, test: 5 }),
            status: "failed",
            result: null,
            chart: null,
            completed_at: null,
            error: { code: "PRACTICE_COMPUTE_FAILED", message: "Không tính được kết quả lượt này. Lượt vẫn được giữ để thử lại." },
          }
    // A new start replaces the unfinished run of the same case (only a run locked before SPEC V3 can be replaced).
    const replaced = state.current_run && state.current_run.run_id !== run.run_id && outdated() ? state.current_run.run_id : null
    if (replaced) backend.runs.delete(replaced)
    backend.runs.set(run.run_id, run)
    idempotentRuns.set(key, run.run_id)
    const others = state.runs.filter((item) => item.ordinal !== run.ordinal)
    backend.state = {
      ...state,
      draft: config,
      draft_revision: state.draft_revision + 1,
      current_run: briefOf(run),
      runs: [...others, briefOf(run)],
      status: status === "failed" ? "failed" : state.ordinal >= state.total ? "set_completed" : "completed",
      can_start: false,
      can_retry: status === "failed",
      can_next: status === "succeeded" && state.ordinal < state.total,
      completed_count: [...others, briefOf(run)].filter((item) => item.status === "succeeded").length,
    }
    return run
  }

  backend.api = async (path, init) => {
    const method = init?.method ?? "GET"
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined
    backend.calls.push({ method, path, body })
    const [route] = path.split("?")
    const segments = route.split("/").filter(Boolean) // practice, :id, tail

    if (segments[0] !== "practice") return {}
    if (segments[1] === "runs" && method === "GET") {
      const run = backend.runs.get(segments[2] ?? "")
      return run ? structuredClone(run) : fail({ status: 404, code: "PRACTICE_RUN_NOT_FOUND", message: "Không tìm thấy lượt luyện tập." })
    }
    const tail = segments[2]
    if (tail === "state") {
      if (backend.stateFailure) fail(backend.stateFailure)
      return structuredClone(backend.state)
    }
    if (tail === "draft" && method === "PUT") {
      const input = body as { expected_revision: number; draft: PracticeConfig }
      if (backend.state.current_run && !outdated()) fail({ status: 409, code: "PRACTICE_RUN_LOCKED", message: "Cấu hình đã khóa sau khi bắt đầu lượt này." })
      if (!hasFormShape(backend.state, input.draft)) {
        fail({ status: 422, code: "PRACTICE_CONFIG_INVALID", message: "Định dạng điều kiện cũ không còn được hỗ trợ. Tải lại để dùng mẫu điều kiện mới." })
      }
      if (input.expected_revision !== backend.state.draft_revision) {
        fail({ status: 409, code: "DRAFT_REVISION_CONFLICT", message: "Bản nháp đã được lưu ở nơi khác." })
      }
      backend.state = { ...backend.state, draft: input.draft, draft_revision: backend.state.draft_revision + 1 }
      return { draft: input.draft, draft_revision: backend.state.draft_revision, validation: { valid: true, errors: [] } }
    }
    if (tail === "preview") {
      const input = body as PreviewBody
      const draft = backend.state.draft
      const config = {
        buy: previewSide(draft.buy, input.buy_rows, input.buy_params),
        sell: previewSide(draft.sell, input.sell_rows, input.sell_params),
        hold_max_sessions: draft.hold_max_sessions,
      } as PracticeConfig
      return {
        ordinal: backend.state.ordinal,
        case_id: backend.state.case.case_id,
        window_bars: 130,
        chart: makeChart({ indicatorId: backend.state.indicator.id, test: 0, config }),
        data_notes: [],
      }
    }
    if (tail === "runs" && method === "POST") {
      const input = body as { idempotency_key: string; ordinal: number; case_id: string; config: PracticeConfig }
      const known = idempotentRuns.get(input.idempotency_key)
      if (known) {
        const stored = backend.runs.get(known)
        if (stored?.status === "failed") {
          const done = lockRun(stored.config, "succeeded", input.idempotency_key)
          return structuredClone(done)
        }
        return structuredClone(stored)
      }
      const failure = backend.startFailures.shift()
      if (failure) fail(failure)
      if (input.ordinal !== backend.state.ordinal || input.case_id !== backend.state.case.case_id) {
        fail({ status: 409, code: "PRACTICE_CASE_MISMATCH", message: "Tình huống hiện tại đã thay đổi ở nơi khác." })
      }
      if (backend.state.current_run && backend.state.current_run.status !== "failed") {
        fail({ status: 409, code: "PRACTICE_RUN_LOCKED", message: "Lượt này đã được bắt đầu." })
      }
      if (backend.failComputeOnce) {
        backend.failComputeOnce = false
        lockRun(input.config, "failed", input.idempotency_key)
        fail({ status: 500, code: "PRACTICE_COMPUTE_FAILED", message: "Không tính được kết quả lượt này. Lượt vẫn được giữ để thử lại." })
      }
      return structuredClone(lockRun(input.config, "succeeded", input.idempotency_key))
    }
    if (tail === "next" && method === "POST") {
      const input = body as { expected_cursor: number; idempotency_key: string }
      if (advanceKeys.has(input.idempotency_key)) return structuredClone(backend.state)
      if (input.expected_cursor !== backend.state.ordinal) {
        fail({ status: 409, code: "PRACTICE_CURSOR_MISMATCH", message: "Tiến trình đã thay đổi ở nơi khác." })
      }
      if (backend.state.ordinal >= backend.state.total) {
        fail({ status: 409, code: "PRACTICE_SET_COMPLETED", message: "Bạn đã hoàn thành cả 30 tình huống của bộ này." })
      }
      if (backend.state.current_run?.status !== "succeeded") {
        fail({ status: 409, code: "PRACTICE_RUN_NOT_COMPLETED", message: "Hoàn thành lượt hiện tại trước." })
      }
      advanceKeys.set(input.idempotency_key, backend.state.ordinal)
      const ordinal = backend.state.ordinal + 1
      backend.state = {
        ...backend.state,
        ordinal,
        status: "ready",
        case: { case_id: caseIdFor(ordinal), ordinal, window_bars: 130 },
        current_run: null,
        can_start: true,
        can_retry: false,
        can_next: false,
      }
      return structuredClone(backend.state)
    }
    if (tail === "history") return makeHistory([...backend.runs.values()].filter((run) => run.status === "succeeded").sort((a, b) => a.ordinal - b.ordinal))
    return {}
  }
  return backend
}
