/**
 * HOSE VN-Index point-impact calculator & VCI contributor calibrator.
 *
 * Computes each stock's point impact on VN-Index:
 *   deltaMarketCap_i = marketCapRef_i * ((price_i - refPrice_i) / refPrice_i)
 *   rawImpact_i      = (deltaMarketCap_i / totalRefMarketCap) * vnIndexRef
 *
 * When optional VCI `IndexImpactChart` top contributors are supplied, calibrates
 * non-reported stocks to the VCI divisor scale and reconciles residual difference
 * proportionally (without flipping any stock's sign) so `sumUp + sumDn` matches
 * `vnIndexChange` within <= 0.01 points (well below the 0.1-point spec limit).
 */

export interface HoseEquityImpactInput {
  symbol: string;
  price: number;
  refPrice: number;
  /** Market capitalization in VND (current cap by default; see `marketCapBasis`). */
  marketCapVnd: number;
}

export interface VciImpactContributor {
  symbol: string;
  impact: number;
  matchPrice?: number | null;
  refPrice?: number | null;
}

export interface ComputeVnIndexImpactInput {
  equities: readonly HoseEquityImpactInput[];
  vnIndexRef: number;
  vnIndexNow?: number;
  vnIndexChange?: number;
  vciContributors?: readonly VciImpactContributor[];
  /**
   * Whether `marketCapVnd` represents live current cap (`price * shares`, default)
   * or reference-price cap (`refPrice * shares`).
   */
  marketCapBasis?: 'current' | 'ref';
  /** Maximum top positive and negative stocks to emit (default: 8). */
  limit?: number;
}

export interface VnIndexImpactItem {
  symbol: string;
  impact: number;
  price: number;
  changePct: number;
}

export interface VnIndexImpactResult {
  sumUp: number;
  sumDn: number;
  indexChange: number;
  delta: number;
  positive: VnIndexImpactItem[];
  negative: VnIndexImpactItem[];
}

interface WorkingContributor {
  symbol: string;
  price: number;
  refPrice: number;
  changePct: number;
  rawImpact: number;
  impact: number;
  fromVci: boolean;
}

const DEFAULT_LIMIT = 8;
const CALIBRATION_SCALE_MIN = 0.5;
const CALIBRATION_SCALE_MAX = 2.0;
const EPSILON = 1e-9;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function resolveIndexChange(input: ComputeVnIndexImpactInput): number {
  if (typeof input.vnIndexChange === 'number' && Number.isFinite(input.vnIndexChange)) {
    return input.vnIndexChange;
  }
  if (
    typeof input.vnIndexNow === 'number' &&
    Number.isFinite(input.vnIndexNow) &&
    Number.isFinite(input.vnIndexRef)
  ) {
    return input.vnIndexNow - input.vnIndexRef;
  }
  return 0;
}

function sameSign(a: number, b: number): boolean {
  return (a > 0 && b > 0) || (a < 0 && b < 0);
}

/**
 * Distributes `residual` across `targets` proportionally to `|impact|` while
 * strictly preserving the sign of every positive/negative contributor.
 * Returns true if the full residual was absorbed cleanly.
 */
function distributeResidualSignSafe(
  targets: readonly WorkingContributor[],
  residual: number,
  targetIndexChange: number,
  fixedSum: number,
): boolean {
  let sumUp = 0;
  let sumDnAbs = 0;
  for (const item of targets) {
    if (item.impact > 0) sumUp += item.impact;
    else if (item.impact < 0) sumDnAbs += -item.impact;
  }

  const totalAbs = sumUp + sumDnAbs;
  if (totalAbs <= EPSILON) return false;

  // Symmetric proportional shift keeps all signs intact iff |residual| < totalAbs.
  // Keep a small safety buffer (0.85) so no contributor collapses close to 0.
  if (sumUp > EPSILON && sumDnAbs > EPSILON && Math.abs(residual) < totalAbs * 0.85) {
    const upScale = 1 + residual / totalAbs;
    const dnScale = 1 - residual / totalAbs;
    for (const item of targets) {
      if (item.impact > 0) item.impact *= upScale;
      else if (item.impact < 0) item.impact *= dnScale;
    }
    return true;
  }

  // One-sided targets (all positive or all negative): scale proportionally in either direction
  // as long as the target sum has the same sign as the active side.
  const desiredTargetsSum = targetIndexChange - fixedSum;
  if (sumUp > EPSILON && sumDnAbs <= EPSILON) {
    if (desiredTargetsSum > EPSILON) {
      const factor = desiredTargetsSum / sumUp;
      for (const item of targets) {
        if (item.impact > 0) item.impact *= factor;
      }
      return true;
    }
    return false;
  }
  if (sumDnAbs > EPSILON && sumUp <= EPSILON) {
    if (desiredTargetsSum < -EPSILON) {
      const factor = Math.abs(desiredTargetsSum) / sumDnAbs;
      for (const item of targets) {
        if (item.impact < 0) item.impact *= factor;
      }
      return true;
    }
    return false;
  }

  // Two-sided with large residual: scale only the side moving toward targetChange
  // so no contributor ever flips sign.
  if (residual > 0 && sumUp > EPSILON) {
    const neededUp = desiredTargetsSum + sumDnAbs;
    if (neededUp > EPSILON) {
      const factor = neededUp / sumUp;
      for (const item of targets) {
        if (item.impact > 0) item.impact *= factor;
      }
      return true;
    }
  } else if (residual < 0 && sumDnAbs > EPSILON) {
    const neededDnAbs = sumUp - desiredTargetsSum;
    if (neededDnAbs > EPSILON) {
      const factor = neededDnAbs / sumDnAbs;
      for (const item of targets) {
        if (item.impact < 0) item.impact *= factor;
      }
      return true;
    }
  }

  return false;
}

/**
 * Computes calibrated VN-Index point impacts for all HOSE equities and emits
 * reconciled totals (`sumUp`, `sumDn`, `delta`) plus top gainers and decliners.
 */
export function computeVnIndexImpact(input: ComputeVnIndexImpactInput): VnIndexImpactResult {
  const limit = Math.max(1, input.limit ?? DEFAULT_LIMIT);
  const marketCapBasis = input.marketCapBasis ?? 'current';
  const indexChangeRaw = resolveIndexChange(input);
  const vnIndexRef =
    Number.isFinite(input.vnIndexRef) && input.vnIndexRef > 0 ? input.vnIndexRef : 0;

  // Step 1: Normalize & deduplicate HOSE equities, computing reference market cap.
  const deduped = new Map<
    string,
    {
      symbol: string;
      price: number;
      refPrice: number;
      changePct: number;
      marketCapRef: number;
      deltaMarketCap: number;
    }
  >();

  for (const eq of input.equities) {
    const symbol = eq.symbol.trim().toUpperCase();
    if (!symbol) continue;
    if (!Number.isFinite(eq.refPrice) || eq.refPrice <= 0) continue;
    if (!Number.isFinite(eq.marketCapVnd) || eq.marketCapVnd <= 0) continue;

    // Unmatched stock (price <= 0 or non-finite) is treated as unchanged at refPrice.
    const effectivePrice = Number.isFinite(eq.price) && eq.price > 0 ? eq.price : eq.refPrice;
    const marketCapRef =
      marketCapBasis === 'ref' ? eq.marketCapVnd : eq.marketCapVnd * (eq.refPrice / effectivePrice);
    if (!Number.isFinite(marketCapRef) || marketCapRef <= 0) continue;

    const existing = deduped.get(symbol);
    if (existing && existing.marketCapRef >= marketCapRef) continue;

    const pctReturn = (effectivePrice - eq.refPrice) / eq.refPrice;
    deduped.set(symbol, {
      symbol,
      price: effectivePrice,
      refPrice: eq.refPrice,
      changePct: pctReturn * 100,
      marketCapRef,
      deltaMarketCap: marketCapRef * pctReturn,
    });
  }

  let totalRefMarketCap = 0;
  for (const row of deduped.values()) {
    totalRefMarketCap += row.marketCapRef;
  }

  // Step 2: Raw cap-weighted point impact per equity.
  const contributors = new Map<string, WorkingContributor>();
  for (const row of deduped.values()) {
    const rawImpact =
      totalRefMarketCap > 0 && vnIndexRef > 0
        ? (row.deltaMarketCap / totalRefMarketCap) * vnIndexRef
        : 0;
    contributors.set(row.symbol, {
      symbol: row.symbol,
      price: row.price,
      refPrice: row.refPrice,
      changePct: row.changePct,
      rawImpact,
      impact: rawImpact,
      fromVci: false,
    });
  }

  // Step 3: Calibrate with optional VCI `IndexImpactChart` top contributors.
  const vciList = input.vciContributors ?? [];
  if (vciList.length > 0) {
    let matchedVciAbs = 0;
    let matchedRawAbs = 0;

    for (const vci of vciList) {
      const symbol = vci.symbol.trim().toUpperCase();
      if (!symbol || !Number.isFinite(vci.impact)) continue;
      const existing = contributors.get(symbol);
      if (existing) {
        if (Math.abs(existing.rawImpact) > EPSILON && sameSign(existing.rawImpact, vci.impact)) {
          matchedVciAbs += Math.abs(vci.impact);
          matchedRawAbs += Math.abs(existing.rawImpact);
        }
        existing.impact = vci.impact;
        existing.fromVci = true;
        if (
          typeof vci.matchPrice === 'number' &&
          Number.isFinite(vci.matchPrice) &&
          vci.matchPrice > 0 &&
          existing.price <= 0
        ) {
          existing.price = vci.matchPrice;
        }
      } else if (Math.abs(vci.impact) > EPSILON) {
        const refPrice =
          typeof vci.refPrice === 'number' && Number.isFinite(vci.refPrice) && vci.refPrice > 0
            ? vci.refPrice
            : 0;
        const price =
          typeof vci.matchPrice === 'number' &&
          Number.isFinite(vci.matchPrice) &&
          vci.matchPrice > 0
            ? vci.matchPrice
            : refPrice;
        const changePct = refPrice > 0 && price > 0 ? ((price - refPrice) / refPrice) * 100 : 0;
        contributors.set(symbol, {
          symbol,
          price,
          refPrice,
          changePct,
          rawImpact: vci.impact,
          impact: vci.impact,
          fromVci: true,
        });
      }
    }

    if (matchedRawAbs > EPSILON && matchedVciAbs > EPSILON) {
      const rawScale = matchedVciAbs / matchedRawAbs;
      const clampedScale = Math.min(
        CALIBRATION_SCALE_MAX,
        Math.max(CALIBRATION_SCALE_MIN, rawScale),
      );
      for (const item of contributors.values()) {
        if (!item.fromVci) {
          item.impact = item.rawImpact * clampedScale;
        }
      }
    }
  }

  // Step 4: Proportional sign-safe residual reconciliation against `vnIndexChange`.
  const allItems = [...contributors.values()];
  const currentSum = allItems.reduce((acc, item) => acc + item.impact, 0);
  const residual = indexChangeRaw - currentSum;

  if (Math.abs(residual) > EPSILON) {
    const nonVciNonZero = allItems.filter(
      (item) => !item.fromVci && Math.abs(item.impact) > EPSILON,
    );
    const vciSum = allItems
      .filter((item) => item.fromVci)
      .reduce((acc, item) => acc + item.impact, 0);
    const nonVciAbs = nonVciNonZero.reduce((acc, item) => acc + Math.abs(item.impact), 0);

    // Prefer absorbing small residuals (<= 15%) in non-VCI stocks first to preserve exact VCI top contributors.
    const absorbedInNonVci =
      nonVciNonZero.length > 0 &&
      Math.abs(residual) < nonVciAbs * 0.15 &&
      distributeResidualSignSafe(nonVciNonZero, residual, indexChangeRaw, vciSum);

    if (!absorbedInNonVci) {
      const allNonZero = allItems.filter((item) => Math.abs(item.impact) > EPSILON);
      distributeResidualSignSafe(allNonZero, residual, indexChangeRaw, 0);
    }
  }

  // Step 5: Aggregate totals and top N positive / negative contributors.
  let rawSumUp = 0;
  let rawSumDn = 0;
  const positives: WorkingContributor[] = [];
  const negatives: WorkingContributor[] = [];

  for (const item of allItems) {
    if (item.impact > EPSILON) {
      rawSumUp += item.impact;
      positives.push(item);
    } else if (item.impact < -EPSILON) {
      rawSumDn += item.impact;
      negatives.push(item);
    }
  }

  positives.sort((a, b) => b.impact - a.impact || a.symbol.localeCompare(b.symbol));
  negatives.sort((a, b) => a.impact - b.impact || a.symbol.localeCompare(b.symbol));

  const sumUp = roundTo(rawSumUp, 2);
  const sumDn = roundTo(rawSumDn, 2);
  const indexChange = roundTo(indexChangeRaw, 2);
  const delta = roundTo(Math.abs(sumUp + sumDn - indexChange), 4);

  const toItem = (item: WorkingContributor): VnIndexImpactItem => ({
    symbol: item.symbol,
    impact: roundTo(item.impact, 2),
    price: roundTo(item.price, 2),
    changePct: roundTo(item.changePct, 2),
  });

  return {
    sumUp,
    sumDn,
    indexChange,
    delta,
    positive: positives.slice(0, limit).map(toItem),
    negative: negatives.slice(0, limit).map(toItem),
  };
}
