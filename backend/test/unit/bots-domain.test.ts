import { describe, expect, it } from 'vitest';

import {
  BOT_DECISION_REASON_CODES,
  BOT_POLICY,
  BOT_POLICY_HASH,
  BOT_POLICY_SNAPSHOT,
  LEGACY_BOT_V1_RULE_SNAPSHOT,
  LEGACY_BOT_V1_RULE_HASH,
  candidateFromSnapshot,
  botRuleReceipt,
  canonicalHash,
  computeBuyQuantity,
  computeProtectiveStop,
  feeRulesFromSnapshot,
  formatDecimal4,
  parseDecimal4,
  rankCandidates,
  roundBasisPoints,
  snapshotHash,
  stopLossSignal,
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
    filter_ids: ['f2', 'f1', 'f1'],
    security_status_verified: true,
    tradable_security_status: true,
    l1_amplitude_vnd: '500.0000',
    l1_amplitude_source_ref: 'l1:fixture',
    source_refs: { fixture: true },
    ...overrides,
  };
}

function candidate(ticker: string, filters: string[], tradingValue = 1_000_000_000n): Candidate {
  return {
    symbol: ticker,
    closeVnd: 20_000n,
    tradingValueAvg20Vnd: tradingValue,
    filterIds: filters,
    amplitude4: 5_000_000n,
    amplitudeSourceRef: 'l1:fixture',
    sourceRefs: {},
  };
}

describe('Bot Academy activation domain', () => {
  it('A02 freezes the exact Academy policy and stable hash', () => {
    expect(BOT_POLICY).toBe(BOT_POLICY_SNAPSHOT);
    expect(BOT_POLICY.initial_cash_vnd).toBe(100_000_000);
    expect(BOT_POLICY.policy_version).toBe('iqx-bot-academy-activation-1');
    expect(BOT_POLICY.fixed_take_profit_enabled).toBe(false);
    expect(BOT_POLICY.require_five_ai_layers).toBe(false);
    expect(BOT_POLICY_HASH).toBe(
      'b7bab5780da2276447cd3dcc3890e267bab597a12bae5d3bd99f49fa859cc849',
    );
    expect(BOT_POLICY_HASH).toBe(canonicalHash(BOT_POLICY_SNAPSHOT));
    expect(Object.isFrozen(BOT_POLICY)).toBe(true);
    expect(Object.isFrozen(BOT_POLICY.candidate_source)).toBe(true);
    expect(Object.isFrozen(BOT_POLICY.candidate_sort)).toBe(true);
    expect(Object.isFrozen(BOT_POLICY.protective_stop)).toBe(true);
    expect(LEGACY_BOT_V1_RULE_HASH).toBe(
      '73df87d8fdf044b2bbab7d80dd1896ee8bda551ab9395dcee908d82bcdce871e',
    );
  });

  it('A08 exposes only the approved new-run decision reason vocabulary', () => {
    expect(BOT_DECISION_REASON_CODES).toContain('academy_buy');
    expect(BOT_DECISION_REASON_CODES).toContain('academy_sell_not_met');
    expect(BOT_DECISION_REASON_CODES).not.toContain('take_profit');
    expect(BOT_DECISION_REASON_CODES).not.toContain('below_support_gate');
    expect(BOT_DECISION_REASON_CODES).not.toContain('missing_layers');
  });

  it('F02 pins policy, sorted grants, config and data hash in one receipt', () => {
    const pin = {
      revision: 7,
      config_hash: 'b'.repeat(64),
      effective_session: '2026-10-05',
    };
    const receipt = botRuleReceipt(
      pin,
      ['indicator:rsi', 'indicator:ma', 'indicator:rsi'],
      'a'.repeat(64),
    );
    expect(receipt.snapshot.granted_capabilities).toEqual(['indicator:ma', 'indicator:rsi']);
    expect(receipt.snapshot.data_hash).toBe('a'.repeat(64));
    expect(verifyRuleReceipt(receipt.snapshot, receipt.hash)).toMatchObject({
      valid: true,
      kind: 'academy',
      policyVersion: BOT_POLICY.policy_version,
      pin,
    });
    expect(
      verifyRuleReceipt({ ...receipt.snapshot, data_hash: 'c'.repeat(64) }, receipt.hash).valid,
    ).toBe(false);
  });

  it('F10 verifies frozen V1 receipts with and without the historical config pin', () => {
    expect(verifyRuleReceipt(LEGACY_BOT_V1_RULE_SNAPSHOT, LEGACY_BOT_V1_RULE_HASH)).toMatchObject({
      valid: true,
      kind: 'legacy-v1',
      pin: null,
    });
    const pin = {
      revision: 2,
      config_hash: 'd'.repeat(64),
      effective_session: '2026-09-01',
    };
    const snapshot = { ...LEGACY_BOT_V1_RULE_SNAPSHOT, shared_config: pin };
    expect(verifyRuleReceipt(snapshot, canonicalHash(snapshot))).toMatchObject({
      valid: true,
      kind: 'legacy-v1',
      pin,
    });
  });

  it('C01/C02 ignores missing or negative AI layers when parsing candidates', () => {
    const missing = candidateFromSnapshot('aaa', symbol({ layers: {} }));
    const negative = candidateFromSnapshot(
      'bbb',
      symbol({
        layers: {
          tin_tuc: {
            verdict: 'bad',
            raw_level: 'very-negative',
            is_very_negative: true,
            source_ref: 'legacy:ai',
          },
        },
      }),
    );
    expect(missing?.symbol).toBe('AAA');
    expect(negative?.symbol).toBe('BBB');
  });

  it('C04 ranks only by filter count, trading value, then symbol', () => {
    const ranked = rankCandidates([
      candidate('ZZZ', ['a'], 9_000n),
      candidate('BBB', ['a', 'b'], 1_000n),
      candidate('AAA', ['a', 'b'], 1_000n),
      candidate('CCC', ['a'], 10_000n),
    ]);
    expect(ranked.map((row) => row.symbol)).toEqual(['AAA', 'BBB', 'CCC', 'ZZZ']);
  });

  it('C06 unions duplicate filter ids, ranks before the 50-candidate cap', () => {
    const rows = Array.from({ length: 50 }, (_, index) =>
      candidate(`S${String(index).padStart(2, '0')}`, ['one'], BigInt(100 - index)),
    );
    rows.push(candidate('ZZZ', ['one', 'two'], 1n));
    rows.push(candidate('ZZZ', ['three'], 1n));
    const ranked = rankCandidates(rows);
    expect(ranked).toHaveLength(50);
    expect(ranked[0]?.symbol).toBe('ZZZ');
    expect(ranked[0]?.filterIds).toEqual(['one', 'three', 'two']);
    expect(ranked.some((row) => row.symbol === 'S49')).toBe(false);
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

  it('D01 stores a close minus two-L1 stop and no take-profit', () => {
    const stop = computeProtectiveStop(20_000n, parseDecimal4('500.0000'));
    expect(stop && formatDecimal4(stop.stop4)).toBe('19000');
    expect(stop).not.toHaveProperty('take4');
  });

  it('D02/D03 sells at or below the stored stop', () => {
    const { stop4 } = computeProtectiveStop(20_000n, parseDecimal4('500'))!;
    expect(stopLossSignal(19_000n, stop4)).toBe('stop_loss');
    expect(stopLossSignal(18_800n, stop4)).toBe('stop_loss');
  });

  it('D04/D05/D06/D08/D10 uses only close and the stored stop', () => {
    const { stop4 } = computeProtectiveStop(20_000n, parseDecimal4('500'))!;
    expect(stopLossSignal(19_500n, stop4)).toBeNull();
    expect(stopLossSignal(22_500n, stop4)).toBeNull();
    expect(stopLossSignal(18_800n, stop4)).toBe('stop_loss');
    expect(BOT_POLICY.fixed_take_profit_enabled).toBe(false);
    expect(BOT_POLICY.implicit_max_holding_enabled).toBe(false);
  });

  it('C08 rejects missing, zero, or invalid L1 amplitude for a new stop', () => {
    expect(computeProtectiveStop(20_000n, null)).toBeNull();
    expect(computeProtectiveStop(20_000n, 0n)).toBeNull();
    expect(computeProtectiveStop(1_000n, parseDecimal4('500')!)).toBeNull();
  });

  it('E01 budgets fees inside 12% NAV and lot-rounds down to 500 shares', () => {
    const sizing = computeBuyQuantity({
      navBasisVnd: 100_000_000n,
      cashAvailableVnd: 100_000_000n,
      priceVnd: 20_000n,
      feeRules: feeRulesFromSnapshot({
        trading_date: '2026-09-23',
        data_version: 'fixture',
        close_is_official: true,
        buy_inputs_complete: true,
        symbols: {},
        fee_rules: feeRules,
      }),
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

  it('E01 maps fee-inclusive one-lot unaffordability and weight failures precisely', () => {
    const rules = feeRulesFromSnapshot({
      trading_date: '2026-09-23',
      data_version: 'fixture',
      close_is_official: true,
      buy_inputs_complete: true,
      symbols: {},
      fee_rules: feeRules,
    });
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
