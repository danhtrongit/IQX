import { api } from "@/shared/http/client"

/* ── UI types (camelCase) ─────────────────────────────────── */

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

export interface PremiumSubscriptionStatus {
  isPremium: boolean
  isTrial: boolean
  status: string | null
  planCode: string | null
  planName: string | null
  periodEnd: Date | null
}

/* ── Raw backend shapes (snake_case) ──────────────────────── */

interface BackendPlan {
  id: string | number
  code: string
  name: string
  duration_days?: number
  price_vnd?: number
  price?: number
}

interface BackendCheckout {
  action?: string
  method?: string
  fields?: Array<{ name: string; value: string }>
  invoice_number?: string
  order_id?: string
}

interface BackendPremiumSubscription {
  is_premium: boolean
  is_trial: boolean
  status: string | null
  current_plan: {
    id: string
    code: string
    name: string
    price_vnd: number
    duration_days: number
  } | null
  current_period_start: string | null
  current_period_end: string | null
}

/* ── Adapters (snake → camel) ─────────────────────────────── */

/** Adapt backend PlanResponse → UI PlanInfo. */
function adaptPlan(raw: BackendPlan): PlanInfo {
  return {
    id: String(raw.id),
    plan: raw.code,
    label: raw.name,
    months: Math.round((raw.duration_days ?? 30) / 30),
    price: raw.price_vnd ?? raw.price ?? 0,
    currency: "VND",
  }
}

/** Adapt backend CheckoutResponse → UI CheckoutData. */
function adaptCheckout(raw: BackendCheckout, plan: PlanInfo): CheckoutData {
  // Backend: { action, method, fields: [{name, value}], invoice_number, order_id }
  const fields: Record<string, string> = {}
  if (Array.isArray(raw.fields)) {
    for (const f of raw.fields) fields[f.name] = f.value
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

function adaptPremiumStatus(raw: BackendPremiumSubscription): PremiumSubscriptionStatus {
  return {
    isPremium: raw.is_premium,
    isTrial: raw.is_trial,
    status: raw.status,
    planCode: raw.current_plan?.code ?? null,
    planName: raw.current_plan?.name ?? null,
    periodEnd: raw.current_period_end ? new Date(raw.current_period_end) : null,
  }
}

/* ── Endpoint functions ───────────────────────────────────── */

export const paymentsApi = {
  /** GET /premium/plans → adapted PlanInfo[]. */
  getPlans: async (): Promise<PlanInfo[]> => {
    const rawPlans = await api.get("premium/plans").json<BackendPlan[]>()
    return rawPlans.map(adaptPlan)
  },

  /** Resolve plan UUID by code, then POST /premium/checkout. */
  createCheckout: async (planKey: string): Promise<CheckoutData> => {
    const rawPlans = await api.get("premium/plans").json<BackendPlan[]>()
    const plan = rawPlans.find((p) => p.code === planKey)
    if (!plan) throw new Error(`Plan ${planKey} not found`)

    const adaptedPlan = adaptPlan(plan)
    const raw = await api
      .post("premium/checkout", { json: { plan_id: plan.id } })
      .json<BackendCheckout>()

    return adaptCheckout(raw, adaptedPlan)
  },
}

export const premiumApi = {
  /** GET /premium/me → adapted subscription status. */
  getMe: async (): Promise<PremiumSubscriptionStatus> => {
    const raw = await api.get("premium/me").json<BackendPremiumSubscription>()
    return adaptPremiumStatus(raw)
  },
}
