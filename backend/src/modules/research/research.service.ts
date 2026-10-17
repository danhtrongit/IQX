import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';

import { thesisEvidence } from './engine/current-view.js';
import { buildShortlist } from './engine/ordering.js';
import { servedValuation } from './engine/valuation.js';
import { isWithinWindow, vnToday, windowStart } from './engine/window.js';
import {
  RESEARCH_PRICE,
  ResearchEngineService,
  type ResearchPricePort,
} from './research-engine.service.js';
import { RESEARCH_STORE, type ResearchJob, type ResearchStore } from './research.ports.js';
import type { InvestmentViewResponse, PublishedView } from './research.types.js';

/** A lease without a heartbeat for this long belongs to a dead worker and is taken over (§26). */
export const JOB_STALE_AFTER_MS = 90_000;
const HEARTBEAT_EVERY_MS = 15_000;
/** After a failed run, searches serve the stored view for this long before retrying (§13.5). */
export const RETRY_COOLDOWN_MS = 10 * 60_000;

/**
 * Serves "Góc nhìn đầu tư" (spec §13, §28). A request only checks the store (no AI): with no
 * change it returns the published view (0 token); with a change it starts — or joins — the
 * symbol's single background job and answers `processing` with the job id to poll.
 */
@Injectable()
export class ResearchService implements OnApplicationShutdown {
  private readonly logger = new Logger(ResearchService.name);
  private readonly running = new Map<string, Promise<void>>();
  private shuttingDown = false;

  constructor(
    @Inject(RESEARCH_STORE) private readonly store: ResearchStore,
    @Inject(RESEARCH_PRICE) private readonly price: ResearchPricePort,
    private readonly engine: ResearchEngineService,
  ) {}

  async view(symbol: string): Promise<InvestmentViewResponse> {
    const today = vnToday();
    if (await this.needsRun(symbol, today)) {
      const job = await this.startOrJoin(symbol, today);
      if (job) return { status: 'processing', jobId: job.id };
    }
    return this.served(symbol);
  }

  async status(symbol: string, jobId: string): Promise<InvestmentViewResponse> {
    const job = await this.store.job(jobId);
    if (!job || job.symbol !== symbol) return this.view(symbol);
    if (job.status === 'running') {
      const stale = Date.now() - Date.parse(job.heartbeatAt) > JOB_STALE_AFTER_MS;
      // The worker that held the lease died: take over instead of waiting for it (§26).
      if (stale) return this.view(symbol);
      return { status: 'processing', jobId: job.id };
    }
    return this.served(symbol);
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    await Promise.allSettled(this.running.values());
  }

  /**
   * Backend-only change check (§13.3): unprocessed reports, claims not matched yet, theses
   * waiting for a summary (left over by a failed run), or evidence/targets aged out.
   */
  private async needsRun(symbol: string, today: string): Promise<boolean> {
    const last = await this.store.lastJob(symbol);
    if (
      last?.status === 'failed' &&
      last.finishedAt &&
      Date.now() - Date.parse(last.finishedAt) < RETRY_COOLDOWN_MS
    )
      return false;
    const from = windowStart(today);
    const reports = await this.store.activeReports(symbol, from);
    if (reports.some((report) => report.processStatus === 'pending')) return true;
    if ((await this.store.unmatchedClaims(symbol, from)).length > 0) return true;
    const [theses, links, claims] = await Promise.all([
      this.store.theses(symbol),
      this.store.thesisLinks(symbol),
      this.store.activeClaims(symbol, from),
    ]);
    const evidence = thesisEvidence(theses, links, claims, today);
    const shortlist = buildShortlist(theses, evidence);
    if (theses.some((thesis) => shortlist.has(thesis.id) && thesis.needsRewrite)) return true;
    const published = await this.store.published(symbol);
    if (!published) return false;
    // Published theses whose broker evidence changed since their summary was written.
    const shown = new Set(published.theses.map((item) => item.id));
    for (const thesis of theses) {
      if (!shown.has(thesis.id)) continue;
      const brokers = evidence.get(thesis.id)?.brokers ?? [];
      if (
        brokers.length === 0 ||
        thesis.summaryBrokers.some((broker) => !brokers.includes(broker))
      ) {
        if (!(await this.blockedSinceLastRun(symbol))) return true;
      }
    }
    // A target in the published valuation fell out of the 30-day window: recompute (0 token).
    if (published.valuation.targets.some((target) => !isWithinWindow(target.reportDate, today)))
      return !(await this.blockedSinceLastRun(symbol));
    return false;
  }

  /** After a circuit-breaker block, the same inputs must not run again on every search. */
  private async blockedSinceLastRun(symbol: string): Promise<boolean> {
    return (await this.store.lastBlockedFingerprint(symbol)) !== null;
  }

  private async startOrJoin(symbol: string, today: string): Promise<ResearchJob | null> {
    if (this.shuttingDown) return null;
    const lease = await this.store.acquireJob(symbol, JOB_STALE_AFTER_MS);
    if (!lease.acquired) return lease.job;
    const job = lease.job;
    const task = this.execute(job, symbol, today).finally(() => this.running.delete(job.id));
    this.running.set(job.id, task);
    return job;
  }

  private async execute(job: ResearchJob, symbol: string, today: string): Promise<void> {
    const timer = setInterval(() => {
      void this.store.heartbeat(job.id).catch(() => undefined);
    }, HEARTBEAT_EVERY_MS);
    timer.unref?.();
    try {
      const outcome = await this.engine.run(symbol, today, () => this.store.heartbeat(job.id));
      if (outcome.status === 'blocked')
        await this.store.finishJob(job.id, 'blocked', {
          inputFingerprint: outcome.fingerprint,
          llmCalls: outcome.llmCalls,
          error: outcome.reason,
        });
      else if (outcome.status === 'failed')
        await this.store.finishJob(job.id, 'failed', {
          llmCalls: outcome.llmCalls,
          error: outcome.error,
        });
      else await this.store.finishJob(job.id, 'done', { llmCalls: outcome.llmCalls });
    } catch (error) {
      this.logger.error(
        `research job ${job.id} for ${symbol} crashed: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.store
        .finishJob(job.id, 'failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        .catch(() => undefined);
    } finally {
      clearInterval(timer);
    }
  }

  /** The stored view, without theses that lost all evidence, priced at the live quote (§22.2). */
  private async served(symbol: string): Promise<InvestmentViewResponse> {
    const published = await this.store.published(symbol);
    if (!published) return { status: 'empty' };
    const live = new Set(
      (await this.store.theses(symbol))
        .filter((t) => t.status === 'active' || t.status === 'updated')
        .map((t) => t.id),
    );
    const theses = published.theses
      .filter((item) => live.has(item.id))
      .map((item, index) => ({ ...item, order: index + 1 }));
    const valuation = await this.valuation(published);
    if (theses.length === 0 && !valuation) return { status: 'empty' };
    return { status: 'ready', version: published.version, theses, valuation };
  }

  private async valuation(published: PublishedView) {
    if (published.valuation.hiddenReason) return null;
    const price = await this.price.currentPrice(published.symbol).catch(() => null);
    return servedValuation(published.valuation, price);
  }
}
