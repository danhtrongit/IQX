export type TradingAccount = {
  id: string
  user_id: string
  status: string
  initial_cash_vnd: number
  cash_available_vnd: number
  cash_reserved_vnd: number
  cash_pending_vnd: number
  total_cash_vnd: number
  activated_at: string
  reset_at: string | null
  created_at: string
}

export type TradingPosition = {
  symbol: string
  quantity_total: number
  quantity_sellable: number
  quantity_pending: number
  quantity_reserved: number
  avg_cost_vnd: number
  current_price_vnd: number | null
  market_value_vnd: number | null
  unrealized_pnl_vnd: number | null
  active_plan_buy_order_id: string | null
  active_original_stop_vnd: number | null
  active_original_take_profit_vnd: number | null
  active_dynamic_stop_vnd: number | null
}

export type TradingPortfolio = {
  account: TradingAccount
  positions: TradingPosition[]
  total_market_value_vnd: number
  nav_vnd: number
  total_unrealized_pnl_vnd: number
  return_pct: number
  refresh_warnings: string[]
}

export type TradingOrder = {
  id: string
  account_id: string
  symbol: string
  mode: string
  side: string
  order_type: string
  status: string
  quantity: number
  limit_price_vnd: number | null
  reserved_cash_vnd: number
  reserved_quantity: number
  filled_price_vnd: number | null
  gross_amount_vnd: number | null
  fee_vnd: number | null
  tax_vnd: number | null
  net_amount_vnd: number | null
  trading_date: string
  rejection_reason: string | null
  cancel_reason: string | null
  exit_matched_buy_order_id: string | null
  exit_snapshot_at: string | null
  exit_avg_cost_vnd: number | null
  journey_plan_saved_levels: number[]
  nhoi_lenh_alert_linked: boolean
  created_at: string
}

export type OrderPage = {
  orders: TradingOrder[]
  total: number
  page: number
  page_size: number
}

export type MarketQuote = {
  symbol: string
  price: number | null
  reference: number | null
  ceiling: number | null
  floor: number | null
  high: number | null
  low: number | null
  volume: number | null
  bids: { price: number; volume: number }[]
  asks: { price: number; volume: number }[]
}

export type JourneyProgress = {
  graduated_at?: string | null
  entered_at?: string | null
  [key: string]: unknown
}
