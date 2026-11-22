/**
 * Fixed parameters of the shared strategy rules (IQX-Bot-Chien-Luoc-SPEC v2.0 §3.1). They are not
 * part of a strategy: Backtest and Bot both run with exactly these values (Q2, Q3).
 */

/** Version of the shared rules (§3) recorded on every Backtest run and Bot receipt. */
export const RULES_VERSION = 'iqx-strategy-rules-2.0' as const;

/** Logical name of the price store recorded in run snapshots (§2.1). */
export const DATA_STORE_NAME = 'flashback_vn100' as const;
export const PRICE_UNIT = 'VND' as const;

/** Index symbol stored in the price store; its bars define the trading calendar (D1). */
export const MARKET_INDEX_SYMBOL = 'VNINDEX' as const;

export const STRATEGY_RULES = Object.freeze({
  /** Initial capital of the Bot and of every Backtest (Q5). */
  initial_cash_vnd: 100_000_000n,
  /** Buy budget = 12% of the session NAV (after sells), fees included. */
  buy_budget_bps: 1_200,
  /** At most two successful buys per session (sells are unlimited). */
  max_buys_per_session: 2,
  /** A buy whose value exceeds 30% of the session NAV is skipped (no lot shrinking, D5d). */
  max_symbol_nav_bps: 3_000,
  /** Board lot. */
  lot_size: 100,
  /** T+2: bought in session T, sellable from session T+2. */
  settlement_sessions: 2,
  /** Rolling window of the GTGD TB20 ranking (sessions of the symbol, D included). */
  liquidity_window: 20,
  /** Giữ tối đa used when the Bot has no strategy (§3.6, §5.6) and the default of new strategies. */
  default_max_holding: 30,
  max_holding_min: 3,
  max_holding_max: 250,
  /** Largest basket (§10.6). */
  max_basket_symbols: 100,
  /** The first 450 store sessions warm the indicators up: `Từ ngày` >= session #451 (§2.3). */
  warmup_sessions: 450,
  /** `Đến ngày` - `Từ ngày` at most 3653 calendar days (§2.3). */
  max_range_days: 3_653,
  /** Annualised return is `—` below this many sessions (§4.7). */
  annualise_min_sessions: 60,
  /** Trading sessions per year used to annualise. */
  sessions_per_year: 252,
  /** Rows kept in `skipped_orders.items` of a Backtest result (§4.7). */
  skipped_items_limit: 60,
});

/**
 * Default fees (§3.1, D5): buy 0.15%; sell 0.15% fee + 0.10% tax = 0.25%. The Bot passes the fee
 * row of its own configuration (`buy_fee_rate_bps`, `sell_fee_rate_bps`, `sell_tax_rate_bps`).
 */
export const DEFAULT_FEE_RULES = Object.freeze({
  buy_fee_bps: 15,
  sell_fee_bps: 15,
  sell_tax_bps: 10,
  lot_size: STRATEGY_RULES.lot_size,
});

/** Vietnamese texts of the rules (journal, skip reasons, exit reasons). */
export const RULE_MESSAGES = Object.freeze({
  session_buy_limit: 'Đã đủ 2 lệnh mua trong phiên',
  insufficient_cash: 'Không đủ tiền mặt cho 1 lô',
  budget_below_lot: '12% NAV không đủ mua 1 lô (giá cao)',
  symbol_cap: 'Vượt trần 30% NAV mỗi mã',
  t2_wait: 'Điều kiện Bán đạt, chờ T+2',
  sell_unknown: 'Điều kiện Bán chưa đánh giá được',
  sell_not_met: 'Điều kiện Bán chưa đạt',
  no_sell_condition: 'Không có điều kiện Bán, chờ hết thời gian giữ',
  due_unfilled: 'Đến hạn, chưa khớp',
  no_price: 'Không có giá đóng cửa hợp lệ trong phiên',
  sell_issue: 'Chỉ báo Bán lỗi',
  universe_empty: 'Rổ mua không có mã',
  no_strategy: 'Chưa chọn chiến lược · không mua mới',
  sell_only: 'Chiến lược chỉ bán · không mua mới',
  nav_incomplete: 'Thiếu giá đóng cửa của vị thế đang giữ · không mua mới',
  no_orders: 'Không có lệnh',
  exit_indicator: 'Điều kiện Bán',
  exit_max_holding: 'Hết thời gian giữ',
});
