/**
 * Tab IQX (spec "Tab IQX cho Bộ lọc và Backtest"): Bộ lọc IQX and Chiến lược IQX are a set of values
 * for the EXISTING forms. This module holds the shared types, the user API and the copy that every
 * place (Bộ lọc, Backtest, Quản trị › Mẫu IQX) must write exactly the same way.
 */
import { useQuery } from "@tanstack/react-query"

import { requestOperation } from "@/lib/contract-client"
import type { IndicatorConfig } from "@/pages/demo-trading/bot/config/types"

import type { FilterDefinition } from "../filter/types"
import { retryUnlessFinal } from "./errors"

export type IqxKind = "filter" | "strategy"

/** Info fields of an item (§5.3). The disclaimer is never stored: it is always added on display. */
export type IqxInfo = { name: string; idea: string; origin: string; when_wrong: string }

export type IqxFilterContent = IqxInfo & { pair_slug: string | null; definition: FilterDefinition }
/**
 * Definition of a Chiến lược IQX (update 22-11 §7, §10.2): rổ VN30/VN100, the V3 indicator map and Giữ tối đa.
 * Versions published before 22-11 have no `universe` (read as VN30).
 */
export type IqxStrategyDefinition = { universe?: { type: "vn30" | "vn100" } | null; max_holding: number; indicators: Record<string, IndicatorConfig> }
export type IqxStrategyContent = IqxInfo & { definition: IqxStrategyDefinition }

export type IqxPair = { id: string; slug: string; name: string; version: number }

export type IqxFilterItem = { id: string; kind: "filter"; slug: string; version: number; content: IqxFilterContent; pair: IqxPair | null }
export type IqxStrategyItem = {
  id: string
  kind: "strategy"
  slug: string
  version: number
  content: IqxStrategyContent
  /** Added by update 22-11 (PLAN §6.1); optional until every server sends them. */
  current_version?: number
  hidden?: boolean
}

/** `{ type, id, version }` kept with what the user made from an item (display and statistics only). */
export type IqxFilterOrigin = { type: "iqx_filter"; id: string; version: number }
export type IqxStrategyOrigin = { type: "iqx_strategy"; id: string; version: number }

export const IQX_DISCLAIMER = "Tham khảo để học, không phải khuyến nghị đầu tư."
export const IQX_FIELD_LIMITS = { name: 40, idea: 140, origin: 120, when_wrong: 200 } as const
export const IQX_MAX_HOLDING = { min: 3, max: 250 } as const

export const iqxTitle = (kind: IqxKind, name: string) => `${kind === "filter" ? "Bộ lọc IQX" : "Chiến lược IQX"} · ${name}`

export const iqxKeys = {
  list: (kind: IqxKind) => ["strategy", "iqx-templates", kind] as const,
}

export async function listIqxFilters(signal?: AbortSignal): Promise<IqxFilterItem[]> {
  const response = await requestOperation("GET /api/v2/strategy/iqx-templates", { query: { kind: "filter" } }, { signal })
  return response.items.filter((item) => item.kind === "filter") as unknown as IqxFilterItem[]
}

export async function listIqxStrategies(signal?: AbortSignal): Promise<IqxStrategyItem[]> {
  const response = await requestOperation("GET /api/v2/strategy/iqx-templates", { query: { kind: "strategy" } }, { signal })
  return response.items.filter((item) => item.kind === "strategy") as unknown as IqxStrategyItem[]
}

/** The shown Bộ lọc IQX, in the admin's order (tab IQX of the Bộ lọc; `enabled` false in compose mode). */
export function useIqxFilters(enabled = true) {
  return useQuery({ queryKey: iqxKeys.list("filter"), queryFn: ({ signal }) => listIqxFilters(signal), enabled, staleTime: 60_000, retry: retryUnlessFinal })
}

/** The shown Chiến lược IQX, in the admin's order (tab IQX of the Backtest). */
export function useIqxStrategies(enabled = true) {
  return useQuery({ queryKey: iqxKeys.list("strategy"), queryFn: ({ signal }) => listIqxStrategies(signal), enabled, staleTime: 60_000, retry: retryUnlessFinal })
}

/** One "Dùng" once the form is filled (§5.7). Statistics only: a failure never bothers the user. */
export function recordIqxUsed(id: string, version: number): void {
  void requestOperation("POST /api/v2/strategy/iqx-templates/{id}/used", { path: { id }, body: { version } }).catch(() => undefined)
}

/**
 * Compose mode (§5.3): the admin edits an item in the REAL Bộ lọc / Backtest form. The page that hosts
 * the form passes this binding; the form loads `initial` once, reports every change and hides the
 * user's own save buttons, library tab IQX and "Bắt đầu từ…" strip. Nothing the admin does there
 * writes the admin's own saved filters, lists or Bot config.
 */
export type IqxComposeState<D> = { definition: D | null; errors: string[] }

export type FilterComposeBinding = {
  initial: FilterDefinition | null
  onChange: (state: IqxComposeState<FilterDefinition>) => void
}

export type StrategyComposeBinding = {
  initial: IqxStrategyDefinition | null
  onChange: (state: IqxComposeState<IqxStrategyDefinition>) => void
}
