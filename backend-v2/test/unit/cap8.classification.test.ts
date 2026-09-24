import { describe, expect, it } from 'vitest';

import {
  classifyCap8Exit,
  timelyStop,
} from '../../src/modules/journey/cap8/cap8.classification.js';

const snapshot = {
  matchedBuyOrderId: 'buy-1',
  sellOrderId: 'sell-1',
  symbol: 'AAA',
  snapshotAt: '2026-01-03T10:00:00+07:00',
  updatedAt: '2026-01-03T10:00:00+07:00',
  createdAt: '2026-01-01T10:00:00+07:00',
  quantity: 100,
  filledPriceVnd: 120,
  beforeQuantity: 100,
  afterQuantity: 0,
  originalStopVnd: 90,
  takeProfitVnd: 120,
  dynamicStopVnd: null,
  dynamicStopSetAt: null,
  planActivatedAt: '2026-01-01T10:00:00+07:00',
  avgCostVnd: 100,
};

describe('Cap8 immutable exit evidence', () => {
  it('classifies target exits without querying the mutable current plan', () => {
    expect(classifyCap8Exit(snapshot, null)).toMatchObject({
      compliant: true,
      exitMethod: 'full',
      reason: 'take_profit_hit',
      remainingPositionPct: 0,
    });
  });

  it('requires independently verified history for a stop exit', () => {
    const stopSnapshot = {
      ...snapshot,
      filledPriceVnd: 90,
      takeProfitVnd: 120,
    };
    expect(classifyCap8Exit(stopSnapshot, null).reason).toBe('unknown_price_history');
    expect(
      classifyCap8Exit(stopSnapshot, [
        { day: '2026-01-02', close: 89 },
        { day: '2026-01-03', close: 90 },
      ]),
    ).toMatchObject({ compliant: true, reason: 'timely_original_stop_exit' });
  });

  it('rejects a stop sold after the next verified session', () => {
    expect(
      timelyStop(
        [
          { day: '2026-01-01', close: 100 },
          { day: '2026-01-02', close: 90 },
          { day: '2026-01-03', close: 80 },
          { day: '2026-01-04', close: 70 },
        ],
        90,
        '2026-01-04',
        '2026-01-01',
      ),
    ).toEqual({ timely: false, reason: 'late_stop_exit' });
  });

  it('keeps malformed or missing execution snapshots unknown', () => {
    expect(classifyCap8Exit({ ...snapshot, beforeQuantity: null }, null)).toMatchObject({
      compliant: false,
      reason: 'missing_execution_snapshot',
    });
    expect(classifyCap8Exit({ ...snapshot, beforeQuantity: 0 }, null).reason).toBe(
      'invalid_execution_snapshot',
    );
  });
});
