import { api } from "@/shared/http/client"

/**
 * Virtual-trading ("Đấu trường ảo") API — ported from `dashboard-bak/src/lib/api.ts`
 * (`arenaApi`). All endpoints live under `/virtual-trading/*`. Adapters convert
 * the backend's `*_vnd` snake_case fields into the UI's camelCase shapes.
 */

// ── UI-facing shapes (camelCase) ──

export interface VTAccount {
  /** Cash available to spend (VND). */
  balance: number
  /** Net asset value: cash + reserved + pending + market value (VND). */
  totalAssets: number
  /** Total unrealized P&L across positions (VND). */
  pnl: number
  /** Unrealized return (%). */
  pnlPercent: number
  /** Win rate (%). */
  winRate: number
  /** Number of orders placed. */
  totalOrders: number
}

export interface VTOrderResult {
  id: string
  symbol: string
  side: string
  type: string
  quantity: number
  /** Filled or limit price (VND). */
  price: number
  /** Gross / net amount (VND). */
  total: number
  fee: number
  status: string
}

export interface VTPosition {
  symbol: string
  quantity: number
  avgBuyPrice: number
  currentPrice: number
  marketValue: number
  unrealizedPnl: number
}

export interface VTOrder {
  id: string
  symbol: string
  side: "BUY" | "SELL"
  quantity: number
  /** Filled or limit price (VND). */
  price: number
  /** Gross amount (VND). */
  total: number
  status: string
  createdAt: string
}

/** Portfolio snapshot: positions plus account-level totals. */
export interface VTPortfolio {
  positions: VTPosition[]
  balance: number
  totalAssets: number
  pnl: number
  pnlPercent: number
}

type Raw = Record<string, unknown>
const num = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function adaptAccount(raw: Raw): VTAccount {
  return {
    balance: num(raw.cash_available_vnd ?? raw.balance),
    pnl: num(raw.total_unrealized_pnl_vnd ?? raw.totalPnl),
    pnlPercent: num(raw.return_pct ?? raw.totalPnlPercent),
    winRate: num(raw.win_rate ?? raw.winRate),
    totalOrders: num(raw.total_orders ?? raw.totalOrders),
    totalAssets:
      num(raw.cash_available_vnd) +
      num(raw.cash_reserved_vnd) +
      num(raw.cash_pending_vnd) +
      num(raw.total_market_value_vnd),
  }
}

function adaptOrderResult(raw: Raw): VTOrderResult {
  return {
    id: String(raw.id),
    symbol: String(raw.symbol ?? ""),
    side: String(raw.side ?? ""),
    type: String(raw.order_type ?? raw.type ?? ""),
    quantity: num(raw.quantity),
    price: num(raw.filled_price_vnd ?? raw.limit_price_vnd ?? raw.price),
    total: num(
      raw.gross_amount_vnd ?? raw.net_amount_vnd ?? raw.filled_value_vnd ?? raw.total,
    ),
    fee: num(raw.fee_vnd ?? raw.fee),
    status: String(raw.status ?? ""),
  }
}

function adaptPosition(raw: Raw): VTPosition {
  return {
    symbol: String(raw.symbol ?? "").toUpperCase(),
    quantity: num(raw.quantity_total ?? raw.quantity),
    avgBuyPrice: num(raw.avg_cost_vnd ?? raw.avgBuyPrice),
    currentPrice: num(raw.current_price_vnd),
    marketValue: num(raw.market_value_vnd),
    unrealizedPnl: num(raw.unrealized_pnl_vnd),
  }
}

function adaptOrder(raw: Raw): VTOrder {
  return {
    id: String(raw.id),
    symbol: String(raw.symbol ?? "").toUpperCase(),
    side: String(raw.side ?? "").toUpperCase() as "BUY" | "SELL",
    quantity: num(raw.quantity),
    price: num(raw.filled_price_vnd ?? raw.limit_price_vnd ?? raw.price),
    total: num(raw.gross_amount_vnd ?? raw.net_amount_vnd),
    status: String(raw.status ?? "").toUpperCase(),
    createdAt: String(raw.created_at ?? raw.createdAt ?? ""),
  }
}

export const tradingApi = {
  /** POST /virtual-trading/account/activate — grants 1B virtual VND. */
  activate: async (): Promise<VTAccount> => {
    const raw = await api.post("virtual-trading/account/activate").json<Raw>()
    return adaptAccount(raw)
  },

  /** GET /virtual-trading/account. */
  getAccount: async (): Promise<VTAccount> => {
    const raw = await api.get("virtual-trading/account").json<Raw>()
    return adaptAccount(raw)
  },

  /** POST /virtual-trading/orders — market buy. */
  buyMarket: async (symbol: string, quantity: number): Promise<VTOrderResult> => {
    const raw = await api
      .post("virtual-trading/orders", {
        json: { symbol, side: "buy", order_type: "market", quantity },
      })
      .json<Raw>()
    return adaptOrderResult(raw)
  },

  /** POST /virtual-trading/orders — market sell. */
  sellMarket: async (symbol: string, quantity: number): Promise<VTOrderResult> => {
    const raw = await api
      .post("virtual-trading/orders", {
        json: { symbol, side: "sell", order_type: "market", quantity },
      })
      .json<Raw>()
    return adaptOrderResult(raw)
  },

  /** POST /virtual-trading/orders — limit buy (price in VND). */
  buyLimit: async (
    symbol: string,
    quantity: number,
    triggerPrice: number,
  ): Promise<VTOrderResult> => {
    const raw = await api
      .post("virtual-trading/orders", {
        json: {
          symbol,
          side: "buy",
          order_type: "limit",
          quantity,
          limit_price_vnd: triggerPrice,
        },
      })
      .json<Raw>()
    return adaptOrderResult(raw)
  },

  /** POST /virtual-trading/orders — limit sell (price in VND). */
  sellLimit: async (
    symbol: string,
    quantity: number,
    triggerPrice: number,
  ): Promise<VTOrderResult> => {
    const raw = await api
      .post("virtual-trading/orders", {
        json: {
          symbol,
          side: "sell",
          order_type: "limit",
          quantity,
          limit_price_vnd: triggerPrice,
        },
      })
      .json<Raw>()
    return adaptOrderResult(raw)
  },

  /** POST /virtual-trading/orders/{id}/cancel. */
  cancelOrder: async (id: string): Promise<void> => {
    await api.post(`virtual-trading/orders/${id}/cancel`).json<Raw>()
  },

  /** GET /virtual-trading/orders?status=pending. */
  getPendingOrders: async (): Promise<VTOrder[]> => {
    const raw = await api
      .get("virtual-trading/orders", {
        searchParams: { status: "pending", page: 1, page_size: 50 },
      })
      .json<{ orders?: Raw[] }>()
    return (raw.orders || []).map(adaptOrder)
  },

  /** GET /virtual-trading/orders (paginated, optional status filter). */
  getOrders: async (
    page = 1,
    limit = 30,
    status?: string,
  ): Promise<VTOrder[]> => {
    const params: Record<string, string | number> = { page, page_size: limit }
    if (status) params.status = status.toLowerCase()
    const raw = await api
      .get("virtual-trading/orders", { searchParams: params })
      .json<{ orders?: Raw[]; data?: Raw[] }>()
    return (raw.orders || raw.data || []).map(adaptOrder)
  },

  /** GET /virtual-trading/portfolio — positions + account totals. */
  getPortfolio: async (): Promise<VTPortfolio> => {
    const raw = await api.get("virtual-trading/portfolio").json<Raw>()
    const account = (raw.account as Raw) || {}
    return {
      positions: ((raw.positions as Raw[]) || []).map(adaptPosition),
      balance: num(account.cash_available_vnd ?? account.balance),
      totalAssets: num(raw.nav_vnd),
      pnl: num(raw.total_unrealized_pnl_vnd),
      pnlPercent: num(raw.return_pct),
    }
  },
}
