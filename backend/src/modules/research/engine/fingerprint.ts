// Fingerprint of a view's content (spec §25): same theses + same valuation inputs → same hash.
import { createHash } from 'node:crypto';

import type { InvestmentViewThesis, ValuationSnapshot } from '../research.types.js';

export function viewFingerprint(
  theses: InvestmentViewThesis[],
  valuation: ValuationSnapshot,
): string {
  // Every object below is built with a literal key order, so the JSON is canonical by construction.
  const canonical = {
    theses: [...theses]
      .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((t) => ({ id: t.id, title: t.title, summary: t.summary, order: t.order })),
    valuation: {
      hiddenReason: valuation.hiddenReason,
      targets: [...valuation.targets]
        .sort((a, b) => (a.broker < b.broker ? -1 : a.broker > b.broker ? 1 : 0))
        .map((t) => ({
          broker: t.broker,
          targetPriceVnd: t.targetPriceVnd,
          reportDate: t.reportDate,
        })),
    },
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
