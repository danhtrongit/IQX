/**
 * Reads + writes around the plan that is NOT part of the order body:
 * Cấp 0's order-level chip, the durable Cấp 2 alerts, Cấp 6's conflict table,
 * and the per-level plan recovery the Kết sổ needs after a reload.
 *
 * Every query is opt-in (`enabled`) so a Cấp 0 session never calls Cấp 6, and
 * every 404 degrades to `null` instead of an error screen — the level simply
 * has no row yet (`GET /capN/progress` before entering is a literal `null`).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { api, ApiError } from "@/lib/api"
import type {
  CamXuc,
  CachKhoiLuongWire,
  ConflictLevel,
  KhauViLoai,
  Lop5Partial,
  LyDo,
  MucTuTin,
  PhuongPhapSlTp,
  TrangThaiLucDat,
} from "./plan-math"
import type { MauThuanCap6 } from "./plan-math"

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

/** A missing level row is a normal state. Validation and eligibility failures
 * remain visible so the journey cannot silently fall back to weaker evidence. */
async function nullable<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  try {
    return unwrap<T>(await api<unknown>(path, { signal }))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/* ── Cấp 0 ──────────────────────────────────────────────────────────────── */

export type Cap0Kehoach = {
  id: string
  order_id: string
  symbol: string
  mode: string
  ly_do_doi_thuong: string
  /** Verbatim chip the user picked — printed as-is by the Kết sổ. */
  ly_do_label: string
  mua_luc: string
  ngay_mua: string
  gia_vao: number | null
  /** `null` = still open; 0 = closed in the same phiên (Sân tập is T+0). */
  so_phien_giu: number | null
}

/** The Cấp 0 Kế hoạch chip of ONE buy order. */
export function useCap0Kehoach(orderId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["journey", "cap0-kehoach", orderId],
    enabled: !!user && !!orderId,
    retry: false,
    queryFn: ({ signal }) =>
      nullable<Cap0Kehoach>(`/cap0/kehoach?order_id=${encodeURIComponent(orderId!)}`, signal),
  })
}

/* ── Cấp 1 ──────────────────────────────────────────────────────────────── */

export type Cap1Progress = {
  task_1_done_at: string | null
  task_2_done_at: string | null
  task_3_done_at: string | null
  task_4_done_at: string | null
  task_5_done_at: string | null
  so_ly_do_da_dung: number
  so_lenh_ly_do_ung_ho: number
  so_lenh_thuc_chien: number
  graduated_at: string | null
}

export function useCap1Progress(enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["journey", "cap1-progress", user?.id],
    enabled: enabled && !!user,
    retry: false,
    queryFn: ({ signal }) => nullable<Cap1Progress>("/cap1/progress", signal),
  })
}

/** One durable closed round trip (`GET /cap1/trades`), server-computed. */
export type Cap1TradeRow = {
  buy_order_id: string
  sell_order_id: string
  symbol: string
  quantity: number
  bought_at: string
  closed_at: string
  gia_vao: number | null
  gia_ra: number
  pnl_pct: number
  pnl_vnd: number
  lyDo: LyDo
  trangThai_luc_dat: TrangThaiLucDat
  vung_mua: number
  cam_xuc: CamXuc | null
  phuong_phap_sl_tp: PhuongPhapSlTp | null
  cat_lo: number | null
  chot_loi: number | null
}

export function useCap1Trades(enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["journey", "cap1-trades", user?.id],
    enabled: enabled && !!user,
    retry: false,
    queryFn: async ({ signal }): Promise<Cap1TradeRow[]> => {
      const payload = await nullable<{ trades?: Cap1TradeRow[] }>("/cap1/trades", signal)
      return payload?.trades ?? []
    },
  })
}

/* ── Cấp 3 ──────────────────────────────────────────────────────────────── */

export type Cap3Progress = {
  khau_vi_da_dat: boolean
  khau_vi: KhauViLoai | null
  /** Demo capital Cấp 3 measures `% vốn` against (VND). */
  von_ban_dau: number
  task_1_done_at: string | null
  task_2_done_at: string | null
  so_lenh_quan_ly_von: number
}

export function useCap3Progress(enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["journey", "cap3-progress", user?.id],
    enabled: enabled && !!user,
    retry: false,
    queryFn: ({ signal }) => nullable<Cap3Progress>("/cap3/progress", signal),
  })
}

/** `POST /cap3/khau-vi` — the risk appetite is server state, changeable later. */
export function useSetKhauVi() {
  const queryClient = useQueryClient()
  return useMutation<unknown, unknown, KhauViLoai>({
    mutationFn: (khauVi) =>
      api("/cap3/khau-vi", { method: "POST", body: JSON.stringify({ khau_vi: khauVi }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["journey", "cap3-progress"] }),
  })
}

/* ── Cấp 2: durable alerts ──────────────────────────────────────────────── */

export type Cap2AlertType = "nhoi_lenh" | "cham_cat_lo"
export type Cap2Alert = {
  id: string
  alert_type: Cap2AlertType
  symbol: string
  session_date: string
  observed_price_vnd: number
  threshold_price_vnd: number | null
  loss_pct: number | null
  breach_session_no: number
  status: "pending" | "shown" | "suppressed" | "acted"
  suppression_reason: string | null
  escalation: "normal" | "delay_5s" | "type_phrase" | null
  priority: "immediate" | "next_session"
  position_quantity: number | null
  position_avg_cost_vnd: number | null
  plan_started_at: string | null
}

export type Cap2PreBuyAlertResult = {
  data_status: "available" | "unavailable"
  triggered: boolean
  reason: string
  alert: Cap2Alert | null
}

/**
 * `POST /cap2/alerts/pre-buy` — the pre-flight that must run BEFORE a Cấp 2+
 * BUY, so the durable alert exists before the order. A previously accepted
 * `proceed_buy` is consumed by the caller exactly once per identical draft.
 */
export function useCap2PreBuyAlert() {
  return useMutation<
    Cap2PreBuyAlertResult,
    unknown,
    {
      symbol: string
      idempotencyKey: string
      quantity: number
      orderType: "market" | "limit"
      limitPriceVnd: number | null
    }
  >({
    mutationFn: (input) =>
      api<Cap2PreBuyAlertResult>("/cap2/alerts/pre-buy", {
        method: "POST",
        body: JSON.stringify({
          symbol: input.symbol,
          idempotency_key: input.idempotencyKey,
          quantity: input.quantity,
          order_type: input.orderType,
          limit_price_vnd: input.limitPriceVnd,
        }),
      }),
  })
}

export type Cap2AlertActionResult = {
  alert: Cap2Alert
  next_step: "none" | "confirm_ato_sell"
}

/** `POST /cap2/alerts/{id}/action` — the durable decision (never a local flag). */
export function useCap2AlertAction() {
  const queryClient = useQueryClient()
  return useMutation<
    Cap2AlertActionResult,
    unknown,
    { alertId: string; action: "cancel_buy" | "proceed_buy" | "sell_ato" | "hold"; confirmationPhrase?: string }
  >({
    mutationFn: (input) =>
      api<Cap2AlertActionResult>(`/cap2/alerts/${input.alertId}/action`, {
        method: "POST",
        body: JSON.stringify({
          action: input.action,
          ...(input.confirmationPhrase ? { confirmation_phrase: input.confirmationPhrase } : {}),
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["journey", "cap2-alerts-active"] }),
  })
}

/** `GET /cap2/alerts/active` — the durable SL inbox (survives reloads). */
export function useActiveCap2Alerts(enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["journey", "cap2-alerts-active", user?.id],
    enabled: enabled && !!user,
    retry: false,
    refetchInterval: 120_000,
    queryFn: async ({ signal }): Promise<Cap2Alert[]> => {
      const payload = await nullable<{ alerts?: Cap2Alert[] }>("/cap2/alerts/active", signal)
      return payload?.alerts ?? []
    },
  })
}

/* ── Cấp 6 ──────────────────────────────────────────────────────────────── */

/** `GET /cap6/mau-thuan/{symbol}` — the server's own side/veto classification. */
export function useCap6MauThuan(symbol: string, enabled: boolean) {
  const { user } = useAuth()
  const code = symbol.trim().toUpperCase()
  return useQuery({
    queryKey: ["journey", "cap6-mau-thuan", code],
    enabled: enabled && !!user && code !== "",
    retry: false,
    staleTime: 60_000,
    queryFn: ({ signal }) => nullable<MauThuanCap6>(`/cap6/mau-thuan/${encodeURIComponent(code)}`, signal),
  })
}

/** `GET /cap6/kehoach/{order_id}` — the SAVED judgement of one buy order. */
export type KehoachMauThuanCap6 = {
  order_id: string
  had_conflict: boolean | null
  conflict_level: ConflictLevel | null
  conflict_level_ten: string | null
  had_veto: boolean | null
  veto_layers_ten: string[] | null
  khoi_luong_pct_von: number | null
  muc_tu_tin: MucTuTin | null
  /** The server's own verdict: `null` = chưa xét được, never "khớp". */
  nhat_quan: boolean | null
}

export function useCap6Kehoach(orderId: string | null, enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["journey", "cap6-kehoach", orderId],
    enabled: enabled && !!user && !!orderId,
    retry: false,
    queryFn: ({ signal }) =>
      nullable<KehoachMauThuanCap6>(`/cap6/kehoach/${encodeURIComponent(orderId!)}`, signal),
  })
}

/** `POST /cap6/skip` — «Không mua lần này»; records, never tracks the price. */
export function useCap6Skip() {
  return useMutation<unknown, unknown, { symbol: string; conflictLevel: ConflictLevel | null }>({
    mutationFn: (input) =>
      api("/cap6/skip", {
        method: "POST",
        body: JSON.stringify({
          symbol: input.symbol,
          conflict_level: input.conflictLevel ?? "chua_ro",
        }),
      }),
  })
}

/* ── Kết sổ: kế hoạch mua khôi phục từ server ───────────────────────────── */

/**
 * The cumulative BUY plan read back by order id — the same row every level's
 * Kết sổ needs after a reload. `planRouteLadder` below picks the richest route
 * the current level can read; only Cấp 0 (whose chip lives in its own
 * `cap0_order_kehoach` table) has no row here.
 */
export type RecoveredPlan = {
  order_id: string
  symbol: string
  quantity: number
  bought_at: string
  gia_vao: number | null
  lyDo: LyDo | null
  trangThai_luc_dat: TrangThaiLucDat | null
  vung_mua: number | null
  phuong_phap_sl_tp: PhuongPhapSlTp | null
  cat_lo: number | null
  chot_loi: number | null
  khau_vi: KhauViLoai | null
  muc_tu_tin: MucTuTin | null
  cach_khoi_luong: CachKhoiLuongWire | null
  khoi_luong: number | null
  pct_von: number | null
  doc_5_lop: Lop5Partial | null
  ai_5_lop: Lop5Partial | null
  /** Server-derived comparison counters (Cấp 4's own row, never client math). */
  so_lop_dong_thuan?: number | null
  so_lop_khac_ai?: number | null
  /** Cấp 5 source stamp — `source_known: false` means "never captured". */
  source_known?: boolean
  tu_san_ma?: boolean | null
  hunt_filter_ten?: string | null
  hunt_signal?: string | null
  /** Cấp 6 judgement, as the SERVER stored it. */
  had_conflict?: boolean | null
  conflict_level?: ConflictLevel | null
  conflict_level_ten?: string | null
  had_veto?: boolean | null
  veto_layers_ten?: string[] | null
  nhat_quan?: boolean | null
  khoi_luong_pct_von?: number | null
}

/**
 * Ordered plan routes for one BUY order — richest first, and every entry reads
 * the SAME `order_kehoach`/`trade_plan` row by order id:
 *
 * - Cấp 6's own row adds the conflict judgement (`nhat_quan`),
 * - Cấp 5's adds the hunt-source stamp (and carries Cấp 4's five-layer block),
 * - Cấp 4's carries `doc_5_lop`/`ai_5_lop` + the server's comparison counters,
 * - Cấp 3's is the ungated one: its handler only checks "the order is mine, is a
 *   BUY, and has a plan row", so it also serves a Cấp 1–2 round trip.
 *
 * Only the Cấp 5/6 routes require that level's own progress row, so they are
 * tried first and the ladder degrades to the ungated route instead of declaring
 * the plan unavailable.
 */
function planRouteLadder(level: number, buyOrderId: string): string[] {
  const suffix = `/plans/${encodeURIComponent(buyOrderId)}`
  const routes: string[] = []
  if (level >= 6) routes.push(`/cap6${suffix}`)
  if (level >= 5) routes.push(`/cap5${suffix}`)
  if (level >= 4) routes.push(`/cap4${suffix}`)
  routes.push(`/cap3${suffix}`)
  return routes
}

function hasCoreRecoveredPlan(row: RecoveredPlan): boolean {
  return Boolean(
    row.order_id &&
      row.symbol &&
      row.quantity > 0 &&
      row.bought_at &&
      row.gia_vao != null,
  )
}

export function useRecoveredPlan(level: number, buyOrderId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["journey", "plan", level, buyOrderId],
    enabled: !!user && level >= 1 && !!buyOrderId,
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<RecoveredPlan | null> => {
      for (const route of planRouteLadder(level, buyOrderId!)) {
        const row = await nullable<RecoveredPlan>(route, signal)
        if (row && hasCoreRecoveredPlan(row)) return row
      }
      return null
    },
  })
}
