// Thesis ordering and selection (spec §6.1, §20).
import { MAX_THESES, type CanonicalThesis, type InvestmentViewThesis } from '../research.types.js';
import type { ThesisEvidenceEntry } from './current-view.js';

export interface ThesisCandidate {
  thesis: CanonicalThesis;
  brokerCount: number;
  title: string;
  summary: string;
}

/**
 * Sort: materiality desc, broker count desc, previous position asc (stable across versions),
 * seq asc. Keeps at most MAX_THESES; when risk theses exist but none made the cut, the best
 * risk thesis takes the last slot so sell-side optimism bias is balanced.
 */
export function orderTheses(
  candidates: ThesisCandidate[],
  previousOrder: Map<string, number>,
): InvestmentViewThesis[] {
  const prev = (c: ThesisCandidate): number =>
    previousOrder.get(c.thesis.id) ?? Number.POSITIVE_INFINITY;
  const sorted = [...candidates].sort(
    (a, b) =>
      b.thesis.materiality - a.thesis.materiality ||
      b.brokerCount - a.brokerCount ||
      (prev(a) === prev(b) ? 0 : prev(a) < prev(b) ? -1 : 1) ||
      a.thesis.seq - b.thesis.seq,
  );

  const selected = sorted.slice(0, MAX_THESES);
  if (selected.length > 0 && !selected.some((c) => c.thesis.isRisk)) {
    const bestRisk = sorted.slice(MAX_THESES).find((c) => c.thesis.isRisk);
    if (bestRisk) selected[selected.length - 1] = bestRisk;
  }

  return selected.map((c, i) => ({
    id: c.thesis.id,
    order: i + 1,
    title: c.title,
    summary: c.summary,
  }));
}

/** Theses worth a builder call per run: the best-backed ones, plus the best risk (spec §20). */
export const BUILD_SHORTLIST = 8;

/**
 * Live theses with evidence ranked by broker count desc, freshest evidence desc, seq asc;
 * keeps BUILD_SHORTLIST, with the last slot going to the best risk thesis when none made it.
 * Theses outside the list keep `needsRewrite` and are written once they gain brokers.
 */
export function buildShortlist(
  theses: CanonicalThesis[],
  evidence: Map<string, ThesisEvidenceEntry>,
): Set<string> {
  const latest = (entry: ThesisEvidenceEntry): string =>
    entry.perBroker.reduce(
      (max, item) => (item.claim.evidenceDate > max ? item.claim.evidenceDate : max),
      '',
    );
  const ranked = theses
    .filter(
      (t) =>
        (t.status === 'active' || t.status === 'updated') &&
        (evidence.get(t.id)?.brokers.length ?? 0) > 0,
    )
    .map((t) => ({
      t,
      brokers: evidence.get(t.id)!.brokers.length,
      latest: latest(evidence.get(t.id)!),
    }))
    .sort(
      (a, b) =>
        b.brokers - a.brokers ||
        (a.latest === b.latest ? 0 : a.latest > b.latest ? -1 : 1) ||
        a.t.seq - b.t.seq,
    );
  const picked = ranked.slice(0, BUILD_SHORTLIST);
  if (picked.length === BUILD_SHORTLIST && !picked.some((item) => item.t.isRisk)) {
    const risk = ranked.slice(BUILD_SHORTLIST).find((item) => item.t.isRisk);
    if (risk) picked[picked.length - 1] = risk;
  }
  return new Set(picked.map((item) => item.t.id));
}
