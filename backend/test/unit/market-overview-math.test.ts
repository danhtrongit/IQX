import { describe, expect, it, vi } from 'vitest';

import {
  buildCapWeightedWeeklySectorSeries,
  classifyRrgQuadrant,
  computeSectorRotation,
  computeSymmetricRrgDomain,
  computeWindowZScore,
  getIsoWeekKey,
  toWeeklySeries,
  type DailyCloseBar,
} from '../../src/modules/market-overview/aggregators/rrg-math.js';
import {
  computeVnIndexImpact,
  type HoseEquityImpactInput,
} from '../../src/modules/market-overview/aggregators/impact-math.js';
import {
  classifyFuturesSlots,
  computeExpiryDate,
  countRemainingTradingSessions,
  decodeKrxMonth,
  decodeKrxYear,
  parseFuturesContractCode,
} from '../../src/modules/market-overview/aggregators/derivatives-calendar.js';
import {
  COMMODITY_FX_CATALOG,
  COMMODITY_SECTOR_ICB4_METADATA,
  COMMODITY_SECTOR_MAP,
  findCommodityEntry,
  getCommoditiesByTab,
  getMappedCommoditySector,
} from '../../src/modules/market-overview/aggregators/commodity-map.js';
import {
  GlobalMarketProvider,
  MSN_SECID,
} from '../../src/modules/market-extended/global-market.provider.js';
import { MarketHttpClient } from '../../src/modules/market-extended/market-http.client.js';

// ---------------------------------------------------------------------------
// Helpers for deterministic synthetic time-series generation
// ---------------------------------------------------------------------------

/** Generates Mon–Fri trading dates spanning `weeks` consecutive ISO weeks from a Monday anchor. */
function generateWeeklyDailyDates(startMondayIso: string, weeks: number): string[][] {
  const start = new Date(`${startMondayIso}T00:00:00.000Z`);
  const allWeeks: string[][] = [];
  for (let w = 0; w < weeks; w += 1) {
    const days: string[] = [];
    for (let d = 0; d < 5; d += 1) {
      const dt = new Date(start.getTime() + (w * 7 + d) * 86_400_000);
      days.push(dt.toISOString().slice(0, 10));
    }
    allWeeks.push(days);
  }
  return allWeeks;
}

/** Expands weekly target closes into daily bars whose Friday close equals the weekly target. */
function expandWeeklyToDaily(
  weekDates: readonly string[][],
  weeklyCloses: readonly number[],
): DailyCloseBar[] {
  const bars: DailyCloseBar[] = [];
  for (let w = 0; w < weekDates.length; w += 1) {
    const days = weekDates[w]!;
    const target = weeklyCloses[w]!;
    const prev = w > 0 ? weeklyCloses[w - 1]! : target;
    for (let d = 0; d < days.length; d += 1) {
      const frac = (d + 1) / days.length;
      bars.push({
        d: days[d]!,
        c: d === days.length - 1 ? target : prev + (target - prev) * frac,
      });
    }
  }
  return bars;
}

/** Independent reference implementation of SPEC WIDGET.md Section 4.1 RRG formulas. */
function referenceRrgTail(sectorWeekly: number[], benchWeekly: number[], trailLen = 5) {
  const rs = sectorWeekly.map((s, i) => s / benchWeekly[i]!);
  const r: number[] = [];
  for (let t = 9; t < rs.length; t += 1) {
    let sum = 0;
    for (let j = t - 9; j <= t; j += 1) sum += rs[j]!;
    r.push(100 * (rs[t]! / (sum / 10)));
  }
  const zScore = (arr: number[], end: number, win: number) => {
    const start = Math.max(0, end - win + 1);
    const slice = arr.slice(start, end + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    const sd = Math.sqrt(variance);
    return sd === 0 ? 0 : (arr[end]! - mean) / sd;
  };
  const ratio: number[] = [];
  for (let k = 1; k < r.length; k += 1) {
    ratio.push(100 + zScore(r, k, 52));
  }
  const m: number[] = [];
  for (let i = 1; i < ratio.length; i += 1) {
    m.push(100 * (ratio[i]! / ratio[i - 1]!));
  }
  const out: Array<{ rsRatio: number; rsMomentum: number }> = [];
  for (let i = 1; i < m.length; i += 1) {
    out.push({
      rsRatio: ratio[i + 1]!,
      rsMomentum: 100 + zScore(m, i, 52),
    });
  }
  return out.slice(-trailLen);
}

// ---------------------------------------------------------------------------
// 1. RRG Math (`rrg-math.ts`)
// ---------------------------------------------------------------------------

describe('rrg-math', () => {
  it('aggregates daily bars into ISO week-ending bars across year boundaries', () => {
    expect(getIsoWeekKey('2025-12-29')).toBe('2026-W01');
    expect(getIsoWeekKey('2026-01-02')).toBe('2026-W01');

    const weekly = toWeeklySeries([
      { d: '2025-12-30', c: 1205 },
      { d: '2025-12-29', c: 1200 },
      { d: '2026-01-02', c: 1215 }, // last trading day of 2026-W01
      { d: '2026-01-05', c: 1220 },
      { d: '2026-01-09', c: 1240 }, // last trading day of 2026-W02
      { d: 'invalid', c: 999 },
      { d: '2026-01-08', c: -10 },
    ]);

    expect(weekly).toEqual([
      { weekKey: '2026-W01', weekEnding: '2026-01-02', close: 1215 },
      { weekKey: '2026-W02', weekEnding: '2026-01-09', close: 1240 },
    ]);
  });

  it('computes cap-weighted weekly sector indices and chain-links new IPOs without jumps', () => {
    const weekDates = generateWeeklyDailyDates('2026-01-05', 4);
    const bench = toWeeklySeries(expandWeeklyToDaily(weekDates, [1000, 1010, 1020, 1030]));

    const series = buildCapWeightedWeeklySectorSeries(
      [
        {
          symbol: 'AAA',
          weight: 100,
          bars: expandWeeklyToDaily(weekDates, [10, 11, 12, 12]),
        },
        {
          symbol: 'BBB',
          weight: 200,
          // Lists only from week 3 onward at price 50 -> 55 (+10% in week 4)
          bars: expandWeeklyToDaily(weekDates.slice(2), [50, 55]),
        },
      ],
      bench,
    );

    expect(series).toHaveLength(4);
    expect(series[0]!.close).toBeCloseTo(100, 6);
    expect(series[1]!.close).toBeCloseTo(110, 6);
    // Week 3: only AAA existed in week 2, so week 3 change is 12/11 (no IPO spike from BBB).
    expect(series[2]!.close).toBeCloseTo(120, 6);
    // Week 4: both AAA (100*12 -> 100*12) and BBB (200*50 -> 200*55): 12200 / 11200.
    expect(series[3]!.close).toBeCloseTo(120 * (12200 / 11200), 6);
  });

  it('matches exact weekly RRG equations, quadrants, 5-week trails, and symmetric domain on a 70-week series', () => {
    const weeks = 70;
    const weekDates = generateWeeklyDailyDates('2025-03-03', weeks);
    const benchWeekly = Array.from(
      { length: weeks },
      (_, t) => 1200 + 25 * Math.sin(t / 9) + t * 1.4,
    );
    const benchDaily = expandWeeklyToDaily(weekDates, benchWeekly);

    // 4 phase-shifted cyclical relative-strength waves engineered to occupy all 4 quadrants.
    const makeWave = (phase: number, trend: number) =>
      benchWeekly.map(
        (v, t) =>
          v * (0.25 + trend * (t / weeks) + 0.045 * Math.sin((2 * Math.PI * t) / 28 + phase)),
      );

    // Construct sectors covering leading, weakening, lagging, improving quadrants.
    const bankWeekly = makeWave(0.15, 0.06);
    const steelWeekly = makeWave(1.75, 0.03);
    const realtyWeekly = makeWave(3.35, -0.05);
    const techWeekly = makeWave(4.85, -0.01);

    const bankMembers = [
      { symbol: 'VCB', weight: 600, bars: expandWeeklyToDaily(weekDates, bankWeekly) },
      { symbol: 'BID', weight: 400, bars: expandWeeklyToDaily(weekDates, bankWeekly) },
    ];

    const result = computeSectorRotation(
      [
        { code: '8300', name: 'Ngân hàng', members: bankMembers },
        { code: '1700', name: 'Thép', bars: expandWeeklyToDaily(weekDates, steelWeekly) },
        { code: '8600', name: 'Bất động sản', bars: expandWeeklyToDaily(weekDates, realtyWeekly) },
        { code: '9500', name: 'Công nghệ', bars: expandWeeklyToDaily(weekDates, techWeekly) },
      ],
      benchDaily,
    );

    expect(result.weekEnding).toBe(weekDates[weeks - 1]![4]);
    expect(result.sectors).toHaveLength(4);

    // Verify exact equation match against independent reference implementation.
    const expectedByCode: Record<string, number[]> = {
      '8300': bankWeekly,
      '1700': steelWeekly,
      '8600': realtyWeekly,
      '9500': techWeekly,
    };

    for (const sector of result.sectors) {
      expect(sector.trail).toHaveLength(5);
      const ref = referenceRrgTail(expectedByCode[sector.code]!, benchWeekly, 5);
      for (let i = 0; i < 5; i += 1) {
        expect(sector.trail[i]!.rsRatio).toBeCloseTo(ref[i]!.rsRatio, 4);
        expect(sector.trail[i]!.rsMomentum).toBeCloseTo(ref[i]!.rsMomentum, 4);
      }
      // Verify quadrant matches the trail head.
      const head = sector.trail.at(-1)!;
      expect(sector.quadrant).toBe(classifyRrgQuadrant(head.rsRatio, head.rsMomentum));
      // Verify all trail coordinates lie strictly inside symmetric domain.
      for (const pt of sector.trail) {
        expect(pt.rsRatio).toBeGreaterThan(result.domain.minRatio);
        expect(pt.rsRatio).toBeLessThan(result.domain.maxRatio);
        expect(pt.rsMomentum).toBeGreaterThan(result.domain.minMomentum);
        expect(pt.rsMomentum).toBeLessThan(result.domain.maxMomentum);
      }
    }

    // Verify exact symmetry around 100 and minimum half-span >= 2.5.
    const leftRatioSpan = Number((100 - result.domain.minRatio).toFixed(2));
    const rightRatioSpan = Number((result.domain.maxRatio - 100).toFixed(2));
    const leftMomSpan = Number((100 - result.domain.minMomentum).toFixed(2));
    const rightMomSpan = Number((result.domain.maxMomentum - 100).toFixed(2));
    expect(leftRatioSpan).toBe(rightRatioSpan);
    expect(leftMomSpan).toBe(rightMomSpan);
    expect(rightRatioSpan).toBeGreaterThanOrEqual(2.5);
  });

  it('classifies all four quadrants accurately including exact 100 boundaries', () => {
    expect(classifyRrgQuadrant(100, 100)).toBe('leading');
    expect(classifyRrgQuadrant(102.5, 101.1)).toBe('leading');
    expect(classifyRrgQuadrant(100, 99.99)).toBe('weakening');
    expect(classifyRrgQuadrant(99.99, 99.99)).toBe('lagging');
    expect(classifyRrgQuadrant(99.99, 100)).toBe('improving');
  });

  it('handles flat series (stdDev === 0) and short partial DB histories (< 65 weeks) gracefully', () => {
    // Flat series: sector strictly proportional to VN-Index -> stdDev === 0 -> (100, 100)
    const weekDates70 = generateWeeklyDailyDates('2025-03-03', 70);
    const bench70 = Array.from({ length: 70 }, (_, t) => 1200 + t * 2);
    const flatSector = bench70.map((v) => v * 0.4);

    const flatRes = computeSectorRotation(
      [{ code: 'FLAT', name: 'Flat Sector', bars: expandWeeklyToDaily(weekDates70, flatSector) }],
      expandWeeklyToDaily(weekDates70, bench70),
    );

    expect(flatRes.sectors).toHaveLength(1);
    expect(flatRes.sectors[0]!.quadrant).toBe('leading');
    for (const pt of flatRes.sectors[0]!.trail) {
      expect(pt.rsRatio).toBe(100);
      expect(pt.rsMomentum).toBe(100);
    }
    expect(flatRes.domain).toEqual({
      minRatio: 97.5,
      maxRatio: 102.5,
      minMomentum: 97.5,
      maxMomentum: 102.5,
    });

    // Short series: 20 weeks (< 65) produces full 5-week finite trail without crashing.
    const weekDates20 = generateWeeklyDailyDates('2026-06-01', 20);
    const bench20 = Array.from({ length: 20 }, (_, t) => 1300 + t * 3);
    const sec20 = bench20.map((v, t) => v * (0.2 + 0.01 * Math.sin(t / 2) + 0.002 * t));
    const short20 = computeSectorRotation(
      [{ code: 'SHORT20', name: 'Short 20w', bars: expandWeeklyToDaily(weekDates20, sec20) }],
      expandWeeklyToDaily(weekDates20, bench20),
    );
    expect(short20.sectors).toHaveLength(1);
    expect(short20.sectors[0]!.trail).toHaveLength(5);
    for (const pt of short20.sectors[0]!.trail) {
      expect(Number.isFinite(pt.rsRatio)).toBe(true);
      expect(Number.isFinite(pt.rsMomentum)).toBe(true);
    }

    // Minimal 12-week history still emits valid finite result without crashing.
    const weekDates12 = generateWeeklyDailyDates('2026-08-03', 12);
    const bench12 = Array.from({ length: 12 }, (_, t) => 1250 + t * 4);
    const sec12 = bench12.map((v, t) => v * (0.3 + 0.005 * t));
    const short12 = computeSectorRotation(
      [{ code: 'SHORT12', name: 'Short 12w', bars: expandWeeklyToDaily(weekDates12, sec12) }],
      expandWeeklyToDaily(weekDates12, bench12),
    );
    expect(short12.sectors).toHaveLength(1);
    expect(short12.sectors[0]!.trail.length).toBeGreaterThanOrEqual(1);

    // Ultra-short (< 3 weeks) returns clean empty sectors with default symmetric domain.
    const emptyRes = computeSectorRotation(
      [{ code: 'TINY', name: 'Tiny', bars: [{ d: '2026-11-20', c: 100 }] }],
      [{ d: '2026-11-20', c: 1200 }],
    );
    expect(emptyRes.sectors).toEqual([]);
    expect(emptyRes.domain).toEqual(computeSymmetricRrgDomain([]));
    expect(computeWindowZScore([100, 100, 100], 2, 52)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. VN-Index Impact Math (`impact-math.ts`)
// ---------------------------------------------------------------------------

describe('impact-math', () => {
  function buildHoseBasket(
    moves: ReadonlyArray<{ symbol: string; refPrice: number; pct: number; capRefBillion: number }>,
  ): { equities: HoseEquityImpactInput[]; exactIndexChange: number; vnIndexRef: number } {
    const vnIndexRef = 1726.72;
    let totalRef = 0;
    let totalNow = 0;
    const equities: HoseEquityImpactInput[] = moves.map((m) => {
      const price = Number((m.refPrice * (1 + m.pct / 100)).toFixed(2));
      const capRef = m.capRefBillion * 1e9;
      const capNow = capRef * (price / m.refPrice);
      totalRef += capRef;
      totalNow += capNow;
      return {
        symbol: m.symbol,
        price,
        refPrice: m.refPrice,
        marketCapVnd: capNow,
      };
    });
    const exactIndexChange = ((totalNow - totalRef) / totalRef) * vnIndexRef;
    return { equities, exactIndexChange, vnIndexRef };
  }

  it('reconciles |sumUp + sumDn - indexChange| <= 0.1 (<= 0.01) across 5+ realistic HOSE sessions', () => {
    const baseCaps = [
      { symbol: 'VCB', refPrice: 92.0, capRefBillion: 514_000 },
      { symbol: 'BID', refPrice: 46.5, capRefBillion: 265_000 },
      { symbol: 'CTG', refPrice: 36.2, capRefBillion: 194_000 },
      { symbol: 'VHM', refPrice: 44.0, capRefBillion: 191_000 },
      { symbol: 'VIC', refPrice: 42.5, capRefBillion: 162_000 },
      { symbol: 'FPT', refPrice: 134.0, capRefBillion: 196_000 },
      { symbol: 'GAS', refPrice: 72.5, capRefBillion: 167_000 },
      { symbol: 'TCB', refPrice: 24.5, capRefBillion: 172_000 },
      { symbol: 'HPG', refPrice: 27.1, capRefBillion: 173_000 },
      { symbol: 'MBB', refPrice: 24.8, capRefBillion: 131_000 },
      { symbol: 'VNM', refPrice: 66.0, capRefBillion: 138_000 },
      { symbol: 'VPB', refPrice: 19.6, capRefBillion: 155_000 },
      { symbol: 'MWG', refPrice: 65.4, capRefBillion: 95_000 },
      { symbol: 'MSN', refPrice: 74.2, capRefBillion: 106_000 },
      { symbol: 'ACB', refPrice: 25.1, capRefBillion: 112_000 },
      { symbol: 'SAB', refPrice: 56.8, capRefBillion: 73_000 },
      { symbol: 'STB', refPrice: 33.4, capRefBillion: 63_000 },
      { symbol: 'SSI', refPrice: 26.5, capRefBillion: 52_000 },
      { symbol: 'PLX', refPrice: 41.2, capRefBillion: 52_000 },
      { symbol: 'GVR', refPrice: 32.0, capRefBillion: 128_000 },
    ];

    // 6 distinct realistic sessions: rally, selloff, mixed-flat, narrow-mega-cap, VCI-freefloat-drift, heavy-red
    const sessionPctPatterns: number[][] = [
      [
        2.1, 3.4, 2.8, 1.5, -0.5, 4.2, 1.1, 2.5, 3.0, 2.2, 0.0, 1.8, 4.5, -1.2, 1.9, -0.3, 3.1, 5.2,
        0.8, 2.7,
      ],
      [
        -2.5, -3.1, -2.9, -4.2, -3.5, -1.8, -1.4, -2.2, -3.0, -2.0, 0.5, -2.4, -3.8, -2.1, -1.9,
        0.2, -4.1, -5.0, -1.3, -3.4,
      ],
      [
        0.4, -0.5, 0.3, -0.8, 0.6, 1.1, -0.4, 0.0, -0.2, 0.5, -0.3, 0.2, -0.9, 0.4, 0.0, -0.6, 0.8,
        -0.7, 0.1, -0.2,
      ],
      [
        4.5, 2.1, -1.2, -2.8, -1.9, 3.2, -0.8, -1.5, -2.1, -1.4, -0.9, -1.1, -2.4, -1.7, -0.8, -1.3,
        -2.0, -3.1, -0.6, -1.5,
      ],
      [
        1.8, -2.2, 0.9, 3.1, -1.5, 2.4, -0.7, 1.2, -1.9, 0.6, -1.1, 1.5, -0.4, 2.2, -0.8, 0.3, -2.5,
        1.7, -0.9, 2.8,
      ],
      [
        -6.8, -5.4, -4.2, -6.9, -3.1, -2.5, -1.8, -4.5, -5.1, -3.9, -1.2, -4.8, -6.1, -3.3, -3.7,
        -0.9, -5.5, -6.5, -2.1, -6.0,
      ],
    ];

    sessionPctPatterns.forEach((pcts, idx) => {
      const { equities, exactIndexChange, vnIndexRef } = buildHoseBasket(
        baseCaps.map((c, i) => ({ ...c, pct: pcts[i]! })),
      );
      // Introduce realistic HOSE capping/divisor drift (+/- 4%) between raw cap sum and official index change.
      const officialIndexChange = Number(
        (exactIndexChange * (idx % 2 === 0 ? 1.035 : 0.965)).toFixed(2),
      );
      const res = computeVnIndexImpact({
        equities,
        vnIndexRef,
        vnIndexNow: vnIndexRef + officialIndexChange,
      });

      expect(Math.abs(res.sumUp + res.sumDn - res.indexChange)).toBeLessThanOrEqual(0.01);
      expect(res.delta).toBeLessThanOrEqual(0.01);
      expect(res.sumUp).toBeGreaterThanOrEqual(0);
      expect(res.sumDn).toBeLessThanOrEqual(0);
      expect(res.positive.length).toBeLessThanOrEqual(8);
      expect(res.negative.length).toBeLessThanOrEqual(8);

      // Positive strictly descending, negative strictly ascending (most negative first).
      for (let i = 1; i < res.positive.length; i += 1) {
        expect(res.positive[i - 1]!.impact).toBeGreaterThanOrEqual(res.positive[i]!.impact);
      }
      for (let i = 1; i < res.negative.length; i += 1) {
        expect(res.negative[i - 1]!.impact).toBeLessThanOrEqual(res.negative[i]!.impact);
      }
    });
  });

  it('calibrates with VCI top contributors while preserving exact VCI top impacts when residual fits in tail stocks', () => {
    const { equities, vnIndexRef } = buildHoseBasket([
      { symbol: 'VCB', refPrice: 90, pct: 2.0, capRefBillion: 500_000 },
      { symbol: 'BID', refPrice: 45, pct: 1.5, capRefBillion: 250_000 },
      { symbol: 'CTG', refPrice: 35, pct: 1.0, capRefBillion: 200_000 },
      { symbol: 'HPG', refPrice: 28, pct: 1.2, capRefBillion: 180_000 },
      { symbol: 'FPT', refPrice: 130, pct: 2.5, capRefBillion: 200_000 },
      { symbol: 'VHM', refPrice: 44, pct: -2.0, capRefBillion: 200_000 },
      { symbol: 'VIC', refPrice: 42, pct: -1.8, capRefBillion: 170_000 },
      { symbol: 'VNM', refPrice: 66, pct: -1.0, capRefBillion: 140_000 },
      { symbol: 'GAS', refPrice: 72, pct: -0.9, capRefBillion: 160_000 },
    ]);

    const res = computeVnIndexImpact({
      equities,
      vnIndexRef,
      vnIndexChange: 10.8,
      vciContributors: [
        { symbol: 'VCB', impact: 8.65, matchPrice: 91.8, refPrice: 90 },
        { symbol: 'VHM', impact: -3.45, matchPrice: 43.12, refPrice: 44 },
      ],
    });

    expect(res.delta).toBeLessThanOrEqual(0.01);
    expect(res.positive[0]?.symbol).toBe('VCB');
    expect(res.positive[0]?.impact).toBeCloseTo(8.65, 2);
    expect(res.negative[0]?.symbol).toBe('VHM');
    expect(res.negative[0]?.impact).toBeCloseTo(-3.45, 2);
  });

  it('handles flat, unmatched (price=0), zero-cap, and ref-basis edge cases cleanly', () => {
    const res = computeVnIndexImpact({
      equities: [
        { symbol: 'AAA', price: 10.5, refPrice: 10.0, marketCapVnd: 100_000_000_000 },
        { symbol: 'BBB', price: 0, refPrice: 20.0, marketCapVnd: 100_000_000_000 }, // unmatched -> flat
        { symbol: 'CCC', price: 15.0, refPrice: 15.0, marketCapVnd: 100_000_000_000 }, // flat
        { symbol: 'ZEROCAP', price: 50.0, refPrice: 40.0, marketCapVnd: 0 }, // zero cap ignored
        { symbol: 'BADREF', price: 12.0, refPrice: 0, marketCapVnd: 50_000_000_000 }, // invalid ref ignored
        { symbol: 'DDD', price: 19.0, refPrice: 20.0, marketCapVnd: 100_000_000_000 },
      ],
      vnIndexRef: 1200,
      vnIndexChange: 0,
      marketCapBasis: 'ref',
    });

    expect(res.delta).toBeLessThanOrEqual(0.01);
    expect(res.positive).toHaveLength(1);
    expect(res.positive[0]!.symbol).toBe('AAA');
    expect(res.negative).toHaveLength(1);
    expect(res.negative[0]!.symbol).toBe('DDD');

    // All-flat market
    const flatRes = computeVnIndexImpact({
      equities: [{ symbol: 'FPT', price: 130, refPrice: 130, marketCapVnd: 200e12 }],
      vnIndexRef: 1700,
      vnIndexNow: 1700,
    });
    expect(flatRes).toEqual({
      sumUp: 0,
      sumDn: 0,
      indexChange: 0,
      delta: 0,
      positive: [],
      negative: [],
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Derivatives Calendar & KRX Code Resolver (`derivatives-calendar.ts`)
// ---------------------------------------------------------------------------

describe('derivatives-calendar', () => {
  it('decodes KRX year/month alphabets and both KRX & legacy HNX derivative codes', () => {
    expect(decodeKrxYear('F', 2026)).toBe(2025);
    expect(decodeKrxYear('G', 2026)).toBe(2026);
    expect(decodeKrxYear('H', 2026)).toBe(2027);
    expect(decodeKrxYear('J', 2026)).toBe(2028);
    expect(decodeKrxYear('I', 2026)).toBeNull(); // I, O, U excluded by VSDC

    expect(decodeKrxMonth('1')).toBe(1);
    expect(decodeKrxMonth('9')).toBe(9);
    expect(decodeKrxMonth('A')).toBe(10);
    expect(decodeKrxMonth('B')).toBe(11);
    expect(decodeKrxMonth('C')).toBe(12);

    // KRX VN30 & VN100
    expect(parseFuturesContractCode('41I1GB000')).toMatchObject({
      code: '41I1GB000',
      underlying: 'VN30',
      year: 2026,
      month: 11,
      format: 'krx',
    });
    expect(parseFuturesContractCode('41I1H3000')).toMatchObject({
      code: '41I1H3000',
      underlying: 'VN30',
      year: 2027,
      month: 3,
      format: 'krx',
    });
    expect(parseFuturesContractCode('41I2GC000')).toMatchObject({
      code: '41I2GC000',
      underlying: 'VN100',
      year: 2026,
      month: 12,
      format: 'krx',
    });
    expect(parseFuturesContractCode('41B1GA000')).toMatchObject({
      code: '41B1GA000',
      underlying: 'VN100',
      year: 2026,
      month: 10,
      format: 'krx',
    });

    // Legacy VN30 & VN100
    expect(parseFuturesContractCode('VN30F2611')).toMatchObject({
      code: 'VN30F2611',
      underlying: 'VN30',
      year: 2026,
      month: 11,
      format: 'legacy',
    });
    expect(parseFuturesContractCode('VN100F2612')).toMatchObject({
      code: 'VN100F2612',
      underlying: 'VN100',
      year: 2026,
      month: 12,
      format: 'legacy',
    });

    // Metadata fallback when code is continuous/non-standard
    expect(parseFuturesContractCode('VN30F1M', { expiryDate: '2026-11-19' })).toMatchObject({
      code: 'VN30F1M',
      underlying: 'VN30',
      year: 2026,
      month: 11,
      format: 'metadata',
      explicitExpiryDate: '2026-11-19',
    });
  });

  it('computes 3rd Thursday expiry date and rolls back across single and multi-day holidays (Tet)', () => {
    const emptyHolidays = new Set<string>();
    // Nov 2026: Nov 1 is Sunday -> Thursdays are 5, 12, 19 -> 3rd Thursday = 2026-11-19
    expect(computeExpiryDate(2026, 11, emptyHolidays)).toBe('2026-11-19');
    // Dec 2026: Dec 1 is Tuesday -> Thursdays are 3, 10, 17 -> 3rd Thursday = 2026-12-17
    expect(computeExpiryDate(2026, 12, emptyHolidays)).toBe('2026-12-17');

    // Single holiday on 3rd Thursday rolls back 1 trading day to Wednesday
    expect(computeExpiryDate(2026, 11, new Set(['2026-11-19']))).toBe('2026-11-18');

    // Feb 2026 Tet week: 3rd Thursday is 2026-02-19, Mon–Fri 16..20 are holidays -> rolls back past weekend to Fri 2026-02-13
    const tetHolidays = new Set([
      '2026-02-16',
      '2026-02-17',
      '2026-02-18',
      '2026-02-19',
      '2026-02-20',
    ]);
    expect(computeExpiryDate(2026, 2, tetHolidays)).toBe('2026-02-13');
  });

  it('counts remaining trading sessions accurately and returns 0 on expiry day', () => {
    const noHolidays = new Set<string>();
    // Expiry day itself -> 0 (UI renders "hôm nay")
    expect(countRemainingTradingSessions('2026-11-19', '2026-11-19', noHolidays)).toBe(0);
    // Past expiry -> 0
    expect(countRemainingTradingSessions('2026-11-20', '2026-11-19', noHolidays)).toBe(0);
    // Day before expiry (Wed -> Thu) -> 1
    expect(countRemainingTradingSessions('2026-11-18', '2026-11-19', noHolidays)).toBe(1);
    // Across weekend (Fri Nov 13 -> Thu Nov 19): Mon 16, Tue 17, Wed 18, Thu 19 = 4
    expect(countRemainingTradingSessions('2026-11-13', '2026-11-19', noHolidays)).toBe(4);
    // Four weeks (Thu Nov 19 -> Thu Dec 17) without holidays = 20 trading sessions
    expect(countRemainingTradingSessions('2026-11-19', '2026-12-17', noHolidays)).toBe(20);
    // Subtract 1 if a holiday falls inside the range
    expect(countRemainingTradingSessions('2026-11-19', '2026-12-17', new Set(['2026-12-01']))).toBe(
      19,
    );
  });

  it('classifies unsorted KRX and legacy contracts into 1M/2M/1Q/2Q slots and filters expired contracts', () => {
    const today = '2026-11-19'; // Expiry day of Nov 2026 contracts!
    const holidays = new Set<string>(['2027-01-01']);

    const classified = classifyFuturesSlots(
      [
        // Unsorted VN30 KRX contracts + an expired Oct 2026 contract
        '41I1H6000', // Jun 2027 -> VN30F2Q
        '41I1GA000', // Oct 2026 -> expired, must be excluded
        '41I1GC000', // Dec 2026 -> VN30F2M
        '41I1H3000', // Mar 2027 -> VN30F1Q
        '41I1GB000', // Nov 2026 -> VN30F1M (expires today -> remainingSessions = 0)
        // Legacy VN100 contracts unsorted
        'VN100F2612', // Dec 2026 -> VN100F2M
        'VN100F2611', // Nov 2026 -> VN100F1M (expires today -> remainingSessions = 0)
      ],
      today,
      holidays,
    );

    expect(classified.vn30.map((c) => [c.slot, c.code, c.expiryDate, c.remainingSessions])).toEqual(
      [
        ['VN30F1M', '41I1GB000', '2026-11-19', 0],
        ['VN30F2M', '41I1GC000', '2026-12-17', 20],
        ['VN30F1Q', '41I1H3000', '2027-03-18', 84],
        ['VN30F2Q', '41I1H6000', '2027-06-17', 149],
      ],
    );

    expect(
      classified.vn100.map((c) => [c.slot, c.code, c.expiryDate, c.remainingSessions]),
    ).toEqual([
      ['VN100F1M', 'VN100F2611', '2026-11-19', 0],
      ['VN100F2M', 'VN100F2612', '2026-12-17', 20],
    ]);

    expect(classified.bySlot['VN30F1M']?.remainingSessions).toBe(0);
    expect(classified.bySlot['VN100F1M']?.remainingSessions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Commodity Catalog & Fixed ICB Lv4 Sector Map (`commodity-map.ts`)
// ---------------------------------------------------------------------------

describe('commodity-map', () => {
  it('maps all 8 spec commodities to their exact Vietnamese ICB Level 4 sector names', () => {
    expect(Object.keys(COMMODITY_SECTOR_MAP)).toHaveLength(8);

    expect(getMappedCommoditySector('oil_brent')).toBe('Dầu khí');
    expect(getMappedCommoditySector('oil_wti')).toBe('Dầu khí');
    expect(getMappedCommoditySector('oil_crude')).toBe('Dầu khí');
    expect(getMappedCommoditySector('gas_natural')).toBe('Dầu khí');
    expect(getMappedCommoditySector('steel_hrc')).toBe('Thép');
    expect(getMappedCommoditySector('iron_ore')).toBe('Thép');
    expect(getMappedCommoditySector('rubber')).toBe('Cao su tự nhiên');
    expect(getMappedCommoditySector('fertilizer_ure')).toBe('Phân bón');
    expect(getMappedCommoditySector('sugar')).toBe('Đường');

    // Unmapped items must return null
    expect(getMappedCommoditySector('copper')).toBeNull();
    expect(getMappedCommoditySector('coffee_robusta')).toBeNull();
    expect(getMappedCommoditySector('gold_sjc')).toBeNull();
    expect(getMappedCommoditySector('usd_vnd')).toBeNull();
    expect(getMappedCommoditySector('dxy')).toBeNull();

    // Exactly 8 catalog entries carry a non-null mappedSectorName
    const mappedInCatalog = COMMODITY_FX_CATALOG.filter((e) => e.mappedSectorName !== null);
    expect(mappedInCatalog).toHaveLength(8);
    for (const entry of mappedInCatalog) {
      expect(
        COMMODITY_SECTOR_ICB4_METADATA[entry.mappedSectorName!].icbLv4Codes.length,
      ).toBeGreaterThan(0);
    }
  });

  it('covers all 3 tabs (energy_metals, agri, gold_fx) with valid source routing', () => {
    const energy = getCommoditiesByTab('energy_metals');
    const agri = getCommoditiesByTab('agri');
    const goldFx = getCommoditiesByTab('gold_fx');

    expect(energy.map((e) => e.code)).toEqual(
      expect.arrayContaining([
        'oil_brent',
        'oil_wti',
        'gas_natural',
        'steel_hrc',
        'iron_ore',
        'copper',
        'steel_d10',
      ]),
    );
    expect(agri.map((e) => e.code)).toEqual(
      expect.arrayContaining([
        'fertilizer_ure',
        'rubber',
        'sugar',
        'coffee_robusta',
        'soybean',
        'corn',
        'pork_north_vn',
      ]),
    );
    expect(goldFx.map((e) => e.code)).toEqual(['gold_global', 'gold_sjc', 'usd_vnd', 'dxy']);

    // Alias lookup works cleanly
    expect(findCommodityEntry('oil_crude')?.code).toBe('oil_wti');
    expect(findCommodityEntry('usd_vnd')?.source).toEqual({
      provider: 'vcb_fx',
      currencyCode: 'USD',
      field: 'sell',
    });
  });
});

// ---------------------------------------------------------------------------
// 5. GlobalMarketProvider MSN Additions & `previous_close` (`global-market.provider.ts`)
// ---------------------------------------------------------------------------

describe('GlobalMarketProvider worldIndex additions', () => {
  it('retains existing MSN_SECID keys and maps verified KOSPI and ASX200 secids', () => {
    // Existing core keys untouched
    expect(MSN_SECID.INX).toBe('a33k6h');
    expect(MSN_SECID.DJI).toBe('a6qja2');
    expect(MSN_SECID.N225).toBe('a9j7bh');
    expect(MSN_SECID.XAUUSD).toBe('ck48ur');
    expect(MSN_SECID.USDVND).toBe('avyufr');

    // Newly verified KOSPI & ASX200 mappings
    expect(MSN_SECID.KOSPI).toBe('ajsd6h');
    expect(MSN_SECID.KS11).toBe('ajsd6h');
    expect(MSN_SECID.ASX200).toBe('aaawc7');
    expect(MSN_SECID.AXJO).toBe('aaawc7');
  });

  it('computes accurate previous_close from prior bar close in worldIndex() for MSN & DXY', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('resolver/api/resolve')) {
        return new Response(
          JSON.stringify({
            configs: {
              'shared/msn-ns/HoroscopeAnswerCardWC/default': {
                properties: { mvpAPIkey: 'test-key' },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('assets.msn.com/service/Finance/Charts/TimeRange')) {
        return new Response(
          JSON.stringify([
            {
              series: {
                timeStamps: ['2026-11-19T00:00:00Z', '2026-11-20T00:00:00Z'],
                openPrices: [4800, 4850],
                pricesHigh: [4900, 4880],
                pricesLow: [4780, 4690],
                prices: [4869.96, 4708.54],
                volumes: [1000, 1200],
              },
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('api.simplize.vn/api/historical/prices/ohlcv')) {
        return new Response(
          JSON.stringify({
            data: [
              [1795305600, 103.5, 103.9, 103.2, 103.7, 0],
              [1795392000, 103.84, 103.853, 103.475, 103.804, 0],
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    try {
      const provider = new GlobalMarketProvider(new MarketHttpClient());

      const kospi = await provider.worldIndex('KOSPI', '2026-11-18', '2026-11-20');
      const msnCall = fetchSpy.mock.calls.find(([input]) =>
        String(input).includes('assets.msn.com/service/Finance/Charts/TimeRange'),
      );
      expect(msnCall).toBeDefined();
      const msnUrl = new URL(String(msnCall![0]));
      expect(msnUrl.searchParams.get('EndTime')).toBe('2026-11-20T23:59:59.999Z');

      expect(kospi.data).toEqual([
        {
          time: '2026-11-19',
          timestamp: 1795046400,
          open: 4800,
          high: 4900,
          low: 4780,
          close: 4869.96,
          previous_close: null,
          volume: 1000,
        },
        {
          time: '2026-11-20',
          timestamp: 1795132800,
          open: 4850,
          high: 4880,
          low: 4690,
          close: 4708.54,
          previous_close: 4869.96,
          volume: 1200,
        },
      ]);

      const dxy = await provider.worldIndex('DXY', '2026-11-20', '2026-11-23');
      const dxyRows = dxy.data as Array<{ close: number; previous_close: number | null }>;
      expect(dxyRows).toHaveLength(2);
      expect(dxyRows[0]!.previous_close).toBeNull();
      expect(dxyRows[1]!.previous_close).toBe(103.7);
      expect(dxyRows[1]!.close).toBe(103.804);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
