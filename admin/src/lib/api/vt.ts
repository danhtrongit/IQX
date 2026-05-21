import { api } from "./client"
import type { PaginatedResult } from "@/hooks/use-paginated-query"

// ── Types ──────────────────────────────────────────────────────────────────

export interface VTAccountRow {
  id: string
  userId: string
  userEmail: string | null
  userName: string | null
  status: string
  initialCashVnd: number
  cashAvailableVnd: number
  cashReservedVnd: number
  cashPendingVnd: number
  activatedAt: string | null
  frozenAt: string | null
  frozenByUserId: string | null
  freezeReason: string | null
  resetAt: string | null
  createdAt: string
}

export interface VTConfigData {
  id: string
  initialCashVnd: number
  buyFeeRateBps: number
  sellFeeRateBps: number
  sellTaxRateBps: number
  settlementMode: string
  boardLotSize: number
  tradingEnabled: boolean
  holidays: string[]
  createdAt: string
  updatedAt: string
}

// ── Backend raw shapes ──────────────────────────────────────────────────────

interface BackendAccount {
  id: string
  user_id: string
  user_email: string | null
  user_name: string | null
  status: string
  initial_cash_vnd: number
  cash_available_vnd: number
  cash_reserved_vnd: number
  cash_pending_vnd: number
  activated_at: string | null
  frozen_at?: string | null
  frozen_by_user_id?: string | null
  freeze_reason?: string | null
  reset_at: string | null
  created_at?: string | null
}

interface BackendPaginated {
  items: BackendAccount[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

interface BackendConfig {
  id: string
  initial_cash_vnd: number
  buy_fee_rate_bps: number
  sell_fee_rate_bps: number
  sell_tax_rate_bps: number
  settlement_mode: string
  board_lot_size: number
  trading_enabled: boolean
  holidays: string[]
  created_at: string
  updated_at: string
}

// ── Adapters ───────────────────────────────────────────────────────────────

function adaptAccount(raw: BackendAccount): VTAccountRow {
  return {
    id: String(raw.id),
    userId: String(raw.user_id),
    userEmail: raw.user_email,
    userName: raw.user_name,
    status: raw.status,
    initialCashVnd: raw.initial_cash_vnd,
    cashAvailableVnd: raw.cash_available_vnd,
    cashReservedVnd: raw.cash_reserved_vnd,
    cashPendingVnd: raw.cash_pending_vnd,
    activatedAt: raw.activated_at,
    frozenAt: raw.frozen_at ?? null,
    frozenByUserId: raw.frozen_by_user_id ? String(raw.frozen_by_user_id) : null,
    freezeReason: raw.freeze_reason ?? null,
    resetAt: raw.reset_at,
    createdAt: raw.created_at ?? "",
  }
}

function adaptConfig(raw: BackendConfig): VTConfigData {
  return {
    id: String(raw.id),
    initialCashVnd: raw.initial_cash_vnd,
    buyFeeRateBps: raw.buy_fee_rate_bps,
    sellFeeRateBps: raw.sell_fee_rate_bps,
    sellTaxRateBps: raw.sell_tax_rate_bps,
    settlementMode: raw.settlement_mode,
    boardLotSize: raw.board_lot_size,
    tradingEnabled: raw.trading_enabled,
    holidays: raw.holidays,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

// ── API client ─────────────────────────────────────────────────────────────

export const vtApi = {
  listAccounts: async (params: {
    page: number
    pageSize: number
    status?: string
    frozenOnly?: boolean | null
    search?: string
  }): Promise<PaginatedResult<VTAccountRow>> => {
    const search = new URLSearchParams()
    search.set("page", String(params.page))
    search.set("page_size", String(params.pageSize))
    if (params.status) search.set("status", params.status)
    if (params.frozenOnly !== undefined && params.frozenOnly !== null)
      search.set("frozen_only", String(params.frozenOnly))
    if (params.search) search.set("search", params.search)

    const raw = await api
      .get(`virtual-trading/admin/accounts?${search}`)
      .json<BackendPaginated>()
    return {
      items: raw.items.map(adaptAccount),
      total: raw.total,
      page: raw.page,
      pageSize: raw.page_size,
      totalPages: raw.total_pages,
    }
  },

  freeze: async (accountId: string, reason: string): Promise<VTAccountRow> => {
    const raw = await api
      .post(`admin/vt/accounts/${accountId}/freeze`, { json: { reason } })
      .json<BackendAccount>()
    return adaptAccount(raw)
  },

  unfreeze: async (accountId: string, reason?: string): Promise<VTAccountRow> => {
    const raw = await api
      .post(`admin/vt/accounts/${accountId}/unfreeze`, { json: { reason: reason ?? null } })
      .json<BackendAccount>()
    return adaptAccount(raw)
  },

  cashAdjust: async (
    accountId: string,
    amountVnd: number,
    reason: string,
  ): Promise<{ account: VTAccountRow; ledgerId: string; newCashAvailableVnd: number }> => {
    const raw = await api
      .post(`admin/vt/accounts/${accountId}/cash-adjust`, {
        json: { amount_vnd: amountVnd, reason },
      })
      .json<{ account: BackendAccount; ledger_id: string; new_cash_available_vnd: number }>()
    return {
      account: adaptAccount(raw.account),
      ledgerId: String(raw.ledger_id),
      newCashAvailableVnd: raw.new_cash_available_vnd,
    }
  },

  reset: async (userId: string): Promise<{ accountsReset: number; message: string }> => {
    const raw = await api
      .post(`virtual-trading/admin/users/${userId}/reset`, { json: {} })
      .json<{ accounts_reset: number; message: string }>()
    return { accountsReset: raw.accounts_reset, message: raw.message }
  },

  getConfig: async (): Promise<VTConfigData> => {
    const raw = await api.get("virtual-trading/admin/config").json<BackendConfig>()
    return adaptConfig(raw)
  },

  updateConfig: async (patch: Partial<{
    initialCashVnd: number
    buyFeeRateBps: number
    sellFeeRateBps: number
    sellTaxRateBps: number
    settlementMode: string
    boardLotSize: number
    tradingEnabled: boolean
    holidays: string[]
  }>): Promise<VTConfigData> => {
    const body: Record<string, unknown> = {}
    if (patch.initialCashVnd !== undefined) body.initial_cash_vnd = patch.initialCashVnd
    if (patch.buyFeeRateBps !== undefined) body.buy_fee_rate_bps = patch.buyFeeRateBps
    if (patch.sellFeeRateBps !== undefined) body.sell_fee_rate_bps = patch.sellFeeRateBps
    if (patch.sellTaxRateBps !== undefined) body.sell_tax_rate_bps = patch.sellTaxRateBps
    if (patch.settlementMode !== undefined) body.settlement_mode = patch.settlementMode
    if (patch.boardLotSize !== undefined) body.board_lot_size = patch.boardLotSize
    if (patch.tradingEnabled !== undefined) body.trading_enabled = patch.tradingEnabled
    if (patch.holidays !== undefined) body.holidays = patch.holidays

    const raw = await api.patch("virtual-trading/admin/config", { json: body }).json<BackendConfig>()
    return adaptConfig(raw)
  },
}
