/**
 * Policy `iqx-bot-v2.0` (Bot và Chiến lược v2.0, spec §3, PLAN D5): the Bot runs the shared
 * strategy rules (`strategy-rules`, `RULES_VERSION`) on the strategy version of its locked
 * schedule row, with prices from the daily price store only. Receipts of `iqx-bot-v1.x` stay
 * verifiable through `bot.shared-config.ts` / `bot.legacy.ts`; they are never executed again.
 */

import {
  DATA_STORE_NAME,
  PRICE_UNIT,
  RULES_VERSION,
  STRATEGY_RULES,
  type StrategySource,
} from '../strategy-rules/index.js';
import { canonicalHash } from './bot.domain.js';

export const BOT_POLICY_V2_VERSION = 'iqx-bot-v2.0' as const;

export const BOT_POLICY_V2 = Object.freeze({
  policy_version: BOT_POLICY_V2_VERSION,
  rules_version: RULES_VERSION,
  execution_model: 'same_session_close',
  data_store: DATA_STORE_NAME,
  price_unit: PRICE_UNIT,
  initial_cash_vnd: Number(STRATEGY_RULES.initial_cash_vnd),
  buy_budget_bps: STRATEGY_RULES.buy_budget_bps,
  max_buys_per_session: STRATEGY_RULES.max_buys_per_session,
  max_symbol_nav_bps: STRATEGY_RULES.max_symbol_nav_bps,
  settlement_sessions: STRATEGY_RULES.settlement_sessions,
  liquidity_window: STRATEGY_RULES.liquidity_window,
  default_max_holding: STRATEGY_RULES.default_max_holding,
  candidate_order: 'gtgd20_desc_symbol_asc',
  sell_scope: 'all_positions_held_at_session_start',
  nav_basis: 'after_sells',
  symbol_cap_behavior: 'skip',
  security_status_gate: false,
  strategy_source: 'locked_schedule_row',
} as const);

export const BOT_POLICY_V2_HASH = canonicalHash(BOT_POLICY_V2);

export type BotV2StrategyPin = {
  source: StrategySource;
  id: string;
  version: number;
  config_hash: string;
  name: string;
  version_label: string;
};

export type BotV2UniversePin = {
  type: 'vn30' | 'vn100' | 'saved_list' | 'none';
  label: string;
  count: number;
  symbols_hash: string;
};

export type BotV2Fees = {
  buy_fee_bps: number;
  sell_fee_bps: number;
  sell_tax_bps: number;
  lot_size: number;
};

export type BotV2RuleSnapshot = typeof BOT_POLICY_V2 & {
  session: string;
  strategy: BotV2StrategyPin | null;
  universe: BotV2UniversePin;
  fees: BotV2Fees;
  data_as_of: string;
  data_hash: string;
  input_hash: string;
};

export function botV2Receipt(values: Omit<BotV2RuleSnapshot, keyof typeof BOT_POLICY_V2>): {
  snapshot: BotV2RuleSnapshot;
  hash: string;
} {
  const snapshot: BotV2RuleSnapshot = { ...BOT_POLICY_V2, ...values };
  return { snapshot, hash: canonicalHash(snapshot) };
}

const HASH = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Verify a v2.0 receipt: its policy part is exactly `BOT_POLICY_V2` and the hash matches. */
export function verifyV2Receipt(
  ruleSnapshot: unknown,
  ruleHash: string | null,
): { valid: true; snapshot: BotV2RuleSnapshot } | { valid: false } {
  if (!isRecord(ruleSnapshot) || typeof ruleHash !== 'string') return { valid: false };
  if (ruleSnapshot.policy_version !== BOT_POLICY_V2_VERSION) return { valid: false };
  const policy: Record<string, unknown> = {};
  for (const key of Object.keys(BOT_POLICY_V2)) policy[key] = ruleSnapshot[key];
  if (canonicalHash(policy) !== BOT_POLICY_V2_HASH) return { valid: false };
  if (canonicalHash(ruleSnapshot) !== ruleHash) return { valid: false };
  if (typeof ruleSnapshot.input_hash !== 'string' || !HASH.test(ruleSnapshot.input_hash)) {
    return { valid: false };
  }
  return { valid: true, snapshot: ruleSnapshot as unknown as BotV2RuleSnapshot };
}

export function isV2Receipt(ruleSnapshot: unknown): boolean {
  return isRecord(ruleSnapshot) && ruleSnapshot.policy_version === BOT_POLICY_V2_VERSION;
}
