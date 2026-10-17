// Shared fakes for the research orchestration tests: an in-memory ResearchStore (lease semantics,
// publish versions, statuses mirror research.repository.ts), a scriptable ResearchAi with call
// counters, a price stub and a ReportFiles stub.
import type { ConfigService } from '@nestjs/config';
import { type Mock, vi } from 'vitest';

import type { Environment } from '../../src/platform/config/environment.js';
import type { ReportFiles } from '../../src/modules/research/report-files.js';
import { ResearchEngineService } from '../../src/modules/research/research-engine.service.js';
import type {
  AcquireJobResult,
  AiUsage,
  BrokerCurrentViewRow,
  PublishInput,
  ResearchAi,
  ResearchJob,
  ResearchStore,
  ThesisPatch,
  UpsertListingResult,
} from '../../src/modules/research/research.ports.js';
import type {
  BuiltThesis,
  CanonicalThesis,
  ClaimMatch,
  DilutiveAction,
  ExtractedClaim,
  ExtractionResult,
  MatchingResult,
  NewThesisDraft,
  PublishedView,
  ResearchReport,
  StoredClaim,
  ThesisBuildInput,
  ThesisEvidenceLink,
  ValidationFailure,
} from '../../src/modules/research/research.types.js';
import { ec, report } from './research-engine-helpers.js';

export { ec } from './research-engine-helpers.js';

export const SYMBOL = 'VIC';
export const NOW_ISO = '2026-10-16T05:00:00.000Z';

export function isoDaysBefore(today: string, days: number): string {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! - days)).toISOString().slice(0, 10);
}

/** A downloaded company report waiting for extraction. */
export function pendingReport(
  id: string,
  broker: string,
  reportDate: string,
  extra: Partial<ResearchReport> = {},
): ResearchReport {
  return report({
    id,
    broker,
    reportDate,
    processStatus: 'pending',
    processAttempts: 0,
    filePath: `research/${id}.pdf`,
    ...extra,
  });
}

export const usage = (calls = 1): AiUsage => ({ calls, promptTokens: 10, completionTokens: 5 });

// ─── fake store ───────────────────────────────────────────────────────────────

interface VersionRow {
  versionId: string;
  symbol: string;
  version: number;
  status: 'published' | 'superseded';
  fingerprint: string;
  theses: PublishedView['theses'];
  valuation: PublishedView['valuation'];
  checkedAt: number | null;
}

export class FakeResearchStore implements ResearchStore {
  reports: ResearchReport[] = [];
  claims: StoredClaim[] = [];
  /** Claim ids that went through matching (research_claims.matched_at). */
  matched = new Set<string>();
  thesisRows: CanonicalThesis[] = [];
  links: ThesisEvidenceLink[] = [];
  versions: VersionRow[] = [];
  jobs: (ResearchJob & { seq: number })[] = [];
  brokerViews = new Map<string, BrokerCurrentViewRow[]>();
  dilutive: DilutiveAction[] = [];
  usageByDate = new Map<string, number>();
  processFailures: { id: string; error: string }[] = [];
  touched = 0;
  heartbeats = 0;
  publishCalls = 0;
  /** Every thesis update, in order, for ordering assertions. */
  updates: { thesisId: string; patch: ThesisPatch }[] = [];
  private seq = 0;

  addReport(r: ResearchReport): ResearchReport {
    this.reports.push({ ...r });
    return r;
  }

  report(id: string): ResearchReport {
    const found = this.reports.find((r) => r.id === id);
    if (!found) throw new Error(`no report ${id}`);
    return found;
  }

  thesis(id: string): CanonicalThesis {
    const found = this.thesisRows.find((t) => t.id === id);
    if (!found) throw new Error(`no thesis ${id}`);
    return found;
  }

  get publishedRow(): VersionRow | undefined {
    return this.versions.find((v) => v.status === 'published');
  }

  /** Version numbers in publication order. */
  get versionNumbers(): number[] {
    return this.versions.map((v) => v.version);
  }

  /** Starts a live 'running' job directly (a worker that is alive or has died). */
  seedRunningJob(symbol: string, heartbeatAtMs: number): ResearchJob {
    const job = this.newJob(symbol, heartbeatAtMs);
    return job;
  }

  private newJob(symbol: string, heartbeatAtMs = Date.now()): ResearchJob {
    this.seq += 1;
    const job = {
      id: `job-${this.seq}`,
      seq: this.seq,
      symbol,
      status: 'running' as const,
      startedAt: new Date(Date.now()).toISOString(),
      heartbeatAt: new Date(heartbeatAtMs).toISOString(),
      finishedAt: null,
      inputFingerprint: null,
      llmCalls: 0,
      errorMessage: null,
    };
    this.jobs.push(job);
    return job;
  }

  // report store half (unused by the engine)
  async upsertListing(): Promise<UpsertListingResult> {
    throw new Error('not used by the engine');
  }
  async pendingDownloads(): Promise<ResearchReport[]> {
    return [];
  }
  async markDownloaded(): Promise<'downloaded' | 'duplicate'> {
    return 'downloaded';
  }
  async markDownloadFailed(): Promise<void> {}
  async countReports(): Promise<number> {
    return this.reports.length;
  }

  // engine reads
  async activeReports(symbol: string, fromDate: string): Promise<ResearchReport[]> {
    return this.reports
      .filter(
        (r) =>
          r.symbol === symbol &&
          r.reportType === 'company' &&
          r.downloadStatus === 'downloaded' &&
          r.reportDate >= fromDate,
      )
      .map((r, index) => ({ r, index }))
      .sort((a, b) =>
        a.r.reportDate < b.r.reportDate
          ? -1
          : a.r.reportDate > b.r.reportDate
            ? 1
            : a.index - b.index,
      )
      .map(({ r }) => ({ ...r }));
  }
  async activeClaims(symbol: string, fromDate: string): Promise<StoredClaim[]> {
    return this.claims
      .filter((c) => c.symbol === symbol && c.status === 'active' && c.evidenceDate >= fromDate)
      .map((c) => ({ ...c }));
  }
  async unmatchedClaims(symbol: string, fromDate: string): Promise<StoredClaim[]> {
    return (await this.activeClaims(symbol, fromDate)).filter((c) => !this.matched.has(c.id));
  }
  async theses(symbol: string): Promise<CanonicalThesis[]> {
    return this.thesisRows
      .filter((t) => t.symbol === symbol)
      .map((t) => ({ ...t, summaryBrokers: [...t.summaryBrokers] }));
  }
  async thesisLinks(symbol: string): Promise<ThesisEvidenceLink[]> {
    const ids = new Set(this.thesisRows.filter((t) => t.symbol === symbol).map((t) => t.id));
    return this.links.filter((l) => ids.has(l.thesisId)).map((l) => ({ ...l }));
  }
  async published(symbol: string): Promise<PublishedView | null> {
    const row = this.versions.find((v) => v.symbol === symbol && v.status === 'published');
    if (!row) return null;
    return {
      versionId: row.versionId,
      symbol: row.symbol,
      version: row.version,
      inputFingerprint: row.fingerprint,
      theses: row.theses.map((t) => ({ ...t })),
      valuation: structuredClone(row.valuation),
    };
  }
  async dilutiveActions(symbol: string, afterDate: string): Promise<DilutiveAction[]> {
    return this.dilutive.filter((a) => a.symbol === symbol && a.exDate > afterDate);
  }

  // engine writes
  async insertClaims(r: ResearchReport, claims: ExtractedClaim[]): Promise<StoredClaim[]> {
    const stored = claims.map((claim) => ({
      ...claim,
      id: `claim-${++this.seq}`,
      reportId: r.id,
      symbol: r.symbol as string,
      broker: r.broker,
      evidenceDate: r.reportDate,
      status: 'active' as const,
    }));
    this.claims.push(...stored);
    return stored.map((c) => ({ ...c }));
  }
  async setClaimStatus(claimIds: string[], status: StoredClaim['status']): Promise<void> {
    for (const c of this.claims) if (claimIds.includes(c.id)) c.status = status;
  }
  async markClaimsMatched(claimIds: string[]): Promise<void> {
    for (const id of claimIds) this.matched.add(id);
  }
  async markProcessed(
    reportId: string,
    target: { targetPriceVnd: number; horizon: string | null } | null,
  ): Promise<void> {
    const r = this.report(reportId);
    r.processStatus = 'processed';
    r.processAttempts += 1;
    // Metadata target wins: the extracted one only fills an empty slot (repository semantics).
    if (target && r.targetSource === null) {
      r.targetPriceVnd = target.targetPriceVnd;
      r.targetHorizon = target.horizon;
      r.targetSource = 'extracted';
    }
  }
  async markProcessFailed(reportId: string, error: string): Promise<void> {
    const r = this.report(reportId);
    r.processAttempts += 1;
    // First failure stays pending (retried by the next search); the third one is final.
    r.processStatus = r.processAttempts >= 3 ? 'failed' : 'pending';
    this.processFailures.push({ id: reportId, error });
  }
  async createThesis(symbol: string, draft: NewThesisDraft): Promise<CanonicalThesis> {
    const seq = this.thesisRows.filter((t) => t.symbol === symbol).length + 1;
    const created: CanonicalThesis = {
      id: `${symbol}_THESIS_${String(seq).padStart(3, '0')}`,
      symbol,
      seq,
      canonicalDriver: draft.canonicalDriver,
      canonicalMechanism: draft.canonicalMechanism,
      canonicalOutcome: draft.canonicalOutcome,
      direction: draft.direction,
      isRisk: draft.isRisk,
      status: 'active',
      materiality: 3,
      currentTitle: null,
      currentSummary: null,
      disagreement: null,
      summaryBrokers: [],
      needsRewrite: true,
      createdAt: NOW_ISO,
    };
    this.thesisRows.push(created);
    return { ...created };
  }
  async linkClaims(
    links: (ThesisEvidenceLink & { matchReason: ClaimMatch['match'] })[],
  ): Promise<void> {
    for (const { thesisId, claimId, relationship } of links) {
      if (this.links.some((l) => l.thesisId === thesisId && l.claimId === claimId)) continue; // ON CONFLICT DO NOTHING
      this.links.push({ thesisId, claimId, relationship });
    }
  }
  async updateThesis(thesisId: string, patch: ThesisPatch): Promise<void> {
    const t = this.thesis(thesisId);
    this.updates.push({ thesisId, patch });
    for (const [key, value] of Object.entries(patch))
      if (value !== undefined) (t as unknown as Record<string, unknown>)[key] = value;
  }
  async replaceBrokerCurrentViews(symbol: string, views: BrokerCurrentViewRow[]): Promise<void> {
    this.brokerViews.set(symbol, views);
  }
  async publish(symbol: string, input: PublishInput): Promise<number> {
    this.publishCalls += 1;
    const version =
      Math.max(0, ...this.versions.filter((v) => v.symbol === symbol).map((v) => v.version)) + 1;
    for (const v of this.versions)
      if (v.symbol === symbol && v.status === 'published') v.status = 'superseded';
    this.versions.push({
      versionId: `ver-${symbol}-${version}`,
      symbol,
      version,
      status: 'published',
      fingerprint: input.inputFingerprint,
      theses: input.theses.map((t) => ({ ...t })),
      valuation: structuredClone(input.valuation),
      checkedAt: null,
    });
    return version;
  }
  async touchPublished(symbol: string): Promise<void> {
    this.touched += 1;
    const row = this.versions.find((v) => v.symbol === symbol && v.status === 'published');
    if (row) row.checkedAt = Date.now();
  }

  // jobs
  async acquireJob(symbol: string, staleAfterMs: number): Promise<AcquireJobResult> {
    const running = this.jobs
      .filter((j) => j.symbol === symbol && j.status === 'running')
      .sort((a, b) => b.seq - a.seq)[0];
    if (running) {
      const live = Date.parse(running.heartbeatAt) > Date.now() - staleAfterMs;
      if (live) return { acquired: false, job: { ...running } };
      running.status = 'failed';
      running.finishedAt = new Date().toISOString();
      running.errorMessage = 'lease expired';
    }
    const job = this.newJob(symbol);
    return { acquired: true, job: { ...job } };
  }
  async heartbeat(jobId: string): Promise<void> {
    this.heartbeats += 1;
    const job = this.jobs.find((j) => j.id === jobId);
    if (job && job.status === 'running') job.heartbeatAt = new Date().toISOString();
  }
  async finishJob(
    jobId: string,
    status: 'done' | 'failed' | 'blocked',
    detail: { inputFingerprint?: string | null; llmCalls?: number; error?: string | null },
  ): Promise<void> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job) return;
    job.status = status;
    job.finishedAt = new Date().toISOString();
    job.heartbeatAt = job.finishedAt;
    job.inputFingerprint = detail.inputFingerprint ?? job.inputFingerprint;
    job.llmCalls = detail.llmCalls ?? job.llmCalls;
    job.errorMessage = detail.error ?? null;
  }
  async job(jobId: string): Promise<ResearchJob | null> {
    const job = this.jobs.find((j) => j.id === jobId);
    return job ? { ...job } : null;
  }
  async lastJob(symbol: string): Promise<ResearchJob | null> {
    const job = this.jobs.filter((j) => j.symbol === symbol).sort((a, b) => b.seq - a.seq)[0];
    return job ? { ...job } : null;
  }
  async lastBlockedFingerprint(symbol: string): Promise<string | null> {
    const own = this.jobs.filter((j) => j.symbol === symbol);
    const lastDone = Math.max(0, ...own.filter((j) => j.status === 'done').map((j) => j.seq));
    const blocked = own
      .filter((j) => j.status === 'blocked' && j.seq > lastDone)
      .sort((a, b) => b.seq - a.seq)[0];
    return blocked?.inputFingerprint ?? null;
  }

  // budget
  async aiCallsOn(date: string): Promise<number> {
    return this.usageByDate.get(date) ?? 0;
  }
  async recordAiUsage(date: string, u: { calls: number }): Promise<void> {
    this.usageByDate.set(date, (this.usageByDate.get(date) ?? 0) + u.calls);
  }
}

// ─── scriptable AI ────────────────────────────────────────────────────────────

export type BuildFn = (
  inputs: ThesisBuildInput[],
  failures: ValidationFailure[] | undefined,
) => BuiltThesis[];

export function defaultBuild(inputs: ThesisBuildInput[]): BuiltThesis[] {
  return inputs.map((input) => ({
    thesisId: input.thesisId,
    title: `Động lực ${input.canonicalDriver}`,
    summary: `Yếu tố ${input.canonicalDriver} đang hỗ trợ kết quả kinh doanh`,
    materiality: 3,
  }));
}

const reasoning = { driver: true, mechanism: true, direction: true, reason: 'cùng ý' };

/** SUPPORT when a live thesis has the same driver, otherwise NEW_THESIS keyed by the driver. */
export function defaultMatch(
  theses: Pick<CanonicalThesis, 'id' | 'canonicalDriver'>[],
  claims: StoredClaim[],
): MatchingResult {
  const keys = new Set<string>();
  const matches: ClaimMatch[] = claims.map((claim) => {
    const existing = theses.find((t) => t.canonicalDriver === claim.driver);
    if (existing)
      return {
        claimId: claim.id,
        relationship: 'SUPPORT',
        thesisId: existing.id,
        newThesisKey: null,
        invalidatesThesis: false,
        match: reasoning,
      };
    keys.add(claim.driver);
    return {
      claimId: claim.id,
      relationship: 'NEW_THESIS',
      thesisId: null,
      newThesisKey: claim.driver,
      invalidatesThesis: false,
      match: reasoning,
    };
  });
  const newTheses: NewThesisDraft[] = [...keys].map((key) => ({
    key,
    canonicalDriver: key,
    canonicalMechanism: 'm',
    canonicalOutcome: 'o',
    direction: 'positive',
    isRisk: false,
  }));
  return { matches, newTheses, disagreements: [] };
}

export class StubAi implements ResearchAi {
  extractCalls: string[] = [];
  matchCalls = 0;
  buildCalls: { inputs: ThesisBuildInput[]; failures: ValidationFailure[] | undefined }[] = [];
  /** reportId → what the extractor returns (default: one 'alpha' claim, no target). */
  extractions = new Map<string, ExtractionResult>();
  /** Throws for every report id in the set / for every call when `failAll`. */
  extractError: Error | null = null;
  matchError: Error | null = null;
  buildError: Error | null = null;
  matchFn:
    | ((
        theses: Pick<CanonicalThesis, 'id' | 'canonicalDriver'>[],
        claims: StoredClaim[],
      ) => MatchingResult)
    | null = null;
  buildFn: BuildFn = (inputs) => defaultBuild(inputs);
  /** Awaited at the start of every extraction; lets a test hold the job open. */
  gate: Promise<void> | null = null;

  get totalCalls(): number {
    return this.extractCalls.length + this.matchCalls + this.buildCalls.length;
  }

  async extractClaims(
    r: Pick<ResearchReport, 'symbol' | 'broker' | 'reportDate' | 'title' | 'language'> & {
      id?: string;
    },
  ) {
    const id = (r as ResearchReport).id;
    this.extractCalls.push(id);
    if (this.gate) await this.gate;
    if (this.extractError) throw this.extractError;
    const result = this.extractions.get(id) ?? { claims: [ec({ driver: 'alpha' })], target: null };
    return { result, usage: usage() };
  }

  async matchClaims(
    _symbol: string,
    theses: Pick<CanonicalThesis, 'id' | 'canonicalDriver'>[],
    claims: StoredClaim[],
  ) {
    this.matchCalls += 1;
    if (this.matchError) throw this.matchError;
    return { result: (this.matchFn ?? defaultMatch)(theses, claims), usage: usage() };
  }

  async buildTheses(_symbol: string, inputs: ThesisBuildInput[], failures?: ValidationFailure[]) {
    this.buildCalls.push({ inputs, failures });
    if (this.buildError) throw this.buildError;
    return { result: this.buildFn(inputs, failures), usage: usage() };
  }
}

// ─── wiring ───────────────────────────────────────────────────────────────────

export interface Harness {
  store: FakeResearchStore;
  ai: StubAi;
  files: { read: ReturnType<typeof vi.fn> };
  price: { currentPrice: Mock<(symbol: string) => Promise<number | null>>; value: number | null };
  settings: { RESEARCH_AI_DAILY_CALL_LIMIT: number; RESEARCH_INSIGHT_ENABLED: boolean };
  engine: ResearchEngineService;
}

export function makeHarness(): Harness {
  const store = new FakeResearchStore();
  const ai = new StubAi();
  const files = { read: vi.fn(async (path: string) => new TextEncoder().encode(path)) };
  const price = {
    value: 90_000 as number | null,
    currentPrice: vi.fn(async (_symbol: string): Promise<number | null> => price.value),
  };
  const settings = { RESEARCH_AI_DAILY_CALL_LIMIT: 1_000, RESEARCH_INSIGHT_ENABLED: true };
  const config = { get: (key: keyof typeof settings) => settings[key] } as unknown as ConfigService<
    Environment,
    true
  >;
  const engine = new ResearchEngineService(
    store,
    ai,
    price,
    files as unknown as ReportFiles,
    config,
  );
  return { store, ai, files, price, settings, engine };
}

/** Makes AI retry backoff (2 s / 8 s) instant without touching other timers. */
export function instantBackoff(): () => void {
  const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
    queueMicrotask(fn);
    return 0 as unknown as NodeJS.Timeout;
  }) as unknown as typeof setTimeout);
  return () => spy.mockRestore();
}
