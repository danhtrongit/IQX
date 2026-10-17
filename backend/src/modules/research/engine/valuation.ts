// Reference valuation (spec §11, §22): backend-only maths over each broker's latest valid target.
import {
  TARGET_PRICE_MAX_RATIO,
  TARGET_PRICE_MIN_RATIO,
  type BrokerTarget,
  type DilutiveAction,
  type InvestmentValuation,
  type ResearchReport,
  type ValuationSnapshot,
} from '../research.types.js';
import { isWithinWindow } from './window.js';

function plausibleAgainstPrice(target: number, currentPrice: number | null): boolean {
  if (currentPrice === null || !(currentPrice > 0)) return true;
  const ratio = target / currentPrice;
  return ratio >= TARGET_PRICE_MIN_RATIO && ratio <= TARGET_PRICE_MAX_RATIO;
}

/**
 * One target per broker: the newest in-window report that has a plausible target. A target outside
 * [0.3, 3] × price is an extraction error and is skipped in favour of that broker's next newest.
 */
export function latestBrokerTargets(
  reports: ResearchReport[],
  today: string,
  currentPrice: number | null,
): BrokerTarget[] {
  const byBroker = new Map<string, { report: ResearchReport; index: number }[]>();
  reports.forEach((report, index) => {
    if (report.targetPriceVnd === null || !(report.targetPriceVnd > 0)) return;
    if (!isWithinWindow(report.reportDate, today)) return;
    const list = byBroker.get(report.broker) ?? [];
    list.push({ report, index });
    byBroker.set(report.broker, list);
  });

  const out: BrokerTarget[] = [];
  for (const [broker, list] of byBroker) {
    list.sort((a, b) =>
      a.report.reportDate === b.report.reportDate
        ? b.index - a.index
        : a.report.reportDate < b.report.reportDate
          ? 1
          : -1,
    );
    const pick = list.find((x) =>
      plausibleAgainstPrice(x.report.targetPriceVnd as number, currentPrice),
    );
    if (pick) {
      out.push({
        broker,
        targetPriceVnd: pick.report.targetPriceVnd as number,
        reportDate: pick.report.reportDate,
        reportId: pick.report.id,
      });
    }
  }
  return out.sort((a, b) => (a.broker < b.broker ? -1 : a.broker > b.broker ? 1 : 0));
}

function median(sortedAsc: number[]): number {
  const n = sortedAsc.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sortedAsc[mid]! : Math.round((sortedAsc[mid - 1]! + sortedAsc[mid]!) / 2);
}

export function computeValuation(
  targets: BrokerTarget[],
  dilutive: DilutiveAction[],
  researchAsOf: string | null,
): ValuationSnapshot {
  const base = { targets, researchAsOf, activeBrokerCount: targets.length };
  if (targets.length === 0) {
    return {
      ...base,
      targetMedian: null,
      targetMin: null,
      targetMax: null,
      hiddenReason: 'no_target',
    };
  }
  // Ex-date after the report date of ANY target in use → the target is not adjusted for dilution.
  const diluted = dilutive.some((a) => targets.some((t) => a.exDate > t.reportDate));
  if (diluted) {
    return {
      ...base,
      targetMedian: null,
      targetMin: null,
      targetMax: null,
      hiddenReason: 'corporate_action',
    };
  }
  const prices = targets.map((t) => t.targetPriceVnd).sort((a, b) => a - b);
  return {
    ...base,
    targetMedian: median(prices),
    targetMin: prices[0]!,
    targetMax: prices[prices.length - 1]!,
    hiddenReason: null,
  };
}

/** Valuation as served: upside is computed against the live price at read time (never stored). */
export function servedValuation(
  s: ValuationSnapshot,
  currentPrice: number | null,
): InvestmentValuation | null {
  if (s.hiddenReason !== null || s.targetMedian === null) return null;
  const price = currentPrice !== null && currentPrice > 0 ? currentPrice : null;
  const upsidePercent =
    price === null ? null : Math.round((s.targetMedian / price - 1) * 100 * 10) / 10 || 0;
  if (s.activeBrokerCount === 1 || s.targetMin === null || s.targetMax === null) {
    return { mode: 'single', targetMedian: s.targetMedian, currentPrice: price, upsidePercent };
  }
  return {
    mode: 'range',
    targetMedian: s.targetMedian,
    targetMin: s.targetMin,
    targetMax: s.targetMax,
    currentPrice: price,
    upsidePercent,
  };
}
