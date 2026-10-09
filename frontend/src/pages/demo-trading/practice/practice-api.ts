/**
 * Mini practice ("luyện tập") API: typed wrappers over the generated contract plus the
 * classification of every failure the screen has to explain.
 *
 * No payload of this module carries a symbol, a company or a calendar date; sessions are
 * addressed as "Phiên n" only.
 */
import { ApiError } from "@/lib/api"
import { requestOperation } from "@/lib/contract-client"
import type { ApiResponseFor } from "@/lib/contract-types"

export type Side = "buy" | "sell"
export type PracticeOp = ">" | "<" | "∈" | "∉"

export type PracticeState = ApiResponseFor<"GET /api/v2/practice/{indicatorId}/state">
export type PracticeConfig = PracticeState["draft"]
export type PracticeSideConfig = PracticeConfig["buy"]
export type PracticeForm = PracticeState["form"]
export type PracticeFormSide = PracticeForm["buy"]
export type PracticeFormField = PracticeFormSide["fields"][number]
export type PracticeFormRule = PracticeFormSide["rules"][number]
export type PracticeOperand = PracticeFormRule["lhs"]
export type PracticeRunBrief = PracticeState["runs"][number]
export type PracticeProfile = PracticeState["profile"]

export type PracticeRun = ApiResponseFor<"GET /api/v2/practice/runs/{runId}">
export type PracticeResult = NonNullable<PracticeRun["result"]>
export type PracticeChart = NonNullable<PracticeRun["chart"]>
export type PracticePlot = PracticeChart["plot"]["buy"]
export type PracticeTrade = PracticeResult["trades"][number]
export type PracticeEvent = PracticeResult["events"][number]
export type PracticeEvidence = PracticeTrade["buy"]["evidence"]
export type PracticeRuleEvidence = PracticeEvidence["rules"][number]

export type PracticePreview = ApiResponseFor<"POST /api/v2/practice/{indicatorId}/preview">
export type PracticeHistory = ApiResponseFor<"GET /api/v2/practice/{indicatorId}/history">
export type PracticeHistoryItem = PracticeHistory["items"][number]
export type PracticeDraftSaved = ApiResponseFor<"PUT /api/v2/practice/{indicatorId}/draft">

export const PRACTICE_TOTAL = 30
export const HOLD_DEFAULT = 60
export const HOLD_MIN = 1
export const HOLD_MAX = 1000

export const practiceKeys = {
  state: (indicatorId: string) => ["practice", "state", indicatorId] as const,
  run: (runId: string) => ["practice", "run", runId] as const,
  preview: (indicatorId: string, caseId: string, params: string) =>
    ["practice", "preview", indicatorId, caseId, params] as const,
  history: (indicatorId: string) => ["practice", "history", indicatorId] as const,
}

export function fetchPracticeState(indicatorId: string, signal?: AbortSignal): Promise<PracticeState> {
  return requestOperation("GET /api/v2/practice/{indicatorId}/state", { path: { indicatorId } }, { signal })
}

export function savePracticeDraft(indicatorId: string, expectedRevision: number, draft: PracticeConfig): Promise<PracticeDraftSaved> {
  return requestOperation("PUT /api/v2/practice/{indicatorId}/draft", {
    path: { indicatorId },
    body: { expected_revision: expectedRevision, draft },
  })
}

export function fetchPracticePreview(
  indicatorId: string,
  params: { buy_params?: Record<string, number>; sell_params?: Record<string, number> },
  signal?: AbortSignal,
): Promise<PracticePreview> {
  return requestOperation("POST /api/v2/practice/{indicatorId}/preview", { path: { indicatorId }, body: params }, { signal })
}

export function startPracticeRun(
  indicatorId: string,
  body: { idempotency_key: string; ordinal: number; case_id: string; config: PracticeConfig },
): Promise<PracticeRun> {
  return requestOperation("POST /api/v2/practice/{indicatorId}/runs", { path: { indicatorId }, body })
}

export function fetchPracticeRun(runId: string, signal?: AbortSignal): Promise<PracticeRun> {
  return requestOperation("GET /api/v2/practice/runs/{runId}", { path: { runId } }, { signal })
}

export function nextPracticeCase(indicatorId: string, expectedCursor: number, idempotencyKey: string): Promise<PracticeState> {
  return requestOperation("POST /api/v2/practice/{indicatorId}/next", {
    path: { indicatorId },
    body: { expected_cursor: expectedCursor, idempotency_key: idempotencyKey },
  })
}

export function fetchPracticeHistory(indicatorId: string, signal?: AbortSignal): Promise<PracticeHistory> {
  return requestOperation(
    "GET /api/v2/practice/{indicatorId}/history",
    { path: { indicatorId }, query: { page: 1, page_size: PRACTICE_TOTAL } },
    { signal },
  )
}

/** A fresh idempotency key (>= 8 chars). */
export function newIdempotencyKey(): string {
  const cryptoApi = typeof globalThis.crypto === "object" ? globalThis.crypto : undefined
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID()
  return `practice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** Academy lesson (`view=academy&lesson=<id>`) that grants each practice indicator. */
export const PRACTICE_INDICATORS: Readonly<Record<string, { name: string; lessonId: string }>> = {
  rsi: { name: "RSI", lessonId: "ch01-l01" },
  macd: { name: "MACD", lessonId: "ch01-l02" },
  ma: { name: "MA / SMA", lessonId: "ch01-l03" },
  bollinger: { name: "Bollinger Bands", lessonId: "ch01-l04" },
  volume: { name: "Khối lượng", lessonId: "ch01-l05" },
  ema: { name: "EMA", lessonId: "ch05-l01" },
  ma_cross: { name: "MA Cross", lessonId: "ch05-l02" },
  dmi: { name: "DMI", lessonId: "ch05-l03" },
  stochastic: { name: "Stochastic", lessonId: "ch05-l04" },
  cci: { name: "CCI", lessonId: "ch05-l05" },
  obv: { name: "OBV", lessonId: "ch07-l01" },
  mfi: { name: "MFI", lessonId: "ch07-l02" },
  cmf: { name: "Chaikin Money Flow", lessonId: "ch07-l03" },
  donchian: { name: "Donchian Channel", lessonId: "ch10-l01" },
  roc: { name: "ROC", lessonId: "ch10-l02" },
  williams_r: { name: "Williams %R", lessonId: "ch10-l03" },
}

export function lessonLink(indicatorId: string): string | null {
  const lesson = PRACTICE_INDICATORS[indicatorId]?.lessonId
  return lesson ? `/demo-trading?view=academy&lesson=${encodeURIComponent(lesson)}` : null
}

/** `?practice=` value when it looks like an indicator id, else null. */
export function parsePracticeParam(value: string | null | undefined): string | null {
  return value && /^[a-z][a-z0-9_]{0,31}$/.test(value) ? value : null
}

export type PracticeFailure =
  | { kind: "not_granted"; message: string }
  | { kind: "not_found"; message: string }
  /** Frozen data of the case is missing or too short; the case is not consumed. */
  | { kind: "data_unavailable"; message: string }
  /** The run is locked but its result could not be computed; retry with the same key. */
  | { kind: "compute_failed"; message: string }
  /** Another tab / device changed the case, cursor or run. */
  | { kind: "stale"; message: string }
  | { kind: "invalid"; message: string; details: string[] }
  | { kind: "set_completed"; message: string }
  | { kind: "network"; message: string }
  | { kind: "unknown"; message: string }

function detailMessages(details: unknown): string[] {
  if (!Array.isArray(details)) return []
  return details
    .map((item) => (item && typeof item === "object" && "message" in item ? (item as { message?: unknown }).message : null))
    .filter((message): message is string => typeof message === "string" && message.length > 0)
}

export function classifyPracticeError(error: unknown): PracticeFailure {
  if (!(error instanceof ApiError)) {
    return { kind: "network", message: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại." }
  }
  const message = error.message
  const code = error.code
  if (error.status === 403) return { kind: "not_granted", message }
  if (error.status === 404) return { kind: "not_found", message }
  if (error.status === 503 || code === "PRACTICE_DATA_UNAVAILABLE" || code === "PRACTICE_DATA_INSUFFICIENT") {
    return {
      kind: "data_unavailable",
      message: "Dữ liệu của tình huống này tạm thời chưa sẵn sàng. Lượt chưa bị tính, hãy thử lại sau.",
    }
  }
  if (code === "PRACTICE_COMPUTE_FAILED") {
    return { kind: "compute_failed", message: "Không tính được kết quả lượt này. Lượt vẫn được giữ để thử lại." }
  }
  if (code === "PRACTICE_SET_COMPLETED") return { kind: "set_completed", message }
  if (error.status === 409) return { kind: "stale", message }
  if (error.status === 422 || code === "PRACTICE_CONFIG_INVALID") {
    return { kind: "invalid", message, details: detailMessages(error.details) }
  }
  if (error.status >= 500) {
    return { kind: "unknown", message: "Máy chủ gặp sự cố. Vui lòng thử lại." }
  }
  return { kind: "unknown", message }
}
