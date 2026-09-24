import { describe, expect, it } from 'vitest';

import {
  BOT_RULE_HASH,
  BOT_RULES,
  candidateGate,
  candidateFromSnapshot,
  canonicalHash,
  computeBuyQuantity,
  computeExitThresholds,
  exitSignal,
  feeRulesFromSnapshot,
  formatDecimal4,
  parseDecimal4,
  rankCandidates,
  roundBasisPoints,
  snapshotHash,
  type BotSnapshotSymbol,
} from '../../src/modules/bots/index.js';

const feeRules = {
  buy_fee_rate_bps: 15,
  sell_fee_rate_bps: 15,
  sell_tax_rate_bps: 10,
  board_lot_size: 100,
  source_ref: 'fixture:fees',
};

function symbol(overrides: Partial<BotSnapshotSymbol> = {}): BotSnapshotSymbol {
  return {
    close_vnd: '50000',
    close_is_official: true,
    trading_value_avg20_vnd: '1000000000',
    filter_ids: ['f2', 'f1', 'f1'],
    security_status_verified: true,
    tradable_security_status: true,
    l1_amplitude_vnd: '1000.0000',
    l1_amplitude_source_ref: 'l1:fixture',
    layers: Object.fromEntries(
      ['ky_thuat', 'dong_tien', 'noi_bo', 'tin_tuc', 'dinh_gia'].map((key) => [
        key,
        {
          verdict: 'ok',
          raw_level: 'strong',
          is_very_negative: false,
          source_ref: `fixture:${key}`,
        },
      ]),
    ),
    source_refs: { fixture: true },
    ...overrides,
  };
}

describe('Bot v1 exact integer domain', () => {
  it('uses the frozen 100m initial cash and stable rule hash', () => {
    expect(BOT_RULES.initial_cash_vnd).toBe(100_000_000n);
    expect(BOT_RULE_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalHash({ b: 2, a: 1 })).toBe(canonicalHash({ a: 1, b: 2 }));
  });

  it('preserves round-half-up fees without Number drift', () => {
    expect(roundBasisPoints(1_000_000_000_000_000n, 15)).toBe(1_500_000_000_000n);
    expect(roundBasisPoints(50_000n * 100n, 15)).toBe(7_500n);
  });

  it('computes the golden buy sizing and enforces board lot and NAV limits', () => {
    const sizing = computeBuyQuantity({
      navBasisVnd: 100_000_000n,
      cashAvailableVnd: 100_000_000n,
      priceVnd: 50_000n,
      feeRules: feeRulesFromSnapshot({
        trading_date: '2026-09-23',
        data_version: 'fixture',
        close_is_official: true,
        buy_inputs_complete: true,
        symbols: {},
        fee_rules: feeRules,
      }),
    });
    expect(sizing.quantity).toBe(200);
    expect(sizing.grossVnd).toBe(10_000_000n);

    const tooExpensive = computeBuyQuantity({
      navBasisVnd: 100_000_000n,
      cashAvailableVnd: 4_999_999n,
      priceVnd: 50_000n,
      feeRules: feeRulesFromSnapshot({
        trading_date: '2026-09-23',
        data_version: 'fixture',
        close_is_official: true,
        buy_inputs_complete: true,
        symbols: {},
        fee_rules: feeRules,
      }),
    });
    expect(tooExpensive.quantity).toBe(0);
    expect(tooExpensive.reasonCode).toBe('below_board_lot');
  });

  it('matches golden stop/take sell signals', () => {
    const thresholds = computeExitThresholds(50_000n, parseDecimal4('1000.0000'))!;
    expect(formatDecimal4(thresholds.stop4)).toBe('48000');
    expect(formatDecimal4(thresholds.take4)).toBe('54000');
    expect(exitSignal(48_000n, thresholds.stop4, thresholds.take4)).toBe('stop_loss');
    expect(exitSignal(54_000n, thresholds.stop4, thresholds.take4)).toBe('take_profit');
    expect(exitSignal(50_000n, thresholds.stop4, thresholds.take4)).toBeNull();
  });

  it('fails closed on missing layers/veto severity and ranks deterministically', () => {
    const valid = candidateFromSnapshot('vnm', symbol())!;
    expect(candidateGate(valid).allowed).toBe(true);
    expect(candidateGate(candidateFromSnapshot('vnm', symbol({ layers: {} }))!).reasonCode).toBe(
      'missing_layers',
    );
    const veto = candidateFromSnapshot(
      'vnm',
      symbol({
        layers: {
          ...symbol().layers,
          tin_tuc: { verdict: 'bad', raw_level: 'weak', is_very_negative: true, source_ref: 'x' },
        },
      }),
    )!;
    expect(candidateGate(veto).reasonCode).toBe('veto_very_negative');
    const ranked = rankCandidates([
      valid,
      candidateFromSnapshot('abc', symbol({ trading_value_avg20_vnd: '2000000000' }))!,
      candidateFromSnapshot('vnm', symbol({ trading_value_avg20_vnd: '1' }))!,
    ]);
    expect(ranked.map((row) => row.symbol)).toEqual(['ABC', 'VNM']);
  });

  it('hashes one snapshot envelope consistently for idempotent retries', () => {
    const input = {
      trading_date: '2026-09-23',
      data_version: 'fixture:v1',
      close_is_official: true,
      buy_inputs_complete: true,
      symbols: { VNM: symbol() },
      fee_rules: feeRules,
    };
    const first = snapshotHash(input);
    const second = snapshotHash({ ...input, snapshot_hash: 'ignored-by-envelope' });
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });
});
