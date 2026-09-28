/**
 * Adapter API cho quản trị giao dịch ảo (Sân tập) — hai nhóm endpoint của backend:
 *
 * - `/virtual-trading/admin/*` (`VirtualTradingAdminController`): cấu hình đang
 *   hoạt động, danh sách tài khoản có phân trang, đặt lại tài khoản theo người
 *   dùng và đặt lại toàn bộ.
 * - `/admin/vt/*` (`AdminVtController`): khóa / mở khóa, điều chỉnh tiền mặt và
 *   "account 360" (vị thế, lệnh, giao dịch, sổ cái, thanh toán T+N, thống kê).
 *
 * Mọi lời gọi đi qua `api()` dùng chung (token + refresh + `ApiError`); đường dẫn
 * ở đây là tương đối so với `/api/v2`. Đơn vị được giữ nguyên như backend:
 * tiền là **đồng VND** (số nguyên), khối lượng là **cổ phiếu**, phí/thuế là
 * **basis point** (1 bps = 0,01%). Client không tự suy diễn hay bịa giá trị.
 */
import { api } from "@/lib/api"

/* ── Từ vựng (khớp enum trong prisma/schema.prisma của backend-v2) ───────── */

export type VtAccountStatus = "active" | "suspended"
export type VtOrderSide = "buy" | "sell"
export type VtOrderType = "market" | "limit"
export type VtOrderStatus = "pending" | "filled" | "cancelled" | "expired" | "rejected"
export type VtSettlementKind = "buy_qty_release" | "sell_cash_release"
export type VtSettlementStatus = "pending" | "settled"
export type VtSettlementMode = "T0" | "T2"

export interface VtPage<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

/** Normalize pagination metadata from either generated v2 JSON spelling. */
export function adaptVtPage<T>(raw: {
  items?: T[] | null
  data?: T[] | null
  total?: number | null
  page?: number | null
  page_size?: number | null
  pageSize?: number | null
  total_pages?: number | null
  totalPages?: number | null
}): VtPage<T> {
  const items = raw.items ?? raw.data ?? []
  const pageSize = raw.page_size ?? raw.pageSize ?? (items.length || 1)
  const total = raw.total ?? items.length
  const page = raw.page ?? 1
  return {
    items,
    total,
    page,
    page_size: pageSize,
    total_pages: raw.total_pages ?? raw.totalPages ?? Math.max(1, Math.ceil(total / pageSize)),
  }
}

/* ── Kiểu trên đường truyền (snake_case, khớp DTO backend) ───────────────── */

interface RawAccountListItem {
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
  reset_at: string | null
}

interface RawAccount {
  id: string
  user_id: string
  status: string
  initial_cash_vnd: number
  cash_available_vnd: number
  cash_reserved_vnd: number
  cash_pending_vnd: number
  activated_at: string | null
  frozen_at: string | null
  frozen_by_user_id: string | null
  freeze_reason: string | null
  created_at: string | null
}

interface RawPosition {
  id: string
  account_id: string
  symbol: string
  quantity_total: number
  quantity_sellable: number
  quantity_pending: number
  quantity_reserved: number
  avg_cost_vnd: number
  created_at: string
}

interface RawOrder {
  id: string
  account_id: string
  user_id: string
  symbol: string
  side: string
  order_type: string
  status: string
  quantity: number
  limit_price_vnd: number | null
  filled_price_vnd: number | null
  gross_amount_vnd: number | null
  fee_vnd: number | null
  tax_vnd: number | null
  net_amount_vnd: number | null
  trading_date: string
  rejection_reason: string | null
  cancel_reason: string | null
  created_at: string
}

interface RawTrade {
  id: string
  order_id: string
  account_id: string
  symbol: string
  side: string
  quantity: number
  price_vnd: number
  gross_amount_vnd: number
  fee_vnd: number
  tax_vnd: number
  net_amount_vnd: number
  price_source: string
  traded_at: string
  created_at: string
}

interface RawLedgerEntry {
  id: string
  account_id: string
  amount_vnd: number
  balance_after_vnd: number
  kind: string
  reference_type: string | null
  reference_id: string | null
  note: string | null
  created_at: string
}

interface RawSettlement {
  id: string
  account_id: string
  trade_id: string
  kind: string
  amount: number
  symbol: string | null
  due_date: string
  status: string
  settled_at: string | null
  created_at: string
}

interface RawStats {
  account_id: string
  total_orders: number
  total_trades: number
  gross_buy_vnd: number
  gross_sell_vnd: number
  realized_pnl_vnd: number
  turnover_vnd: number
  win_rate: number | null
}

interface RawConfig {
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

/* ── Kiểu hiển thị (camelCase) ───────────────────────────────────────────── */

export interface VtAccountListRow {
  id: string
  userId: string
  userEmail: string | null
  userName: string | null
  status: VtAccountStatus
  initialCashVnd: number
  cashAvailableVnd: number
  cashReservedVnd: number
  cashPendingVnd: number
  activatedAt: string | null
  resetAt: string | null
}

export interface VtAccount {
  id: string
  userId: string
  status: VtAccountStatus
  initialCashVnd: number
  cashAvailableVnd: number
  cashReservedVnd: number
  cashPendingVnd: number
  activatedAt: string | null
  frozenAt: string | null
  frozenByUserId: string | null
  freezeReason: string | null
  createdAt: string | null
}

export interface VtPosition {
  id: string
  accountId: string
  symbol: string
  quantityTotal: number
  quantitySellable: number
  quantityPending: number
  quantityReserved: number
  avgCostVnd: number
  createdAt: string
}

export interface VtOrder {
  id: string
  accountId: string
  symbol: string
  side: VtOrderSide
  orderType: VtOrderType
  status: VtOrderStatus
  quantity: number
  limitPriceVnd: number | null
  filledPriceVnd: number | null
  grossAmountVnd: number | null
  feeVnd: number | null
  taxVnd: number | null
  netAmountVnd: number | null
  tradingDate: string
  rejectionReason: string | null
  cancelReason: string | null
  createdAt: string
}

export interface VtTrade {
  id: string
  orderId: string
  symbol: string
  side: VtOrderSide
  quantity: number
  priceVnd: number
  grossAmountVnd: number
  feeVnd: number
  taxVnd: number
  netAmountVnd: number
  priceSource: string
  tradedAt: string
  createdAt: string
}

export interface VtLedgerEntry {
  id: string
  amountVnd: number
  balanceAfterVnd: number
  kind: string
  referenceType: string | null
  referenceId: string | null
  note: string | null
  createdAt: string
}

export interface VtSettlement {
  id: string
  tradeId: string
  kind: VtSettlementKind
  amount: number
  symbol: string | null
  dueDate: string
  status: VtSettlementStatus
  settledAt: string | null
  createdAt: string
}

export interface VtAccountStats {
  accountId: string
  totalOrders: number
  totalTrades: number
  grossBuyVnd: number
  grossSellVnd: number
  realizedPnlVnd: number
  turnoverVnd: number
  /** Backend hiện trả `null` (chưa theo dõi giá vốn theo từng mã). */
  winRate: number | null
}

export interface VtConfig {
  id: string
  initialCashVnd: number
  buyFeeRateBps: number
  sellFeeRateBps: number
  sellTaxRateBps: number
  settlementMode: VtSettlementMode
  boardLotSize: number
  tradingEnabled: boolean
  holidays: string[]
  createdAt: string
  updatedAt: string
}

/* ── Bộ chuyển đổi ───────────────────────────────────────────────────────── */

function adaptAccountListRow(raw: RawAccountListItem): VtAccountListRow {
  return {
    id: String(raw.id),
    userId: String(raw.user_id),
    userEmail: raw.user_email,
    userName: raw.user_name,
    status: raw.status as VtAccountStatus,
    initialCashVnd: raw.initial_cash_vnd,
    cashAvailableVnd: raw.cash_available_vnd,
    cashReservedVnd: raw.cash_reserved_vnd,
    cashPendingVnd: raw.cash_pending_vnd,
    activatedAt: raw.activated_at,
    resetAt: raw.reset_at,
  }
}

function adaptAccount(raw: RawAccount): VtAccount {
  return {
    id: String(raw.id),
    userId: String(raw.user_id),
    status: raw.status as VtAccountStatus,
    initialCashVnd: raw.initial_cash_vnd,
    cashAvailableVnd: raw.cash_available_vnd,
    cashReservedVnd: raw.cash_reserved_vnd,
    cashPendingVnd: raw.cash_pending_vnd,
    activatedAt: raw.activated_at,
    frozenAt: raw.frozen_at,
    frozenByUserId: raw.frozen_by_user_id,
    freezeReason: raw.freeze_reason,
    createdAt: raw.created_at,
  }
}

function adaptPosition(raw: RawPosition): VtPosition {
  return {
    id: String(raw.id),
    accountId: String(raw.account_id),
    symbol: raw.symbol,
    quantityTotal: raw.quantity_total,
    quantitySellable: raw.quantity_sellable,
    quantityPending: raw.quantity_pending,
    quantityReserved: raw.quantity_reserved,
    avgCostVnd: raw.avg_cost_vnd,
    createdAt: raw.created_at,
  }
}

function adaptOrder(raw: RawOrder): VtOrder {
  return {
    id: String(raw.id),
    accountId: String(raw.account_id),
    symbol: raw.symbol,
    side: raw.side as VtOrderSide,
    orderType: raw.order_type as VtOrderType,
    status: raw.status as VtOrderStatus,
    quantity: raw.quantity,
    limitPriceVnd: raw.limit_price_vnd,
    filledPriceVnd: raw.filled_price_vnd,
    grossAmountVnd: raw.gross_amount_vnd,
    feeVnd: raw.fee_vnd,
    taxVnd: raw.tax_vnd,
    netAmountVnd: raw.net_amount_vnd,
    tradingDate: raw.trading_date,
    rejectionReason: raw.rejection_reason,
    cancelReason: raw.cancel_reason,
    createdAt: raw.created_at,
  }
}

function adaptTrade(raw: RawTrade): VtTrade {
  return {
    id: String(raw.id),
    orderId: String(raw.order_id),
    symbol: raw.symbol,
    side: raw.side as VtOrderSide,
    quantity: raw.quantity,
    priceVnd: raw.price_vnd,
    grossAmountVnd: raw.gross_amount_vnd,
    feeVnd: raw.fee_vnd,
    taxVnd: raw.tax_vnd,
    netAmountVnd: raw.net_amount_vnd,
    priceSource: raw.price_source,
    tradedAt: raw.traded_at,
    createdAt: raw.created_at,
  }
}

function adaptLedgerEntry(raw: RawLedgerEntry): VtLedgerEntry {
  return {
    id: String(raw.id),
    amountVnd: raw.amount_vnd,
    balanceAfterVnd: raw.balance_after_vnd,
    kind: raw.kind,
    referenceType: raw.reference_type,
    referenceId: raw.reference_id ? String(raw.reference_id) : null,
    note: raw.note,
    createdAt: raw.created_at,
  }
}

function adaptSettlement(raw: RawSettlement): VtSettlement {
  return {
    id: String(raw.id),
    tradeId: String(raw.trade_id),
    kind: raw.kind as VtSettlementKind,
    amount: raw.amount,
    symbol: raw.symbol,
    dueDate: raw.due_date,
    status: raw.status as VtSettlementStatus,
    settledAt: raw.settled_at,
    createdAt: raw.created_at,
  }
}

function adaptStats(raw: RawStats): VtAccountStats {
  return {
    accountId: String(raw.account_id),
    totalOrders: raw.total_orders,
    totalTrades: raw.total_trades,
    grossBuyVnd: raw.gross_buy_vnd,
    grossSellVnd: raw.gross_sell_vnd,
    realizedPnlVnd: raw.realized_pnl_vnd,
    turnoverVnd: raw.turnover_vnd,
    winRate: raw.win_rate,
  }
}

function adaptConfig(raw: RawConfig): VtConfig {
  return {
    id: String(raw.id),
    initialCashVnd: raw.initial_cash_vnd,
    buyFeeRateBps: raw.buy_fee_rate_bps,
    sellFeeRateBps: raw.sell_fee_rate_bps,
    sellTaxRateBps: raw.sell_tax_rate_bps,
    settlementMode: raw.settlement_mode as VtSettlementMode,
    boardLotSize: raw.board_lot_size,
    tradingEnabled: raw.trading_enabled,
    holidays: raw.holidays,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

function adaptPage<TRaw, TView>(raw: Parameters<typeof adaptVtPage<TRaw>>[0], adapt: (row: TRaw) => TView): VtPage<TView> {
  const page = adaptVtPage(raw)
  return { ...page, items: page.items.map(adapt) }
}

/* ── Tham số lọc ─────────────────────────────────────────────────────────── */

export interface VtAccountFilters {
  page: number
  pageSize: number
  search?: string
  status?: VtAccountStatus
  /** `true` = chỉ tài khoản đã khóa, `false` = chỉ tài khoản chưa khóa, `undefined` = tất cả. */
  frozenOnly?: boolean
}

export interface VtOrderFilters {
  page: number
  pageSize: number
  status?: VtOrderStatus
  symbol?: string
  dateFrom?: string
  dateTo?: string
}

export interface VtTradeFilters {
  page: number
  pageSize: number
  symbol?: string
}

export interface VtLedgerFilters {
  page: number
  pageSize: number
  kind?: string
}

export interface VtSettlementFilters {
  page: number
  pageSize: number
  status?: VtSettlementStatus
}

export interface VtConfigPatch {
  initialCashVnd?: number
  buyFeeRateBps?: number
  sellFeeRateBps?: number
  sellTaxRateBps?: number
  settlementMode?: VtSettlementMode
  boardLotSize?: number
  tradingEnabled?: boolean
  holidays?: string[]
}

/** Bỏ giá trị rỗng/`undefined` rồi đổi tên khoá sang snake_case như backend. */
function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue
    search.set(key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`), String(value))
  }
  return search.toString()
}

const ADMIN_BASE = "/virtual-trading/admin"
const ACCOUNT_BASE = "/admin/vt/accounts"

/* ── Danh sách tài khoản + cấu hình (`/virtual-trading/admin/*`) ─────────── */

/** `GET /virtual-trading/admin/accounts` — phân trang + lọc phía server. */
export async function listAccounts(filters: VtAccountFilters, signal?: AbortSignal): Promise<VtPage<VtAccountListRow>> {
  const raw = await api<VtPage<RawAccountListItem>>(
    `${ADMIN_BASE}/accounts?${query({
      page: filters.page,
      pageSize: filters.pageSize,
      search: filters.search,
      status: filters.status,
      frozenOnly: filters.frozenOnly,
    })}`,
    { signal },
  )
  return adaptPage(raw, adaptAccountListRow)
}

/** `GET /virtual-trading/admin/config` — cấu hình đang hoạt động. */
export async function fetchConfig(signal?: AbortSignal): Promise<VtConfig> {
  return adaptConfig(await api<RawConfig>(`${ADMIN_BASE}/config`, { signal }))
}

/** `PATCH /virtual-trading/admin/config` — chỉ gửi các trường thực sự đổi. */
export async function updateConfig(patch: VtConfigPatch): Promise<VtConfig> {
  const body: Record<string, unknown> = {}
  if (patch.initialCashVnd !== undefined) body.initial_cash_vnd = patch.initialCashVnd
  if (patch.buyFeeRateBps !== undefined) body.buy_fee_rate_bps = patch.buyFeeRateBps
  if (patch.sellFeeRateBps !== undefined) body.sell_fee_rate_bps = patch.sellFeeRateBps
  if (patch.sellTaxRateBps !== undefined) body.sell_tax_rate_bps = patch.sellTaxRateBps
  if (patch.settlementMode !== undefined) body.settlement_mode = patch.settlementMode
  if (patch.boardLotSize !== undefined) body.board_lot_size = patch.boardLotSize
  if (patch.tradingEnabled !== undefined) body.trading_enabled = patch.tradingEnabled
  if (patch.holidays !== undefined) body.holidays = patch.holidays
  return adaptConfig(await api<RawConfig>(`${ADMIN_BASE}/config`, { method: "PATCH", body: JSON.stringify(body) }))
}

export interface VtResetResult {
  accountsReset: number
  message: string
}

/** `POST /virtual-trading/admin/users/{user_id}/reset` — xoá lệnh/giao dịch/vị
 *  thế/sổ cái của **một** người dùng và đưa tiền mặt về vốn ban đầu. */
export async function resetAccountForUser(userId: string): Promise<VtResetResult> {
  const raw = await api<{ accounts_reset: number; message: string }>(
    `${ADMIN_BASE}/users/${userId}/reset`,
    { method: "POST" },
  )
  return { accountsReset: raw.accounts_reset, message: raw.message }
}

/** `POST /virtual-trading/admin/reset-all` — đặt lại **toàn bộ** tài khoản. */
export async function resetAllAccounts(): Promise<VtResetResult> {
  const raw = await api<{ accounts_reset: number; message: string }>(`${ADMIN_BASE}/reset-all`, { method: "POST" })
  return { accountsReset: raw.accounts_reset, message: raw.message }
}

/* ── Account 360 + thao tác quản trị (`/admin/vt/*`) ─────────────────────── */

export async function fetchAccount(accountId: string, signal?: AbortSignal): Promise<VtAccount> {
  return adaptAccount(await api<RawAccount>(`${ACCOUNT_BASE}/${accountId}`, { signal }))
}

/** `GET /admin/vt/accounts/{id}/positions` — backend trả **toàn bộ** vị thế. */
export async function listPositions(accountId: string, signal?: AbortSignal): Promise<VtPosition[]> {
  const raw = await api<RawPosition[]>(`${ACCOUNT_BASE}/${accountId}/positions`, { signal })
  return raw.map(adaptPosition)
}

export async function listOrders(
  accountId: string,
  filters: VtOrderFilters,
  signal?: AbortSignal,
): Promise<VtPage<VtOrder>> {
  const raw = await api<VtPage<RawOrder>>(`${ACCOUNT_BASE}/${accountId}/orders?${query({ ...filters })}`, { signal })
  return adaptPage(raw, adaptOrder)
}

export async function listTrades(
  accountId: string,
  filters: VtTradeFilters,
  signal?: AbortSignal,
): Promise<VtPage<VtTrade>> {
  const raw = await api<VtPage<RawTrade>>(`${ACCOUNT_BASE}/${accountId}/trades?${query({ ...filters })}`, { signal })
  return adaptPage(raw, adaptTrade)
}

export async function listLedger(
  accountId: string,
  filters: VtLedgerFilters,
  signal?: AbortSignal,
): Promise<VtPage<VtLedgerEntry>> {
  const raw = await api<VtPage<RawLedgerEntry>>(`${ACCOUNT_BASE}/${accountId}/ledger?${query({ ...filters })}`, { signal })
  return adaptPage(raw, adaptLedgerEntry)
}

export async function listSettlements(
  accountId: string,
  filters: VtSettlementFilters,
  signal?: AbortSignal,
): Promise<VtPage<VtSettlement>> {
  const raw = await api<VtPage<RawSettlement>>(`${ACCOUNT_BASE}/${accountId}/settlements?${query({ ...filters })}`, { signal })
  return adaptPage(raw, adaptSettlement)
}

export async function fetchAccountStats(accountId: string, signal?: AbortSignal): Promise<VtAccountStats> {
  return adaptStats(await api<RawStats>(`${ACCOUNT_BASE}/${accountId}/stats`, { signal }))
}

/** `POST /admin/vt/accounts/{id}/freeze` — lý do bắt buộc, backend ghi audit. */
export async function freezeAccount(accountId: string, reason: string): Promise<VtAccount> {
  return adaptAccount(
    await api<RawAccount>(`${ACCOUNT_BASE}/${accountId}/freeze`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  )
}

/** `POST /admin/vt/accounts/{id}/unfreeze` — lý do tuỳ chọn. */
export async function unfreezeAccount(accountId: string, reason?: string): Promise<VtAccount> {
  return adaptAccount(
    await api<RawAccount>(`${ACCOUNT_BASE}/${accountId}/unfreeze`, {
      method: "POST",
      body: JSON.stringify({ reason: reason?.trim() ? reason.trim() : null }),
    }),
  )
}

export interface VtCashAdjustResult {
  account: VtAccount
  ledgerId: string
  newCashAvailableVnd: number
}

/** `POST /admin/vt/accounts/{id}/cash-adjust` — số tiền khác 0, lý do bắt buộc;
 *  backend từ chối nếu kết quả âm và luôn ghi một dòng sổ cái `admin_adjust`. */
export async function adjustCash(
  accountId: string,
  amountVnd: number,
  reason: string,
): Promise<VtCashAdjustResult> {
  const raw = await api<{ account: RawAccount; ledger_id: string; new_cash_available_vnd: number }>(
    `${ACCOUNT_BASE}/${accountId}/cash-adjust`,
    { method: "POST", body: JSON.stringify({ amount_vnd: amountVnd, reason }) },
  )
  return {
    account: adaptAccount(raw.account),
    ledgerId: String(raw.ledger_id),
    newCashAvailableVnd: raw.new_cash_available_vnd,
  }
}
