import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyBackfill,
  formatPlan,
  loadBalances,
  loadCandidates,
  parseArgs,
  planBackfill,
  requireSafeTarget,
  type CandidateRow,
} from '../../scripts/shop-reward-backfill.js';
import type { SqlClient } from '../../src/platform/database/database.service.js';
import { allLedger, expectLedgerConsistent, memoryHarness } from './helpers/shop-harness.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

function row(userId: string, lessonKey: string, extra: Partial<CandidateRow> = {}): CandidateRow {
  return {
    userId,
    lessonKey,
    lessonId: lessonKey.replace(':', '-'),
    catalogVersion: 'iqx-academy-outline-13ch-71lessons-v1',
    completionMethod: 'quiz',
    completedAt: new Date('2026-08-01T00:00:00Z'),
    ...extra,
  };
}

describe('shop reward backfill: arguments and safety', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('is a dry run unless --apply is given', () => {
    expect(parseArgs([])).toEqual({ apply: false, json: false, userId: null, limit: null });
    expect(parseArgs(['--apply', '--json', '--limit', '5', '--user', USER_A])).toEqual({
      apply: true,
      json: true,
      userId: USER_A,
      limit: 5,
    });
    expect(() => parseArgs(['--user', 'nope'])).toThrow('UUID');
    expect(() => parseArgs(['--limit', '0'])).toThrow('--limit');
    expect(() => parseArgs(['--frobnicate'])).toThrow('Unknown argument');
  });

  it('only targets iqx_v2_* databases and needs explicit approval to write', () => {
    delete process.env.DATABASE_URL;
    expect(() => requireSafeTarget(false)).toThrow('DATABASE_URL');
    process.env.DATABASE_URL = 'postgresql://localhost/iqx';
    expect(() => requireSafeTarget(false)).toThrow('iqx_v2_*');
    process.env.DATABASE_URL = 'postgresql://localhost/iqx_v2_prod';
    expect(requireSafeTarget(false)).toBe('postgresql://localhost/iqx_v2_prod');
    delete process.env.V2_SHOP_BACKFILL_APPROVED;
    expect(() => requireSafeTarget(true)).toThrow('V2_SHOP_BACKFILL_APPROVED');
    process.env.V2_SHOP_BACKFILL_APPROVED = 'true';
    expect(requireSafeTarget(true)).toBe('postgresql://localhost/iqx_v2_prod');
  });
});

describe('shop reward backfill: planning (dry run output)', () => {
  it('plans 100 xu per candidate lesson with the shared reward key and before/after balances', () => {
    const plan = planBackfill(
      [
        row(USER_A, 'technical:rsi'),
        row(USER_A, 'guide:ch02-l01', { completionMethod: 'guide' }),
        row(USER_B, 'fundamental:roe'),
      ],
      new Map([[USER_A, 300]]),
    );
    expect(plan.totalXu).toBe(300);
    expect(plan.credits.map((c) => c.rewardKey)).toEqual([
      `lesson_first_completion:${USER_A}:technical:rsi`,
      `lesson_first_completion:${USER_A}:guide:ch02-l01`,
      `lesson_first_completion:${USER_B}:fundamental:roe`,
    ]);
    expect(plan.users).toEqual([
      { userId: USER_A, lessons: 2, xu: 200, balanceBefore: 300, balanceAfter: 500 },
      { userId: USER_B, lessons: 1, xu: 100, balanceBefore: 0, balanceAfter: 100 },
    ]);
    const text = formatPlan(plan, false);
    expect(text).toContain('DRY RUN');
    expect(text).toContain('total xu: 300');
    expect(text).toContain(`lesson_first_completion:${USER_A}:technical:rsi`);
  });

  it('M05/M06: never rewards legacy positional ids or unverifiable methods; reports them', () => {
    const plan = planBackfill(
      [
        row(USER_A, 'ch07-l01'),
        row(USER_A, 'technical:obv', { completionMethod: 'count_only' }),
        row(USER_A, 'technical:obv'),
        row(USER_A, 'technical:obv'),
      ],
      new Map(),
    );
    expect(plan.credits).toHaveLength(1);
    expect(plan.credits[0]?.lessonKey).toBe('technical:obv');
    expect(plan.skipped.map((s) => s.reason)).toEqual([
      'invalid_lesson_key',
      'invalid_completion_method',
    ]);
    expect(plan.totalXu).toBe(100);
  });

  it('reads candidates as completions without a reward row and balances read-only', async () => {
    const queries: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
    const db: SqlClient = {
      query: async (text, values) => {
        queries.push({ text, values });
        if (text.includes('academy_completions')) {
          return [
            {
              user_id: USER_A,
              lesson_key: 'technical:rsi',
              lesson_id: 'ch01-l01',
              catalog_version: 'v1',
              completion_method: 'quiz',
              completed_at: new Date('2026-08-01T00:00:00Z'),
            },
          ] as never;
        }
        return [{ user_id: USER_A, balance: '200' }] as never;
      },
    };
    const rows = await loadCandidates(db, { userId: null, limit: 10 });
    expect(rows).toEqual([
      row(USER_A, 'technical:rsi', { lessonId: 'ch01-l01', catalogVersion: 'v1' }),
    ]);
    expect(queries[0]?.text).toMatch(/left join lesson_rewards/);
    expect(queries[0]?.text).toMatch(/r\.user_id is null/);
    expect(queries[0]?.text).not.toMatch(/\b(insert|update|delete)\b/i);
    expect(await loadBalances(db, [USER_A, USER_A])).toEqual(new Map([[USER_A, 200]]));
    expect(await loadBalances(db, [])).toEqual(new Map());
  });
});

describe('shop reward backfill: apply goes through the shared reward service', () => {
  it('credits once, is safe to re-run and never double-pays a lesson already rewarded in realtime', async () => {
    const h = memoryHarness();
    const userId = await h.newUser();
    // The realtime Academy hook already rewarded this lesson.
    await h.database.transaction((tx) =>
      h.rewards.creditFirstCompletion(tx, {
        userId,
        lessonKey: 'technical:rsi',
        lessonId: 'ch01-l01',
        catalogVersion: 'v1',
        completionMethod: 'quiz',
        completedAt: new Date().toISOString(),
      }),
    );

    const plan = planBackfill(
      [
        row(userId, 'technical:rsi'),
        row(userId, 'technical:macd'),
        row(userId, 'guide:ch04-l01', { completionMethod: 'guide' }),
      ],
      new Map([[userId, 100]]),
    );
    const first = await applyBackfill(plan, (op) => h.database.transaction(op), h.rewards);
    expect(first).toMatchObject({ credited: 2, alreadyRewarded: 1, xuCredited: 200, failed: [] });
    await expectLedgerConsistent(h, userId, 300);

    const second = await applyBackfill(plan, (op) => h.database.transaction(op), h.rewards);
    expect(second).toMatchObject({ credited: 0, alreadyRewarded: 3, xuCredited: 0, failed: [] });
    const rows = await expectLedgerConsistent(h, userId, 300);
    const sources = rows.map((r) => r.ref.source).sort();
    expect(sources).toEqual(['backfill', 'backfill', 'realtime']);
    expect(rows.find((r) => r.ref.lesson_key === 'technical:macd')?.ref.completed_at).toBe(
      '2026-08-01T00:00:00.000Z',
    );
  });

  it('M04: a concurrent realtime reward and the backfill still pay a lesson once', async () => {
    const h = memoryHarness();
    const userId = await h.newUser();
    const plan = planBackfill([row(userId, 'fundamental:roe')], new Map());
    const [, backfill] = await Promise.all([
      h.database.transaction((tx) =>
        h.rewards.creditFirstCompletion(tx, {
          userId,
          lessonKey: 'fundamental:roe',
          lessonId: 'ch03-l06',
          catalogVersion: 'v1',
          completionMethod: 'quiz',
          completedAt: new Date().toISOString(),
        }),
      ),
      applyBackfill(plan, (op) => h.database.transaction(op), h.rewards),
    ]);
    expect(backfill.credited + backfill.alreadyRewarded).toBe(1);
    await expectLedgerConsistent(h, userId, 100);
    expect(await allLedger(h, userId)).toHaveLength(1);
  });

  it('keeps going when one lesson fails and reports it', async () => {
    const h = memoryHarness();
    const userId = await h.newUser();
    const plan = planBackfill(
      [row(userId, 'technical:rsi'), row(userId, 'technical:macd')],
      new Map(),
    );
    const original = h.rewards.creditFirstCompletion.bind(h.rewards);
    const failing = vi
      .spyOn(h.rewards, 'creditFirstCompletion')
      .mockImplementationOnce(async () => {
        throw new Error('boom');
      })
      .mockImplementation(original);
    const result = await applyBackfill(plan, (op) => h.database.transaction(op), h.rewards);
    failing.mockRestore();
    expect(result.failed).toEqual([{ userId, lessonKey: 'technical:rsi', error: 'boom' }]);
    expect(result.credited).toBe(1);
    await expectLedgerConsistent(h, userId, 100);
  });
});
