/**
 * Weekly Relative Rotation Graph (RRG / Chu kỳ ngành) calculation engine.
 *
 * Implements the IQX proprietary weekly RRG equations from SPEC WIDGET.md:
 *   RS_t          = I_t / V_t
 *   R_t           = 100 * (RS_t / SMA_10(RS)_t)
 *   RS-Ratio_t    = 100 + z_52(R)_t
 *   M_t           = 100 * (RS-Ratio_t / RS-Ratio_{t-1})
 *   RS-Momentum_t = 100 + z_52(M)_t
 *
 * Pure module: no I/O, no external dependencies, safe for partial/short histories.
 */

export type RrgQuadrant = 'leading' | 'weakening' | 'lagging' | 'improving';

export interface DailyCloseBar {
  /** Trading date in YYYY-MM-DD format. */
  d: string;
  /** Closing level / adjusted close price (> 0). */
  c: number;
}

export interface WeeklyCloseBar {
  /** ISO-8601 week identifier, e.g. `2026-W47`. */
  weekKey: string;
  /** Last trading day in that ISO week (`YYYY-MM-DD`). */
  weekEnding: string;
  /** Closing value on the last trading day of the week. */
  close: number;
}

export interface SectorMemberSeries {
  symbol: string;
  /** Shares outstanding or constant share-equivalent cap weight (> 0). */
  weight: number;
  bars: readonly DailyCloseBar[];
}

export interface SectorSeriesInput {
  code: string;
  name: string;
  /** Pre-computed sector index daily or weekly bars (used if provided). */
  bars?: readonly DailyCloseBar[];
  /** Member daily bars aggregated into a cap-weighted weekly sector index. */
  members?: readonly SectorMemberSeries[];
}

export interface RrgTrailPoint {
  week: string;
  rsRatio: number;
  rsMomentum: number;
}

export interface RrgSectorResult {
  code: string;
  name: string;
  quadrant: RrgQuadrant;
  trail: RrgTrailPoint[];
}

export interface RrgDomain {
  minRatio: number;
  maxRatio: number;
  minMomentum: number;
  maxMomentum: number;
}

export interface SectorRotationResult {
  weekEnding: string;
  domain: RrgDomain;
  sectors: RrgSectorResult[];
}

export interface ComputeSectorRotationOptions {
  /** Trailing weeks for SMA smoothing of RS (spec default: 10). */
  smaWindow?: number;
  /** Trailing weeks for z-score standardization (spec default: 52). */
  zScoreWindow?: number;
  /** Number of latest weekly points emitted per sector trail (spec default: 5). */
  trailLength?: number;
  /** Minimum symmetric half-span around 100 for bounding domain (default: 2.5). */
  minHalfSpan?: number;
  /** Multiplicative padding applied to max deviation from 100 (default: 1.15). */
  domainPadding?: number;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ZERO_STD_EPSILON = 1e-12;
const DEFAULT_SMA_WINDOW = 10;
const DEFAULT_Z_WINDOW = 52;
const DEFAULT_TRAIL_LENGTH = 5;
const DEFAULT_MIN_HALF_SPAN = 2.5;
const DEFAULT_DOMAIN_PADDING = 1.15;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function parseUtcDate(dateStr: string): Date | null {
  const match = DATE_RE.exec(dateStr);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Returns the ISO-8601 week key (`YYYY-Www`) for a valid `YYYY-MM-DD` date string.
 * Throws if `dateStr` is not a valid calendar date.
 */
export function getIsoWeekKey(dateStr: string): string {
  const utc = parseUtcDate(dateStr);
  if (!utc) throw new Error(`Invalid YYYY-MM-DD date: ${dateStr}`);
  const dayOfWeek = utc.getUTCDay() || 7; // Mon = 1 .. Sun = 7
  utc.setUTCDate(utc.getUTCDate() + 4 - dayOfWeek); // Thursday of the same ISO week
  const isoYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
}

/**
 * Converts daily close bars into a chronological weekly series by retaining
 * the last trading day of each ISO week. Invalid dates or non-positive closes
 * are skipped cleanly.
 */
export function toWeeklySeries(bars: readonly DailyCloseBar[]): WeeklyCloseBar[] {
  const valid: DailyCloseBar[] = [];
  for (const bar of bars) {
    if (!Number.isFinite(bar.c) || bar.c <= 0) continue;
    if (!parseUtcDate(bar.d)) continue;
    valid.push(bar);
  }
  valid.sort((a, b) => a.d.localeCompare(b.d));

  const byWeek = new Map<string, WeeklyCloseBar>();
  for (const bar of valid) {
    const weekKey = getIsoWeekKey(bar.d);
    byWeek.set(weekKey, {
      weekKey,
      weekEnding: bar.d,
      close: bar.c,
    });
  }
  return [...byWeek.values()].sort((a, b) => a.weekEnding.localeCompare(b.weekEnding));
}

/**
 * Builds a chain-linked, cap-weighted weekly index from constituent daily bars.
 *
 * When all constituents are active throughout the window, the resulting level
 * is strictly proportional to `sum(weight_i * close_{i,t})`. Chain-linking over
 * overlapping constituents prevents artificial jumps when stocks IPO or resume
 * trading mid-window.
 */
export function buildCapWeightedWeeklySectorSeries(
  members: readonly SectorMemberSeries[],
  benchmarkWeeks: readonly WeeklyCloseBar[],
): WeeklyCloseBar[] {
  if (members.length === 0 || benchmarkWeeks.length === 0) return [];

  const prepared: Array<{ weight: number; byWeek: Map<string, number> }> = [];
  for (const member of members) {
    if (!Number.isFinite(member.weight) || member.weight <= 0) continue;
    const weekly = toWeeklySeries(member.bars);
    if (weekly.length === 0) continue;
    const byWeek = new Map<string, number>();
    for (const point of weekly) {
      byWeek.set(point.weekKey, point.close);
    }
    prepared.push({ weight: member.weight, byWeek });
  }
  if (prepared.length === 0) return [];

  const output: WeeklyCloseBar[] = [];
  const lastClose = new Map<number, number>();
  let indexLevel = 100;
  let initialized = false;

  for (const bench of benchmarkWeeks) {
    const currentCloses = new Map<number, number>();
    for (let i = 0; i < prepared.length; i += 1) {
      const member = prepared[i]!;
      const direct = member.byWeek.get(bench.weekKey);
      if (direct !== undefined && direct > 0) {
        currentCloses.set(i, direct);
      } else {
        const carried = lastClose.get(i);
        if (carried !== undefined && carried > 0) {
          currentCloses.set(i, carried);
        }
      }
    }

    if (currentCloses.size === 0) continue;

    if (!initialized) {
      initialized = true;
      indexLevel = 100;
    } else {
      let prevCap = 0;
      let curCap = 0;
      for (const [idx, curPrice] of currentCloses) {
        const prevPrice = lastClose.get(idx);
        if (prevPrice === undefined || prevPrice <= 0) continue;
        const w = prepared[idx]!.weight;
        prevCap += w * prevPrice;
        curCap += w * curPrice;
      }
      if (prevCap > 0 && curCap > 0) {
        indexLevel *= curCap / prevCap;
      }
    }

    for (const [idx, curPrice] of currentCloses) {
      lastClose.set(idx, curPrice);
    }

    output.push({
      weekKey: bench.weekKey,
      weekEnding: bench.weekEnding,
      close: indexLevel,
    });
  }

  return output;
}

/**
 * Classifies a `(rsRatio, rsMomentum)` coordinate into its RRG quadrant:
 * - `leading`   (`Dẫn dắt`):   ratio >= 100 && momentum >= 100
 * - `weakening` (`Suy yếu`):   ratio >= 100 && momentum < 100
 * - `lagging`   (`Tụt hậu`):   ratio < 100  && momentum < 100
 * - `improving` (`Cải thiện`): ratio < 100  && momentum >= 100
 */
export function classifyRrgQuadrant(rsRatio: number, rsMomentum: number): RrgQuadrant {
  if (rsRatio >= 100) {
    return rsMomentum >= 100 ? 'leading' : 'weakening';
  }
  return rsMomentum >= 100 ? 'improving' : 'lagging';
}

/**
 * Computes population z-score of the last element in `values[start..end]`
 * (inclusive). Returns `0` when variance is zero or fewer than 2 values exist.
 */
export function computeWindowZScore(
  values: readonly number[],
  endIndex: number,
  windowSize: number,
): number {
  const startIndex = Math.max(0, endIndex - windowSize + 1);
  const count = endIndex - startIndex + 1;
  if (count < 2) return 0;

  let sum = 0;
  for (let i = startIndex; i <= endIndex; i += 1) {
    sum += values[i]!;
  }
  const mean = sum / count;

  let varianceSum = 0;
  for (let i = startIndex; i <= endIndex; i += 1) {
    const diff = values[i]! - mean;
    varianceSum += diff * diff;
  }
  const stdDev = Math.sqrt(varianceSum / count);
  if (!Number.isFinite(stdDev) || stdDev <= ZERO_STD_EPSILON) return 0;

  return (values[endIndex]! - mean) / stdDev;
}

/**
 * Computes a symmetric bounding domain centered strictly at `(100, 100)`
 * covering all emitted trail coordinates with padding.
 */
export function computeSymmetricRrgDomain(
  sectors: readonly RrgSectorResult[],
  minHalfSpan = DEFAULT_MIN_HALF_SPAN,
  padding = DEFAULT_DOMAIN_PADDING,
): RrgDomain {
  let maxDeviation = 0;
  for (const sector of sectors) {
    for (const point of sector.trail) {
      const ratioDev = Math.abs(point.rsRatio - 100);
      const momDev = Math.abs(point.rsMomentum - 100);
      if (ratioDev > maxDeviation) maxDeviation = ratioDev;
      if (momDev > maxDeviation) maxDeviation = momDev;
    }
  }

  const safeMin =
    Number.isFinite(minHalfSpan) && minHalfSpan > 0 ? minHalfSpan : DEFAULT_MIN_HALF_SPAN;
  const safePad = Number.isFinite(padding) && padding >= 1 ? padding : DEFAULT_DOMAIN_PADDING;
  const halfSpan = roundTo(Math.max(safeMin, maxDeviation * safePad), 2);

  return {
    minRatio: roundTo(100 - halfSpan, 2),
    maxRatio: roundTo(100 + halfSpan, 2),
    minMomentum: roundTo(100 - halfSpan, 2),
    maxMomentum: roundTo(100 + halfSpan, 2),
  };
}

/**
 * Computes the weekly RRG trail for a single aligned sector/benchmark pair.
 * Returns `null` when insufficient aligned history exists (< 3 weeks).
 */
export function computeSingleSectorRrgTrail(
  sectorWeekly: readonly WeeklyCloseBar[],
  benchmarkWeekly: readonly WeeklyCloseBar[],
  options: ComputeSectorRotationOptions = {},
): RrgTrailPoint[] | null {
  const smaTarget = options.smaWindow ?? DEFAULT_SMA_WINDOW;
  const zTarget = options.zScoreWindow ?? DEFAULT_Z_WINDOW;
  const trailLength = Math.max(1, options.trailLength ?? DEFAULT_TRAIL_LENGTH);

  const sectorByWeek = new Map<string, number>();
  for (const point of sectorWeekly) {
    if (Number.isFinite(point.close) && point.close > 0) {
      sectorByWeek.set(point.weekKey, point.close);
    }
  }

  const aligned: Array<{ weekEnding: string; rs: number }> = [];
  for (const bench of benchmarkWeekly) {
    if (!Number.isFinite(bench.close) || bench.close <= 0) continue;
    const secClose = sectorByWeek.get(bench.weekKey);
    if (secClose === undefined || secClose <= 0) continue;
    aligned.push({
      weekEnding: bench.weekEnding,
      rs: secClose / bench.close,
    });
  }

  const n = aligned.length;
  if (n < 3) return null;

  // Use exact SMA_10 whenever history >= 12 weeks; adapt gracefully for ultra-short partial DBs.
  const effectiveSma =
    n >= smaTarget + 2 ? smaTarget : Math.max(2, Math.min(smaTarget, Math.floor(n / 2)));

  // Step 1 & 2: R_t = 100 * (RS_t / SMA(RS)_t)
  const rValues: number[] = [];
  const rWeeks: string[] = [];
  let rollingRsSum = 0;
  for (let i = 0; i < n; i += 1) {
    rollingRsSum += aligned[i]!.rs;
    if (i >= effectiveSma) {
      rollingRsSum -= aligned[i - effectiveSma]!.rs;
    }
    if (i >= effectiveSma - 1) {
      const sma = rollingRsSum / effectiveSma;
      const r = sma > 0 ? 100 * (aligned[i]!.rs / sma) : 100;
      rValues.push(r);
      rWeeks.push(aligned[i]!.weekEnding);
    }
  }

  if (rValues.length < 2) return null;

  // Step 3: RS-Ratio_t = 100 + z_52(R)_t
  // For k >= 1, trailing window has min(zTarget, k + 1) >= 2 points.
  // Once k >= 51 (history >= 61 weeks), every point uses the exact 52-week trailing window.
  const rsRatioSeries: Array<{ weekEnding: string; value: number }> = [];
  for (let k = 1; k < rValues.length; k += 1) {
    const z = computeWindowZScore(rValues, k, zTarget);
    rsRatioSeries.push({
      weekEnding: rWeeks[k]!,
      value: 100 + z,
    });
  }

  if (rsRatioSeries.length < 2) return null;

  // Step 4: M_t = 100 * (RS-Ratio_t / RS-Ratio_{t-1})
  const mValues: number[] = [];
  const mMeta: Array<{ weekEnding: string; rsRatio: number }> = [];
  for (let i = 1; i < rsRatioSeries.length; i += 1) {
    const prevRatio = rsRatioSeries[i - 1]!.value;
    const curRatio = rsRatioSeries[i]!.value;
    const m = prevRatio > 0 ? 100 * (curRatio / prevRatio) : 100;
    mValues.push(m);
    mMeta.push({
      weekEnding: rsRatioSeries[i]!.weekEnding,
      rsRatio: curRatio,
    });
  }

  if (mValues.length === 0) return null;

  // Step 5: RS-Momentum_t = 100 + z_52(M)_t
  // When history has >= 2 momentum points, start at m = 1 so stdDev has >= 2 samples;
  // for minimal 12-week series (1 momentum point), allow m = 0 (momentum = 100).
  const startM = mValues.length >= 2 ? 1 : 0;
  const fullTrail: RrgTrailPoint[] = [];
  for (let m = startM; m < mValues.length; m += 1) {
    const zMom = computeWindowZScore(mValues, m, zTarget);
    fullTrail.push({
      week: mMeta[m]!.weekEnding,
      rsRatio: roundTo(mMeta[m]!.rsRatio, 4),
      rsMomentum: roundTo(100 + zMom, 4),
    });
  }

  if (fullTrail.length === 0) return null;
  return fullTrail.slice(-trailLength);
}

/**
 * Computes weekly RRG trails, quadrant classifications, and symmetric domain
 * for all ICB Level 2 sectors against the VN-Index benchmark.
 */
export function computeSectorRotation(
  sectors: readonly SectorSeriesInput[],
  benchmarkDailyBars: readonly DailyCloseBar[],
  options: ComputeSectorRotationOptions = {},
): SectorRotationResult {
  const benchmarkWeekly = toWeeklySeries(benchmarkDailyBars);
  const weekEnding = benchmarkWeekly.at(-1)?.weekEnding ?? '';

  if (benchmarkWeekly.length < 3 || sectors.length === 0) {
    return {
      weekEnding,
      domain: computeSymmetricRrgDomain([], options.minHalfSpan, options.domainPadding),
      sectors: [],
    };
  }

  const results: RrgSectorResult[] = [];
  for (const sector of sectors) {
    const sectorWeekly =
      sector.bars && sector.bars.length > 0
        ? toWeeklySeries(sector.bars)
        : sector.members && sector.members.length > 0
          ? buildCapWeightedWeeklySectorSeries(sector.members, benchmarkWeekly)
          : [];

    const trail = computeSingleSectorRrgTrail(sectorWeekly, benchmarkWeekly, options);
    if (!trail || trail.length === 0) continue;

    const head = trail.at(-1)!;
    results.push({
      code: sector.code,
      name: sector.name,
      quadrant: classifyRrgQuadrant(head.rsRatio, head.rsMomentum),
      trail,
    });
  }

  const latestWeek =
    results.reduce((maxWeek, item) => {
      const headWeek = item.trail.at(-1)?.week ?? '';
      return headWeek > maxWeek ? headWeek : maxWeek;
    }, '') || weekEnding;

  return {
    weekEnding: latestWeek,
    domain: computeSymmetricRrgDomain(results, options.minHalfSpan, options.domainPadding),
    sectors: results,
  };
}
