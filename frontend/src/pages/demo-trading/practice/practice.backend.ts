/**
 * In-memory stand-in for the /api/v2/practice routes used by the tests and the screenshot script:
 * it follows the controller rules that matter to the UI (locked config after start, idempotent start
 * and next, revision conflicts, one step at a time, 30 cases and no wrap).
 */
import { ApiError } from "@/lib/api"
import type { PracticeConfig, PracticeRun, PracticeState } from "./practice-api"
import { CASE_ID, briefOf, makeChart, makeHistory, makeRun, makeState, type TradePlan } from "./practice.fixtures"

type Call = { method: string; path: string; body: unknown }
type Failure = { status: number; code: string; message: string }

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
  throw new ApiError(failure.message, failure.status, { code: failure.code })
}

export function createBackend(options: { state?: Partial<PracticeState>; runs?: PracticeRun[] } = {}): FakeBackend {
  const backend: FakeBackend = {
    state: makeState(options.state),
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

  const lockRun = (config: PracticeConfig, status: "succeeded" | "failed", key: string): PracticeRun => {
    const state = backend.state
    const run: PracticeRun =
      status === "succeeded"
        ? makeRun({ runId: runIdFor(state.ordinal), ordinal: state.ordinal, caseId: state.case.case_id, config, plan: backend.plan, valuation: backend.valuation })
        : {
            ...makeRun({ runId: runIdFor(state.ordinal), ordinal: state.ordinal, caseId: state.case.case_id, config, test: 5 }),
            status: "failed",
            result: null,
            chart: null,
            completed_at: null,
            error: { code: "PRACTICE_COMPUTE_FAILED", message: "Không tính được kết quả lượt này. Lượt vẫn được giữ để thử lại." },
          }
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
      if (backend.state.current_run) fail({ status: 409, code: "PRACTICE_RUN_LOCKED", message: "Cấu hình đã khóa sau khi bắt đầu lượt này." })
      if (input.expected_revision !== backend.state.draft_revision) {
        fail({ status: 409, code: "DRAFT_REVISION_CONFLICT", message: "Bản nháp đã được lưu ở nơi khác." })
      }
      backend.state = { ...backend.state, draft: input.draft, draft_revision: backend.state.draft_revision + 1 }
      return { draft: input.draft, draft_revision: backend.state.draft_revision, validation: { valid: true, errors: [] } }
    }
    if (tail === "preview") {
      const input = body as { buy_params?: Record<string, number>; sell_params?: Record<string, number> }
      return {
        ordinal: backend.state.ordinal,
        case_id: backend.state.case.case_id,
        window_bars: 130,
        chart: makeChart({
          indicatorId: "rsi",
          test: 0,
          params: { buy: input.buy_params ?? backend.state.draft.buy.params, sell: input.sell_params ?? backend.state.draft.sell.params },
        }),
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
