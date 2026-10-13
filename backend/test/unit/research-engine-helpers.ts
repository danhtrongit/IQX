import type {
  CanonicalThesis,
  ExtractedClaim,
  ResearchReport,
  StoredClaim,
  ThesisBuildInput,
  ValuationSnapshot,
} from '../../src/modules/research/research.types.js';

export const TODAY = '2026-10-16';

export function report(p: Partial<ResearchReport> & { id: string; broker: string; reportDate: string }): ResearchReport {
  return {
    source: 'vietstock',
    sourceReportId: p.id,
    symbol: 'VIC',
    reportType: 'company',
    title: 't',
    summary: 's',
    language: 'vi',
    sourceUrl: 'u',
    fileUrl: null,
    filePath: null,
    fileHash: null,
    targetPriceVnd: null,
    targetSource: null,
    targetHorizon: null,
    downloadStatus: 'downloaded',
    processStatus: 'processed',
    processAttempts: 1,
    ...p,
  };
}

export function claim(p: Partial<StoredClaim> & { id: string; reportId: string; broker: string; evidenceDate: string }): StoredClaim {
  return {
    subject: 's',
    driver: 'd',
    mechanism: 'm',
    outcome: 'o',
    direction: 'positive',
    timeHorizon: '',
    claimType: 'growth_driver',
    summary: '',
    numbers: [],
    sourcePage: null,
    symbol: 'VIC',
    status: 'active',
    ...p,
  };
}

export function thesis(p: Partial<CanonicalThesis> & { id: string }): CanonicalThesis {
  return {
    symbol: 'VIC',
    seq: 1,
    canonicalDriver: 'd',
    canonicalMechanism: 'm',
    canonicalOutcome: 'o',
    direction: 'positive',
    isRisk: false,
    status: 'active',
    materiality: 3,
    currentTitle: null,
    currentSummary: null,
    disagreement: null,
    summaryBrokers: [],
    needsRewrite: false,
    createdAt: '2026-10-01T00:00:00Z',
    ...p,
  };
}

export function ec(p: Partial<ExtractedClaim> = {}): ExtractedClaim {
  return {
    subject: 's',
    driver: 'd',
    mechanism: 'm',
    outcome: 'o',
    direction: 'positive',
    timeHorizon: '',
    claimType: 'growth_driver',
    summary: '',
    numbers: [],
    sourcePage: null,
    ...p,
  };
}

export function input(p: Partial<ThesisBuildInput> & { thesisId: string }, claims: ExtractedClaim[] = [ec()]): ThesisBuildInput {
  return {
    canonicalDriver: 'd',
    canonicalMechanism: 'm',
    canonicalOutcome: 'o',
    direction: 'positive',
    isRisk: false,
    disagreement: null,
    previousTitle: null,
    previousSummary: null,
    evidence: claims.map((c, i) => ({ brokerRef: `B${i + 1}`, evidenceDate: '2026-10-01', claim: c })),
    ...p,
  };
}

export function snapshot(p: Partial<ValuationSnapshot> = {}): ValuationSnapshot {
  return {
    targetMedian: null,
    targetMin: null,
    targetMax: null,
    activeBrokerCount: 0,
    targets: [],
    researchAsOf: null,
    hiddenReason: null,
    ...p,
  };
}
