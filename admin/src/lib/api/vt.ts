import { api } from "./client"
import { adaptPage, type BackendPaginated, type PaginatedResult } from "./types"

export interface VTPosition { id: string; accountId: string; symbol: string; quantityTotal: number; quantitySellable: number; quantityPending: number; quantityReserved: number; avgCostVnd: number; createdAt: string }
export interface VTOrder { id: string; accountId: string; userId: string; symbol: string; side: string; orderType: string; status: string; quantity: number; limitPriceVnd: number | null; filledPriceVnd: number | null; grossAmountVnd: number | null; feeVnd: number | null; taxVnd: number | null; netAmountVnd: number | null; tradingDate: string; rejectionReason: string | null; cancelReason: string | null; createdAt: string }
export interface VTTrade { id: string; orderId: string; accountId: string; symbol: string; side: string; quantity: number; priceVnd: number; grossAmountVnd: number; feeVnd: number; taxVnd: number; netAmountVnd: number; priceSource: string; tradedAt: string; createdAt: string }
export interface VTLedgerEntry { id: string; accountId: string; amountVnd: number; balanceAfterVnd: number; kind: string; referenceType: string | null; referenceId: string | null; note: string | null; createdAt: string }
export interface VTSettlement { id: string; accountId: string; tradeId: string; kind: string; amount: number; symbol: string | null; dueDate: string; status: string; settledAt: string | null; createdAt: string }
export interface VTAccountStats { accountId: string; totalOrders: number; totalTrades: number; grossBuyVnd: number; grossSellVnd: number; realizedPnlVnd: number; turnoverVnd: number; winRate: number | null }
export interface VTAccountRow { id: string; userId: string; userEmail: string | null; userName: string | null; status: string; initialCashVnd: number; cashAvailableVnd: number; cashReservedVnd: number; cashPendingVnd: number; activatedAt: string | null; frozenAt: string | null; frozenByUserId: string | null; freezeReason: string | null; resetAt: string | null; createdAt: string | null }
export interface VTConfigData { id: string; initialCashVnd: number; buyFeeRateBps: number; sellFeeRateBps: number; sellTaxRateBps: number; settlementMode: string; boardLotSize: number; tradingEnabled: boolean; holidays: string[]; createdAt: string; updatedAt: string }

interface BackendAccount { id: string; user_id: string; user_email: string | null; user_name: string | null; status: string; initial_cash_vnd: number; cash_available_vnd: number; cash_reserved_vnd: number; cash_pending_vnd: number; activated_at: string | null; frozen_at?: string | null; frozen_by_user_id?: string | null; freeze_reason?: string | null; reset_at: string | null; created_at?: string | null }
interface BackendPosition { id: string; account_id: string; symbol: string; quantity_total: number; quantity_sellable: number; quantity_pending: number; quantity_reserved: number; avg_cost_vnd: number; created_at: string }
interface BackendOrder { id: string; account_id: string; user_id: string; symbol: string; side: string; order_type: string; status: string; quantity: number; limit_price_vnd: number | null; filled_price_vnd: number | null; gross_amount_vnd: number | null; fee_vnd: number | null; tax_vnd: number | null; net_amount_vnd: number | null; trading_date: string; rejection_reason: string | null; cancel_reason: string | null; created_at: string }
interface BackendTrade { id: string; order_id: string; account_id: string; symbol: string; side: string; quantity: number; price_vnd: number; gross_amount_vnd: number; fee_vnd: number; tax_vnd: number; net_amount_vnd: number; price_source: string; traded_at: string; created_at: string }
interface BackendLedger { id: string; account_id: string; amount_vnd: number; balance_after_vnd: number; kind: string; reference_type: string | null; reference_id: string | null; note: string | null; created_at: string }
interface BackendSettlement { id: string; account_id: string; trade_id: string; kind: string; amount: number; symbol: string | null; due_date: string; status: string; settled_at: string | null; created_at: string }
interface BackendStats { account_id: string; total_orders: number; total_trades: number; gross_buy_vnd: number; gross_sell_vnd: number; realized_pnl_vnd: number; turnover_vnd: number; win_rate: number | null }
interface BackendConfig { id: string; initial_cash_vnd: number; buy_fee_rate_bps: number; sell_fee_rate_bps: number; sell_tax_rate_bps: number; settlement_mode: string; board_lot_size: number; trading_enabled: boolean; holidays: string[]; created_at: string; updated_at: string }

function adaptAccount(raw: BackendAccount): VTAccountRow {
  return { id: String(raw.id), userId: String(raw.user_id), userEmail: raw.user_email, userName: raw.user_name, status: raw.status, initialCashVnd: raw.initial_cash_vnd, cashAvailableVnd: raw.cash_available_vnd, cashReservedVnd: raw.cash_reserved_vnd, cashPendingVnd: raw.cash_pending_vnd, activatedAt: raw.activated_at, frozenAt: raw.frozen_at ?? null, frozenByUserId: raw.frozen_by_user_id ? String(raw.frozen_by_user_id) : null, freezeReason: raw.freeze_reason ?? null, resetAt: raw.reset_at, createdAt: raw.created_at ?? null }
}
function adaptPosition(raw: BackendPosition): VTPosition { return { id: String(raw.id), accountId: String(raw.account_id), symbol: raw.symbol, quantityTotal: raw.quantity_total, quantitySellable: raw.quantity_sellable, quantityPending: raw.quantity_pending, quantityReserved: raw.quantity_reserved, avgCostVnd: raw.avg_cost_vnd, createdAt: raw.created_at } }
function adaptOrder(raw: BackendOrder): VTOrder { return { id: String(raw.id), accountId: String(raw.account_id), userId: String(raw.user_id), symbol: raw.symbol, side: raw.side, orderType: raw.order_type, status: raw.status, quantity: raw.quantity, limitPriceVnd: raw.limit_price_vnd, filledPriceVnd: raw.filled_price_vnd, grossAmountVnd: raw.gross_amount_vnd, feeVnd: raw.fee_vnd, taxVnd: raw.tax_vnd, netAmountVnd: raw.net_amount_vnd, tradingDate: raw.trading_date, rejectionReason: raw.rejection_reason, cancelReason: raw.cancel_reason, createdAt: raw.created_at } }
function adaptTrade(raw: BackendTrade): VTTrade { return { id: String(raw.id), orderId: String(raw.order_id), accountId: String(raw.account_id), symbol: raw.symbol, side: raw.side, quantity: raw.quantity, priceVnd: raw.price_vnd, grossAmountVnd: raw.gross_amount_vnd, feeVnd: raw.fee_vnd, taxVnd: raw.tax_vnd, netAmountVnd: raw.net_amount_vnd, priceSource: raw.price_source, tradedAt: raw.traded_at, createdAt: raw.created_at } }
function adaptLedger(raw: BackendLedger): VTLedgerEntry { return { id: String(raw.id), accountId: String(raw.account_id), amountVnd: raw.amount_vnd, balanceAfterVnd: raw.balance_after_vnd, kind: raw.kind, referenceType: raw.reference_type, referenceId: raw.reference_id, note: raw.note, createdAt: raw.created_at } }
function adaptSettlement(raw: BackendSettlement): VTSettlement { return { id: String(raw.id), accountId: String(raw.account_id), tradeId: String(raw.trade_id), kind: raw.kind, amount: raw.amount, symbol: raw.symbol, dueDate: raw.due_date, status: raw.status, settledAt: raw.settled_at, createdAt: raw.created_at } }
function adaptStats(raw: BackendStats): VTAccountStats { return { accountId: String(raw.account_id), totalOrders: raw.total_orders, totalTrades: raw.total_trades, grossBuyVnd: raw.gross_buy_vnd, grossSellVnd: raw.gross_sell_vnd, realizedPnlVnd: raw.realized_pnl_vnd, turnoverVnd: raw.turnover_vnd, winRate: raw.win_rate } }
function adaptConfig(raw: BackendConfig): VTConfigData { return { id: String(raw.id), initialCashVnd: raw.initial_cash_vnd, buyFeeRateBps: raw.buy_fee_rate_bps, sellFeeRateBps: raw.sell_fee_rate_bps, sellTaxRateBps: raw.sell_tax_rate_bps, settlementMode: raw.settlement_mode, boardLotSize: raw.board_lot_size, tradingEnabled: raw.trading_enabled, holidays: raw.holidays, createdAt: raw.created_at, updatedAt: raw.updated_at } }

export const vtApi = {
  listAccounts: async (params: { page: number; pageSize: number; status?: string; frozenOnly?: boolean | null; search?: string }): Promise<PaginatedResult<VTAccountRow>> => {
    const qs = new URLSearchParams({ page: String(params.page), page_size: String(params.pageSize) })
    if (params.status) qs.set("status", params.status)
    if (params.frozenOnly !== undefined && params.frozenOnly !== null) qs.set("frozen_only", String(params.frozenOnly))
    if (params.search) qs.set("search", params.search)
    return adaptPage(await api.get(`virtual-trading/admin/accounts?${qs}`).json<BackendPaginated<BackendAccount>>(), adaptAccount)
  },
  freeze: async (accountId: string, reason: string): Promise<VTAccountRow> => adaptAccount(await api.post(`admin/vt/accounts/${accountId}/freeze`, { json: { reason } }).json<BackendAccount>()),
  unfreeze: async (accountId: string, reason?: string): Promise<VTAccountRow> => adaptAccount(await api.post(`admin/vt/accounts/${accountId}/unfreeze`, { json: { reason: reason ?? null } }).json<BackendAccount>()),
  cashAdjust: async (accountId: string, amountVnd: number, reason: string): Promise<{ account: VTAccountRow; ledgerId: string; newCashAvailableVnd: number }> => {
    const raw = await api.post(`admin/vt/accounts/${accountId}/cash-adjust`, { json: { amount_vnd: amountVnd, reason } }).json<{ account: BackendAccount; ledger_id: string; new_cash_available_vnd: number }>()
    return { account: adaptAccount(raw.account), ledgerId: String(raw.ledger_id), newCashAvailableVnd: raw.new_cash_available_vnd }
  },
  reset: async (userId: string): Promise<{ accountsReset: number; message: string }> => {
    const raw = await api.post(`virtual-trading/admin/users/${userId}/reset`, { json: {} }).json<{ accounts_reset: number; message: string }>()
    return { accountsReset: raw.accounts_reset, message: raw.message }
  },
  getConfig: async (): Promise<VTConfigData> => adaptConfig(await api.get("virtual-trading/admin/config").json<BackendConfig>()),
  updateConfig: async (patch: Partial<{ initialCashVnd: number; buyFeeRateBps: number; sellFeeRateBps: number; sellTaxRateBps: number; settlementMode: string; boardLotSize: number; tradingEnabled: boolean; holidays: string[] }>): Promise<VTConfigData> => adaptConfig(await api.patch("virtual-trading/admin/config", { json: configBody(patch) }).json<BackendConfig>()),
  getAccount: async (accountId: string): Promise<VTAccountRow> => adaptAccount(await api.get(`admin/vt/accounts/${accountId}`).json<BackendAccount>()),
  listPositions: async (accountId: string): Promise<VTPosition[]> => (await api.get(`admin/vt/accounts/${accountId}/positions`).json<BackendPosition[]>()).map(adaptPosition),
  listOrders: async (accountId: string, params: { page: number; pageSize: number; status?: string; symbol?: string; dateFrom?: string; dateTo?: string }): Promise<PaginatedResult<VTOrder>> => adaptPage(await api.get(`admin/vt/accounts/${accountId}/orders?${pageQuery(params)}`).json<BackendPaginated<BackendOrder>>(), adaptOrder),
  listTrades: async (accountId: string, params: { page: number; pageSize: number; symbol?: string }): Promise<PaginatedResult<VTTrade>> => adaptPage(await api.get(`admin/vt/accounts/${accountId}/trades?${pageQuery(params)}`).json<BackendPaginated<BackendTrade>>(), adaptTrade),
  listLedger: async (accountId: string, params: { page: number; pageSize: number; kind?: string }): Promise<PaginatedResult<VTLedgerEntry>> => adaptPage(await api.get(`admin/vt/accounts/${accountId}/ledger?${pageQuery(params)}`).json<BackendPaginated<BackendLedger>>(), adaptLedger),
  listSettlements: async (accountId: string, params: { page: number; pageSize: number; status?: string }): Promise<PaginatedResult<VTSettlement>> => adaptPage(await api.get(`admin/vt/accounts/${accountId}/settlements?${pageQuery(params)}`).json<BackendPaginated<BackendSettlement>>(), adaptSettlement),
  getStats: async (accountId: string): Promise<VTAccountStats> => adaptStats(await api.get(`admin/vt/accounts/${accountId}/stats`).json<BackendStats>()),
}

function pageQuery(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams({ page: String(params.page), page_size: String(params.pageSize) })
  for (const [key, value] of Object.entries(params)) {
    if (["page", "pageSize"].includes(key) || value === undefined || value === "") continue
    const apiKey = key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)
    qs.set(apiKey, String(value))
  }
  return qs
}

function configBody(patch: Partial<{ initialCashVnd: number; buyFeeRateBps: number; sellFeeRateBps: number; sellTaxRateBps: number; settlementMode: string; boardLotSize: number; tradingEnabled: boolean; holidays: string[] }>) {
  const body: Record<string, unknown> = {}
  if (patch.initialCashVnd !== undefined) body.initial_cash_vnd = patch.initialCashVnd
  if (patch.buyFeeRateBps !== undefined) body.buy_fee_rate_bps = patch.buyFeeRateBps
  if (patch.sellFeeRateBps !== undefined) body.sell_fee_rate_bps = patch.sellFeeRateBps
  if (patch.sellTaxRateBps !== undefined) body.sell_tax_rate_bps = patch.sellTaxRateBps
  if (patch.settlementMode !== undefined) body.settlement_mode = patch.settlementMode
  if (patch.boardLotSize !== undefined) body.board_lot_size = patch.boardLotSize
  if (patch.tradingEnabled !== undefined) body.trading_enabled = patch.tradingEnabled
  if (patch.holidays !== undefined) body.holidays = patch.holidays
  return body
}
