import ky, { type KyInstance } from "ky"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

let _accessToken: string | null = localStorage.getItem("accessToken")

export function setAccessToken(token: string | null) {
  _accessToken = token
  if (token) localStorage.setItem("accessToken", token)
  else localStorage.removeItem("accessToken")
}

export function getAccessToken() {
  return _accessToken
}

export const api: KyInstance = ky.create({
  prefixUrl: API_BASE,
  hooks: {
    beforeRequest: [
      (request) => {
        const token = getAccessToken()
        if (token) {
          request.headers.set("Authorization", `Bearer ${token}`)
        }
      },
    ],
    afterResponse: [
      async (request, _options, response) => {
        if (response.status === 401) {
          const refreshed = await tryRefreshToken()
          if (!refreshed) {
            setAccessToken(null)
            localStorage.removeItem("refreshToken")
            window.dispatchEvent(new CustomEvent("auth:logout"))
            return
          }
          
          const token = getAccessToken()
          if (token) {
            request.headers.set("Authorization", `Bearer ${token}`)
          }
          return ky(request)
        }
      },
    ],
  },
})

let refreshTokenPromise: Promise<boolean> | null = null

async function tryRefreshToken(): Promise<boolean> {
  if (refreshTokenPromise) {
    return refreshTokenPromise
  }

  refreshTokenPromise = (async () => {
    const refreshToken = localStorage.getItem("refreshToken")
    if (!refreshToken) return false

    try {
      // Backend: POST /auth/refresh { refresh_token } → { access_token, refresh_token, token_type }
      const res = await ky
        .post(`${API_BASE}/auth/refresh`, {
          json: { refresh_token: refreshToken },
        })
        .json<{ access_token: string; refresh_token: string; token_type: string }>()

      setAccessToken(res.access_token)
      localStorage.setItem("refreshToken", res.refresh_token)
      return true
    } catch {
      return false
    } finally {
      refreshTokenPromise = null
    }
  })()

  return refreshTokenPromise
}

// ── Adapter helpers ──

/** Convert snake_case backend user to camelCase AuthUser for UI */
function adaptUserResponse(raw: BackendUserResponse): AuthUser {
  return {
    id: String(raw.id),
    email: raw.email,
    fullName: raw.full_name || `${raw.first_name} ${raw.last_name}`.trim() || null,
    firstName: raw.first_name,
    lastName: raw.last_name,
    phone: raw.phone_number || null,
    role: raw.role,
    status: raw.status,
    isActive: raw.status === "active",
    createdAt: raw.created_at,
  }
}

// ── Auth API ──

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
}

export interface AuthUser {
  id: string
  email: string
  fullName: string | null
  firstName: string
  lastName: string
  phone: string | null
  role: string
  status: string
  isActive: boolean
  createdAt: string
}

/** Raw backend UserResponse shape (snake_case) */
interface BackendUserResponse {
  id: string
  email: string
  first_name: string
  last_name: string
  full_name: string
  phone_number: string | null
  role: string
  status: string
  is_email_verified: boolean
  created_at: string
  updated_at: string
  [key: string]: unknown
}

/** Backend TokenResponse shape */
interface BackendTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

// Wrapper: UI-compatible AuthResponse shape (adapter layer)
export interface AuthResponse {
  user: AuthUser
  accessToken: string
  refreshToken: string
}

export const authApi = {
  /**
   * Login flow:
   * 1. POST /auth/login → { access_token, refresh_token }
   * 2. GET /auth/me → UserResponse (snake_case)
   * Returns adapted AuthResponse for UI.
   */
  login: async (payload: LoginPayload): Promise<AuthResponse> => {
    const tokenRes = await api
      .post("auth/login", { json: payload })
      .json<BackendTokenResponse>()

    // Temporarily set token to fetch /auth/me
    setAccessToken(tokenRes.access_token)

    const userRaw = await api.get("auth/me").json<BackendUserResponse>()
    const user = adaptUserResponse(userRaw)

    return {
      user,
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token,
    }
  },

  /**
   * Register flow:
   * 1. POST /auth/register → UserResponse (no auto-login)
   * 2. POST /auth/login → { access_token, refresh_token }
   * 3. GET /auth/me → UserResponse
   * Returns adapted AuthResponse for UI.
   */
  register: async (payload: RegisterPayload): Promise<AuthResponse> => {
    // Register (does NOT auto-login)
    await api
      .post("auth/register", {
        json: {
          email: payload.email,
          password: payload.password,
          first_name: payload.firstName,
          last_name: payload.lastName,
          phone_number: payload.phone || undefined,
        },
      })
      .json<BackendUserResponse>()

    // Login after register
    const tokenRes = await api
      .post("auth/login", { json: { email: payload.email, password: payload.password } })
      .json<BackendTokenResponse>()

    setAccessToken(tokenRes.access_token)

    const userRaw = await api.get("auth/me").json<BackendUserResponse>()
    const user = adaptUserResponse(userRaw)

    return {
      user,
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token,
    }
  },

  logout: () =>
    api.post("auth/logout").json<{ message: string }>(),

  /** Fetch current user profile from /auth/me */
  getMe: async (): Promise<AuthUser> => {
    const raw = await api.get("auth/me").json<BackendUserResponse>()
    return adaptUserResponse(raw)
  },
}

// ── Virtual Trading API (replaces Arena) ──

export interface ArenaAccount {
  balance: number
  totalPnl: number
  totalPnlPercent: number
  winRate: number
  totalOrders: number
  totalAssets: number
}

export interface ArenaOrderResult {
  message: string
  data: {
    id: string
    symbol: string
    side: string
    type: string
    quantity: number
    price: number
    total: number
    fee: number
    status: string
  }
}

/** Adapt backend AccountResponse → UI ArenaAccount shape */
function adaptVTAccount(raw: any): ArenaAccount {
  return {
    balance: raw.cash_available_vnd ?? raw.balance ?? 0,
    totalPnl: raw.total_unrealized_pnl_vnd ?? raw.totalPnl ?? 0,
    totalPnlPercent: raw.return_pct ?? raw.totalPnlPercent ?? 0,
    winRate: raw.win_rate ?? raw.winRate ?? 0,
    totalOrders: raw.total_orders ?? raw.totalOrders ?? 0,
    totalAssets: (raw.cash_available_vnd ?? 0) + (raw.cash_reserved_vnd ?? 0) + (raw.cash_pending_vnd ?? 0) + (raw.total_market_value_vnd ?? 0),
  }
}

/** Adapt backend OrderResponse → UI shape */
function adaptVTOrder(raw: any): ArenaOrderResult["data"] {
  const priceVnd = raw.filled_price_vnd ?? raw.limit_price_vnd ?? raw.price ?? 0
  const totalVnd = raw.gross_amount_vnd ?? raw.net_amount_vnd ?? raw.filled_value_vnd ?? raw.total ?? 0
  return {
    id: String(raw.id),
    symbol: raw.symbol,
    side: raw.side,
    type: raw.order_type ?? raw.type,
    quantity: raw.quantity,
    price: priceVnd,
    total: totalVnd,
    fee: raw.fee_vnd ?? raw.fee ?? 0,
    status: raw.status,
  }
}

export const arenaApi = {
  activate: async () => {
    const raw = await api.post("virtual-trading/account/activate").json<any>()
    return { message: "OK", data: adaptVTAccount(raw) }
  },

  getAccount: async () => {
    const raw = await api.get("virtual-trading/account").json<any>()
    return { message: "OK", data: adaptVTAccount(raw) }
  },

  buyMarket: async (symbol: string, quantity: number) => {
    const raw = await api
      .post("virtual-trading/orders", {
        json: { symbol, side: "buy", order_type: "market", quantity },
      })
      .json<any>()
    return { message: "OK", data: adaptVTOrder(raw) } as ArenaOrderResult
  },

  sellMarket: async (symbol: string, quantity: number) => {
    const raw = await api
      .post("virtual-trading/orders", {
        json: { symbol, side: "sell", order_type: "market", quantity },
      })
      .json<any>()
    return { message: "OK", data: adaptVTOrder(raw) } as ArenaOrderResult
  },

  buyLimit: async (symbol: string, quantity: number, triggerPrice: number) => {
    const raw = await api
      .post("virtual-trading/orders", {
        json: { symbol, side: "buy", order_type: "limit", quantity, limit_price_vnd: triggerPrice },
      })
      .json<any>()
    return { message: "OK", data: adaptVTOrder(raw) } as ArenaOrderResult
  },

  sellLimit: async (symbol: string, quantity: number, triggerPrice: number) => {
    const raw = await api
      .post("virtual-trading/orders", {
        json: { symbol, side: "sell", order_type: "limit", quantity, limit_price_vnd: triggerPrice },
      })
      .json<any>()
    return { message: "OK", data: adaptVTOrder(raw) } as ArenaOrderResult
  },

  cancelOrder: async (id: string) => {
    await api.post(`virtual-trading/orders/${id}/cancel`).json<any>()
    return { message: "Đã hủy lệnh" }
  },

  getPendingOrders: async () => {
    const raw = await api
      .get("virtual-trading/orders", { searchParams: { status: "pending", page: 1, page_size: 50 } })
      .json<any>()
    const orders = (raw.orders || []).map(adaptVTOrder)
    return { data: orders }
  },

  getOrders: async (page = 1, limit = 20, status?: string) => {
    const params: Record<string, string | number> = { page, page_size: limit }
    if (status) params.status = status
    const raw = await api.get("virtual-trading/orders", { searchParams: params }).json<any>()
    const orders = (raw.orders || []).map(adaptVTOrder)
    return { data: orders }
  },

  getPortfolio: async () => {
    const raw = await api.get("virtual-trading/portfolio").json<any>()
    const positions = (raw.positions || []).map((p: any) => ({
      symbol: p.symbol,
      quantity: p.quantity,
      avgBuyPrice: p.avg_cost_vnd ?? p.avgBuyPrice ?? 0,
      currentPrice: p.current_price_vnd ?? 0,
      marketValue: p.market_value_vnd ?? 0,
      unrealizedPnl: p.unrealized_pnl_vnd ?? 0,
    }))
    return { data: positions }
  },
}

// ── Users API ──

export interface UserProfile {
  id: string
  email: string
  fullName: string | null
  firstName: string
  lastName: string
  phone: string | null
  role: string
  isActive: boolean
  premiumExpiresAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UpdateProfilePayload {
  firstName?: string
  lastName?: string
  phone?: string
  // TODO: backend does not have self-change-password endpoint.
  // Do not send password via PATCH /users/me.
}

function adaptProfile(raw: BackendUserResponse): UserProfile {
  return {
    id: String(raw.id),
    email: raw.email,
    fullName: raw.full_name || `${raw.first_name} ${raw.last_name}`.trim() || null,
    firstName: raw.first_name,
    lastName: raw.last_name,
    phone: raw.phone_number || null,
    role: raw.role,
    isActive: raw.status === "active",
    premiumExpiresAt: null, // Use GET /premium/me for subscription status
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

export const usersApi = {
  getProfile: async () => {
    const raw = await api.get("users/me").json<BackendUserResponse>()
    return { message: "OK", data: adaptProfile(raw) }
  },

  updateProfile: async (payload: UpdateProfilePayload) => {
    const body: Record<string, string | undefined> = {}
    if (payload.firstName !== undefined) body.first_name = payload.firstName
    if (payload.lastName !== undefined) body.last_name = payload.lastName
    if (payload.phone !== undefined) body.phone_number = payload.phone
    const raw = await api.patch("users/me", { json: body }).json<BackendUserResponse>()
    return { message: "OK", data: adaptProfile(raw) }
  },
}

// ── Premium API (replaces Payments) ──

export interface PlanInfo {
  id: string
  plan: string
  label: string
  months: number
  price: number
  currency: string
}

export interface CheckoutData {
  paymentId: string
  checkoutUrl: string
  fields: Record<string, string>
  plan: string
  planLabel: string
  amount: number
}

/** Adapt backend PlanResponse → UI PlanInfo */
function adaptPlan(raw: any): PlanInfo {
  return {
    id: String(raw.id),
    plan: raw.code,
    label: raw.name,
    months: Math.round((raw.duration_days ?? 30) / 30),
    price: raw.price_vnd ?? raw.price ?? 0,
    currency: "VND",
  }
}

/** Adapt backend CheckoutResponse → UI CheckoutData */
function adaptCheckout(raw: any, plan: PlanInfo): CheckoutData {
  // Backend: { action, method, fields: [{name, value}], invoice_number, order_id }
  const fields: Record<string, string> = {}
  if (Array.isArray(raw.fields)) {
    for (const f of raw.fields) {
      fields[f.name] = f.value
    }
  }

  return {
    paymentId: raw.order_id || raw.invoice_number || "",
    checkoutUrl: raw.action || "",
    fields,
    plan: plan.plan,
    planLabel: plan.label,
    amount: plan.price,
  }
}

export const paymentsApi = {
  getPlans: async () => {
    const rawPlans = await api.get("premium/plans").json<any[]>()
    return { message: "OK", data: rawPlans.map(adaptPlan) }
  },

  createCheckout: async (planKey: string) => {
    // First find plan by code to get the UUID id
    const rawPlans = await api.get("premium/plans").json<any[]>()
    const plan = rawPlans.find((p: any) => p.code === planKey)
    if (!plan) throw new Error(`Plan ${planKey} not found`)

    const adaptedPlan = adaptPlan(plan)

    const raw = await api
      .post("premium/checkout", { json: { plan_id: plan.id } })
      .json<any>()

    return { message: "OK", data: adaptCheckout(raw, adaptedPlan) }
  },

  /** TODO: Backend does not have a user payment history endpoint.
   *  GET /premium/me returns subscription status only, not history.
   *  Returning empty data gracefully. */
  getHistory: async (_page = 1, _limit = 10) => {
    try {
      const raw = await api.get("premium/my-orders").json<any[]>()
      const items = raw.map((o: any) => ({
        id: o.id,
        description: o.planName || "IQX Premium",
        amount: o.amount,
        status: o.status === "paid" ? "COMPLETED" : o.status === "pending" ? "PENDING" : "FAILED",
        createdAt: o.createdAt,
        paidAt: o.paidAt,
        invoiceNumber: o.invoiceNumber,
      }))
      return {
        message: "OK",
        data: {
          items,
          total: items.length,
          page: _page,
          limit: _limit,
          totalPages: 1,
        },
      }
    } catch {
      return {
        message: "OK",
        data: { items: [] as any[], total: 0, page: _page, limit: _limit, totalPages: 0 },
      }
    }
  },
}
