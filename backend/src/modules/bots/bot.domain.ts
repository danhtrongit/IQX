import { createHash } from 'node:crypto';

import type { BotMarketSnapshotInput, BotSnapshotSymbol } from './bot.types.js';

const BOT_CANDIDATE_SOURCE = Object.freeze([
  'khoi_ngoai_gom',
  'tu_doanh_gom',
  'kl_dot_bien',
  'vuot_dinh_20',
  'tang_manh_kl',
] as const);
const BOT_CANDIDATE_SORT = Object.freeze([
  'filter_count desc',
  'trading_value_avg20_vnd desc',
  'symbol asc',
] as const);
const BOT_PROTECTIVE_STOP = Object.freeze({
  basis: 'close',
  l1_multiplier: 2,
  action: 'sell_all',
} as const);

export const BOT_POLICY = Object.freeze({
  policy_version: 'iqx-bot-academy-activation-1',
  execution_model: 'same_session_close',
  initial_cash_vnd: 100_000_000,
  require_active_buy_conditions: true,
  empty_buy_gate: false,
  empty_sell_gate: false,
  require_five_ai_layers: false,
  ai_support_threshold_enabled: false,
  ai_news_insider_veto_enabled: false,
  candidate_source: BOT_CANDIDATE_SOURCE,
  max_results_per_filter: 10,
  max_unique_candidates: 50,
  candidate_sort: BOT_CANDIDATE_SORT,
  max_new_buys_per_session: 2,
  buy_budget_nav_ratio: '0.12',
  max_symbol_nav_ratio: '0.30',
  allow_add_to_open_symbol: false,
  allow_rebuy_same_session: false,
  protective_stop: BOT_PROTECTIVE_STOP,
  fixed_take_profit_enabled: false,
  implicit_max_holding_enabled: false,
  implicit_trailing_enabled: false,
} as const);

export type BotPolicySnapshot = typeof BOT_POLICY;
export const BOT_POLICY_SNAPSHOT: BotPolicySnapshot = BOT_POLICY;

function canonicalize(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function canonicalHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

export const BOT_POLICY_HASH = canonicalHash(BOT_POLICY_SNAPSHOT);

export const BOT_DECISION_REASON_CODES = [
  'waiting_for_academy_conditions',
  'no_active_buy_conditions',
  'academy_buy_not_met',
  'academy_condition_missing',
  'config_invalid_or_unauthorized',
  'academy_buy',
  'academy_sell',
  'academy_sell_not_met',
  'stop_loss',
  'no_active_sell_conditions',
  'invalid_or_missing_l1_amplitude',
  'invalid_close',
  'missing_stop',
  'ledger_error',
  'already_holding',
  'rebuy_same_session_blocked',
  'insufficient_cash_or_lot',
  'symbol_limit',
  'session_buy_limit',
  'security_status_blocked',
  'missing_security_status',
  'buy_inputs_incomplete',
  'no_eligible_candidates',
  'valuation_incomplete',
  'source_error',
  'reconciliation_failed',
] as const;

export type BotDecisionReasonCode = (typeof BOT_DECISION_REASON_CODES)[number];

export function parseInteger(value: string | number | bigint, name = 'integer'): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`${name} must be a safe integer`);
    return BigInt(value);
  }
  if (!/^-?\d+$/.test(value)) throw new Error(`${name} must be an integer`);
  return BigInt(value);
}

/** Numeric(20,4) represented exactly as ten-thousandths. */
export function parseDecimal4(value: string | number | null | undefined): bigint | null {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  const raw = typeof value === 'number' ? value.toString() : value.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return null;
  const fraction = match[3] ?? '';
  if (fraction.length > 4 && /[1-9]/.test(fraction.slice(4))) return null;
  const sign = match[1] === '-' ? -1n : 1n;
  return sign * (BigInt(match[2]!) * 10_000n + BigInt((fraction.slice(0, 4) + '0000').slice(0, 4)));
}

export function formatDecimal4(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 10_000n;
  const fraction = (absolute % 10_000n).toString().padStart(4, '0').replace(/0+$/, '');
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function roundBasisPoints(amountVnd: bigint, rateBps: number): bigint {
  if (amountVnd < 0n || !Number.isSafeInteger(rateBps) || rateBps < 0) {
    throw new Error('amount and basis points must be non-negative integers');
  }
  return (amountVnd * BigInt(rateBps) + 5_000n) / 10_000n;
}

export type Candidate = {
  symbol: string;
  closeVnd: bigint;
  tradingValueAvg20Vnd: bigint;
  filterIds: string[];
  amplitude4: bigint | null;
  amplitudeSourceRef: string | null;
  sourceRefs: Record<string, unknown>;
};

export function candidateFromSnapshot(symbol: string, row: BotSnapshotSymbol): Candidate | null {
  try {
    const closeVnd = parseInteger(row.close_vnd ?? '', 'close_vnd');
    const avg20 = parseInteger(row.trading_value_avg20_vnd ?? '', 'trading_value_avg20_vnd');
    if (closeVnd <= 0n || avg20 < 0n) return null;
    return {
      symbol: symbol.trim().toUpperCase(),
      closeVnd,
      tradingValueAvg20Vnd: avg20,
      filterIds: [...new Set(row.filter_ids ?? [])].sort(),
      amplitude4: parseDecimal4(row.l1_amplitude_vnd),
      amplitudeSourceRef: row.l1_amplitude_source_ref?.trim() || null,
      sourceRefs: row.source_refs ?? {},
    };
  } catch {
    return null;
  }
}

export function candidateRank(candidate: Candidate): [number, bigint, string] {
  return [-candidate.filterIds.length, -candidate.tradingValueAvg20Vnd, candidate.symbol];
}

function compareRank(left: Candidate, right: Candidate): number {
  const a = candidateRank(left);
  const b = candidateRank(right);
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return a[2].localeCompare(b[2]);
}

export function rankCandidates(rows: readonly Candidate[]): Candidate[] {
  const unique = new Map<string, Candidate>();
  for (const row of rows) {
    if (!row.symbol) continue;
    const symbol = row.symbol.trim().toUpperCase();
    const previous = unique.get(symbol);
    if (!previous) {
      unique.set(symbol, { ...row, symbol, filterIds: [...new Set(row.filterIds)].sort() });
      continue;
    }
    const filterIds = [...new Set([...previous.filterIds, ...row.filterIds])].sort();
    const richer = row.tradingValueAvg20Vnd > previous.tradingValueAvg20Vnd ? row : previous;
    unique.set(symbol, { ...richer, symbol, filterIds });
  }
  return [...unique.values()].sort(compareRank).slice(0, BOT_POLICY.max_unique_candidates);
}

export function computeProtectiveStop(
  entryPriceVnd: bigint,
  amplitude4: bigint | null,
): { stop4: bigint } | null {
  if (entryPriceVnd <= 0n || amplitude4 === null || amplitude4 <= 0n) return null;
  const entry4 = entryPriceVnd * 10_000n;
  const stop4 = entry4 - BigInt(BOT_POLICY.protective_stop.l1_multiplier) * amplitude4;
  return stop4 > 0n && stop4 < entry4 ? { stop4 } : null;
}

export function stopLossSignal(closeVnd: bigint | null, stop4: bigint): 'stop_loss' | null {
  if (closeVnd === null || closeVnd <= 0n) return null;
  const close4 = closeVnd * 10_000n;
  if (close4 <= stop4) return 'stop_loss';
  return null;
}

export type FeeRules = {
  buyFeeRateBps: number;
  sellFeeRateBps: number;
  sellTaxRateBps: number;
  boardLotSize: number;
  sourceRef: string;
};

export function feeRulesFromSnapshot(snapshot: BotMarketSnapshotInput): FeeRules {
  const source = snapshot.fee_rules;
  const values = [
    source.buy_fee_rate_bps,
    source.sell_fee_rate_bps,
    source.sell_tax_rate_bps,
    source.board_lot_size,
  ];
  if (
    !values.every(Number.isSafeInteger) ||
    values.some((value) => value < 0) ||
    source.board_lot_size <= 0
  ) {
    throw new Error('Invalid fee rules');
  }
  return {
    buyFeeRateBps: source.buy_fee_rate_bps,
    sellFeeRateBps: source.sell_fee_rate_bps,
    sellTaxRateBps: source.sell_tax_rate_bps,
    boardLotSize: source.board_lot_size,
    sourceRef: source.source_ref,
  };
}

export type SizingResult = {
  quantity: number;
  grossVnd: bigint;
  feeVnd: bigint;
  totalVnd: bigint;
  reasonCode: 'insufficient_cash_or_lot' | 'symbol_limit' | null;
};

export function computeBuyQuantity(options: {
  navBasisVnd: bigint;
  cashAvailableVnd: bigint;
  priceVnd: bigint;
  existingSymbolValueVnd?: bigint;
  feesPaidInBatchVnd?: bigint;
  feeRules: FeeRules;
}): SizingResult {
  const {
    navBasisVnd,
    cashAvailableVnd,
    priceVnd,
    existingSymbolValueVnd = 0n,
    feesPaidInBatchVnd = 0n,
    feeRules,
  } = options;
  if (navBasisVnd <= 0n || cashAvailableVnd <= 0n || priceVnd <= 0n) {
    return {
      quantity: 0,
      grossVnd: 0n,
      feeVnd: 0n,
      totalVnd: 0n,
      reasonCode: 'insufficient_cash_or_lot',
    };
  }
  const budget = (navBasisVnd * 12n) / 100n;
  const maximum = budget < cashAvailableVnd ? budget : cashAvailableVnd;
  const lot = BigInt(feeRules.boardLotSize);
  let lots = maximum / (priceVnd * lot);
  let capitalFeasible = false;
  while (lots > 0n) {
    const quantityBig = lots * lot;
    if (quantityBig > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('Quantity exceeds safe integer');
    const grossVnd = quantityBig * priceVnd;
    const feeVnd = roundBasisPoints(grossVnd, feeRules.buyFeeRateBps);
    const totalVnd = grossVnd + feeVnd;
    if (totalVnd <= budget && totalVnd <= cashAvailableVnd) capitalFeasible = true;
    const proposedNav = navBasisVnd - feesPaidInBatchVnd - feeVnd;
    const withinWeight =
      proposedNav > 0n && (existingSymbolValueVnd + grossVnd) * 100n <= 30n * proposedNav;
    if (totalVnd <= budget && totalVnd <= cashAvailableVnd && withinWeight) {
      return {
        quantity: Number(quantityBig),
        grossVnd,
        feeVnd,
        totalVnd,
        reasonCode: null,
      };
    }
    lots -= 1n;
  }
  const reasonCode = capitalFeasible ? 'symbol_limit' : 'insufficient_cash_or_lot';
  return { quantity: 0, grossVnd: 0n, feeVnd: 0n, totalVnd: 0n, reasonCode };
}

export function sanitizeSnapshot(input: BotMarketSnapshotInput): BotMarketSnapshotInput {
  const { snapshot_hash: _ignored, ...payload } = input;
  return payload;
}

export function snapshotHash(input: BotMarketSnapshotInput): string {
  return canonicalHash(sanitizeSnapshot(input));
}

export function ratioString(value: bigint, base: bigint, scale = 12): string | null {
  if (base === 0n) return null;
  const factor = 10n ** BigInt(scale);
  const numerator = (value - base) * factor;
  const rounded = numerator >= 0n ? (numerator + base / 2n) / base : (numerator - base / 2n) / base;
  const negative = rounded < 0n;
  const absolute = negative ? -rounded : rounded;
  const whole = absolute / factor;
  const fraction = (absolute % factor).toString().padStart(scale, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}
