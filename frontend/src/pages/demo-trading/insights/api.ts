/**
 * Wire layer for the hunt ("Săn mã") and Bot panels - every endpoint is called
 * through the shared `api()` client, so auth/refresh/proxy behaviour is
 * identical to the trading hooks.
 *
 * Shapes are snake_case exactly as the backend serializes them. Nothing here
 * invents a value: unknown stays `null` on the wire, and the panels render it
 * as "-".
 */
import { ApiError, api } from "@/lib/api"

/* ── Hunt ───────────────────────────────────────────────────────────────── */

export type LocSanTieuChi = {
  ma: string
  ten: string
  ap_dung: boolean
  giai_thich: string | null
}

export type HuntFilterStatus = {
  ma: string
  icon: string
  ten: string
  mo_ta: string
  dieu_kien: string
  xep_hang_theo: string
  nguon_du_lieu: string | null
  kha_dung: boolean
  ly_do_chua_kha_dung: string | null
}

export type SanMaIndex = {
  loc_san: LocSanTieuChi[]
  so_ma_trong_ro: number | null
  bo_loc: HuntFilterStatus[]
  hien_thi_toi_da: number
}

export type HuntItem = {
  hang: number
  symbol: string
  gia_vnd: number | null
  pct_thay_doi: number | null
  tin_hieu: string
  gia_tri_xep_hang: number | null
}

export type HuntResult = {
  ma: string
  icon: string | null
  ten: string
  mo_ta: string
  dieu_kien: string
  xep_hang_theo: string
  nguon_du_lieu: string | null
  kha_dung: boolean
  ly_do_chua_kha_dung: string | null
  tong_so_ma: number | null
  so_ma_trong_ro: number | null
  so_ma_xet: number | null
  so_ma_truot_loc_san: number | null
  so_ma_bo_qua_thieu_du_lieu: number | null
  ket_qua_day_du: boolean | null
  canh_bao_thieu_du_lieu: string | null
  hien_thi_toi_da: number
  loc_san: LocSanTieuChi[]
  items: HuntItem[]
}

/* ── Bot ────────────────────────────────────────────────────────────────── */

export type BotRunIssue = {
  code: string
  symbol: string | null
  detail: string | null
}

export type BotRunStatus = {
  status: "idle" | "running" | "succeeded" | "failed"
  latest_run_id: string | null
  last_updated_at: string | null
  processed_unseen_sessions: number
  issues: BotRunIssue[]
}

export type BotProductStage = "bot_v1_waiting" | "bot_v2_academy"

export type BotConditionsState =
  "waiting_for_conditions" | "entry_enabled" | "exit_only" | "protection_only"

export type BotConditions = {
  state: BotConditionsState
  has_active_buy: boolean
  has_active_sell: boolean
  buy_condition_count: number
  sell_condition_count: number
  saved_revision: number | null
  effective_revision: number | null
  effective_session: string | null
  config_status: "none" | "pending" | "effective" | "calendar_unavailable"
  open_positions: number
}

export type BotOverview = {
  eligible: boolean
  current_level: number
  cap6_graduated_at: string | null
  disclosure: string
  bot: {
    strategy_id: string
    strategy_version: number
    execution_model: string
    initial_cash_vnd: string
    activated_at: string
    policy_version: string
    product_stage: BotProductStage
  } | null
  conditions: BotConditions | null
  account: {
    cash_vnd: string
    market_value_vnd: string | null
    nav_vnd: string | null
    pnl_total_net_vnd: string | null
    return_total: string | null
    valuation_complete: boolean
    as_of_session: string | null
  } | null
  bot_run: BotRunStatus
}

export type BotPosition = {
  id: string
  symbol: string
  qty: number
  entry_price_vnd: string
  current_close_vnd: string | null
  market_value_vnd: string | null
  weight_pct: string | null
  amplitude_at_entry_vnd: string
  amplitude_source_ref: string
  stop_loss_vnd: string
  legacy_take_profit_vnd: string | null
  unrealized_pnl_net_vnd: string | null
  filter_ids: string[]
  opened_session: string
  opened_at: string
  sector: string | null
}

export type BotPositions = {
  items: BotPosition[]
  valuation_complete: boolean
  as_of_session: string | null
}

export type BotJournalItem = {
  id: string
  run_id: string
  trading_date: string
  action: string
  reason_code: string
  reason: string
  execution: {
    id: string
    side: string
    qty: number
    price_vnd: string
    gross_value_vnd: string
    fee_vnd: string
    tax_vnd: string
    net_cash_delta_vnd: string
  } | null
  symbol: string | null
  filter_ids: string[]
  supporting_count: number | null
  threshold_vnd: string | null
  created_at: string
}

export type BotJournal = {
  items: BotJournalItem[]
  next_cursor: string | null
  issues: BotRunIssue[]
}

export type BotPerformance = {
  base: {
    trading_date: string
    bot_nav_vnd: string
    vnindex_value: string | null
  } | null
  series: {
    trading_date: string
    cash_vnd: string
    market_value_vnd: string | null
    nav_vnd: string | null
    valuation_complete: boolean
    bot_return_since_base: string | null
    vnindex_value: string | null
    vnindex_return_since_base: string | null
  }[]
  comparison_available: boolean
}

/* ── Fetchers ───────────────────────────────────────────────────────────── */

function unwrap<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "data" in payload
  ) {
    return (payload as { data: T }).data
  }
  return payload as T
}

const get = async <T>(path: string, signal?: AbortSignal) =>
  unwrap<T>(await api<unknown>(path, { signal }))

/**
 * A 404 from a read that may not be deployed or populated yet is "no data", not
 * a failure - it maps to `null` so the panels can say so instead of reporting an
 * error. Every other status still throws.
 */
async function getOrNull<T>(
  path: string,
  signal?: AbortSignal
): Promise<T | null> {
  try {
    return unwrap<T>(await api<unknown>(path, { signal }))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export const insightsApi = {
  huntIndex: (signal?: AbortSignal) =>
    getOrNull<SanMaIndex>("/cap5/san-ma", signal),
  hunt: (filter: string, signal?: AbortSignal) =>
    getOrNull<HuntResult>(`/cap5/san-ma/${filter}`, signal),
  botOverview: (signal?: AbortSignal) => get<BotOverview>("/bot", signal),
  botPositions: (signal?: AbortSignal) =>
    get<BotPositions>("/bot/positions", signal),
  botJournal: (cursor: string | null, signal?: AbortSignal) =>
    get<BotJournal>(
      `/bot/journal?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      signal
    ),
  botPerformance: (signal?: AbortSignal) =>
    get<BotPerformance>("/bot/performance", signal),
}
