/**
 * Shared Buy/Sell indicator configuration client (bot-v2, schema 2.0).
 *
 * One saved configuration per account is shared by Học viện, Backtest and Bot.
 * Saves are optimistic-concurrency writes: every PATCH carries the revision the
 * draft was based on plus an idempotency key. A 409 `REVISION_CONFLICT` means
 * another tab saved first — callers must keep their draft and ask the user to
 * reload, never retry blindly (no last-write-wins).
 *
 * Contract: .pi/botv2/CONTRACTS.md §4 (`/strategy/shared-config`).
 */
import { api as sharedApi, ApiError } from "@/lib/api"

export type CompareOp = ">" | "<"
export type MembershipOp = "∈" | "∉"
export type RuleOp = CompareOp | MembershipOp

export type Operand =
  | { kind: "series"; key: string; offset?: number }
  | { kind: "param"; key: string }
  | { kind: "constant"; value: number }

export type Rule =
  | { id: string; kind: "compare" | "cross"; lhs: Operand; op: CompareOp; rhs: Operand; allowed_ops: CompareOp[] }
  | { id: string; kind: "membership"; lhs: Operand; op: MembershipOp; rhs: { lower: Operand; upper: Operand }; allowed_ops: MembershipOp[] }

export type SideConfig = { enabled: boolean; params: Record<string, number>; rules: Rule[] }
export type IndicatorConfig = { master_enabled: boolean; buy: SideConfig; sell: SideConfig }
export type Side = "buy" | "sell"

export type SharedConfig = {
  schema_version: "2.0"
  revision: number
  rule_version: "iqx-rules-2.0"
  indicators: Record<string, IndicatorConfig>
}

export type EffectiveStatus = "pending" | "effective" | "calendar_unavailable"

export type SharedConfigState = {
  /** 0 = never saved; `config` is then the registry default. */
  saved_revision: number
  effective_revision: number | null
  effective_session: string | null
  status: EffectiveStatus
  config: SharedConfig
  config_hash: string
  registry_version: string
  granted_indicators: string[]
}

export type SaveSharedConfigResult = {
  revision: number
  config: SharedConfig
  config_hash: string
  effective_session: string | null
  status: EffectiveStatus
}

export type SharedConfigRevision = {
  revision: number
  saved_at: string
  config_hash: string
  effective_session: string | null
  status: EffectiveStatus
}

async function unwrap<T>(path: string, options: RequestInit = {}): Promise<T> {
  const payload = await sharedApi<unknown>(path, options)
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** True when the backend has bot-v2 strategy routes disabled (404 FEATURE_DISABLED). */
export function isFeatureDisabled(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404 && error.code === "FEATURE_DISABLED"
}

export function isRevisionConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === "REVISION_CONFLICT"
}

export function getSharedConfig(signal?: AbortSignal): Promise<SharedConfigState> {
  return unwrap<SharedConfigState>("/strategy/shared-config", { signal })
}

export function saveSharedConfig(
  body: { expected_revision: number; idempotency_key: string; indicators: Record<string, IndicatorConfig> },
  signal?: AbortSignal,
): Promise<SaveSharedConfigResult> {
  return unwrap<SaveSharedConfigResult>("/strategy/shared-config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })
}

export function listSharedConfigRevisions(limit = 20, signal?: AbortSignal): Promise<SharedConfigRevision[]> {
  return unwrap<SharedConfigRevision[]>(`/strategy/shared-config/revisions?limit=${limit}`, { signal })
}

export type RegistryField = {
  key: string
  label: string
  type: "integer" | "number"
  min: number
  max: number
  step: number
  unit: string
  api_scale: number
  wire_unit: string
}

export type RegistrySide = SideConfig & { field_overrides?: Record<string, Partial<RegistryField>> }

export type TechnicalIndicator = {
  id: string
  name: string
  chapter: number
  lesson_id: string
  family: "state" | "event"
  formula: string
  availability: "ohlcv" | "needs_history_context"
  fields: RegistryField[]
  buy: RegistrySide
  sell: RegistrySide
  learned: boolean
}

export type TechnicalRegistry = {
  calculation_version: string
  rule_version: string
  indicators: TechnicalIndicator[]
}

export function getTechnicalRegistry(signal?: AbortSignal): Promise<TechnicalRegistry> {
  return unwrap<TechnicalRegistry>("/strategy/registry/technical", { signal })
}

/** Field metadata for one side: base field merged with that side's override. */
export function sideField(indicator: TechnicalIndicator, side: Side, key: string): RegistryField | undefined {
  const base = indicator.fields.find((field) => field.key === key)
  if (!base) return undefined
  return { ...base, ...(indicator[side].field_overrides?.[key] ?? {}) }
}
