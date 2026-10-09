import { canonicalHash } from './bot.domain.js';

/** @deprecated Historical fixture/audit field order; never a live decision gate. */
export const BOT_LAYER_KEYS = Object.freeze([
  'ky_thuat',
  'dong_tien',
  'noi_bo',
  'tin_tuc',
] as const);

/**
 * Frozen Bot V1 receipt data. This module exists only to verify historical
 * receipts; the Academy activation policy must never execute these rules.
 */
export const LEGACY_BOT_V1_RULES = Object.freeze({
  strategy_id: 'iqx_standard',
  strategy_version: 1,
  execution_model: 'same_session_close',
  initial_cash_vnd: 100_000_000n,
  min_supporting_layers: 3,
  max_results_per_filter: 10,
  max_unique_candidates: 50,
  max_new_buys_per_session: 2,
  buy_budget_nav_pct: 12,
  buy_budget_includes_fee: true,
  max_symbol_nav_pct: 30,
  stop_loss_l1_multiplier: 2,
  take_profit_l1_multiplier: 4,
  allow_add_to_open_symbol: false,
  allow_rebuy_same_session: false,
});

export type LegacyBotV1RuleSnapshot = Omit<typeof LEGACY_BOT_V1_RULES, 'initial_cash_vnd'> & {
  initial_cash_vnd: number;
};

export const LEGACY_BOT_V1_RULE_SNAPSHOT: LegacyBotV1RuleSnapshot = Object.freeze({
  ...LEGACY_BOT_V1_RULES,
  initial_cash_vnd: Number(LEGACY_BOT_V1_RULES.initial_cash_vnd),
});

export const LEGACY_BOT_V1_RULE_HASH =
  '73df87d8fdf044b2bbab7d80dd1896ee8bda551ab9395dcee908d82bcdce871e';

export function isLegacyBotV1Snapshot(value: unknown): boolean {
  return canonicalHash(value) === LEGACY_BOT_V1_RULE_HASH;
}

/**
 * Frozen `iqx-bot-academy-activation-1` policy snapshot. It exists only so receipts written
 * before `iqx-bot-v1.0` stay verifiable; no new run is ever created with it.
 */
export const LEGACY_ACADEMY_POLICY_VERSION = 'iqx-bot-academy-activation-1' as const;

export const LEGACY_ACADEMY_POLICY = Object.freeze({
  policy_version: LEGACY_ACADEMY_POLICY_VERSION,
  execution_model: 'same_session_close',
  initial_cash_vnd: 100_000_000,
  require_active_buy_conditions: true,
  empty_buy_gate: false,
  empty_sell_gate: false,
  require_five_ai_layers: false,
  ai_support_threshold_enabled: false,
  ai_news_insider_veto_enabled: false,
  candidate_source: Object.freeze([
    'khoi_ngoai_gom',
    'tu_doanh_gom',
    'kl_dot_bien',
    'vuot_dinh_20',
    'tang_manh_kl',
  ] as const),
  max_results_per_filter: 10,
  max_unique_candidates: 50,
  candidate_sort: Object.freeze([
    'filter_count desc',
    'trading_value_avg20_vnd desc',
    'symbol asc',
  ] as const),
  max_new_buys_per_session: 2,
  buy_budget_nav_ratio: '0.12',
  max_symbol_nav_ratio: '0.30',
  allow_add_to_open_symbol: false,
  allow_rebuy_same_session: false,
  protective_stop: Object.freeze({
    basis: 'close',
    l1_multiplier: 2,
    action: 'sell_all',
  } as const),
  fixed_take_profit_enabled: false,
  implicit_max_holding_enabled: false,
  implicit_trailing_enabled: false,
} as const);

export const LEGACY_ACADEMY_POLICY_HASH = canonicalHash(LEGACY_ACADEMY_POLICY);
