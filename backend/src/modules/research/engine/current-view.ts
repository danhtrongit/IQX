// Broker Current View + per-thesis evidence (spec §9, §10): one live view per (symbol, broker),
// newer reports win, older claims are inherited while still inside the window.
import type { BrokerCurrentViewRow } from '../research.ports.js';
import type { CanonicalThesis, ResearchReport, StoredClaim, ThesisEvidenceLink } from '../research.types.js';
import { isWithinWindow } from './window.js';

export interface ThesisEvidenceEntry {
  thesisId: string;
  brokers: string[];
  perBroker: { broker: string; claim: StoredClaim }[];
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Current evidence of each active/updated thesis: per broker only the newest in-window active
 * claim. A replace/contradict link from a newer claim of the same broker retires that broker's
 * older claims on the thesis (spec §10.2).
 */
export function thesisEvidence(
  theses: CanonicalThesis[],
  links: ThesisEvidenceLink[],
  claims: StoredClaim[],
  today: string,
): Map<string, ThesisEvidenceEntry> {
  const claimIndex = new Map<string, { claim: StoredClaim; index: number }>();
  claims.forEach((claim, index) => claimIndex.set(claim.id, { claim, index }));

  const out = new Map<string, ThesisEvidenceEntry>();
  for (const thesis of theses) {
    if (thesis.status !== 'active' && thesis.status !== 'updated') continue;

    const linked = new Map<string, { claim: StoredClaim; index: number; relationship: ThesisEvidenceLink['relationship'] }>();
    for (const link of links) {
      if (link.thesisId !== thesis.id) continue;
      const hit = claimIndex.get(link.claimId);
      if (hit) linked.set(link.claimId, { ...hit, relationship: link.relationship });
    }

    // Per broker: the date of the newest replace/contradict claim (any live claim in the window).
    const retiredBefore = new Map<string, string>();
    for (const { claim, relationship } of linked.values()) {
      if (relationship !== 'replace' && relationship !== 'contradict') continue;
      if (claim.status === 'invalidated' || !isWithinWindow(claim.evidenceDate, today)) continue;
      const cur = retiredBefore.get(claim.broker);
      if (cur === undefined || claim.evidenceDate > cur) retiredBefore.set(claim.broker, claim.evidenceDate);
    }

    const newest = new Map<string, { claim: StoredClaim; index: number }>();
    for (const entry of linked.values()) {
      const { claim } = entry;
      if (claim.status !== 'active' || !isWithinWindow(claim.evidenceDate, today)) continue;
      const cutoff = retiredBefore.get(claim.broker);
      if (cutoff !== undefined && claim.evidenceDate < cutoff) continue;
      const cur = newest.get(claim.broker);
      if (
        !cur ||
        claim.evidenceDate > cur.claim.evidenceDate ||
        (claim.evidenceDate === cur.claim.evidenceDate && entry.index > cur.index)
      ) {
        newest.set(claim.broker, { claim, index: entry.index });
      }
    }

    const perBroker = [...newest.entries()]
      .sort(([a], [b]) => cmp(a, b))
      .map(([broker, { claim }]) => ({ broker, claim }));
    out.set(thesis.id, { thesisId: thesis.id, brokers: perBroker.map((p) => p.broker), perBroker });
  }
  return out;
}

/** One row per broker with at least one in-window report. */
export function buildBrokerCurrentViews(
  reports: ResearchReport[],
  claims: StoredClaim[],
  links: ThesisEvidenceLink[],
  today: string,
): BrokerCurrentViewRow[] {
  const byBroker = new Map<string, { report: ResearchReport; index: number }[]>();
  reports.forEach((report, index) => {
    if (!isWithinWindow(report.reportDate, today)) return;
    const list = byBroker.get(report.broker) ?? [];
    list.push({ report, index });
    byBroker.set(report.broker, list);
  });

  const thesesOfClaim = new Map<string, Set<string>>();
  for (const link of links) {
    const set = thesesOfClaim.get(link.claimId) ?? new Set<string>();
    set.add(link.thesisId);
    thesesOfClaim.set(link.claimId, set);
  }

  const rows: BrokerCurrentViewRow[] = [];
  for (const [broker, list] of [...byBroker.entries()].sort(([a], [b]) => cmp(a, b))) {
    // Newest first; same date → later in input order first.
    list.sort((a, b) =>
      a.report.reportDate === b.report.reportDate ? b.index - a.index : cmp(b.report.reportDate, a.report.reportDate),
    );
    const latest = list[0]!.report;
    const withTarget = list.find((x) => x.report.targetPriceVnd !== null && x.report.targetPriceVnd > 0)?.report ?? null;

    const olderReportIds = new Set(list.slice(1).map((x) => x.report.id));
    const brokerClaims = claims.filter(
      (c) => c.broker === broker && c.status === 'active' && isWithinWindow(c.evidenceDate, today),
    );

    const view: BrokerCurrentViewRow['claims'] = [];
    for (const claim of brokerClaims) {
      if (claim.reportId === latest.id) {
        view.push({ claimId: claim.id, relationship: 'current' });
      } else if (olderReportIds.has(claim.reportId)) {
        const mine = thesesOfClaim.get(claim.id);
        const superseded =
          mine !== undefined &&
          brokerClaims.some((other) => {
            if (other.id === claim.id || !isNewer(other, claim)) return false;
            const theirs = thesesOfClaim.get(other.id);
            return theirs !== undefined && [...mine].some((t) => theirs.has(t));
          });
        if (!superseded) view.push({ claimId: claim.id, relationship: 'inherited' });
      }
    }

    rows.push({
      broker,
      asOf: latest.reportDate,
      latestReportId: latest.id,
      latestTargetPrice: withTarget?.targetPriceVnd ?? null,
      latestTargetReportDate: withTarget?.reportDate ?? null,
      latestTargetReportId: withTarget?.id ?? null,
      claims: view,
    });
  }
  return rows;
}

function isNewer(a: StoredClaim, b: StoredClaim): boolean {
  return a.evidenceDate > b.evidenceDate;
}
