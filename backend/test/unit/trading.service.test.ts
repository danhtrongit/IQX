import { describe, expect, it } from 'vitest';

import { roundBasisPoints } from '../../src/modules/trading/trading.service.js';
import {
  addTradingDays,
  currentTradingDate,
  sessionExpiry,
} from '../../src/modules/trading/trading.calendar.js';
import { placeOrderSchema } from '../../src/modules/trading/trading.schemas.js';

describe('virtual trading arithmetic and contracts', () => {
  it('rounds basis points half-up using exact bigint arithmetic', () => {
    expect(roundBasisPoints(100_000n, 15)).toBe(150n);
    expect(roundBasisPoints(1n, 50)).toBe(0n);
    expect(roundBasisPoints(5_000n, 1)).toBe(1n);
    expect(roundBasisPoints(999_999_999_999n, 10)).toBe(1_000_000_000n);
  });

  it('rejects invalid order shape and sell journey payload', () => {
    expect(
      placeOrderSchema.safeParse({
        symbol: 'fpt',
        side: 'limit',
        order_type: 'market',
        quantity: 100,
      }).success,
    ).toBe(false);
    expect(
      placeOrderSchema.safeParse({
        symbol: 'FPT',
        side: 'sell',
        order_type: 'market',
        quantity: 100,
        journey_plan: { ly_do_doi_thuong: 'x' },
      }).success,
    ).toBe(false);
    const parsed = placeOrderSchema.parse({
      symbol: 'fpt',
      side: 'buy',
      order_type: 'limit',
      quantity: 100,
      limit_price_vnd: 10_000,
    });
    expect(parsed.symbol).toBe('FPT');
  });

  it('calculates Vietnam trading date and T+2 around weekends/holidays', () => {
    const holidays = new Set(['2026-09-21']);
    expect(currentTradingDate(new Date('2026-09-21T04:00:00Z'), holidays)).toBe('2026-09-18');
    expect(addTradingDays('2026-09-18', 2, holidays)).toBe('2026-09-23');
    expect(sessionExpiry('2026-09-18').toISOString()).toBe('2026-09-18T08:00:00.000Z');
  });
});
