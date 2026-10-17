import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../platform/config/environment.js';
import { circuitBreak } from './engine/circuit-breaker.js';
import { buildBrokerCurrentViews, thesisEvidence } from './engine/current-view.js';
import { viewFingerprint } from './engine/fingerprint.js';
import { buildShortlist, orderTheses } from './engine/ordering.js';
import { validateBuiltTheses } from './engine/validators.js';
import { computeValuation, latestBrokerTargets } from './engine/valuation.js';
import { windowStart } from './engine/window.js';
import { extractPdfText } from './pdf-text.js';
import { ReportFiles } from './report-files.js';
import {
  RESEARCH_AI,
  RESEARCH_STORE,
  type AiUsage,
  type ResearchAi,
  type ResearchStore,
} from './research.ports.js';
import type {
  BuiltThesis,
  CanonicalThesis,
  ExtractedClaim,
  ResearchReport,
  StoredClaim,
  ThesisBuildInput,
  ValidationFailure,
  ValuationSnapshot,
} from './research.types.js';
import { BROKER_DISPLAY_NAMES } from './sources/broker-aliases.js';

/** Live price lookup; null when the quote is unavailable (valuation then skips the ratio check). */
export const RESEARCH_PRICE = Symbol('RESEARCH_PRICE');
export interface ResearchPricePort {
  currentPrice(symbol: string): Promise<number | null>;
}

export type RunOutcome =
  | { status: 'done'; published: number | null }
  | { status: 'blocked'; reason: string; fingerprint: string }
  | { status: 'failed'; error: string };

class BudgetExceededError extends Error {
  constructor() {
    super('RESEARCH_AI_BUDGET_EXCEEDED');
  }
}

const AI_ATTEMPTS = 3;
const AI_BACKOFF_MS = [2_000, 8_000];
const BROKER_CONCURRENCY = 3;
/** Claims per matching call and theses per builder call: keeps each answer far below max_tokens. */
export const MATCH_CHUNK = 12;
export const BUILD_CHUNK = 4;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A truncated answer comes back truncated again: retrying only burns the budget. */
function isTruncated(error: unknown): boolean {
  const response = (error as { getResponse?: () => unknown })?.getResponse?.();
  return (
    typeof response === 'object' &&
    response !== null &&
    (response as { code?: unknown }).code === 'AI_OUTPUT_TRUNCATED'
  );
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    out.push(items.slice(index, index + size));
  return out;
}

async function inParallel<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await task(item);
  });
  await Promise.all(workers);
}

/**
 * One processing run of the research pipeline for a symbol (spec §12–§13): extraction of
 * unprocessed reports → matching → canonical thesis update → broker current views → thesis
 * builder for affected theses only → automatic checks → publish when material. Deterministic
 * steps never call the AI; every AI call counts against the daily budget.
 */
@Injectable()
export class ResearchEngineService {
  private readonly logger = new Logger(ResearchEngineService.name);

  constructor(
    @Inject(RESEARCH_STORE) private readonly store: ResearchStore,
    @Inject(RESEARCH_AI) private readonly ai: ResearchAi,
    @Inject(RESEARCH_PRICE) private readonly price: ResearchPricePort,
    private readonly files: ReportFiles,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async run(
    symbol: string,
    today: string,
    onProgress: () => Promise<void>,
  ): Promise<RunOutcome & { llmCalls: number }> {
    const budget = { calls: 0 };
    try {
      const outcome = await this.process(symbol, today, budget, onProgress);
      return { ...outcome, llmCalls: budget.calls };
    } catch (error) {
      if (!(error instanceof BudgetExceededError))
        this.logger.error(`research run failed for ${symbol}: ${errorText(error)}`);
      return { status: 'failed', error: errorText(error), llmCalls: budget.calls };
    }
  }

  private async process(
    symbol: string,
    today: string,
    budget: { calls: number },
    onProgress: () => Promise<void>,
  ): Promise<RunOutcome> {
    const from = windowStart(today);
    const reports = await this.store.activeReports(symbol, from);
    const published = await this.store.published(symbol);

    // 1. Extraction: one broker's reports in date order (older never overwrites newer, §26),
    //    brokers in parallel. A broken report is marked failed and the run goes on (§13.5).
    const pending = reports.filter((report) => report.processStatus === 'pending');
    const byBroker = new Map<string, ResearchReport[]>();
    for (const report of pending)
      byBroker.set(report.broker, [...(byBroker.get(report.broker) ?? []), report]);
    await inParallel([...byBroker.values()], BROKER_CONCURRENCY, async (brokerReports) => {
      for (const report of brokerReports) {
        await this.extract(report, today, budget);
        await onProgress();
      }
    });

    // 2. Semantic matching + contradiction check of every claim not matched yet (§15–§19),
    //    in small batches; a batch is marked matched only once its result is stored, so a
    //    failed run leaves the rest for the next one.
    const unmatched = await this.store.unmatchedClaims(symbol, from);
    // Valuation claims (target, multiples) feed the valuation block, never a thesis.
    await this.store.markClaimsMatched(
      unmatched.filter((claim) => claim.claimType === 'valuation').map((claim) => claim.id),
    );
    for (const batch of chunks(
      unmatched.filter((claim) => claim.claimType !== 'valuation'),
      MATCH_CHUNK,
    )) {
      await this.match(symbol, batch, today, budget);
      await this.store.markClaimsMatched(batch.map((claim) => claim.id));
      await onProgress();
    }

    // 3. Evidence, expiry and broker current views (deterministic, §9–§11, §17).
    const claims = await this.store.activeClaims(symbol, from);
    const links = await this.store.thesisLinks(symbol);
    let theses = await this.store.theses(symbol);
    const evidence = thesisEvidence(theses, links, claims, today);
    for (const thesis of theses.filter(isLive)) {
      const brokers = evidence.get(thesis.id)?.brokers ?? [];
      if (brokers.length === 0) {
        await this.store.updateThesis(thesis.id, { status: 'expired' });
      } else if (thesis.summaryBrokers.some((broker) => !brokers.includes(broker))) {
        // Lost a broker: the summary may speak for evidence that is gone (§13.4).
        await this.store.updateThesis(thesis.id, { needsRewrite: true });
      }
    }
    const processedReports = await this.store.activeReports(symbol, from);
    await this.store.replaceBrokerCurrentViews(
      symbol,
      buildBrokerCurrentViews(processedReports, claims, links, today),
    );
    theses = await this.store.theses(symbol);

    // 4. Thesis builder for the affected theses only, then the automatic checks (§20–§21).
    const shortlist = buildShortlist(theses, evidence);
    const rewrite = theses.filter((thesis) => shortlist.has(thesis.id) && thesis.needsRewrite);
    for (const group of chunks(rewrite, BUILD_CHUNK)) {
      await this.build(symbol, group, evidence, today, budget);
      await onProgress();
    }
    theses = await this.store.theses(symbol);

    // 5. Assemble the view: ordered theses + valuation; publish only on a material change (§25).
    const candidates = theses
      .filter((thesis) => isLive(thesis) && thesis.currentTitle && thesis.currentSummary)
      .map((thesis) => ({
        thesis,
        brokerCount: evidence.get(thesis.id)?.brokers.length ?? 0,
        title: thesis.currentTitle as string,
        summary: thesis.currentSummary as string,
      }))
      .filter((candidate) => candidate.brokerCount > 0);
    const previousOrder = new Map((published?.theses ?? []).map((item) => [item.id, item.order]));
    const ordered = orderTheses(candidates, previousOrder);
    const valuation = await this.valuation(symbol, processedReports, today);
    const fingerprint = viewFingerprint(ordered, valuation);

    if (published?.inputFingerprint === fingerprint) {
      await this.store.touchPublished(symbol);
      return { status: 'done', published: null };
    }
    const visible = ordered.length > 0 || valuation.hiddenReason === null;
    if (!published && !visible) return { status: 'done', published: null };

    const reason = circuitBreak(published, { theses: ordered, valuation }, reports.length > 0);
    if (reason) {
      // Kept for the technical team; the stored view stays on screen (§21.6).
      this.logger.error(`research circuit breaker for ${symbol}: ${reason}`);
      return { status: 'blocked', reason, fingerprint };
    }
    const version = await this.store.publish(symbol, {
      inputFingerprint: fingerprint,
      theses: ordered,
      valuation,
    });
    return { status: 'done', published: version };
  }

  private async extract(
    report: ResearchReport,
    today: string,
    budget: { calls: number },
  ): Promise<void> {
    let text: string;
    try {
      if (!report.filePath) throw new Error('REPORT_FILE_MISSING');
      text = (await extractPdfText(await this.files.read(report.filePath))).text;
    } catch (error) {
      await this.store.markProcessFailed(report.id, `unreadable: ${errorText(error)}`);
      return;
    }
    try {
      const { result } = await this.callAi(today, budget, () =>
        this.ai.extractClaims(report, text),
      );
      await this.store.insertClaims(report, result.claims);
      await this.store.markProcessed(report.id, result.target);
    } catch (error) {
      if (error instanceof BudgetExceededError) throw error;
      await this.store.markProcessFailed(report.id, errorText(error));
    }
  }

  private async match(
    symbol: string,
    claims: StoredClaim[],
    today: string,
    budget: { calls: number },
  ) {
    const live = (await this.store.theses(symbol)).filter(isLive);
    const { result } = await this.callAi(today, budget, () =>
      this.ai.matchClaims(symbol, live, claims),
    );
    const created = new Map<string, string>();
    for (const draft of result.newTheses) {
      if (
        !result.matches.some(
          (match) => match.relationship === 'NEW_THESIS' && match.newThesisKey === draft.key,
        )
      )
        continue;
      created.set(draft.key, (await this.store.createThesis(symbol, draft)).id);
    }
    const links: Parameters<ResearchStore['linkClaims']>[0] = [];
    const touched = new Set<string>();
    const invalidated = new Set<string>();
    for (const match of result.matches) {
      if (match.relationship === 'IRRELEVANT') continue;
      const thesisId =
        match.relationship === 'NEW_THESIS'
          ? created.get(match.newThesisKey ?? '')
          : live.some((thesis) => thesis.id === match.thesisId)
            ? match.thesisId
            : null;
      if (!thesisId) continue;
      const relationship =
        match.relationship === 'NEW_THESIS'
          ? 'support'
          : (match.relationship.toLowerCase() as 'support' | 'update' | 'contradict' | 'replace');
      links.push({ thesisId, claimId: match.claimId, relationship, matchReason: match.match });
      if (match.relationship !== 'SUPPORT') touched.add(thesisId);
      if (match.relationship === 'REPLACE' && match.invalidatesThesis) invalidated.add(thesisId);
    }
    await this.store.linkClaims(links);
    for (const { thesisRef, disagreement } of result.disagreements) {
      const thesisId =
        created.get(thesisRef) ??
        (live.some((thesis) => thesis.id === thesisRef) ? thesisRef : null);
      if (!thesisId) continue;
      await this.store.updateThesis(thesisId, { disagreement });
      touched.add(thesisId);
    }
    for (const thesisId of touched) {
      if (invalidated.has(thesisId))
        await this.store.updateThesis(thesisId, { status: 'invalidated' });
      else
        await this.store.updateThesis(thesisId, {
          status: created.has(thesisId) ? 'active' : 'updated',
          needsRewrite: true,
        });
    }
  }

  private async build(
    symbol: string,
    theses: CanonicalThesis[],
    evidence: ReturnType<typeof thesisEvidence>,
    today: string,
    budget: { calls: number },
  ) {
    const inputs: ThesisBuildInput[] = theses.map((thesis) => {
      const perBroker = evidence.get(thesis.id)?.perBroker ?? [];
      return {
        thesisId: thesis.id,
        canonicalDriver: thesis.canonicalDriver,
        canonicalMechanism: thesis.canonicalMechanism,
        canonicalOutcome: thesis.canonicalOutcome,
        direction: thesis.direction,
        isRisk: thesis.isRisk,
        disagreement:
          thesis.disagreement &&
          anonymizeDisagreement(
            thesis,
            perBroker.map((item) => item.broker),
          ),
        previousTitle: thesis.currentTitle,
        previousSummary: thesis.currentSummary,
        // Brokers are anonymized: the builder must never see or write a broker name.
        evidence: perBroker.map((item, index) => ({
          brokerRef: `B${index + 1}`,
          evidenceDate: item.claim.evidenceDate,
          claim: claimContent(item.claim),
        })),
      };
    });
    const check = (built: BuiltThesis[], subset: ThesisBuildInput[]) =>
      validateBuiltTheses(built, { inputs: subset, brokerNames: BROKER_DISPLAY_NAMES });

    const first = await this.callAi(today, budget, () => this.ai.buildTheses(symbol, inputs));
    let { passed, failures } = check(first.result, inputs);
    const missing = inputs.filter(
      (input) => !passed.some((item) => item.thesisId === input.thesisId),
    );
    if (missing.length > 0) {
      // One regeneration with the rejection reasons, then drop what still fails (§21).
      const reasons: ValidationFailure[] = [
        ...failures,
        ...missing
          .filter((input) => !failures.some((failure) => failure.thesisId === input.thesisId))
          .map((input) => ({
            thesisId: input.thesisId,
            code: 'schema' as const,
            detail: 'thiếu luận điểm trong kết quả',
          })),
      ];
      const retry = await this.callAi(today, budget, () =>
        this.ai.buildTheses(symbol, missing, reasons),
      );
      const second = check(retry.result, missing);
      passed = [...passed, ...second.passed];
      failures = second.failures;
    }
    for (const input of inputs) {
      const built = passed.find((item) => item.thesisId === input.thesisId);
      const brokers = (evidence.get(input.thesisId)?.perBroker ?? []).map((item) => item.broker);
      if (built) {
        await this.store.updateThesis(input.thesisId, {
          currentTitle: built.title,
          currentSummary: built.summary,
          materiality: built.materiality,
          summaryBrokers: brokers,
          needsRewrite: false,
          status: 'active',
        });
      } else {
        // Still failing after one retry: leave it out until new evidence arrives, so the
        // same rejection does not spend tokens on every search.
        this.logger.warn(
          `research thesis ${input.thesisId} rejected: ${failures
            .filter((f) => f.thesisId === input.thesisId)
            .map((f) => f.code)
            .join(',')}`,
        );
        await this.store.updateThesis(input.thesisId, {
          currentTitle: null,
          currentSummary: null,
          summaryBrokers: brokers,
          needsRewrite: false,
        });
      }
    }
  }

  private async valuation(
    symbol: string,
    reports: ResearchReport[],
    today: string,
  ): Promise<ValuationSnapshot> {
    const price = await this.price.currentPrice(symbol).catch(() => null);
    const targets = latestBrokerTargets(reports, today, price);
    const earliest = targets.reduce<string | null>(
      (min, target) => (min === null || target.reportDate < min ? target.reportDate : min),
      null,
    );
    const dilutive = earliest ? await this.store.dilutiveActions(symbol, earliest) : [];
    const asOf = reports.reduce<string | null>(
      (max, report) => (max === null || report.reportDate > max ? report.reportDate : max),
      null,
    );
    return computeValuation(targets, dilutive, asOf);
  }

  /** Runs an AI step with backoff retries, inside the daily budget; usage is recorded per call. */
  private async callAi<T>(
    today: string,
    budget: { calls: number },
    step: () => Promise<{ result: T; usage: AiUsage }>,
  ): Promise<{ result: T; usage: AiUsage }> {
    const limit = this.config.get('RESEARCH_AI_DAILY_CALL_LIMIT', { infer: true });
    let lastError: unknown;
    for (let attempt = 0; attempt < AI_ATTEMPTS; attempt += 1) {
      if ((await this.store.aiCallsOn(today)) >= limit) throw new BudgetExceededError();
      try {
        const output = await step();
        budget.calls += output.usage.calls;
        await this.store.recordAiUsage(today, output.usage);
        return output;
      } catch (error) {
        lastError = error;
        budget.calls += 1;
        await this.store.recordAiUsage(today, { calls: 1, promptTokens: 0, completionTokens: 0 });
        if (isTruncated(error)) break;
        if (attempt < AI_ATTEMPTS - 1)
          await new Promise((resolve) => setTimeout(resolve, AI_BACKOFF_MS[attempt]));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(errorText(lastError));
  }
}

/** The claim as the builder may see it: content only, no broker, report or claim ids. */
function claimContent(claim: StoredClaim): ExtractedClaim {
  return {
    subject: claim.subject,
    driver: claim.driver,
    mechanism: claim.mechanism,
    outcome: claim.outcome,
    direction: claim.direction,
    timeHorizon: claim.timeHorizon,
    claimType: claim.claimType,
    summary: claim.summary,
    numbers: claim.numbers,
    sourcePage: claim.sourcePage,
  };
}

function isLive(thesis: CanonicalThesis): boolean {
  return thesis.status === 'active' || thesis.status === 'updated';
}

/** Disagreement values name brokers; the builder only sees the same B1/B2 refs as the evidence. */
function anonymizeDisagreement(
  thesis: CanonicalThesis,
  brokers: string[],
): CanonicalThesis['disagreement'] {
  if (!thesis.disagreement) return null;
  return {
    ...thesis.disagreement,
    values: thesis.disagreement.values.map((item) => {
      const index = brokers.indexOf(item.broker);
      return { broker: index >= 0 ? `B${index + 1}` : 'B?', value: item.value };
    }),
  };
}
