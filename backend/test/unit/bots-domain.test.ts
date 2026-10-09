import { describe, expect, it } from 'vitest';

import * as botModule from '../../src/modules/bots/index.js';
import {
  BOT_DECISION_REASON_CODES,
  BOT_POLICY,
  BOT_POLICY_HASH,
  BOT_POLICY_SNAPSHOT,
  BOT_REASON_LABELS,
  LEGACY_ACADEMY_POLICY,
  LEGACY_ACADEMY_POLICY_HASH,
  LEGACY_BOT_V1_RULE_SNAPSHOT,
  LEGACY_BOT_V1_RULE_HASH,
  botRuleReceipt,
  candidateFromSnapshot,
  canonicalHash,
  computeBuyQuantity,
  feeRulesFromSnapshot,
  rankCandidates,
  roundBasisPoints,
  snapshotHash,
  verifyRuleReceipt,
  type BotSnapshotSymbol,
  type Candidate,
} from '../../src/modules/bots/index.js';
import { evaluateRuleWithEvidence, type MembershipRule } from '../../src/modules/quant/v2/index.js';

const feeRules = {
  buy_fee_rate_bps: 10,
  sell_fee_rate_bps: 15,
  sell_tax_rate_bps: 10,
  board_lot_size: 100,
  source_ref: 'fixture:fees',
};

function symbol(overrides: Partial<BotSnapshotSymbol> = {}): BotSnapshotSymbol {
  return {
    close_vnd: '20000',
    close_is_official: true,
    trading_value_avg20_vnd: '1000000000',
    security_status_verified: true,
    tradable_security_status: true,
    source_refs: { fixture: true },
    ...overrides,
  };
}

function candidate(ticker: string, tradingValue = 1_000_000_000n): Candidate {
  return {
    symbol: ticker,
    closeVnd: 20_000n,
    tradingValueAvg20Vnd: tradingValue,
    sourceRefs: {},
  };
}

const pin = { revision: 7, config_hash: 'b'.repeat(64), effective_session: '2026-10-05' };
const universePin = {
  kind: 'vn30' as const,
  revision: 0,
  status: 'verified' as const,
  effective_session: null,
  symbols_hash: 'e'.repeat(64),
};

describe('Bot policy iqx-bot-v1.0 domain', () => {
  it('A02 freezes the exact policy: universe source, ranking and no stop/target/trailing', () => {
    expect(BOT_POLICY).toBe(BOT_POLICY_SNAPSHOT);
    expect(BOT_POLICY.policy_version).toBe('iqx-bot-v1.0');
    expect(BOT_POLICY.initial_cash_vnd).toBe(100_000_000);
    expect(BOT_POLICY.universe).toMatchObject({
      default_source: 'vn30',
      custom_replaces_default: true,
      unavailable_behavior: 'no_new_buys_sells_continue',
    });
    expect(BOT_POLICY.sell_scope).toBe('all_positions_held_at_session_start');
    expect(BOT_POLICY.candidate_order).toBe('gtgd20_desc_symbol_asc');
    // The ordering is a template choice the product owner has not confirmed yet.
    expect(BOT_POLICY.candidate_order_owner_confirmation).toBe('pending');
    expect(BOT_POLICY.l1_required).toBe(false);
    expect(BOT_POLICY.protective_stop_enabled).toBe(false);
    expect(BOT_POLICY.fixed_take_profit_enabled).toBe(false);
    expect(BOT_POLICY.implicit_trailing_enabled).toBe(false);
    expect(BOT_POLICY.implicit_max_holding_enabled).toBe(false);
    expect(BOT_POLICY.require_five_ai_layers).toBe(false);
    expect(BOT_POLICY.max_new_buys_per_session).toBe(2);
    expect(BOT_POLICY.buy_budget_nav_ratio).toBe('0.12');
    expect(BOT_POLICY.max_symbol_nav_ratio).toBe('0.30');
    expect(BOT_POLICY_HASH).toBe(canonicalHash(BOT_POLICY_SNAPSHOT));
    // Pins the policy: any change to a rule must be a deliberate new version/hash.
    expect(BOT_POLICY_HASH).toBe(
      '8d62680b69f0c645f418595b5943dc274a4cbdffc78ea956af276da662d2b878',
    );
    expect(Object.isFrozen(BOT_POLICY)).toBe(true);
    expect(Object.isFrozen(BOT_POLICY.universe)).toBe(true);
    expect(BOT_POLICY).not.toHaveProperty('protective_stop');
    expect(BOT_POLICY).not.toHaveProperty('candidate_source');
  });

  it('A03 keeps the retired academy policy frozen so old receipts stay verifiable', () => {
    expect(LEGACY_ACADEMY_POLICY.policy_version).toBe('iqx-bot-academy-activation-1');
    expect(LEGACY_ACADEMY_POLICY_HASH).toBe(
      'b7bab5780da2276447cd3dcc3890e267bab597a12bae5d3bd99f49fa859cc849',
    );
    expect(LEGACY_ACADEMY_POLICY_HASH).not.toBe(BOT_POLICY_HASH);
    expect(LEGACY_BOT_V1_RULE_HASH).toBe(
      '73df87d8fdf044b2bbab7d80dd1896ee8bda551ab9395dcee908d82bcdce871e',
    );
  });

  it('A04 no longer exports any stop, amplitude or protective-exit helper', () => {
    expect(botModule).not.toHaveProperty('computeProtectiveStop');
    expect(botModule).not.toHaveProperty('stopLossSignal');
    expect(botModule).not.toHaveProperty('BOT_PROTECTIVE_STOP');
  });

  it('A08 exposes only the approved new-run decision reason vocabulary', () => {
    for (const code of ['academy_buy', 'academy_sell_not_met', 'universe_unavailable']) {
      expect(BOT_DECISION_REASON_CODES).toContain(code);
    }
    expect(BOT_DECISION_REASON_CODES).toContain('missing_liquidity_data');
    expect(BOT_DECISION_REASON_CODES).toContain('legacy_needs_review');
    for (const code of [
      'take_profit',
      'stop_loss',
      'missing_stop',
      'invalid_or_missing_l1_amplitude',
      'below_support_gate',
      'missing_layers',
    ]) {
      expect(BOT_DECISION_REASON_CODES).not.toContain(code);
    }
  });

  it('A09 gives every live reason a Vietnamese label, and still labels legacy rows', () => {
    for (const code of BOT_DECISION_REASON_CODES) {
      expect(BOT_REASON_LABELS[code], code).toMatch(/\S/);
    }
    expect(BOT_REASON_LABELS.stop_loss).toBeDefined();
    expect(BOT_REASON_LABELS.invalid_or_missing_l1_amplitude).toBeDefined();
  });

  it('F02 pins policy, sorted grants, config, data hash and universe in one receipt', () => {
    const receipt = botRuleReceipt(
      pin,
      ['indicator:rsi', 'indicator:ma', 'indicator:rsi'],
      'a'.repeat(64),
      universePin,
    );
    expect(receipt.snapshot.granted_capabilities).toEqual(['indicator:ma', 'indicator:rsi']);
    expect(receipt.snapshot.data_hash).toBe('a'.repeat(64));
    expect(receipt.snapshot.universe_pin).toEqual(universePin);
    expect(verifyRuleReceipt(receipt.snapshot, receipt.hash)).toMatchObject({
      valid: true,
      kind: 'bot',
      policyVersion: 'iqx-bot-v1.0',
      pin,
      universe: universePin,
    });
    expect(
      verifyRuleReceipt({ ...receipt.snapshot, data_hash: 'c'.repeat(64) }, receipt.hash).valid,
    ).toBe(false);
    expect(
      verifyRuleReceipt(
        { ...receipt.snapshot, universe_pin: { ...universePin, revision: 9 } },
        receipt.hash,
      ).valid,
    ).toBe(false);
    expect(
      verifyRuleReceipt({ ...receipt.snapshot, candidate_order: 'random' }, receipt.hash).valid,
    ).toBe(false);
    expect(botRuleReceipt(null, [], 'a'.repeat(64)).snapshot.universe_pin).toBeNull();
  });

  it('F03 verifies a historical academy-activation receipt read-only', () => {
    const snapshot = {
      ...LEGACY_ACADEMY_POLICY,
      shared_config: pin,
      granted_capabilities: ['indicator:ma', 'indicator:rsi'],
      data_hash: 'a'.repeat(64),
    };
    const hash = canonicalHash(snapshot);
    expect(verifyRuleReceipt(snapshot, hash)).toMatchObject({
      valid: true,
      kind: 'academy',
      policyVersion: 'iqx-bot-academy-activation-1',
      pin,
      universe: null,
    });
    expect(verifyRuleReceipt({ ...snapshot, data_hash: 'c'.repeat(64) }, hash).valid).toBe(false);
    expect(
      verifyRuleReceipt(
        { ...snapshot, protective_stop: { basis: 'close', l1_multiplier: 3, action: 'sell_all' } },
        hash,
      ).valid,
    ).toBe(false);
  });

  it('F10 verifies frozen V1 receipts with and without the historical config pin', () => {
    expect(verifyRuleReceipt(LEGACY_BOT_V1_RULE_SNAPSHOT, LEGACY_BOT_V1_RULE_HASH)).toMatchObject({
      valid: true,
      kind: 'legacy-v1',
      pin: null,
    });
    const legacyPin = { revision: 2, config_hash: 'd'.repeat(64), effective_session: '2026-09-01' };
    const snapshot = { ...LEGACY_BOT_V1_RULE_SNAPSHOT, shared_config: legacyPin };
    expect(verifyRuleReceipt(snapshot, canonicalHash(snapshot))).toMatchObject({
      valid: true,
      kind: 'legacy-v1',
      pin: legacyPin,
    });
  });

  it('C01/C02 parses a candidate from close + 20-session value only, never layers or L1', () => {
    const parsed = candidateFromSnapshot('aaa', symbol());
    expect(parsed).toEqual({
      symbol: 'AAA',
      closeVnd: 20_000n,
      tradingValueAvg20Vnd: 1_000_000_000n,
      sourceRefs: { fixture: true },
    });
    expect(parsed).not.toHaveProperty('filterIds');
    expect(parsed).not.toHaveProperty('amplitude4');
  });

  it('C03 refuses a candidate without a valid close or without 20-session liquidity', () => {
    expect(candidateFromSnapshot('AAA', symbol({ trading_value_avg20_vnd: undefined }))).toBeNull();
    expect(candidateFromSnapshot('AAA', symbol({ close_vnd: '0' }))).toBeNull();
    expect(candidateFromSnapshot('AAA', symbol({ close_vnd: undefined }))).toBeNull();
  });

  it('C04 ranks by 20-session traded value descending, then symbol ascending', () => {
    const ranked = rankCandidates([
      candidate('ZZZ', 9_000n),
      candidate('BBB', 1_000n),
      candidate('AAA', 1_000n),
      candidate('CCC', 10_000n),
    ]);
    expect(ranked.map((row) => row.symbol)).toEqual(['CCC', 'ZZZ', 'AAA', 'BBB']);
  });

  it('C06 deduplicates by symbol keeping the richer row and applies no 50-candidate cap', () => {
    const rows = Array.from({ length: 80 }, (_, index) =>
      candidate(`S${String(index).padStart(2, '0')}`, BigInt(100 - index)),
    );
    rows.push(candidate('S79', 5_000n));
    const ranked = rankCandidates(rows);
    expect(ranked).toHaveLength(80);
    expect(ranked[0]?.symbol).toBe('S79');
    expect(ranked[0]?.tradingValueAvg20Vnd).toBe(5_000n);
  });

  it('B13 keeps missing membership data unknown for the not-in operator', () => {
    const rule: MembershipRule = {
      id: 'range',
      kind: 'membership',
      lhs: { kind: 'series', key: 'value' },
      op: '∉',
      rhs: {
        kind: 'interval',
        lower: { kind: 'param', key: 'lower' },
        upper: { kind: 'param', key: 'upper' },
        bounds: 'open',
      },
      allowed_ops: ['∈', '∉'],
    };
    const evidence = evaluateRuleWithEvidence(rule, { value: [null] }, { lower: 20, upper: 80 }, 0);
    expect(evidence).toMatchObject({
      lhs: null,
      rhs: null,
      rhs_lower: 20,
      rhs_upper: 80,
      result: null,
      missing: true,
    });
  });

  const rules = feeRulesFromSnapshot({
    trading_date: '2026-09-23',
    data_version: 'fixture',
    close_is_official: true,
    buy_inputs_complete: true,
    symbols: {},
    fee_rules: feeRules,
  });

  it('E01 budgets fees inside 12% NAV and lot-rounds down to 500 shares', () => {
    const sizing = computeBuyQuantity({
      navBasisVnd: 100_000_000n,
      cashAvailableVnd: 100_000_000n,
      priceVnd: 20_000n,
      feeRules: rules,
    });
    expect(sizing).toMatchObject({
      quantity: 500,
      grossVnd: 10_000_000n,
      feeVnd: 10_000n,
      totalVnd: 10_010_000n,
      reasonCode: null,
    });
    expect(600n * 20_000n + roundBasisPoints(600n * 20_000n, 10)).toBeGreaterThan(12_000_000n);
  });

  it('B08 spec example: 0.15% fee gives q=500 (10,015,000) and q=600 is refused', () => {
    const specRules = { ...rules, buyFeeRateBps: 15 };
    const sizing = computeBuyQuantity({
      navBasisVnd: 100_000_000n,
      cashAvailableVnd: 100_000_000n,
      priceVnd: 20_000n,
      feeRules: specRules,
    });
    expect(sizing).toMatchObject({ quantity: 500, totalVnd: 10_015_000n });
    expect(600n * 20_000n + roundBasisPoints(600n * 20_000n, 15)).toBe(12_018_000n);
  });

  it('E01 maps fee-inclusive one-lot unaffordability and weight failures precisely', () => {
    expect(
      computeBuyQuantity({
        navBasisVnd: 100_000_000n,
        cashAvailableVnd: 2_000_000n,
        priceVnd: 20_000n,
        feeRules: rules,
      }).reasonCode,
    ).toBe('insufficient_cash_or_lot');
    expect(
      computeBuyQuantity({
        navBasisVnd: 100_000_000n,
        cashAvailableVnd: 100_000_000n,
        priceVnd: 20_000n,
        existingSymbolValueVnd: 30_000_000n,
        feeRules: rules,
      }).reasonCode,
    ).toBe('symbol_limit');
  });

  it('F02 hashes one snapshot envelope consistently for retries', () => {
    const input = {
      trading_date: '2026-09-23',
      data_version: 'fixture:v1',
      close_is_official: true,
      buy_inputs_complete: true,
      symbols: { VNM: symbol() },
      fee_rules: feeRules,
    };
    expect(snapshotHash(input)).toBe(snapshotHash({ ...input, snapshot_hash: 'ignored' }));
  });
});
