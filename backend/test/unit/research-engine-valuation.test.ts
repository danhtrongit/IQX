import { describe, expect, it } from 'vitest';

import {
  computeValuation,
  latestBrokerTargets,
  servedValuation,
} from '../../src/modules/research/engine/valuation.js';
import type { BrokerTarget } from '../../src/modules/research/research.types.js';
import { TODAY, report, snapshot } from './research-engine-helpers.js';

const tgt = (broker: string, targetPriceVnd: number, reportDate = '2026-10-10'): BrokerTarget => ({
  broker,
  targetPriceVnd,
  reportDate,
  reportId: `${broker}-${reportDate}`,
});

describe('latestBrokerTargets', () => {
  it('test 29: newer target replaces the older one of the same broker', () => {
    const t = latestBrokerTargets(
      [
        report({ id: 'a', broker: 'VIETCAP', reportDate: '2026-10-01', targetPriceVnd: 170_000 }),
        report({ id: 'b', broker: 'VIETCAP', reportDate: '2026-10-16', targetPriceVnd: 185_000 }),
        report({ id: 'c', broker: 'SSI', reportDate: '2026-10-05', targetPriceVnd: 190_000 }),
      ],
      TODAY,
      null,
    );
    expect(t.map((x) => [x.broker, x.targetPriceVnd])).toEqual([
      ['SSI', 190_000],
      ['VIETCAP', 185_000],
    ]);
    expect(computeValuation(t, [], TODAY).targetMedian).toBe(187_500);
  });

  it('test 17: uses the nearest report that has a target; skips out-of-window', () => {
    const t = latestBrokerTargets(
      [
        report({ id: 'a', broker: 'VIETCAP', reportDate: '2026-10-01', targetPriceVnd: 170_000 }),
        report({ id: 'flash', broker: 'VIETCAP', reportDate: '2026-10-16' }),
        report({ id: 'old', broker: 'MBS', reportDate: '2026-09-10', targetPriceVnd: 50_000 }),
      ],
      TODAY,
      null,
    );
    expect(t).toEqual([
      { broker: 'VIETCAP', targetPriceVnd: 170_000, reportDate: '2026-10-01', reportId: 'a' },
    ]);
  });

  it('test 26: target 68 vs price 61,700 is rejected, falling back to the next newest', () => {
    const reports = [
      report({ id: 'ok', broker: 'SSI', reportDate: '2026-10-01', targetPriceVnd: 68_000 }),
      report({ id: 'bad', broker: 'SSI', reportDate: '2026-10-10', targetPriceVnd: 68 }),
      report({ id: 'only', broker: 'HSC', reportDate: '2026-10-10', targetPriceVnd: 68 }),
    ];
    const t = latestBrokerTargets(reports, TODAY, 61_700);
    expect(t).toEqual([
      { broker: 'SSI', targetPriceVnd: 68_000, reportDate: '2026-10-01', reportId: 'ok' },
    ]);
    // price unknown → no ratio check
    expect(latestBrokerTargets(reports, TODAY, null)).toHaveLength(2);
  });

  it('ratio bounds are inclusive: 0.3x and 3x kept, just outside dropped', () => {
    const r = (id: string, p: number) =>
      report({ id, broker: id, reportDate: '2026-10-10', targetPriceVnd: p });
    const t = latestBrokerTargets(
      [r('A', 30_000), r('B', 300_000), r('C', 29_999), r('D', 300_001)],
      TODAY,
      100_000,
    );
    expect(t.map((x) => x.broker)).toEqual(['A', 'B']);
  });

  it('same-date reports of one broker: later input wins', () => {
    const t = latestBrokerTargets(
      [
        report({ id: 'a', broker: 'SSI', reportDate: '2026-10-10', targetPriceVnd: 100_000 }),
        report({ id: 'b', broker: 'SSI', reportDate: '2026-10-10', targetPriceVnd: 110_000 }),
      ],
      TODAY,
      null,
    );
    expect(t[0]!.reportId).toBe('b');
  });
});

describe('computeValuation', () => {
  it('test 32: no targets → hidden no_target', () => {
    const v = computeValuation([], [], null);
    expect(v.hiddenReason).toBe('no_target');
    expect(v.targetMedian).toBeNull();
    expect(servedValuation(v, 100_000)).toBeNull();
  });

  it('odd count median, min, max', () => {
    const v = computeValuation(
      [tgt('A', 170_000), tgt('B', 190_000), tgt('C', 180_000)],
      [],
      '2026-10-10',
    );
    expect(v).toMatchObject({
      targetMedian: 180_000,
      targetMin: 170_000,
      targetMax: 190_000,
      activeBrokerCount: 3,
      hiddenReason: null,
    });
  });

  it('even count median is the rounded mean of the two middle values', () => {
    const v = computeValuation(
      [tgt('A', 100_001), tgt('B', 100_002), tgt('C', 90_000), tgt('D', 120_000)],
      [],
      null,
    );
    expect(v.targetMedian).toBe(100_002); // (100001+100002)/2 = 100001.5 → 100002
    expect(v.targetMin).toBe(90_000);
    expect(v.targetMax).toBe(120_000);
  });

  it('test 31: ex-date after the report date of ANY target hides the module', () => {
    const targets = [tgt('A', 100_000, '2026-10-01'), tgt('B', 110_000, '2026-10-15')];
    const hidden = computeValuation(
      targets,
      [{ symbol: 'X', exDate: '2026-10-10', eventCode: 'ISS' }],
      null,
    );
    expect(hidden.hiddenReason).toBe('corporate_action');
    expect(hidden.targetMedian).toBeNull();
    expect(hidden.targets).toHaveLength(2);
    // ex-date on/before every report date → fine
    const ok = computeValuation(
      targets,
      [{ symbol: 'X', exDate: '2026-10-01', eventCode: 'ISS' }],
      null,
    );
    expect(ok.hiddenReason).toBeNull();
  });
});

describe('servedValuation', () => {
  const three = computeValuation(
    [tgt('A', 170_000), tgt('B', 190_000), tgt('C', 180_000)],
    [],
    null,
  );

  it('test 28: median 180k vs 150k → 20.0, vs 160k → 12.5', () => {
    expect(servedValuation(three, 150_000)).toMatchObject({
      mode: 'range',
      targetMedian: 180_000,
      upsidePercent: 20,
    });
    expect(servedValuation(three, 160_000)).toMatchObject({
      upsidePercent: 12.5,
      currentPrice: 160_000,
    });
  });

  it('range exposes min/max; single broker has none (test 30)', () => {
    expect(servedValuation(three, 150_000)).toMatchObject({
      targetMin: 170_000,
      targetMax: 190_000,
    });
    const single = servedValuation(computeValuation([tgt('A', 185_000)], [], null), 150_000)!;
    expect(single.mode).toBe('single');
    expect('targetMin' in single).toBe(false);
    expect(single.upsidePercent).toBe(23.3);
  });

  it('negative upside and unknown price', () => {
    expect(servedValuation(three, 200_000)!.upsidePercent).toBe(-10);
    expect(servedValuation(three, null)).toMatchObject({ currentPrice: null, upsidePercent: null });
    expect(servedValuation(three, 0)).toMatchObject({ currentPrice: null, upsidePercent: null });
    expect(
      servedValuation(snapshot({ hiddenReason: 'corporate_action', targetMedian: 1 }), 5),
    ).toBeNull();
  });
});
