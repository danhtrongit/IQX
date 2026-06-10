import { api } from "./client"

export interface PlanDistributionPoint {
  plan_code: string
  plan_name: string
  price_vnd: number
  active_subscriptions: number
}

export interface MetricsOverview {
  total_users: number
  active_users: number
  new_users_today: number
  new_users_last_7d: number
  new_users_last_30d: number
  active_subscribers: number
  active_trial_count: number
  active_paid_count: number
  plan_distribution: PlanDistributionPoint[]
  mrr_vnd: number
  revenue_today_vnd: number
  revenue_last_7d_vnd: number
  revenue_last_30d_vnd: number
  vt_active_accounts: number
  vt_orders_today: number
  generated_at: string
}

export interface DailyRevenuePoint {
  date: string
  paid_orders: number
  revenue_vnd: number
}

export const metricsApi = {
  overview: () => api.get("admin/metrics/overview").json<MetricsOverview>(),
  revenue: (days = 30) => api.get(`admin/metrics/revenue?days=${days}`).json<DailyRevenuePoint[]>(),
  planDistribution: () => api.get("admin/metrics/plan-distribution").json<PlanDistributionPoint[]>(),
}
