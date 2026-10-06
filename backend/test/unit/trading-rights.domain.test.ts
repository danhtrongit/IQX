import { describe, expect, it } from 'vitest';

import {
  RightsNegativeCostError,
  classifyVciEvent,
  computeEligibleQuantity,
  computeRightsAdjustment,
  deriveActionStage,
  determineDueTransitions,
  parseRatio,
  parseStockTitle,
  previousTradingDate,
  roundHalfUp,
  vnDate,
} from '../../src/modules/trading/rights.domain.js';
import type {
  CorporateActionRow,
  EntitlementRow,
  ReplayTrade,
} from '../../src/modules/trading/rights.types.js';

const NO_HOLIDAYS: ReadonlySet<string> = new Set<string>();

function action(overrides: Partial<CorporateActionRow> = {}): CorporateActionRow {
  return {
    id: 'act-1',
    source: 'VCI',
    source_event_id: 'evt-1',
    symbol: 'BFC',
    event_code: 'DIV',
    kind: 'cash_dividend',
    event_title_en: '',
    announced_date: null,
    exright_date: null,
    record_date: null,
    payout_date: null,
    issue_date: null,
    cash_per_share_vnd: 4000n,
    stock_ratio: null,
    credit_date: null,
    credit_action_id: null,
    disposition: 'processable',
    review_reason: null,
    financial_frozen_at: null,
    latest_payload: {},
    first_seen_at: new Date('2026-01-01T00:00:00.000Z'),
    last_seen_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function entitlement(overrides: Partial<EntitlementRow> = {}): EntitlementRow {
  return {
    id: 'ent-1',
    account_id: 'acc-1',
    corporate_action_id: 'act-1',
    account_epoch_at: new Date('2026-01-01T00:00:00.000Z'),
    kind: 'cash_dividend',
    effective_ex_date: '2026-10-08',
    eligibility_date: '2026-10-07',
    eligible_quantity: 100,
    cash_amount_vnd: 400_000n,
    share_quantity: 0,
    avg_before_ex_vnd: 49_900n,
    avg_after_ex_vnd: 45_900n,
    status: 'pending_cash',
    applied_at: new Date('2026-10-08T00:00:00.000Z'),
    fulfilled_at: null,
    ...overrides,
  };
}

function trade(overrides: Partial<ReplayTrade> = {}): ReplayTrade {
  return {
    side: 'buy',
    quantity: 100,
    sessionDate: '2026-10-07',
    tradedAt: new Date('2026-10-07T03:00:00.000Z'),
    ...overrides,
  };
}

function ignoredReason(result: ReturnType<typeof classifyVciEvent>): string {
  if ('action' in result) throw new Error('expected the event to be ignored');
  return result.ignored;
}

describe('parseStockTitle', () => {
  it('classifies stock dividends', () => {
    expect(parseStockTitle('Share Issue - Stock dividend ratio 25.0%')).toBe('stock_dividend');
    expect(parseStockTitle('Bonus Issue 10%')).toBe('stock_dividend');
    expect(parseStockTitle('Share issue – bonus shares')).toBe('stock_dividend');
  });

  it('excludes purchase rights before accepting dividend wording', () => {
    expect(parseStockTitle('Rights issue 2:1')).toBe('purchase_right');
    expect(parseStockTitle('Share Issue - Stock dividend and rights issue')).toBe('purchase_right');
    expect(parseStockTitle('Share Issue - Subscription rights')).toBe('purchase_right');
    expect(parseStockTitle('Preferential subscription for existing holders')).toBe(
      'purchase_right',
    );
    expect(parseStockTitle('Purchase rights offering')).toBe('purchase_right');
  });

  it('ignores unknown wording', () => {
    expect(parseStockTitle('Annual general meeting notice')).toBe('unknown');
  });
});

describe('classifyVciEvent', () => {
  it('accepts a DIV cash dividend and slices ISO dates to Vietnam dates', () => {
    const result = classifyVciEvent({
      id: 'div-1',
      ticker: 'bfc',
      event_code: 'DIV',
      event_title_en: 'Cash Dividend - Year 2025 - 500 VND',
      public_date: '2026-09-01T00:00:00',
      exright_date: '2026-10-08T00:00:00',
      record_date: '2026-10-09T00:00:00',
      payout_date: '2026-10-20T00:00:00',
      value_per_share: 4000,
    });
    if (!('action' in result)) throw new Error('expected an action');
    expect(result.action).toMatchObject({
      sourceEventId: 'div-1',
      symbol: 'BFC',
      eventCode: 'DIV',
      kind: 'cash_dividend',
      cashPerShareVnd: 4000n,
      stockRatio: null,
      announcedDate: '2026-09-01',
      exrightDate: '2026-10-08',
      recordDate: '2026-10-09',
      payoutDate: '2026-10-20',
    });
  });

  it('rounds a fractional value_per_share half up exactly once', () => {
    const half = classifyVciEvent({
      id: 'div-2',
      ticker: 'AAA',
      event_code: 'DIV',
      value_per_share: 4000.5,
    });
    const down = classifyVciEvent({
      id: 'div-3',
      ticker: 'AAA',
      event_code: 'DIV',
      value_per_share: '3999.4',
    });
    if (!('action' in half) || !('action' in down)) throw new Error('expected actions');
    expect(half.action.cashPerShareVnd).toBe(4001n);
    expect(down.action.cashPerShareVnd).toBe(3999n);
  });

  it('ignores DIV events with a missing, zero or negative value', () => {
    expect(ignoredReason(classifyVciEvent({ id: 'd', ticker: 'AAA', event_code: 'DIV' }))).toBe(
      'missing_or_invalid_value_per_share',
    );
    expect(
      ignoredReason(
        classifyVciEvent({ id: 'd', ticker: 'AAA', event_code: 'DIV', value_per_share: 0 }),
      ),
    ).toBe('missing_or_invalid_value_per_share');
    expect(
      ignoredReason(
        classifyVciEvent({ id: 'd', ticker: 'AAA', event_code: 'DIV', value_per_share: -1000 }),
      ),
    ).toBe('missing_or_invalid_value_per_share');
  });

  it('accepts an ISS stock dividend and keeps the exact ratio', () => {
    const result = classifyVciEvent({
      id: 'iss-1',
      ticker: 'htn',
      event_code: 'ISS',
      event_title_en: 'Share Issue - Stock dividend ratio 25.0%',
      public_date: '2026-09-01T00:00:00',
      exright_date: '2026-10-08T00:00:00',
      record_date: '2026-10-09T00:00:00',
      exercise_ratio: 0.25,
    });
    if (!('action' in result)) throw new Error('expected an action');
    expect(result.action).toMatchObject({
      eventCode: 'ISS',
      kind: 'stock_dividend',
      stockRatio: '0.25',
      cashPerShareVnd: null,
    });
  });

  it('accepts a bonus issue title', () => {
    const result = classifyVciEvent({
      id: 'iss-2',
      ticker: 'HTN',
      event_code: 'ISS',
      event_title_en: 'Share Issue - Bonus Issue 10%',
      exercise_ratio: 0.1,
    });
    if (!('action' in result)) throw new Error('expected an action');
    expect(result.action.kind).toBe('stock_dividend');
    expect(result.action.stockRatio).toBe('0.1');
  });

  it('ignores ISS purchase rights and unknown titles', () => {
    expect(
      ignoredReason(
        classifyVciEvent({
          id: 'iss-3',
          ticker: 'AAA',
          event_code: 'ISS',
          event_title_en: 'Rights issue 2:1',
          exercise_ratio: 1,
        }),
      ),
    ).toBe('purchase_right_not_a_dividend');
    expect(
      ignoredReason(
        classifyVciEvent({
          id: 'iss-4',
          ticker: 'AAA',
          event_code: 'ISS',
          event_title_en: 'Annual general meeting',
          exercise_ratio: 0.2,
        }),
      ),
    ).toBe('unrecognized_iss_title');
  });

  it('rejects ISS ratios that are missing, non-positive or too precise', () => {
    const event = (exercise_ratio: unknown): unknown => ({
      id: 'iss-5',
      ticker: 'AAA',
      event_code: 'ISS',
      event_title_en: 'Stock dividend',
      exercise_ratio,
    });
    expect(ignoredReason(classifyVciEvent(event(undefined)))).toBe(
      'missing_or_invalid_exercise_ratio',
    );
    expect(ignoredReason(classifyVciEvent(event(0)))).toBe('missing_or_invalid_exercise_ratio');
    expect(ignoredReason(classifyVciEvent(event('0.1234567890123')))).toBe(
      'missing_or_invalid_exercise_ratio',
    );
    expect('action' in classifyVciEvent(event('0.1234567890'))).toBe(true);
  });

  it('accepts an AIS listing only when issue_date is present', () => {
    const result = classifyVciEvent({
      id: 'ais-1',
      ticker: 'htn',
      event_code: 'AIS',
      event_title_en: 'Additional listing',
      issue_date: '2026-11-01T00:00:00',
    });
    if (!('action' in result)) throw new Error('expected an action');
    expect(result.action.kind).toBe('listing');
    expect(result.action.issueDate).toBe('2026-11-01');
    expect(ignoredReason(classifyVciEvent({ id: 'ais-2', ticker: 'HTN', event_code: 'AIS' }))).toBe(
      'missing_issue_date',
    );
  });

  it('ignores unsupported codes, invalid dates and missing identity', () => {
    expect(ignoredReason(classifyVciEvent({ id: 'x', ticker: 'AAA', event_code: 'XYZ' }))).toBe(
      'unsupported_event_code',
    );
    expect(
      ignoredReason(
        classifyVciEvent({
          id: 'x',
          ticker: 'AAA',
          event_code: 'DIV',
          value_per_share: 1000,
          exright_date: '2026-13-40T00:00:00',
        }),
      ),
    ).toBe('invalid_date');
    expect(
      ignoredReason(
        classifyVciEvent({
          id: 'x',
          ticker: 'AAA',
          event_code: 'DIV',
          value_per_share: 1000,
          record_date: '2026-02-30T00:00:00',
        }),
      ),
    ).toBe('invalid_date');
    expect(ignoredReason(classifyVciEvent({ ticker: 'AAA', event_code: 'DIV' }))).toBe(
      'missing_source_event_id',
    );
    expect(ignoredReason(classifyVciEvent({ id: 'x', event_code: 'DIV' }))).toBe('missing_ticker');
  });
});

describe('numeric helpers', () => {
  it('rounds half up symmetrically on bigint rationals', () => {
    expect(roundHalfUp(5n, 2n)).toBe(3n);
    expect(roundHalfUp(1n, 2n)).toBe(1n);
    expect(roundHalfUp(4n, 10n)).toBe(0n);
    expect(roundHalfUp(5n, 10n)).toBe(1n);
    expect(roundHalfUp(15n, 10n)).toBe(2n);
    expect(roundHalfUp(-5n, 2n)).toBe(-3n);
  });

  it('parses ratios to exact decimal strings bounded at ten decimals', () => {
    expect(parseRatio(0.25)).toBe('0.25');
    expect(parseRatio(0.2)).toBe('0.2');
    expect(parseRatio('0.250')).toBe('0.25');
    expect(parseRatio('1')).toBe('1');
    expect(parseRatio('0.1234567890')).toBe('0.123456789');
    expect(parseRatio('0.12345678901')).toBeNull();
    expect(parseRatio(0)).toBeNull();
    expect(parseRatio(-0.5)).toBeNull();
    expect(parseRatio('abc')).toBeNull();
    expect(parseRatio(null)).toBeNull();
  });

  it('derives the Vietnam calendar date with the +7h convention', () => {
    expect(vnDate(new Date('2026-10-07T18:00:00.000Z'))).toBe('2026-10-08');
    expect(vnDate(new Date('2026-10-07T16:59:00.000Z'))).toBe('2026-10-07');
  });
});

describe('computeRightsAdjustment', () => {
  it('reproduces the BFC cash dividend example', () => {
    const adjusted = computeRightsAdjustment({
      eligibleQuantity: 100,
      liveQuantity: 100,
      liveAvgVnd: 49_900n,
      terms: { kind: 'cash_dividend', cashPerShareVnd: 4000n },
    });
    expect(adjusted).toEqual({ newAvgVnd: 45_900n, cashVnd: 400_000n, shares: 0 });
  });

  it('reproduces the HTN stock dividend example', () => {
    const adjusted = computeRightsAdjustment({
      eligibleQuantity: 1400,
      liveQuantity: 1400,
      liveAvgVnd: 7300n,
      terms: { kind: 'stock_dividend', stockRatio: '0.2' },
    });
    expect(adjusted).toEqual({ newAvgVnd: 6083n, cashVnd: 0n, shares: 280 });
  });

  it('floors fractional shares once per event', () => {
    const adjusted = computeRightsAdjustment({
      eligibleQuantity: 1401,
      liveQuantity: 1401,
      liveAvgVnd: 7300n,
      terms: { kind: 'stock_dividend', stockRatio: '0.2' },
    });
    expect(adjusted.shares).toBe(280);
  });

  it('handles the liveQuantity = 0 branches', () => {
    const cash = computeRightsAdjustment({
      eligibleQuantity: 100,
      liveQuantity: 0,
      liveAvgVnd: 49_900n,
      terms: { kind: 'cash_dividend', cashPerShareVnd: 4000n },
    });
    expect(cash).toEqual({ newAvgVnd: 49_900n, cashVnd: 400_000n, shares: 0 });

    const stock = computeRightsAdjustment({
      eligibleQuantity: 1400,
      liveQuantity: 0,
      liveAvgVnd: 7300n,
      terms: { kind: 'stock_dividend', stockRatio: '0.2' },
    });
    expect(stock).toEqual({ newAvgVnd: 6083n, cashVnd: 0n, shares: 280 });
  });

  it('throws a typed error instead of clamping a negative average cost', () => {
    expect(() =>
      computeRightsAdjustment({
        eligibleQuantity: 100,
        liveQuantity: 100,
        liveAvgVnd: 3000n,
        terms: { kind: 'cash_dividend', cashPerShareVnd: 4000n },
      }),
    ).toThrow(RightsNegativeCostError);
  });
});

describe('computeEligibleQuantity', () => {
  const epoch = new Date('2026-01-01T00:00:00.000Z');
  const base = {
    eligibilityDate: '2026-10-07',
    accountEpochAt: epoch,
    priorStockEntitlements: [],
  };

  it('counts buys through the eligibility date and ignores the ex-date buy', () => {
    const eligible = computeEligibleQuantity({
      ...base,
      trades: [trade({ quantity: 100 })],
    });
    expect(eligible).toEqual({ quantity: 100, negative: false });

    const exDateBuy = computeEligibleQuantity({
      ...base,
      trades: [trade({ quantity: 100, sessionDate: '2026-10-08' })],
    });
    expect(exDateBuy).toEqual({ quantity: 0, negative: false });
  });

  it('keeps entitlement when a sell happens on the ex-date', () => {
    const eligible = computeEligibleQuantity({
      ...base,
      trades: [
        trade({ quantity: 100 }),
        trade({ side: 'sell', quantity: 100, sessionDate: '2026-10-08' }),
      ],
    });
    expect(eligible).toEqual({ quantity: 100, negative: false });
  });

  it('ignores trades before the account epoch', () => {
    const eligible = computeEligibleQuantity({
      ...base,
      trades: [trade({ tradedAt: new Date('2025-12-31T23:59:59.000Z') })],
    });
    expect(eligible).toEqual({ quantity: 0, negative: false });
  });

  it('adds prior stock entitlements effective through the eligibility date', () => {
    const eligible = computeEligibleQuantity({
      ...base,
      trades: [trade({ quantity: 100 })],
      priorStockEntitlements: [
        { effectiveExDate: '2026-10-07', shareQuantity: 280 },
        { effectiveExDate: '2026-10-08', shareQuantity: 999 },
      ],
    });
    expect(eligible).toEqual({ quantity: 380, negative: false });
  });

  it('clamps a negative reconstruction and reports the flag', () => {
    const eligible = computeEligibleQuantity({
      ...base,
      trades: [trade({ side: 'sell', quantity: 50 })],
    });
    expect(eligible).toEqual({ quantity: 0, negative: true });
  });
});

describe('previousTradingDate', () => {
  it('steps over weekends', () => {
    expect(previousTradingDate('2026-10-12', NO_HOLIDAYS)).toBe('2026-10-09');
    expect(previousTradingDate('2026-10-05', NO_HOLIDAYS)).toBe('2026-10-02');
  });

  it('steps over configured holidays', () => {
    const holidays = new Set(['2026-10-09']);
    expect(previousTradingDate('2026-10-12', holidays)).toBe('2026-10-08');
  });
});

describe('determineDueTransitions', () => {
  it('applies the ex transition only at or after the ex-date with no entitlement', () => {
    const cash = action({ exright_date: '2026-10-08' });
    expect(determineDueTransitions(cash, null, '2026-10-07')).toEqual([]);
    expect(determineDueTransitions(cash, null, '2026-10-08')).toEqual([{ type: 'apply_ex' }]);
  });

  it('never applies ex for listings or non-processable actions', () => {
    expect(
      determineDueTransitions(
        action({ kind: 'listing', event_code: 'AIS', exright_date: '2026-10-08' }),
        null,
        '2026-10-20',
      ),
    ).toEqual([]);
    expect(
      determineDueTransitions(
        action({ exright_date: '2026-10-08', disposition: 'review_required' }),
        null,
        '2026-10-20',
      ),
    ).toEqual([]);
    expect(
      determineDueTransitions(
        action({ exright_date: '2026-10-08', disposition: 'skipped_pre_deploy' }),
        null,
        '2026-10-20',
      ),
    ).toEqual([]);
  });

  it('pays pending cash only when payout_date is due', () => {
    const cash = action({ exright_date: '2026-10-08', payout_date: '2026-10-20' });
    const ent = entitlement({ status: 'pending_cash' });
    expect(determineDueTransitions(cash, ent, '2026-10-19')).toEqual([]);
    expect(determineDueTransitions(cash, ent, '2026-10-20')).toEqual([{ type: 'pay_cash' }]);
    expect(
      determineDueTransitions(action({ payout_date: '2026-10-20' }), ent, '2026-10-20'),
    ).toEqual([{ type: 'pay_cash' }]);
  });

  it('credits pending stock only when credit_date is due', () => {
    const stock = action({
      kind: 'stock_dividend',
      event_code: 'ISS',
      cash_per_share_vnd: null,
      stock_ratio: '0.2',
      exright_date: '2026-10-08',
      credit_date: '2026-11-01',
    });
    const ent = entitlement({
      kind: 'stock_dividend',
      status: 'pending_stock',
      cash_amount_vnd: 0n,
      share_quantity: 280,
    });
    expect(determineDueTransitions(stock, ent, '2026-10-31')).toEqual([]);
    expect(determineDueTransitions(stock, ent, '2026-11-01')).toEqual([{ type: 'credit_stock' }]);
  });

  it('keeps NULL payout and credit dates pending indefinitely', () => {
    const cash = action({ exright_date: '2026-10-08' });
    expect(
      determineDueTransitions(cash, entitlement({ status: 'pending_cash' }), '2030-01-01'),
    ).toEqual([]);
    const stock = action({
      kind: 'stock_dividend',
      event_code: 'ISS',
      cash_per_share_vnd: null,
      stock_ratio: '0.2',
      exright_date: '2026-10-08',
    });
    expect(
      determineDueTransitions(
        stock,
        entitlement({
          kind: 'stock_dividend',
          status: 'pending_stock',
          cash_amount_vnd: 0n,
          share_quantity: 280,
        }),
        '2030-01-01',
      ),
    ).toEqual([]);
  });

  it('does not transition fulfilled or cancelled entitlements', () => {
    const cash = action({ exright_date: '2026-10-08', payout_date: '2026-10-20' });
    expect(
      determineDueTransitions(
        cash,
        entitlement({ status: 'paid', fulfilled_at: new Date() }),
        '2026-10-20',
      ),
    ).toEqual([]);
    expect(
      determineDueTransitions(
        cash,
        entitlement({ status: 'cancelled_reset', fulfilled_at: new Date() }),
        '2026-10-20',
      ),
    ).toEqual([]);
  });
});

describe('deriveActionStage', () => {
  it('derives the cash lifecycle from dates and disposition', () => {
    expect(deriveActionStage(action(), '2026-10-01')).toBe('announced');
    expect(deriveActionStage(action({ exright_date: '2026-10-08' }), '2026-10-07')).toBe(
      'ex_date_pending',
    );
    expect(deriveActionStage(action({ exright_date: '2026-10-08' }), '2026-10-08')).toBe(
      'ex_applied',
    );
    expect(
      deriveActionStage(
        action({ exright_date: '2026-10-08', payout_date: '2026-10-20' }),
        '2026-10-20',
      ),
    ).toBe('paid');
  });

  it('derives the stock lifecycle from the credit date', () => {
    const stock = action({
      kind: 'stock_dividend',
      event_code: 'ISS',
      cash_per_share_vnd: null,
      stock_ratio: '0.2',
      exright_date: '2026-10-08',
      credit_date: '2026-11-01',
    });
    expect(deriveActionStage(stock, '2026-10-07')).toBe('ex_date_pending');
    expect(deriveActionStage(stock, '2026-10-08')).toBe('ex_applied');
    expect(deriveActionStage(stock, '2026-11-01')).toBe('credited');
  });

  it('honours policy disposition and listing evidence', () => {
    expect(deriveActionStage(action({ disposition: 'skipped_pre_deploy' }), '2026-10-01')).toBe(
      'skipped_pre_deploy',
    );
    expect(deriveActionStage(action({ disposition: 'review_required' }), '2026-10-01')).toBe(
      'review_required',
    );
    expect(
      deriveActionStage(
        action({
          kind: 'listing',
          event_code: 'AIS',
          cash_per_share_vnd: null,
          issue_date: '2026-11-01',
        }),
        '2026-11-01',
      ),
    ).toBe('listing');
  });
});
