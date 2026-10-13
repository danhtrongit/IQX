// Circuit breaker (spec §21.6): refuse to publish a view that looks like an extraction/AI accident.
import {
  CIRCUIT_MEDIAN_CHANGE,
  type InvestmentViewThesis,
  type PublishedView,
  type ValuationSnapshot,
} from '../research.types.js';

/** Returns the blocking reason, or null when `next` may be published. */
export function circuitBreak(
  previous: PublishedView | null,
  next: { theses: InvestmentViewThesis[]; valuation: ValuationSnapshot },
  hasValidReports: boolean,
): string | null {
  if (!previous) return null;

  const prevMedian = previous.valuation.targetMedian;
  const nextMedian = next.valuation.targetMedian;
  if (prevMedian !== null && nextMedian !== null && prevMedian > 0) {
    // Rounded to kill float noise: 130000/100000 - 1 is 0.30000000000000004, not > 30%.
    const change = Math.round(Math.abs(nextMedian / prevMedian - 1) * 1e9) / 1e9;
    if (change > CIRCUIT_MEDIAN_CHANGE) {
      return `median target moved ${(change * 100).toFixed(1)}% (${prevMedian} -> ${nextMedian}), over the ${CIRCUIT_MEDIAN_CHANGE * 100}% limit`;
    }
  }

  if (next.theses.length === 0 && hasValidReports && previous.theses.length >= 1) {
    return 'thesis count dropped to 0 while valid reports still exist';
  }

  // "All theses replaced at once". An empty next view is rule 2's business (it may be legitimate
  // when every report expired), so this only applies when something was actually published.
  if (previous.theses.length >= 2 && next.theses.length > 0) {
    const nextIds = new Set(next.theses.map((t) => t.id));
    if (!previous.theses.some((t) => nextIds.has(t.id))) {
      return 'every previous thesis was replaced at once';
    }
  }
  return null;
}
