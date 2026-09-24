import { createHash } from 'node:crypto';

import type { BotLayerEvidence, BotMarketSnapshotInput, BotSnapshotSymbol } from './bot.types.js';

export const BOT_LAYER_KEYS = ['ky_thuat', 'dong_tien', 'noi_bo', 'tin_tuc', 'dinh_gia'] as const;

export const BOT_RULES = Object.freeze({
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

export type BotRuleSnapshot = Omit<typeof BOT_RULES, 'initial_cash_vnd'> & {
  initial_cash_vnd: number;
};

export const BOT_RULE_SNAPSHOT: BotRuleSnapshot = Object.freeze({
  ...BOT_RULES,
  initial_cash_vnd: Number(BOT_RULES.initial_cash_vnd),
});

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

export const BOT_RULE_HASH = canonicalHash(BOT_RULE_SNAPSHOT);

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
  layers: Record<string, BotLayerEvidence>;
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
      layers: row.layers ?? {},
      amplitude4: parseDecimal4(row.l1_amplitude_vnd),
      amplitudeSourceRef: row.l1_amplitude_source_ref?.trim() || null,
      sourceRefs: row.source_refs ?? {},
    };
  } catch {
    return null;
  }
}

export function supportingCount(candidate: Candidate): number {
  return Object.values(candidate.layers).filter((row) => row.verdict === 'ok').length;
}

export function candidateGate(candidate: Candidate): {
  allowed: boolean;
  reasonCode: string;
  missingLayers: string[];
} {
  const missingLayers = BOT_LAYER_KEYS.filter((key) => !candidate.layers[key]);
  if (missingLayers.length) return { allowed: false, reasonCode: 'missing_layers', missingLayers };
  for (const key of ['tin_tuc', 'noi_bo'] as const) {
    const layer = candidate.layers[key]!;
    if (layer.is_very_negative === null) {
      return { allowed: false, reasonCode: 'missing_veto_severity', missingLayers: [] };
    }
    if (layer.is_very_negative) {
      return { allowed: false, reasonCode: 'veto_very_negative', missingLayers: [] };
    }
  }
  if (supportingCount(candidate) < BOT_RULES.min_supporting_layers) {
    return { allowed: false, reasonCode: 'below_support_gate', missingLayers: [] };
  }
  return { allowed: true, reasonCode: 'eligible', missingLayers: [] };
}

export function candidateRank(candidate: Candidate): [number, number, bigint, string] {
  return [
    -supportingCount(candidate),
    -candidate.filterIds.length,
    -candidate.tradingValueAvg20Vnd,
    candidate.symbol,
  ];
}

function compareRank(left: Candidate, right: Candidate): number {
  const a = candidateRank(left);
  const b = candidateRank(right);
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  if (a[2] !== b[2]) return a[2] < b[2] ? -1 : 1;
  return a[3].localeCompare(b[3]);
}

export function rankCandidates(rows: readonly Candidate[]): Candidate[] {
  const unique = new Map<string, Candidate>();
  for (const row of rows) {
    if (!row.symbol) continue;
    const previous = unique.get(row.symbol);
    if (!previous || compareRank(row, previous) < 0) unique.set(row.symbol, row);
  }
  const capped = [...unique.values()]
    .sort((left, right) => left.symbol.localeCompare(right.symbol))
    .slice(0, BOT_RULES.max_unique_candidates);
  return capped.filter((candidate) => candidateGate(candidate).allowed).sort(compareRank);
}

export function computeExitThresholds(
  entryPriceVnd: bigint,
  amplitude4: bigint | null,
): { stop4: bigint; take4: bigint } | null {
  if (entryPriceVnd <= 0n || amplitude4 === null || amplitude4 <= 0n) return null;
  const entry4 = entryPriceVnd * 10_000n;
  const stop4 = entry4 - BigInt(BOT_RULES.stop_loss_l1_multiplier) * amplitude4;
  const take4 = entry4 + BigInt(BOT_RULES.take_profit_l1_multiplier) * amplitude4;
  return stop4 > 0n && stop4 < entry4 && take4 > entry4 ? { stop4, take4 } : null;
}

export function exitSignal(
  closeVnd: bigint | null,
  stop4: bigint,
  take4: bigint,
): 'stop_loss' | 'take_profit' | null {
  if (closeVnd === null || closeVnd <= 0n) return null;
  const close4 = closeVnd * 10_000n;
  if (close4 <= stop4) return 'stop_loss';
  if (close4 >= take4) return 'take_profit';
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
  reasonCode: string | null;
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
    return { quantity: 0, grossVnd: 0n, feeVnd: 0n, totalVnd: 0n, reasonCode: 'insufficient_cash' };
  }
  const budget = (navBasisVnd * BigInt(BOT_RULES.buy_budget_nav_pct)) / 100n;
  const maximum = budget < cashAvailableVnd ? budget : cashAvailableVnd;
  const lot = BigInt(feeRules.boardLotSize);
  let lots = maximum / (priceVnd * lot);
  while (lots > 0n) {
    const quantityBig = lots * lot;
    if (quantityBig > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('Quantity exceeds safe integer');
    const grossVnd = quantityBig * priceVnd;
    const feeVnd = roundBasisPoints(grossVnd, feeRules.buyFeeRateBps);
    const totalVnd = grossVnd + feeVnd;
    const proposedNav = navBasisVnd - feesPaidInBatchVnd - feeVnd;
    const withinWeight =
      proposedNav > 0n &&
      (existingSymbolValueVnd + grossVnd) * 100n <=
        BigInt(BOT_RULES.max_symbol_nav_pct) * proposedNav;
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
  const oneLot = priceVnd * lot;
  let reasonCode = 'below_board_lot';
  if (oneLot <= maximum) reasonCode = 'symbol_weight_limit';
  else if (cashAvailableVnd < priceVnd) reasonCode = 'insufficient_cash';
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
