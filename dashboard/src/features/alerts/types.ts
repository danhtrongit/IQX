export type Side = "buy" | "sell"
export type Logic = "AND" | "OR"

export interface Condition {
  indicator: string
  op: string
  value: number | string | null
}

export interface Combination {
  logic: Logic
  conditions: Condition[]
}

export interface AlertSignal {
  key: string
  side: Side
  ta_name: string
  message_title: string
  combination: Combination
  is_enabled: boolean
  sort_order: number
}

export interface UserAlertRule {
  id: string
  name: string
  side: Side
  base_signal_key: string | null
  combination: Combination
  is_enabled: boolean
  created_at: string
  updated_at: string
}

export interface AlertEvent {
  id: string
  symbol: string
  signal_key: string | null
  session_date: string
  fired_at: string
  price: number | null
  delivered: boolean
}

export interface TelegramStatus {
  linked: boolean
  linked_at: string | null
  bot_username: string | null
}

export interface TelegramLink {
  deep_link: string
  token: string
}

export interface CreateRuleBody {
  signal_key?: string
  name?: string
  side?: Side
  combination?: Combination
  is_enabled?: boolean
}
