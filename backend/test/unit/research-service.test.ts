// ResearchService.view/status: change check without AI, per-symbol lease, background execution with
// heartbeat, served view priced live (spec §13, §26, §28, §33). Engine, validators, valuation and
// ordering are the real implementations; store/AI/price/files are fakes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JOB_STALE_AFTER_MS, RETRY_COOLDOWN_MS, ResearchService } from '../../src/modules/research/research.service.js';
import type { InvestmentViewResponse } from '../../src/modules/research/research.types.js';
import { TODAY } from './research-engine-helpers.js';
import {
  type Harness,
  NOW_ISO,
  SYMBOL,
  ec,
  instantBackoff,
  isoDaysBefore,
  makeHarness,
  pendingReport,
} from './research-orchestrator-helpers.js';

vi.mock('../../src/modules/research/pdf-text.js', () => ({
  extractPdfText: vi.fn(async (bytes: Uint8Array) => {
    const path = new TextDecoder().decode(bytes);
    if (path.includes('corrupt')) throw new Error('Cannot read PDF: corrupt');
    return { text: `text of ${path}`, pages: 1 };
  }),
}));

const A = 'VIETCAP';
const B = 'VDSC';
const C = 'SSI';
const day = (n: number) => isoDaysBefore(TODAY, n);

let h: Harness;
let svc: ResearchService;
let restoreTimers: (() => void) | null = null;

beforeEach(() => {
  // Only the clock and the heartbeat interval are fake; promises and setImmediate stay real.
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(NOW_ISO)); // 12:00 in Ho Chi Minh -> vnToday() === TODAY
  h = makeHarness();
  svc = new ResearchService(h.store, h.price, h.engine);
});
afterEach(() => {
  restoreTimers?.();
  restoreTimers = null;
  vi.useRealTimers();
});

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

async function settle(jobId: string) {
  for (let i = 0; i < 2_000; i += 1) {
    const job = await h.store.job(jobId);
    if (job && job.status !== 'running') return job;
    await tick();
  }
  throw new Error(`job ${jobId} did not finish`);
}

function processing(res: InvestmentViewResponse): string {
  if (res.status !== 'processing') throw new Error(`expected processing, got ${res.status}`);
  return res.jobId;
}
function ready(res: InvestmentViewResponse) {
  if (res.status !== 'ready') throw new Error(`expected ready, got ${res.status}`);
  return res;
}

/** Two brokers with targets; alpha is backed by both, beta by B only. */
function seedReports(aAge = 5, bAge = 2) {
  h.store.addReport(pendingReport('ra', A, day(aAge), { targetPriceVnd: 100_000, targetSource: 'metadata' }));
  h.store.addReport(pendingReport('rb', B, day(bAge), { targetPriceVnd: 120_000, targetSource: 'metadata' }));
  h.ai.extractions.set('ra', { claims: [ec({ driver: 'alpha' })], target: null });
  h.ai.extractions.set('rb', { claims: [ec({ driver: 'alpha' }), ec({ driver: 'beta' })], target: null });
}

/** First search, settled: leaves published v1 in the store. */
async function publishV1(aAge = 5, bAge = 2) {
  seedReports(aAge, bAge);
  const jobId = processing(await svc.view(SYMBOL));
  await settle(jobId);
  return jobId;
}

describe('first search (acceptance 8, 9, 10)', () => {
  it('8: a symbol with no reports answers empty without a job or an AI call', async () => {
    expect(await svc.view(SYMBOL)).toEqual({ status: 'empty' });
    expect(h.store.jobs).toHaveLength(0);
    expect(h.ai.totalCalls).toBe(0);
  });

  it('9: first search -> processing + jobId; after the job, status() is ready with theses + valuation; version 1', async () => {
    seedReports();
    const first = await svc.view(SYMBOL);
    expect(first).toEqual({ status: 'processing', jobId: expect.any(String) });
    const jobId = processing(first);

    const job = await settle(jobId);
    expect(job).toMatchObject({ status: 'done', llmCalls: 4, symbol: SYMBOL });

    const view = ready(await svc.status(SYMBOL, jobId));
    expect(view.version).toBe(1);
    expect(view.theses.map((t) => t.order)).toEqual([1, 2]);
    expect(view.valuation).toEqual({
      mode: 'range',
      targetMedian: 110_000,
      targetMin: 100_000,
      targetMax: 120_000,
      currentPrice: 90_000,
      upsidePercent: 22.2,
    });
    expect(h.store.versionNumbers).toEqual([1]);
    expect(h.store.heartbeats).toBeGreaterThan(0); // engine progress doubles as the lease heartbeat
  });

  it('10: search again with nothing new -> ready from the store, 0 AI calls, no new job', async () => {
    await publishV1();
    const calls = h.ai.totalCalls;

    const again = ready(await svc.view(SYMBOL));

    expect(again.version).toBe(1);
    expect(h.ai.totalCalls).toBe(calls);
    expect(h.store.jobs).toHaveLength(1);
    expect(h.store.touched).toBe(0);
  });

  it('15: one unreadable PDF is marked failed, the others are processed and the view published', async () => {
    h.store.addReport(pendingReport('ra', A, day(5), { targetPriceVnd: 100_000, targetSource: 'metadata' }));
    h.store.addReport(pendingReport('bad', B, day(4), { filePath: 'research/corrupt.pdf' }));
    const jobId = processing(await svc.view(SYMBOL));
    await settle(jobId);

    expect(h.store.processFailures.map((f) => f.id)).toEqual(['bad']);
    expect(h.store.report('ra').processStatus).toBe('processed');
    const view = ready(await svc.status(SYMBOL, jobId));
    expect(view.theses).toHaveLength(1);
  });
});

describe('one lease per symbol (acceptance 11, 12, 13, 26)', () => {
  it('11: concurrent view() calls while running share one jobId and the AI runs once', async () => {
    seedReports();
    let release!: () => void;
    h.ai.gate = new Promise<void>((resolve) => (release = resolve));

    const answers = await Promise.all(Array.from({ length: 25 }, () => svc.view(SYMBOL)));
    const ids = new Set(answers.map(processing));
    expect(ids.size).toBe(1);
    const jobId = [...ids][0]!;
    expect(processing(await svc.status(SYMBOL, jobId))).toBe(jobId); // still running
    expect(h.store.jobs).toHaveLength(1);

    release();
    await settle(jobId);

    expect(h.ai.extractCalls.sort()).toEqual(['ra', 'rb']);
    expect(h.ai.matchCalls).toBe(1);
    expect(h.ai.buildCalls).toHaveLength(1);
    const results = await Promise.all(answers.map(() => svc.status(SYMBOL, jobId)));
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
    expect(ready(results[0]!).version).toBe(1);
  });

  it('a different symbol is not blocked by the running one', async () => {
    seedReports();
    h.store.addReport(pendingReport('rx', A, day(3), { symbol: 'FPT' }));
    h.ai.gate = new Promise<void>(() => undefined); // VIC never finishes
    const vic = processing(await svc.view(SYMBOL));
    const fpt = processing(await svc.view('FPT'));
    expect(fpt).not.toBe(vic);
  });

  it('12: a slow job keeps its lease alive through the heartbeat interval (no takeover, no timeout)', async () => {
    seedReports();
    let release!: () => void;
    h.ai.gate = new Promise<void>((resolve) => (release = resolve));
    const jobId = processing(await svc.view(SYMBOL));
    const beats = h.store.heartbeats;

    // Well past JOB_STALE_AFTER_MS: only the 15 s heartbeat keeps the lease live.
    await vi.advanceTimersByTimeAsync(JOB_STALE_AFTER_MS * 3);

    expect(h.store.heartbeats).toBeGreaterThan(beats + 10);
    expect(processing(await svc.status(SYMBOL, jobId))).toBe(jobId);
    expect(processing(await svc.view(SYMBOL))).toBe(jobId);
    expect(h.store.jobs).toHaveLength(1);

    release();
    expect((await settle(jobId)).status).toBe('done');
    const stopped = h.store.heartbeats;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.store.heartbeats).toBe(stopped); // interval cleared when the job ends
  });

  it('13: a running job with a stale heartbeat is taken over by status(): new job acquired and completed', async () => {
    seedReports();
    const dead = h.store.seedRunningJob(SYMBOL, Date.now() - JOB_STALE_AFTER_MS - 10_000);

    const res = await svc.status(SYMBOL, dead.id);

    const newId = processing(res);
    expect(newId).not.toBe(dead.id);
    expect(h.store.jobs.find((j) => j.id === dead.id)).toMatchObject({ status: 'failed', errorMessage: 'lease expired' });
    expect((await settle(newId)).status).toBe('done');
    expect(ready(await svc.status(SYMBOL, newId)).version).toBe(1);
    expect(h.ai.matchCalls).toBe(1);
  });

  it('13: a running job with a fresh heartbeat is awaited, not taken over', async () => {
    seedReports();
    const alive = h.store.seedRunningJob(SYMBOL, Date.now() - 30_000);
    expect(await svc.status(SYMBOL, alive.id)).toEqual({ status: 'processing', jobId: alive.id });
    expect(h.store.jobs).toHaveLength(1);
    expect(h.ai.totalCalls).toBe(0);
    // view() joins the live lease as well.
    expect(processing(await svc.view(SYMBOL))).toBe(alive.id);
  });

  it('status() with an unknown job id or another symbol job falls back to view()', async () => {
    seedReports();
    const otherSymbolJob = h.store.seedRunningJob('FPT', Date.now());
    const fromUnknown = processing(await svc.status(SYMBOL, 'nope'));
    await settle(fromUnknown);
    const fromOther = await svc.status(SYMBOL, otherSymbolJob.id);
    expect(ready(fromOther).version).toBe(1);
  });

  it('shutdown waits for running jobs and refuses to start new ones', async () => {
    seedReports();
    let release!: () => void;
    h.ai.gate = new Promise<void>((resolve) => (release = resolve));
    const jobId = processing(await svc.view(SYMBOL));
    let drained = false;
    const shutdown = svc.onApplicationShutdown().then(() => (drained = true));
    await tick();
    expect(drained).toBe(false);

    release();
    await shutdown;
    expect((await h.store.job(jobId))?.status).toBe('done');

    h.store.addReport(pendingReport('rc', C, day(1)));
    expect((await svc.view(SYMBOL)).status).not.toBe('processing');
  });
});

describe('failures (acceptance 14) and AI budget', () => {
  it('14: AI keeps failing -> job failed; the stored view is still served; first-time symbols stay empty', async () => {
    restoreTimers = instantBackoff();
    // No stored view yet: the block hides itself.
    h.store.addReport(pendingReport('ra', A, day(5)));
    h.ai.matchError = new Error('match 500');
    const first = processing(await svc.view(SYMBOL));
    expect(await settle(first)).toMatchObject({ status: 'failed', errorMessage: 'match 500' });
    expect(await svc.status(SYMBOL, first)).toEqual({ status: 'empty' });
  });

  it('14: with a stored view, a failed job keeps serving it', async () => {
    await publishV1();
    restoreTimers = instantBackoff();
    h.store.addReport(pendingReport('rc', C, day(1)));
    h.ai.extractions.set('rc', { claims: [ec({ driver: 'gamma' })], target: null });
    h.ai.matchError = new Error('match 500');

    const jobId = processing(await svc.view(SYMBOL));
    const job = await settle(jobId);

    expect(job.status).toBe('failed');
    expect(job.llmCalls).toBe(4); // extract + 3 failed matches
    const view = ready(await svc.status(SYMBOL, jobId));
    expect(view.version).toBe(1);
    expect(h.store.versionNumbers).toEqual([1]);
  });

  it('14: extraction failure -> report stays pending, stored view served, the next search retries and publishes', async () => {
    await publishV1();
    restoreTimers = instantBackoff();
    h.store.addReport(pendingReport('rc', C, day(1)));
    h.ai.extractions.set('rc', { claims: [ec({ driver: 'gamma' })], target: null });
    h.ai.extractError = new Error('503');
    const failed = processing(await svc.view(SYMBOL));
    await settle(failed);
    expect(h.store.report('rc').processStatus).toBe('pending'); // first failure is retryable
    expect(ready(await svc.status(SYMBOL, failed)).version).toBe(1);

    h.ai.extractError = null; // AI is back: the next search starts a fresh job for the pending report
    const retry = processing(await svc.view(SYMBOL));
    expect(retry).not.toBe(failed);
    await settle(retry);
    const view = ready(await svc.status(SYMBOL, retry));
    expect(view.version).toBe(2);
    expect(view.theses).toHaveLength(3);
  });

  it('14: after a failed matching step the stored view is served during the cooldown, then the next search retries and publishes', async () => {
    await publishV1();
    restoreTimers = instantBackoff();
    h.store.addReport(pendingReport('rc', C, day(1)));
    h.ai.extractions.set('rc', { claims: [ec({ driver: 'gamma' })], target: null });
    h.ai.matchError = new Error('match 500');
    expect((await settle(processing(await svc.view(SYMBOL)))).status).toBe('failed');
    expect(h.store.matched.size).toBe(3); // only the claims of the first run; gamma is left unmatched

    h.ai.matchError = null;
    const calls = h.ai.totalCalls;
    const jobs = h.store.jobs.length;
    expect(ready(await svc.view(SYMBOL)).version).toBe(1); // within the cooldown: no run, no AI
    expect(h.ai.totalCalls).toBe(calls);
    expect(h.store.jobs).toHaveLength(jobs);

    vi.setSystemTime(Date.now() + RETRY_COOLDOWN_MS + 1_000);
    const retry = processing(await svc.view(SYMBOL));
    expect((await settle(retry)).status).toBe('done');
    const view = ready(await svc.status(SYMBOL, retry));
    expect(view.version).toBe(2);
    expect(view.theses).toHaveLength(3);
    expect(h.ai.extractCalls.filter((id) => id === 'rc')).toHaveLength(1); // not extracted again
  });

  it('14: after a failed builder step on a first search the view stays empty during the cooldown, then the retry publishes', async () => {
    restoreTimers = instantBackoff();
    seedReports();
    h.ai.buildError = new Error('build 500');
    expect((await settle(processing(await svc.view(SYMBOL)))).status).toBe('failed');

    h.ai.buildError = null;
    const calls = h.ai.totalCalls;
    expect(await svc.view(SYMBOL)).toEqual({ status: 'empty' }); // within the cooldown
    expect(h.ai.totalCalls).toBe(calls);

    vi.setSystemTime(Date.now() + RETRY_COOLDOWN_MS + 1_000);
    const retry = processing(await svc.view(SYMBOL));
    expect((await settle(retry)).status).toBe('done');
    expect(ready(await svc.status(SYMBOL, retry)).version).toBe(1);
    expect(h.ai.matchCalls).toBe(1); // matching is not repeated, only the builder
  });

  it('budget: daily limit reached -> no AI call, job failed, stored view served; works again once capacity returns', async () => {
    await publishV1();
    const calls = h.ai.totalCalls;
    h.settings.RESEARCH_AI_DAILY_CALL_LIMIT = h.store.usageByDate.get(TODAY)!;
    h.store.addReport(pendingReport('rc', C, day(1)));

    const jobId = processing(await svc.view(SYMBOL));
    const job = await settle(jobId);

    expect(job).toMatchObject({ status: 'failed', errorMessage: 'RESEARCH_AI_BUDGET_EXCEEDED', llmCalls: 0 });
    expect(h.ai.totalCalls).toBe(calls);
    expect(ready(await svc.status(SYMBOL, jobId)).version).toBe(1);

    h.settings.RESEARCH_AI_DAILY_CALL_LIMIT = 1_000;
    // The failed job starts a cooldown: searches serve the stored view without a new run...
    expect(ready(await svc.view(SYMBOL)).version).toBe(1);
    expect(h.store.jobs).toHaveLength(2);
    // ...and once it is over, the pending report is picked up.
    vi.setSystemTime(Date.now() + RETRY_COOLDOWN_MS + 1_000);
    const retry = processing(await svc.view(SYMBOL));
    expect((await settle(retry)).status).toBe('done');
    expect(h.store.report('rc').processStatus).toBe('processed');
  });
});

describe('expiry-driven runs (acceptance 6, 7)', () => {
  it('6: a thesis whose only evidence turned 31 days old is removed with 0 AI calls and a new version', async () => {
    h.store.addReport(pendingReport('ra', A, day(20), { targetPriceVnd: 100_000, targetSource: 'metadata' }));
    h.store.addReport(pendingReport('rb', B, day(3), { targetPriceVnd: 110_000, targetSource: 'metadata' }));
    h.ai.extractions.set('ra', { claims: [ec({ driver: 'alpha' })], target: null });
    h.ai.extractions.set('rb', { claims: [ec({ driver: 'beta' })], target: null });
    await settle(processing(await svc.view(SYMBOL)));
    const calls = h.ai.totalCalls;
    expect(ready(await svc.view(SYMBOL)).theses).toHaveLength(2);

    vi.setSystemTime(new Date('2026-10-27T05:00:00Z')); // A is 31 days old
    const jobId = processing(await svc.view(SYMBOL));
    await settle(jobId);

    expect(h.ai.totalCalls).toBe(calls);
    const view = ready(await svc.status(SYMBOL, jobId));
    expect(view.version).toBe(2);
    expect(view.theses).toHaveLength(1);
    expect(view.theses[0]!.title).toContain('beta');
  });

  it('7: a thesis losing 1 of 2 brokers is rewritten alone, other theses keep their text', async () => {
    await publishV1(20, 3); // alpha: A+B, beta: B only
    const calls = { extract: h.ai.extractCalls.length, match: h.ai.matchCalls, build: h.ai.buildCalls.length };

    vi.setSystemTime(new Date('2026-10-27T05:00:00Z'));
    const jobId = processing(await svc.view(SYMBOL));
    await settle(jobId);

    expect(h.ai.extractCalls).toHaveLength(calls.extract);
    expect(h.ai.matchCalls).toBe(calls.match);
    expect(h.ai.buildCalls).toHaveLength(calls.build + 1);
    expect(h.ai.buildCalls.at(-1)!.inputs.map((i) => i.canonicalDriver)).toEqual(['alpha']);
    expect(ready(await svc.status(SYMBOL, jobId)).theses).toHaveLength(2);
  });

  it('a target ageing out of the window is recomputed with 0 AI calls', async () => {
    h.store.addReport(pendingReport('ra', A, day(20), { targetPriceVnd: 100_000, targetSource: 'metadata' }));
    h.store.addReport(pendingReport('rb', B, day(3), { targetPriceVnd: 120_000, targetSource: 'metadata' }));
    h.ai.extractions.set('ra', { claims: [], target: null }); // A contributes a target only
    h.ai.extractions.set('rb', { claims: [ec({ driver: 'alpha' })], target: null });
    await settle(processing(await svc.view(SYMBOL)));
    expect(ready(await svc.view(SYMBOL)).valuation).toMatchObject({ mode: 'range', targetMedian: 110_000 });
    const calls = h.ai.totalCalls;

    vi.setSystemTime(new Date('2026-10-27T05:00:00Z'));
    const jobId = processing(await svc.view(SYMBOL));
    await settle(jobId);

    expect(h.ai.totalCalls).toBe(calls);
    const view = ready(await svc.status(SYMBOL, jobId));
    expect(view.version).toBe(2);
    expect(view.valuation).toMatchObject({ mode: 'single', targetMedian: 120_000 });
  });
});

describe('circuit breaker (acceptance 27)', () => {
  async function blockedScenario() {
    h.store.addReport(pendingReport('ra', A, day(10), { targetPriceVnd: 100_000, targetSource: 'metadata' }));
    await settle(processing(await svc.view(SYMBOL)));
    h.store.addReport(pendingReport('rb', B, day(1), { targetPriceVnd: 200_000, targetSource: 'metadata' }));
    const jobId = processing(await svc.view(SYMBOL));
    return { jobId, job: await settle(jobId) };
  }

  it('27: median target jumping > 30% -> job blocked, previous version served, same inputs do not start another AI run', async () => {
    const { jobId, job } = await blockedScenario();

    expect(job.status).toBe('blocked');
    expect(job.errorMessage).toMatch(/median target moved 50\.0%/);
    expect(job.inputFingerprint).toMatch(/^[0-9a-f]{64}$/);
    const view = ready(await svc.status(SYMBOL, jobId));
    expect(view.version).toBe(1);
    expect(view.valuation).toMatchObject({ mode: 'single', targetMedian: 100_000 });

    const calls = h.ai.totalCalls;
    for (let i = 0; i < 3; i += 1) expect(ready(await svc.view(SYMBOL)).version).toBe(1);
    expect(h.ai.totalCalls).toBe(calls);
    expect(h.store.jobs).toHaveLength(2);
  });

  it('27: while blocked, an evidence/target ageing-out does not retrigger a run either', async () => {
    await blockedScenario();
    const jobs = h.store.jobs.length;
    vi.setSystemTime(new Date('2026-11-06T05:00:00Z')); // A (the published target, dated 10 days ago) is now 31 days old
    expect(ready(await svc.view(SYMBOL)).version).toBe(1);
    expect(h.store.jobs).toHaveLength(jobs);
  });

  it('27: a genuinely new report after a block starts a new run', async () => {
    await blockedScenario();
    h.store.addReport(pendingReport('rc', C, day(0)));
    const next = processing(await svc.view(SYMBOL));
    expect(next).not.toBe(h.store.jobs[1]!.id);
  });
});

describe('price changes (acceptance 28, 33)', () => {
  it('28/33: a price change only recomputes the served upside, 0 AI calls, no job, no new version', async () => {
    await publishV1(); // median 110000
    const calls = h.ai.totalCalls;
    const jobs = h.store.jobs.length;

    h.price.value = 100_000;
    expect(ready(await svc.view(SYMBOL)).valuation).toMatchObject({ currentPrice: 100_000, upsidePercent: 10 });
    h.price.value = 137_500;
    const lower = ready(await svc.view(SYMBOL));
    expect(lower.valuation).toMatchObject({ currentPrice: 137_500, upsidePercent: -20 });
    expect(lower.version).toBe(1);

    expect(h.ai.totalCalls).toBe(calls);
    expect(h.store.jobs).toHaveLength(jobs);
    expect(h.store.versionNumbers).toEqual([1]);
  });

  it('28: spec example, target median 180k: price 150k -> 20%, price 160k -> 12.5%', async () => {
    h.store.addReport(pendingReport('ra', A, day(5), { targetPriceVnd: 180_000, targetSource: 'metadata' }));
    h.price.value = 150_000;
    await settle(processing(await svc.view(SYMBOL)));
    expect(ready(await svc.view(SYMBOL)).valuation).toMatchObject({ mode: 'single', upsidePercent: 20 });
    h.price.value = 160_000;
    expect(ready(await svc.view(SYMBOL)).valuation).toMatchObject({ upsidePercent: 12.5 });
  });

  it('an unavailable quote serves the view without a percentage', async () => {
    await publishV1();
    h.price.value = null;
    expect(ready(await svc.view(SYMBOL)).valuation).toMatchObject({ currentPrice: null, upsidePercent: null });
    h.price.currentPrice.mockRejectedValueOnce(new Error('down'));
    expect(ready(await svc.view(SYMBOL)).valuation).toMatchObject({ currentPrice: null, upsidePercent: null });
  });

  it('32: theses without any target are served with valuation null', async () => {
    h.store.addReport(pendingReport('ra', A, day(5)));
    await settle(processing(await svc.view(SYMBOL)));
    const view = ready(await svc.view(SYMBOL));
    expect(view.theses).toHaveLength(1);
    expect(view.valuation).toBeNull();
  });
});
