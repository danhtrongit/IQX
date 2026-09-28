import type { Combination } from '../quant/conditions.js';

export type AlertSide = 'buy' | 'sell';

export type AlertSignal = {
  id: string;
  key: string;
  side: AlertSide;
  ta_name: string;
  message_title: string;
  combination: Combination;
  is_enabled: boolean;
  sort_order: number;
  created_at: Date | string;
  updated_at: Date | string;
};

export type UserAlertRule = {
  id: string;
  user_id: string;
  name: string;
  side: AlertSide;
  base_signal_key: string | null;
  combination: Combination;
  is_enabled: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

export type AlertEvent = {
  id: string;
  user_id: string;
  rule_id: string;
  symbol: string;
  signal_key: string | null;
  session_date: Date | string;
  fired_at: Date | string;
  price: string | number | null;
  delivered: boolean;
  delivery_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type ScannableRule = UserAlertRule & {
  telegram_chat_id: string | null;
  symbols: string[];
};

export type AlertScanSummary = {
  rules: number;
  symbols_scanned: number;
  alerts_fired: number;
  deliveries_succeeded: number;
  deliveries_failed: number;
  ran_at: string;
  skipped?: 'market_closed' | 'disabled';
};
