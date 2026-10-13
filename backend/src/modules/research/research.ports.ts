// Ports between the research engine, its store (SQL) and its AI steps. The engine only talks
// to these interfaces so each side can be tested with hand-built stubs.
import type {
  BuiltThesis,
  CanonicalThesis,
  ClaimMatch,
  DilutiveAction,
  ExtractedClaim,
  ExtractionResult,
  InvestmentViewThesis,
  MatchingResult,
  NewThesisDraft,
  PublishedView,
  ResearchReport,
  SourceReportListing,
  StoredClaim,
  ThesisBuildInput,
  ThesisEvidenceLink,
  ThesisStatus,
  Disagreement,
  ValidationFailure,
  ValuationSnapshot,
} from './research.types.js';

export const RESEARCH_STORE = Symbol('RESEARCH_STORE');
export const RESEARCH_AI = Symbol('RESEARCH_AI');
export const REPORT_SOURCES = Symbol('REPORT_SOURCES');

export interface UpsertListingResult {
  id: string;
  /** True when the (source, source_report_id) row did not exist before. */
  inserted: boolean;
}

export interface ResearchJob {
  id: string;
  symbol: string;
  status: 'running' | 'done' | 'failed' | 'blocked';
  startedAt: string;
  heartbeatAt: string;
  finishedAt: string | null;
  inputFingerprint: string | null;
  llmCalls: number;
  errorMessage: string | null;
}

export type AcquireJobResult =
  /** This caller owns the lease and must run the job. */
  | { acquired: true; job: ResearchJob }
  /** Another live worker owns the symbol; wait for this job. */
  | { acquired: false; job: ResearchJob };

export interface ThesisPatch {
  status?: ThesisStatus;
  materiality?: number;
  currentTitle?: string | null;
  currentSummary?: string | null;
  disagreement?: Disagreement | null;
  summaryBrokers?: string[];
  needsRewrite?: boolean;
}

export interface BrokerCurrentViewRow {
  broker: string;
  asOf: string;
  latestReportId: string;
  latestTargetPrice: number | null;
  latestTargetReportDate: string | null;
  latestTargetReportId: string | null;
  /** Claims in the view: 'current' from the latest report, 'inherited' from older ones (spec §10.3). */
  claims: { claimId: string; relationship: 'current' | 'inherited' }[];
}

export interface PublishInput {
  inputFingerprint: string;
  theses: InvestmentViewThesis[];
  valuation: ValuationSnapshot;
}

export interface ResearchStore {
  // ── Report store (daily download job, no AI) ──────────────────────────────
  upsertListing(listing: SourceReportListing): Promise<UpsertListingResult>;
  /** Reports still to download (pending, or failed with fewer than `maxAttempts`). */
  pendingDownloads(limit: number, maxAttempts: number): Promise<ResearchReport[]>;
  /** Stores the file; returns 'duplicate' when another downloaded report has the same hash. */
  markDownloaded(
    reportId: string,
    file: { filePath: string; fileHash: string; fileBytes: number; fileUrl: string },
  ): Promise<'downloaded' | 'duplicate'>;
  markDownloadFailed(reportId: string, error: string): Promise<void>;
  /** Number of stored reports from a source (0 → first deploy, run the 30-day backfill). */
  countReports(source: SourceReportListing['source']): Promise<number>;

  // ── Engine reads ───────────────────────────────────────────────────────────
  /** Downloaded company reports of the symbol with report_date ≥ fromDate, oldest first. */
  activeReports(symbol: string, fromDate: string): Promise<ResearchReport[]>;
  /** Active claims of the symbol with evidence_date ≥ fromDate. */
  activeClaims(symbol: string, fromDate: string): Promise<StoredClaim[]>;
  /** Active claims (evidence_date ≥ fromDate) that have not been through matching yet, oldest first. */
  unmatchedClaims(symbol: string, fromDate: string): Promise<StoredClaim[]>;
  theses(symbol: string): Promise<CanonicalThesis[]>;
  thesisLinks(symbol: string): Promise<ThesisEvidenceLink[]>;
  published(symbol: string): Promise<PublishedView | null>;
  /** Dilutive events (stock dividend, bonus, additional issue) with ex-date after `afterDate`. */
  dilutiveActions(symbol: string, afterDate: string): Promise<DilutiveAction[]>;

  // ── Engine writes ──────────────────────────────────────────────────────────
  insertClaims(report: ResearchReport, claims: ExtractedClaim[]): Promise<StoredClaim[]>;
  setClaimStatus(claimIds: string[], status: StoredClaim['status']): Promise<void>;
  markClaimsMatched(claimIds: string[]): Promise<void>;
  markProcessed(reportId: string, target: { targetPriceVnd: number; horizon: string | null } | null): Promise<void>;
  markProcessFailed(reportId: string, error: string): Promise<void>;
  createThesis(symbol: string, draft: NewThesisDraft): Promise<CanonicalThesis>;
  linkClaims(links: (ThesisEvidenceLink & { matchReason: ClaimMatch['match'] })[]): Promise<void>;
  updateThesis(thesisId: string, patch: ThesisPatch): Promise<void>;
  replaceBrokerCurrentViews(symbol: string, views: BrokerCurrentViewRow[]): Promise<void>;
  /** Publishes a new version (supersedes the previous one) and returns its number. */
  publish(symbol: string, input: PublishInput): Promise<number>;
  /** Records that the published view was checked and is still current. */
  touchPublished(symbol: string): Promise<void>;

  // ── Jobs: one live lease per symbol ────────────────────────────────────────
  acquireJob(symbol: string, staleAfterMs: number): Promise<AcquireJobResult>;
  heartbeat(jobId: string): Promise<void>;
  finishJob(
    jobId: string,
    status: 'done' | 'failed' | 'blocked',
    detail: { inputFingerprint?: string | null; llmCalls?: number; error?: string | null },
  ): Promise<void>;
  job(jobId: string): Promise<ResearchJob | null>;
  /** Most recent job of the symbol, any status. */
  lastJob(symbol: string): Promise<ResearchJob | null>;
  /** Fingerprint of the latest 'blocked' job of the symbol (circuit breaker), if any. */
  lastBlockedFingerprint(symbol: string): Promise<string | null>;

  // ── Daily AI budget ────────────────────────────────────────────────────────
  aiCallsOn(date: string): Promise<number>;
  recordAiUsage(date: string, usage: { calls: number; promptTokens: number; completionTokens: number }): Promise<void>;
}

export interface AiUsage {
  calls: number;
  promptTokens: number;
  completionTokens: number;
}

export interface ResearchAi {
  /** Atomic claims + target price from one report's text (spec §14). */
  extractClaims(
    report: Pick<ResearchReport, 'symbol' | 'broker' | 'reportDate' | 'title' | 'language'>,
    text: string,
  ): Promise<{ result: ExtractionResult; usage: AiUsage }>;
  /** Semantic matching + contradiction/disagreement check of new claims vs existing theses (spec §15–§19). */
  matchClaims(
    symbol: string,
    theses: Pick<CanonicalThesis, 'id' | 'canonicalDriver' | 'canonicalMechanism' | 'canonicalOutcome' | 'direction' | 'currentSummary'>[],
    claims: StoredClaim[],
  ): Promise<{ result: MatchingResult; usage: AiUsage }>;
  /** User-facing title/summary of the affected theses only (spec §20). `failures` carries the previous rejection reasons. */
  buildTheses(
    symbol: string,
    inputs: ThesisBuildInput[],
    failures?: ValidationFailure[],
  ): Promise<{ result: BuiltThesis[]; usage: AiUsage }>;
}
