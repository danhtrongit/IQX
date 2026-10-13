// AI Insight v2 "Góc nhìn đầu tư" — shared domain types of the research module.
// Spec: IQX_AI_Insight_Goc_nhin_dau_tu_SPEC.md (v2). Keep this file free of Nest/DB imports.

/** Only reports dated within this many days take part in the current view (spec §8). */
export const REPORT_WINDOW_DAYS = 30;
/** At most this many theses are shown (spec §6.1). */
export const MAX_THESES = 5;
/** Summary hard cap in words (spec §6.2). */
export const SUMMARY_MAX_WORDS = 60;
/** A target outside [0.3, 3] × current price is an extraction error (spec §21.5). */
export const TARGET_PRICE_MIN_RATIO = 0.3;
export const TARGET_PRICE_MAX_RATIO = 3;
/** Circuit breaker: median target moving more than this vs the published view (spec §21.6). */
export const CIRCUIT_MEDIAN_CHANGE = 0.3;

export type ReportSourceId = 'vietstock' | 'vndirect';
export type ReportType = 'company' | 'industry' | 'strategy' | 'macro' | 'technical' | 'other';
export type DownloadStatus = 'pending' | 'downloaded' | 'failed' | 'duplicate';
export type ProcessStatus = 'pending' | 'processed' | 'failed' | 'skipped';
export type Direction = 'positive' | 'negative' | 'neutral' | 'mixed';
export type ClaimType =
  | 'growth_driver'
  | 'earnings_driver'
  | 'margin_driver'
  | 'project_catalyst'
  | 'industry_driver'
  | 'financial_risk'
  | 'execution_risk'
  | 'valuation'
  | 'forecast'
  | 'assumption'
  | 'other';

export const CLAIM_TYPES: readonly ClaimType[] = [
  'growth_driver',
  'earnings_driver',
  'margin_driver',
  'project_catalyst',
  'industry_driver',
  'financial_risk',
  'execution_risk',
  'valuation',
  'forecast',
  'assumption',
  'other',
];
export const RISK_CLAIM_TYPES: ReadonlySet<ClaimType> = new Set(['financial_risk', 'execution_risk']);

/** A report listed by a source, before download. Metadata comes from the source, never from AI. */
export interface SourceReportListing {
  source: ReportSourceId;
  sourceReportId: string;
  /** Upper-case ticker, or null when the source item names several symbols / none. */
  symbol: string | null;
  /** Canonical broker key (alias-normalized), e.g. "VIETCAP", "SSI", "VNDIRECT". */
  broker: string;
  brokerRaw: string;
  reportType: ReportType;
  /** ISO date (YYYY-MM-DD) printed by the broker. */
  reportDate: string;
  title: string;
  summary: string;
  language: 'vi' | 'en';
  sourceUrl: string;
  /** Direct PDF URL when the listing already exposes it. */
  fileUrl: string | null;
  /** Target price parsed from title/summary by the backend (VND), when present. */
  targetPriceVnd: number | null;
}

/** A report source adapter (Vietstock, VNDirect...). Implementations must respect rate limits. */
export interface ReportSource {
  readonly id: ReportSourceId;
  /** Lists reports dated in [fromDate, toDate] (ISO dates, inclusive). */
  list(fromDate: string, toDate: string, signal?: AbortSignal): Promise<SourceReportListing[]>;
  /** Resolves the PDF URL when the listing did not include it. */
  resolveFileUrl(listing: SourceReportListing, signal?: AbortSignal): Promise<string | null>;
  /** Downloads the file bytes (PDF). */
  download(fileUrl: string, signal?: AbortSignal): Promise<Uint8Array>;
}

export interface ResearchReport {
  id: string;
  source: ReportSourceId;
  sourceReportId: string;
  /** Null only for multi-symbol (industry/strategy/macro) reports, which are never processed. */
  symbol: string | null;
  broker: string;
  reportType: ReportType;
  reportDate: string;
  title: string;
  summary: string;
  language: 'vi' | 'en';
  sourceUrl: string;
  fileUrl: string | null;
  filePath: string | null;
  fileHash: string | null;
  targetPriceVnd: number | null;
  targetSource: 'metadata' | 'extracted' | null;
  targetHorizon: string | null;
  downloadStatus: DownloadStatus;
  processStatus: ProcessStatus;
  processAttempts: number;
}

export interface ClaimNumber {
  metric: string;
  value: number;
  unit: string;
  period?: string;
}

/** Atomic claim extracted from one report (spec §14). */
export interface ExtractedClaim {
  subject: string;
  driver: string;
  mechanism: string;
  outcome: string;
  direction: Direction;
  timeHorizon: string;
  claimType: ClaimType;
  summary: string;
  numbers: ClaimNumber[];
  sourcePage: number | null;
}

export interface ExtractedTarget {
  targetPriceVnd: number;
  horizon: string | null;
}

export interface ExtractionResult {
  claims: ExtractedClaim[];
  target: ExtractedTarget | null;
}

export interface StoredClaim extends ExtractedClaim {
  id: string;
  reportId: string;
  symbol: string;
  broker: string;
  evidenceDate: string;
  status: 'active' | 'superseded' | 'invalidated';
}

export type ClaimRelationship = 'SUPPORT' | 'UPDATE' | 'CONTRADICT' | 'REPLACE' | 'NEW_THESIS' | 'IRRELEVANT';

/** Per-dimension match verdict the AI must return for every claim (spec §16). */
export interface MatchReason {
  driver: boolean;
  mechanism: boolean;
  direction: boolean;
  reason: string;
}

export interface ClaimMatch {
  claimId: string;
  relationship: ClaimRelationship;
  /** Existing canonical thesis id for SUPPORT/UPDATE/CONTRADICT/REPLACE. */
  thesisId: string | null;
  /** Groups NEW_THESIS claims that belong together within this run, e.g. "n1". */
  newThesisKey: string | null;
  /** REPLACE that makes the thesis no longer valid (project cancelled...). */
  invalidatesThesis: boolean;
  match: MatchReason;
}

export interface NewThesisDraft {
  key: string;
  canonicalDriver: string;
  canonicalMechanism: string;
  canonicalOutcome: string;
  direction: Direction;
  isRisk: boolean;
}

export interface Disagreement {
  dimension: 'timeline' | 'size' | 'forecast' | 'margin' | 'growth' | 'other';
  note: string;
  /** Broker → stated value; ≥ 2 distinct values make a disagreement. */
  values: { broker: string; value: string }[];
}

export interface MatchingResult {
  matches: ClaimMatch[];
  newTheses: NewThesisDraft[];
  /** Thesis id (existing or new key) → disagreement detected among its evidence. */
  disagreements: { thesisRef: string; disagreement: Disagreement }[];
}

export type ThesisStatus = 'active' | 'updated' | 'invalidated' | 'expired';

export interface CanonicalThesis {
  id: string;
  symbol: string;
  seq: number;
  canonicalDriver: string;
  canonicalMechanism: string;
  canonicalOutcome: string;
  direction: Direction;
  isRisk: boolean;
  status: ThesisStatus;
  materiality: number;
  currentTitle: string | null;
  currentSummary: string | null;
  disagreement: Disagreement | null;
  summaryBrokers: string[];
  needsRewrite: boolean;
  createdAt: string;
}

export interface ThesisEvidenceLink {
  thesisId: string;
  claimId: string;
  relationship: 'support' | 'update' | 'contradict' | 'replace';
}

/** Input of the thesis builder: structured thesis + the claims currently backing it. */
export interface ThesisBuildInput {
  thesisId: string;
  canonicalDriver: string;
  canonicalMechanism: string;
  canonicalOutcome: string;
  direction: Direction;
  isRisk: boolean;
  disagreement: Disagreement | null;
  previousTitle: string | null;
  previousSummary: string | null;
  /** One current claim per broker (Broker Current View), broker names already anonymized ("B1", "B2"). */
  evidence: { brokerRef: string; evidenceDate: string; claim: ExtractedClaim }[];
}

export interface BuiltThesis {
  thesisId: string;
  title: string;
  summary: string;
  /** 1 (minor) … 5 (decisive for earnings/valuation). */
  materiality: number;
}

export interface ValidationFailure {
  thesisId: string;
  code:
    | 'schema'
    | 'word_count'
    | 'unknown_thesis'
    | 'forbidden_term'
    | 'broker_name'
    | 'generic_title'
    | 'untraceable_number'
    | 'disagreement'
    | 'certainty';
  detail: string;
}

/** Latest valid target of one broker inside the window (spec §11, §22.2). */
export interface BrokerTarget {
  broker: string;
  targetPriceVnd: number;
  reportDate: string;
  reportId: string;
}

export interface DilutiveAction {
  symbol: string;
  exDate: string;
  eventCode: string;
}

export type ValuationHiddenReason = 'corporate_action' | 'no_target';

export interface ValuationSnapshot {
  targetMedian: number | null;
  targetMin: number | null;
  targetMax: number | null;
  activeBrokerCount: number;
  targets: BrokerTarget[];
  researchAsOf: string | null;
  hiddenReason: ValuationHiddenReason | null;
}

/** Valuation as served (spec §28): computed against the live price at read time. */
export type InvestmentValuation =
  | {
      mode: 'range';
      targetMedian: number;
      targetMin: number;
      targetMax: number;
      currentPrice: number | null;
      upsidePercent: number | null;
    }
  | {
      mode: 'single';
      targetMedian: number;
      currentPrice: number | null;
      upsidePercent: number | null;
    };

export interface InvestmentViewThesis {
  id: string;
  order: number;
  title: string;
  summary: string;
}

export type InvestmentViewResponse =
  | { status: 'processing'; jobId: string }
  | { status: 'empty' }
  | {
      status: 'ready';
      version: number;
      theses: InvestmentViewThesis[];
      valuation: InvestmentValuation | null;
    };

export interface PublishedView {
  versionId: string;
  symbol: string;
  version: number;
  inputFingerprint: string;
  theses: InvestmentViewThesis[];
  valuation: ValuationSnapshot;
}
