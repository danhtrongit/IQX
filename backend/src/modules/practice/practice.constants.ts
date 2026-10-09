/**
 * Practice ("mini luyện tập") constants. Bot SPEC §9-§11, Appendix B.
 *
 * The practice module never touches bot/manual accounts, shared config, grants or coins.
 */

/** The only indicators the practice supports (Appendix B). Anything else is rejected. */
export const PRACTICE_INDICATOR_IDS = [
  'rsi',
  'macd',
  'ma',
  'bollinger',
  'volume',
  'ema',
  'ma_cross',
  'dmi',
  'stochastic',
  'cci',
  'obv',
  'mfi',
  'cmf',
  'donchian',
  'roc',
  'williams_r',
] as const;
export type PracticeIndicatorId = (typeof PRACTICE_INDICATOR_IDS)[number];

export const isPracticeIndicatorId = (value: string): value is PracticeIndicatorId =>
  (PRACTICE_INDICATOR_IDS as readonly string[]).includes(value);

export const PRACTICE_CASE_COUNT = 30;

/** Default and allowed range of the maximum holding time (sessions; integer). */
export const HOLD_MAX_DEFAULT = 60;
export const HOLD_MAX_MIN = 1;
export const HOLD_MAX_MAX = 1_000;

/** Engine / API versions stored on every run. */
export const PRACTICE_ENGINE_VERSION = 'practice-engine-1';

/**
 * Execution profile `mini-profile-v1` (SPEC §11.1). Fee/lot values are the sample values of the
 * approved HTML (buy 0.15%, sell fee + tax 0.25%, lot 100). They are NOT verified against a
 * broker or exchange rule set: `verified` stays false until the product owner confirms them.
 */
export const MINI_PROFILE_V1 = Object.freeze({
  profile_version: 'mini-profile-v1',
  capital: 100_000_000,
  lot: 100,
  buy_fee_rate: 0.0015,
  sell_cost_rate: 0.0025,
  allocation: 'all_available_cash_including_fees',
  execution: 'next_open',
  stop_loss: 'none',
  take_profit: 'none',
  trailing: 'none',
  forced_liquidation_at_end: false,
  max_positions: 1,
  settlement: 'not_modelled',
  slippage: 'not_modelled',
  verified: false,
});

/** Numeric parameters of the execution profile consumed by the engine. */
export type EngineProfile = {
  capital: number;
  lot: number;
  buy_fee_rate: number;
  sell_cost_rate: number;
};

export const MINI_ENGINE_PROFILE: EngineProfile = Object.freeze({
  capital: MINI_PROFILE_V1.capital,
  lot: MINI_PROFILE_V1.lot,
  buy_fee_rate: MINI_PROFILE_V1.buy_fee_rate,
  sell_cost_rate: MINI_PROFILE_V1.sell_cost_rate,
});
