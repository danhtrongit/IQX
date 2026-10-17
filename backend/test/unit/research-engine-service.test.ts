// ResearchEngineService.run: extraction -> matching -> evidence/expiry -> builder -> validators ->
// ordering/valuation -> fingerprint -> circuit breaker -> publish (spec §13, §21, §24-§26).
// Real pure engine functions; only the store, AI, price and file ports are fakes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimMatch } from '../../src/modules/research/research.types.js';
import { TODAY } from './research-engine-helpers.js';
import {
  type Harness,
  SYMBOL,
  defaultMatch,
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
const day = (n: number) => isoDaysBefore(TODAY, n);

let h: Harness;
let progress = 0;
let restoreTimers: (() => void) | null = null;

beforeEach(() => {
  h = makeHarness();
  progress = 0;
});
afterEach(() => {
  restoreTimers?.();
  restoreTimers = null;
});

const run = (today = TODAY) =>
  h.engine.run(SYMBOL, today, async () => {
    progress += 1;
  });
const thesisByDriver = (driver: string) => {
  const found = h.store.thesisRows.find((t) => t.canonicalDriver === driver);
  if (!found) throw new Error(`no thesis ${driver}`);
  return found;
};
const truncated = () =>
  Object.assign(new Error('AI output truncated'), {
    getResponse: () => ({ code: 'AI_OUTPUT_TRUNCATED' }),
  });
const claimMatch = (
  over: Partial<ClaimMatch> & Pick<ClaimMatch, 'claimId' | 'relationship'>,
): ClaimMatch => ({
  thesisId: null,
  newThesisKey: null,
  invalidatesThesis: false,
  match: { driver: true, mechanism: true, direction: true, reason: 'r' },
  ...over,
});

/** Run 1 of most scenarios: two brokers, alpha backed by both, beta only by B. */
async function firstRunTwoBrokers(aAge = 20, bAge = 3) {
  h.store.addReport(
    pendingReport('ra', A, day(aAge), { targetPriceVnd: 100_000, targetSource: 'metadata' }),
  );
  h.store.addReport(
    pendingReport('rb', B, day(bAge), { targetPriceVnd: 110_000, targetSource: 'metadata' }),
  );
  h.ai.extractions.set('ra', { claims: [ec({ driver: 'alpha' })], target: null });
  h.ai.extractions.set('rb', {
    claims: [ec({ driver: 'alpha' }), ec({ driver: 'beta' })],
    target: null,
  });
  return run();
}

describe('research engine: first run (acceptance 9)', () => {
  it('9: extracts, matches, builds once and publishes version 1 with theses + valuation', async () => {
    const outcome = await firstRunTwoBrokers();

    expect(outcome).toMatchObject({ status: 'done', published: 1 });
    expect(h.ai.extractCalls.sort()).toEqual(['ra', 'rb']);
    expect(h.ai.matchCalls).toBe(1);
    expect(h.ai.buildCalls).toHaveLength(1); // both theses in one builder call
    expect(outcome.llmCalls).toBe(4);
    expect(h.store.usageByDate.get(TODAY)).toBe(4);

    expect(h.store.versionNumbers).toEqual([1]);
    const view = h.store.publishedRow!;
    expect(view.theses.map((t) => t.order)).toEqual([1, 2]);
    expect(view.theses.map((t) => t.id).sort()).toEqual(['VIC_THESIS_001', 'VIC_THESIS_002']);
    expect(view.valuation).toMatchObject({
      targetMedian: 105_000,
      targetMin: 100_000,
      targetMax: 110_000,
      hiddenReason: null,
    });
    expect(h.store.reports.every((r) => r.processStatus === 'processed')).toBe(true);
    expect(
      h.store.brokerViews
        .get(SYMBOL)
        ?.map((v) => v.broker)
        .sort(),
    ).toEqual([B, A]);
    expect(progress).toBeGreaterThanOrEqual(3);
  });

  it('26: a broker reports are extracted oldest first', async () => {
    h.store.addReport(pendingReport('new', A, day(2)));
    h.store.addReport(pendingReport('old', A, day(9)));
    await run();
    expect(h.ai.extractCalls).toEqual(['old', 'new']);
  });

  it('the extracted target fills an empty slot but never overwrites the metadata one', async () => {
    h.store.addReport(pendingReport('ra', A, day(5)));
    h.store.addReport(
      pendingReport('rb', B, day(4), { targetPriceVnd: 120_000, targetSource: 'metadata' }),
    );
    h.ai.extractions.set('ra', {
      claims: [ec({ driver: 'alpha' })],
      target: { targetPriceVnd: 100_000, horizon: '12 tháng' },
    });
    h.ai.extractions.set('rb', {
      claims: [ec({ driver: 'alpha' })],
      target: { targetPriceVnd: 999_000, horizon: null },
    });
    await run();
    expect(h.store.report('ra')).toMatchObject({
      targetPriceVnd: 100_000,
      targetSource: 'extracted',
    });
    expect(h.store.report('rb')).toMatchObject({
      targetPriceVnd: 120_000,
      targetSource: 'metadata',
    });
  });

  it('nothing worth showing and nothing published yet -> no version', async () => {
    h.store.addReport(pendingReport('ra', A, day(5)));
    h.ai.extractions.set('ra', { claims: [], target: null });
    const outcome = await run();
    expect(outcome).toMatchObject({ status: 'done', published: null });
    expect(h.store.versions).toHaveLength(0);
    expect(h.ai.matchCalls).toBe(0);
  });

  it('a price outage does not stop valuation (ratio check is skipped)', async () => {
    h.price.currentPrice.mockRejectedValue(new Error('quote down'));
    await firstRunTwoBrokers();
    expect(h.store.publishedRow!.valuation.targetMedian).toBe(105_000);
  });

  it('31: a dilutive event after the report date hides the valuation but keeps the theses', async () => {
    h.store.dilutive = [{ symbol: SYMBOL, exDate: day(1), eventCode: 'DIV' }];
    await firstRunTwoBrokers();
    const view = h.store.publishedRow!;
    expect(view.valuation.hiddenReason).toBe('corporate_action');
    expect(view.theses).toHaveLength(2);
  });
});

describe('research engine: nothing new (acceptance 10, 23)', () => {
  it('10: running again with nothing new makes 0 AI calls, no new version, only touchPublished', async () => {
    await firstRunTwoBrokers();
    const calls = h.ai.totalCalls;
    const second = await run();
    expect(second).toMatchObject({ status: 'done', published: null, llmCalls: 0 });
    expect(h.ai.totalCalls).toBe(calls);
    expect(h.store.versionNumbers).toEqual([1]);
    expect(h.store.touched).toBe(1);
  });

  it('23: a new report that only SUPPORTs an existing thesis: no builder call, same fingerprint, no new version', async () => {
    h.store.addReport(
      pendingReport('ra', A, day(10), { targetPriceVnd: 100_000, targetSource: 'metadata' }),
    );
    await run();
    const buildsBefore = h.ai.buildCalls.length;

    const updatesBefore = h.store.updates.length;
    h.store.addReport(pendingReport('rb', B, day(1))); // no target, claim restates alpha
    const second = await run();

    expect(h.ai.extractCalls).toEqual(['ra', 'rb']);
    expect(h.ai.matchCalls).toBe(2);
    expect(h.ai.buildCalls).toHaveLength(buildsBefore);
    expect(second).toMatchObject({ status: 'done', published: null });
    expect(h.store.versionNumbers).toEqual([1]);
    expect(h.store.touched).toBe(1);
    expect(
      h.store.updates.slice(updatesBefore).filter((u) => u.patch.needsRewrite === true),
    ).toHaveLength(0);
  });
});

describe('research engine: 30-day window (acceptance 5, 6, 7)', () => {
  it('5: evidence exactly 30 days old is still active -> no change', async () => {
    await firstRunTwoBrokers(20, 3);
    const calls = h.ai.totalCalls;
    // A is 20 days old on day 0: exactly 30 days on day +10.
    const out = await run('2026-10-26');
    expect(out).toMatchObject({ status: 'done', published: null });
    expect(h.ai.totalCalls).toBe(calls);
  });

  it('6: a thesis whose only evidence is 31 days old is removed with 0 AI calls and a new version', async () => {
    await firstRunTwoBrokers(20, 3); // alpha: A+B, beta: B only
    // Make alpha rest on A alone: drop B's alpha claim from the evidence.
    h.store.claims = h.store.claims.filter((c) => !(c.broker === B && c.driver === 'alpha'));
    const calls = h.ai.totalCalls;

    const out = await run('2026-10-27'); // A is now 31 days old
    expect(out).toMatchObject({ status: 'done', published: 2, llmCalls: 0 });
    expect(h.ai.totalCalls).toBe(calls);
    expect(thesisByDriver('alpha').status).toBe('expired');
    expect(h.store.publishedRow!.theses.map((t) => t.id)).toEqual([thesisByDriver('beta').id]);
    expect(h.store.versionNumbers).toEqual([1, 2]);
    // A's target left the window too.
    expect(h.store.publishedRow!.valuation.targets.map((t) => t.broker)).toEqual([B]);
  });

  it('7: a thesis losing 1 of 2 brokers to expiry is rewritten alone (builder sees only that thesis)', async () => {
    await firstRunTwoBrokers(20, 3); // alpha: A+B, beta: B only
    const alpha = thesisByDriver('alpha');
    const beta = thesisByDriver('beta');
    const before = {
      extract: h.ai.extractCalls.length,
      match: h.ai.matchCalls,
      build: h.ai.buildCalls.length,
    };
    h.ai.buildFn = (inputs) =>
      inputs.map((i) => ({
        thesisId: i.thesisId,
        title: `Động lực ${i.canonicalDriver}`,
        summary: 'Còn một nguồn ủng hộ yếu tố này',
        materiality: 3,
      }));

    const out = await run('2026-10-27');

    expect(out).toMatchObject({ status: 'done', published: 2, llmCalls: 1 });
    expect(h.ai.extractCalls).toHaveLength(before.extract);
    expect(h.ai.matchCalls).toBe(before.match);
    expect(h.ai.buildCalls).toHaveLength(before.build + 1);
    const call = h.ai.buildCalls.at(-1)!;
    expect(call.inputs.map((i) => i.thesisId)).toEqual([alpha.id]);
    expect(call.inputs[0]!.evidence).toHaveLength(1);
    expect(call.inputs[0]!.previousSummary).toContain('alpha');
    expect(h.store.thesis(alpha.id)).toMatchObject({ summaryBrokers: [B], needsRewrite: false });
    expect(h.store.thesis(alpha.id).currentSummary).toBe('Còn một nguồn ủng hộ yếu tố này');
    expect(h.store.thesis(beta.id).currentSummary).toContain('beta'); // untouched
  });

  it('the builder evidence is addressed by anonymous refs (B1, B2), never by broker name', async () => {
    await firstRunTwoBrokers();
    const refs = h.ai.buildCalls[0]!.inputs.flatMap((i) => i.evidence.map((e) => e.brokerRef));
    expect(refs.length).toBe(3);
    expect(refs.every((ref) => /^B\d+$/.test(ref))).toBe(true);
  });

  it('the builder evidence claim is content only: no id, report, broker, symbol, date or status', async () => {
    await firstRunTwoBrokers();
    const claims = h.ai.buildCalls[0]!.inputs.flatMap((i) => i.evidence.map((e) => e.claim));
    expect(claims.length).toBe(3);
    for (const claim of claims) {
      expect(Object.keys(claim).sort()).toEqual([
        'claimType',
        'direction',
        'driver',
        'mechanism',
        'numbers',
        'outcome',
        'sourcePage',
        'subject',
        'summary',
        'timeHorizon',
      ]);
      for (const key of ['id', 'reportId', 'broker', 'symbol', 'evidenceDate', 'status'])
        expect(claim).not.toHaveProperty(key);
    }
    // The evidence date travels beside the claim, not inside it.
    expect(
      h.ai.buildCalls[0]!.inputs.flatMap((i) => i.evidence.map((e) => e.evidenceDate)).every(
        Boolean,
      ),
    ).toBe(true);
  });
});

describe('research engine: chunked matching and builder', () => {
  const manyClaims = (n: number) =>
    Array.from({ length: n }, (_, i) => ec({ driver: 'alpha', summary: `ý ${i}` }));

  it('matches unmatched claims in chunks of 12 and marks each chunk once stored', async () => {
    h.store.addReport(pendingReport('ra', A, day(5)));
    h.ai.extractions.set('ra', { claims: manyClaims(30), target: null });
    const sizes: number[] = [];
    h.ai.matchFn = (theses, claims) => {
      sizes.push(claims.length);
      return defaultMatch(theses, claims);
    };

    const out = await run();

    expect(out).toMatchObject({ status: 'done', published: 1 });
    expect(sizes).toEqual([12, 12, 6]);
    expect(h.store.matched.size).toBe(30);
  });

  it('a failure in chunk 2 keeps chunk 1 matched and leaves chunk 2 and later unmatched; the next run resumes there', async () => {
    restoreTimers = instantBackoff();
    h.store.addReport(pendingReport('ra', A, day(5)));
    h.ai.extractions.set('ra', { claims: manyClaims(30), target: null });
    const first12 = new Set<string>();
    let failFrom = true;
    h.ai.matchFn = (theses, claims) => {
      if (first12.size === 0) for (const claim of claims) first12.add(claim.id);
      else if (failFrom && !claims.some((claim) => first12.has(claim.id)))
        throw new Error('match 500');
      return defaultMatch(theses, claims);
    };

    const out = await run();

    expect(out).toMatchObject({ status: 'failed', error: 'match 500' });
    expect(h.ai.matchCalls).toBe(1 + 3); // chunk 1 once, chunk 2 on every attempt
    expect(first12.size).toBe(12);
    expect([...h.store.matched].sort()).toEqual([...first12].sort());
    expect((await h.store.unmatchedClaims(SYMBOL, day(30))).length).toBe(18);
    expect(h.store.report('ra').processStatus).toBe('processed');

    failFrom = false;
    const extractions = h.ai.extractCalls.length;
    const retried = await run();

    expect(retried).toMatchObject({ status: 'done', published: 1 });
    expect(h.ai.extractCalls).toHaveLength(extractions); // the report is not extracted again
    expect(h.ai.matchCalls).toBe(4 + 2); // 12 + 6 remaining
    expect(h.store.matched.size).toBe(30);
  });

  it('runs the builder in groups of 4 theses, only for the 8-thesis shortlist', async () => {
    h.store.addReport(pendingReport('ra', A, day(5)));
    h.ai.extractions.set('ra', {
      claims: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9'].map((driver) =>
        ec({ driver }),
      ),
      target: null,
    });

    const out = await run();

    expect(out).toMatchObject({ status: 'done', published: 1 });
    expect(h.ai.buildCalls.map((call) => call.inputs.length)).toEqual([4, 4]);
    expect(h.store.thesisRows.filter((t) => t.currentTitle)).toHaveLength(8);
    // The 9th thesis waits (needsRewrite) until it gains brokers; it does not trigger extra builds.
    expect(h.store.thesisRows.filter((t) => !t.currentTitle && t.needsRewrite)).toHaveLength(1);
  });
});

describe('research engine: thesis lifecycle (acceptance 22)', () => {
  it('22: REPLACE with invalidatesThesis -> thesis invalidated, not shown, nothing rewritten', async () => {
    h.store.addReport(pendingReport('ra', A, day(10)));
    h.ai.extractions.set('ra', {
      claims: [ec({ driver: 'alpha' }), ec({ driver: 'beta' })],
      target: null,
    });
    await run();
    const alpha = thesisByDriver('alpha');
    const beta = thesisByDriver('beta');
    const builds = h.ai.buildCalls.length;

    h.store.addReport(pendingReport('rc', B, day(1)));
    h.ai.extractions.set('rc', {
      claims: [ec({ driver: 'alpha', direction: 'negative' })],
      target: null,
    });
    h.ai.matchFn = (_t, claims) => ({
      matches: claims.map((c) =>
        claimMatch({
          claimId: c.id,
          relationship: 'REPLACE',
          thesisId: alpha.id,
          invalidatesThesis: true,
        }),
      ),
      newTheses: [],
      disagreements: [],
    });

    const out = await run();

    expect(out).toMatchObject({ status: 'done', published: 2 });
    expect(h.store.thesis(alpha.id).status).toBe('invalidated');
    expect(h.store.publishedRow!.theses.map((t) => t.id)).toEqual([beta.id]);
    expect(h.store.publishedRow!.theses[0]!.order).toBe(1);
    expect(h.ai.buildCalls).toHaveLength(builds);
  });
});

describe('research engine: automatic checks (acceptance 24)', () => {
  it('24: untraceable number -> regenerated once with the failures -> still failing -> thesis dropped, others kept', async () => {
    h.store.addReport(pendingReport('ra', A, day(5)));
    h.ai.extractions.set('ra', {
      claims: [
        ec({ driver: 'alpha', numbers: [{ metric: 'tăng trưởng', value: 20, unit: '%' }] }),
        ec({ driver: 'beta' }),
      ],
      target: null,
    });
    h.ai.buildFn = (inputs) =>
      inputs.map((i) => ({
        thesisId: i.thesisId,
        title: `Động lực ${i.canonicalDriver}`,
        summary:
          i.canonicalDriver === 'alpha'
            ? 'Doanh thu tăng 55% nhờ mở rộng công suất'
            : 'Yếu tố beta hỗ trợ kết quả kinh doanh',
        materiality: 3,
      }));

    const out = await run();

    expect(h.ai.buildCalls).toHaveLength(2);
    const alpha = thesisByDriver('alpha');
    const beta = thesisByDriver('beta');
    expect(h.ai.buildCalls[0]!.inputs).toHaveLength(2);
    expect(h.ai.buildCalls[0]!.failures).toBeUndefined();
    expect(h.ai.buildCalls[1]!.inputs.map((i) => i.thesisId)).toEqual([alpha.id]);
    expect(h.ai.buildCalls[1]!.failures).toEqual([
      expect.objectContaining({ thesisId: alpha.id, code: 'untraceable_number' }),
    ]);

    expect(out).toMatchObject({ status: 'done', published: 1 });
    expect(h.store.publishedRow!.theses.map((t) => t.id)).toEqual([beta.id]);
    expect(h.store.thesis(alpha.id)).toMatchObject({
      currentTitle: null,
      currentSummary: null,
      needsRewrite: false,
    });

    // The rejection is remembered: another search does not spend tokens on it again.
    const calls = h.ai.totalCalls;
    await run();
    expect(h.ai.totalCalls).toBe(calls);
  });

  it('25: recommendation wording is rejected, a clean second attempt is accepted', async () => {
    h.store.addReport(pendingReport('ra', A, day(5)));
    h.ai.buildFn = (inputs, failures) =>
      inputs.map((i) => ({
        thesisId: i.thesisId,
        title: 'Động lực alpha',
        summary: failures
          ? 'Yếu tố alpha hỗ trợ kết quả kinh doanh'
          : 'Khuyến nghị mua nhờ yếu tố alpha',
        materiality: 3,
      }));
    const out = await run();
    expect(h.ai.buildCalls).toHaveLength(2);
    expect(h.ai.buildCalls[1]!.failures?.[0]?.code).toBe('forbidden_term');
    expect(out).toMatchObject({ status: 'done', published: 1 });
    expect(h.store.publishedRow!.theses[0]!.summary).toBe('Yếu tố alpha hỗ trợ kết quả kinh doanh');
  });
});

describe('research engine: circuit breaker (acceptance 27)', () => {
  it('27: median target jumping > 30% -> blocked, previous version stays, same inputs block again with 0 AI calls', async () => {
    h.store.addReport(
      pendingReport('ra', A, day(10), { targetPriceVnd: 100_000, targetSource: 'metadata' }),
    );
    await run();

    h.store.addReport(
      pendingReport('rb', B, day(1), { targetPriceVnd: 200_000, targetSource: 'metadata' }),
    );
    const out = await run();

    expect(out.status).toBe('blocked');
    if (out.status !== 'blocked') throw new Error('unreachable');
    expect(out.reason).toMatch(/median target moved 50\.0%/);
    expect(out.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(h.store.versionNumbers).toEqual([1]);
    expect(h.store.publishedRow!.valuation.targetMedian).toBe(100_000);
    expect(h.store.report('rb').processStatus).toBe('processed'); // the new report is not re-extracted

    const calls = h.ai.totalCalls;
    const again = await run();
    expect(again).toMatchObject({ status: 'blocked', fingerprint: out.fingerprint, llmCalls: 0 });
    expect(h.ai.totalCalls).toBe(calls);
  });

  it('a move of exactly 30% is allowed', async () => {
    h.store.addReport(
      pendingReport('ra', A, day(10), { targetPriceVnd: 100_000, targetSource: 'metadata' }),
    );
    await run();
    h.store.addReport(
      pendingReport('rb', B, day(1), { targetPriceVnd: 160_000, targetSource: 'metadata' }),
    ); // median 130000
    const out = await run();
    expect(out).toMatchObject({ status: 'done', published: 2 });
  });
});

describe('research engine: AI budget and failures (acceptance 14, 15)', () => {
  it('budget: daily call limit reached -> no AI call, run failed, stored view untouched, report left pending', async () => {
    await firstRunTwoBrokers();
    const calls = h.ai.totalCalls;
    h.settings.RESEARCH_AI_DAILY_CALL_LIMIT = 4; // exactly what run 1 spent
    h.store.addReport(pendingReport('rc', B, day(1)));

    const out = await run();

    expect(out).toMatchObject({
      status: 'failed',
      error: 'RESEARCH_AI_BUDGET_EXCEEDED',
      llmCalls: 0,
    });
    expect(h.ai.totalCalls).toBe(calls);
    expect(h.store.versionNumbers).toEqual([1]);
    expect(h.store.report('rc').processStatus).toBe('pending');
    expect(h.store.processFailures).toHaveLength(0);
  });

  it('budget: the limit is checked before every call, including mid-run', async () => {
    h.settings.RESEARCH_AI_DAILY_CALL_LIMIT = 3; // 2 extractions + 1 match, then the builder is refused
    const out = await firstRunTwoBrokers();
    expect(out).toMatchObject({
      status: 'failed',
      error: 'RESEARCH_AI_BUDGET_EXCEEDED',
      llmCalls: 3,
    });
    expect(h.ai.buildCalls).toHaveLength(0);
    expect(h.store.versions).toHaveLength(0);
  });

  it('retries a transient AI error with backoff and counts every attempt against the budget', async () => {
    restoreTimers = instantBackoff();
    h.store.addReport(pendingReport('ra', A, day(5)));
    const spy = vi.spyOn(h.ai, 'extractClaims');
    spy.mockRejectedValueOnce(new Error('429')).mockRejectedValueOnce(new Error('503'));

    const out = await run();

    expect(spy).toHaveBeenCalledTimes(3);
    expect(out).toMatchObject({ status: 'done', published: 1 });
    expect(out.llmCalls).toBe(2 + 3); // 2 failed + extract + match + build
    expect(h.store.processFailures).toHaveLength(0);
  });

  it('a truncated extraction is not retried: one call, one attempt counted against the report', async () => {
    restoreTimers = instantBackoff();
    h.store.addReport(pendingReport('ra', A, day(5)));
    h.ai.extractError = truncated();

    const out = await run();

    expect(h.ai.extractCalls).toHaveLength(1);
    expect(out).toMatchObject({ status: 'done', llmCalls: 1 });
    expect(h.store.processFailures).toEqual([{ id: 'ra', error: 'AI output truncated' }]);
    expect(h.store.report('ra')).toMatchObject({ processStatus: 'pending', processAttempts: 1 });
    expect(h.store.usageByDate.get(TODAY)).toBe(1);
  });

  it('a truncated matching answer is not retried either', async () => {
    restoreTimers = instantBackoff();
    h.store.addReport(pendingReport('ra', A, day(5)));
    h.ai.matchError = truncated();

    const out = await run();

    expect(h.ai.matchCalls).toBe(1);
    expect(out).toMatchObject({ status: 'failed', error: 'AI output truncated', llmCalls: 2 }); // extract + 1 match
    expect(h.store.matched.size).toBe(0);
  });

  it('a report fails for good at the third failed attempt', async () => {
    restoreTimers = instantBackoff();
    h.store.addReport(pendingReport('ra', A, day(5)));
    h.ai.extractError = new Error('503');
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await run();
      expect(h.store.report('ra').processStatus).toBe(attempt < 3 ? 'pending' : 'failed');
    }
  });

  it('14: extraction keeps failing -> that report is marked failed (retried next search), run continues', async () => {
    restoreTimers = instantBackoff();
    h.store.addReport(pendingReport('ra', A, day(5)));
    h.ai.extractError = new Error('503 upstream');

    const out = await run();

    expect(h.ai.extractCalls).toHaveLength(3); // AI_ATTEMPTS
    expect(h.store.processFailures).toEqual([{ id: 'ra', error: '503 upstream' }]);
    expect(h.store.report('ra').processStatus).toBe('pending'); // first failure: still retryable
    expect(out).toMatchObject({ status: 'done', llmCalls: 3 });
    expect(h.ai.matchCalls).toBe(0);
  });

  it('14: matching keeps failing -> run failed with the AI error, after 3 attempts', async () => {
    restoreTimers = instantBackoff();
    h.store.addReport(pendingReport('ra', A, day(5)));
    h.ai.matchError = new Error('match 500');

    const out = await run();

    expect(h.ai.matchCalls).toBe(3);
    expect(out).toMatchObject({ status: 'failed', error: 'match 500', llmCalls: 3 + 1 }); // extract + 3 failed matches
    expect(h.store.versions).toHaveLength(0);
  });

  it('14: builder keeps failing with a stored view -> run failed, stored view kept', async () => {
    restoreTimers = instantBackoff();
    await firstRunTwoBrokers(20, 3);
    h.ai.buildError = new Error('build 500');
    h.store.addReport(pendingReport('rc', B, day(1)));
    h.ai.extractions.set('rc', { claims: [ec({ driver: 'gamma' })], target: null });

    const out = await run();

    expect(out).toMatchObject({ status: 'failed', error: 'build 500' });
    expect(h.store.versionNumbers).toEqual([1]);
  });

  it('15: an unreadable PDF is marked failed, the other reports are processed and the view published', async () => {
    h.store.addReport(
      pendingReport('ra', A, day(5), { targetPriceVnd: 100_000, targetSource: 'metadata' }),
    );
    h.store.addReport(pendingReport('bad', B, day(4), { filePath: 'research/corrupt.pdf' }));

    const out = await run();

    expect(h.ai.extractCalls).toEqual(['ra']);
    expect(h.store.processFailures).toEqual([
      { id: 'bad', error: 'unreadable: Cannot read PDF: corrupt' },
    ]);
    expect(h.store.report('ra').processStatus).toBe('processed');
    expect(out).toMatchObject({ status: 'done', published: 1 });
    expect(h.store.publishedRow!.theses).toHaveLength(1);
    expect(out.llmCalls).toBe(3);
  });

  it('15: a report without a stored file is marked failed (REPORT_FILE_MISSING)', async () => {
    h.store.addReport(pendingReport('nofile', A, day(5), { filePath: null }));
    await run();
    expect(h.store.processFailures).toEqual([
      { id: 'nofile', error: 'unreadable: REPORT_FILE_MISSING' },
    ]);
    expect(h.ai.totalCalls).toBe(0);
  });
});
