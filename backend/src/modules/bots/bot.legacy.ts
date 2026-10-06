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
